import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DIST_DIR = resolve(process.cwd(), "dist");
const PORT = Number(process.env.PORT ?? 8787);
const CONFIGURED_MODEL = (
  process.env.TRAZO_AI_MODEL || "gemini-2.5-flash-image"
).trim();
const DEFAULT_MODEL = CONFIGURED_MODEL.includes("image")
  ? CONFIGURED_MODEL
  : "gemini-2.5-flash-image";
const VERTEX_EXPRESS_API_KEY = (
  process.env.VERTEX_EXPRESS_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  ""
).trim();
const VERTEX_EXPRESS_ENDPOINT = (model) =>
  `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(
    VERTEX_EXPRESS_API_KEY,
  )}`;

const ACTION_LABELS = {
  reinterpret: "Reinterpretar",
  paint: "Pintar",
};

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const json = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 5_000_000) {
      throw new Error("El cuerpo de la peticion es demasiado grande.");
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
};

const buildImagePart = (selectionImageDataUrl) => {
  if (typeof selectionImageDataUrl !== "string") {
    return null;
  }

  const match = selectionImageDataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );

  if (!match) {
    return null;
  }

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
};

const getFallbackSummary = (requestBody) => {
  const actions = Array.isArray(requestBody?.actionIds)
    ? requestBody.actionIds
    : [];

  if (actions.includes("paint")) {
    return "La IA preparo una reinterpretacion con mas color.";
  }

  return "La IA preparo una reinterpretacion visual de la seleccion actual.";
};

const extractImageProposal = (payload, requestBody) => {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const textSummary = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
  const imagePart =
    parts.find(
      (part) =>
        typeof part?.inlineData?.data === "string" &&
        typeof part?.inlineData?.mimeType === "string" &&
        part.inlineData.mimeType.startsWith("image/"),
    ) ?? null;

  if (!imagePart) {
    throw new Error("La IA no devolvio una imagen valida.");
  }

  const mimeType = imagePart.inlineData.mimeType.trim();
  const imageData = imagePart.inlineData.data.trim();

  if (!mimeType || !imageData) {
    throw new Error("La IA no devolvio una imagen valida.");
  }

  return {
    summary: textSummary || getFallbackSummary(requestBody),
    mimeType,
    imageDataUrl: `data:${mimeType};base64,${imageData}`,
  };
};

const buildPrompt = (requestBody) => {
  const guidedActions =
    requestBody.actionIds?.map((actionId) => ACTION_LABELS[actionId] ?? actionId) ??
    [];
  const wantsPaint = requestBody.actionIds?.includes("paint");

  return [
    "Eres Trazo AI.",
    "Tu trabajo es reinterpretar el boceto adjunto como una imagen bonita, clara y util.",
    "Debes responder con una imagen final, no con explicaciones largas ni con SVG textual.",
    "Reglas duras:",
    "- Usa la imagen adjunta como base obligatoria.",
    "- Conserva la estructura general, el orden y la intencion del boceto.",
    "- Si parece una interfaz o wireframe, conviertelo en una interfaz presentada y coherente.",
    "- Si parece un diagrama, conviertelo en un diagrama limpio y legible.",
    "- Si hay texto manuscrito legible, reescribelo dentro de la imagen en espanol claro.",
    "- Si algun texto no se entiende, usa etiquetas cortas y neutras en espanol en vez de inventar contenido largo.",
    "- Todo el contenido visible debe estar en espanol. Nunca uses ingles.",
    "- Evita resultados abstractos, absurdos o demasiado artisticos. Debe ser util y entendible.",
    "- Usa formas limpias, color agradable, jerarquia clara, espaciado consistente y una presentacion moderna.",
    "- No copies el look generico de Excalidraw. Debe verse como una version pulida del boceto.",
    wantsPaint
      ? "- Empuja mas la paleta de color, el contraste y el acabado visual."
      : "- Manten una paleta equilibrada y un acabado visual limpio.",
    "- Respeta la proporcion general del boceto para que encaje bien al reemplazar la seleccion.",
    "",
    `Selected count: ${requestBody.selectedCount}.`,
    `Selected ids: ${(requestBody.selectedElementIds ?? []).join(", ")}.`,
    `Selected element types: ${(requestBody.selectedElementTypes ?? []).join(", ") || "unknown"}.`,
    `Acciones activas: ${
      guidedActions.length > 0 ? guidedActions.join(", ") : "Reinterpretar"
    }.`,
    `Matiz opcional: ${requestBody.note?.trim() || "none"}.`,
    "",
    "Snapshot de seleccion (metadatos de elementos):",
    JSON.stringify(requestBody.selectedElements ?? [], null, 2),
    "",
    "Pistas de accion:",
    "- Reinterpretar: reconstruye el boceto como una pieza mas clara y mas bonita.",
    "- Pintar: da mas fuerza al color y al acabado.",
    "",
    "Usa el PNG adjunto como fuente principal de verdad.",
  ].join("\n");
};

const requestVertexProposal = async (requestBody) => {
  if (!VERTEX_EXPRESS_API_KEY) {
    throw new Error(
      "Falta VERTEX_EXPRESS_API_KEY. Anade la clave de Vertex en .env.local antes de aplicar.",
    );
  }

  const imagePart = buildImagePart(requestBody.selectionImageDataUrl);

  if (!imagePart) {
    throw new Error("No se pudo capturar la seleccion para reinterpretarla.");
  }

  const response = await fetch(
    VERTEX_EXPRESS_ENDPOINT(DEFAULT_MODEL),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              imagePart,
              {
                text: buildPrompt(requestBody),
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "Responde siempre en espanol. Si devuelves texto de apoyo, debe ser corto y claro.",
            },
          ],
        },
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Vertex AI devolvio un error HTTP ${response.status}.`,
    );
  }

  return extractImageProposal(payload, requestBody);
};

const serveStatic = async (pathname, method, response) => {
  if (!existsSync(DIST_DIR) || (method !== "GET" && method !== "HEAD")) {
    return false;
  }

  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  let filePath = resolve(DIST_DIR, `.${normalizedPath}`);

  if (!filePath.startsWith(DIST_DIR)) {
    return false;
  }

  try {
    const fileStats = await stat(filePath);

    if (fileStats.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    filePath = join(DIST_DIR, "index.html");
  }

  try {
    const fileBuffer = await readFile(filePath);
    const contentType =
      CONTENT_TYPES[extname(filePath).toLowerCase()] ??
      "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });

    if (method === "HEAD") {
      response.end();
      return true;
    }

    response.end(fileBuffer);
    return true;
  } catch {
    return false;
  }
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, {
      ok: true,
      provider: "vertex-express",
      model: DEFAULT_MODEL,
      hasApiKey: Boolean(VERTEX_EXPRESS_API_KEY),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ai/prepare") {
    try {
      const requestBody = await readJsonBody(request);

      if (
        !Array.isArray(requestBody?.selectedElements) ||
        typeof requestBody?.selectedCount !== "number" ||
        requestBody.selectedCount <= 0
      ) {
        json(response, 400, {
          error: "La peticion no incluye una seleccion valida.",
        });
        return;
      }

      const proposal = await requestVertexProposal(requestBody);

      json(response, 200, {
        model: DEFAULT_MODEL,
        requestPreview: requestBody.preview ?? "",
        proposal,
      });
    } catch (error) {
      json(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo preparar la propuesta de IA.",
      });
    }
    return;
  }

  if (await serveStatic(url.pathname, request.method ?? "GET", response)) {
    return;
  }

  json(response, 404, { error: "Ruta no encontrada." });
});

server.listen(PORT, () => {
  console.log(`[Trazo AI] server listening on http://localhost:${PORT}`);
});
