import type { PreparedAiRequest } from "./ai-panel";

export type AiImageProposal = {
  summary: string;
  imageDataUrl: string;
  mimeType: string;
};

export type AiPrepareResponse = {
  model: string;
  proposal: AiImageProposal;
  requestPreview: string;
};

const normalizeAiErrorMessage = (value: unknown) => {
  const message = typeof value === "string" ? value.trim() : "";

  if (!message) {
    return "No se pudo reinterpretar ahora.";
  }

  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("quota exceeded") ||
    normalizedMessage.includes("free_tier_requests") ||
    normalizedMessage.includes("rate limit")
  ) {
    return "Cuota de Vertex agotada.";
  }

  if (
    normalizedMessage.includes("plan and billing") ||
    normalizedMessage.includes("billing")
  ) {
    return "Vertex necesita facturacion.";
  }

  if (
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("api_key") ||
    normalizedMessage.includes("credential")
  ) {
    return "Falta la clave de Vertex.";
  }

  if (
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("service disabled") ||
    normalizedMessage.includes("not been used in project")
  ) {
    return "Activa Vertex AI en tu proyecto de Google Cloud.";
  }

  if (normalizedMessage.includes("valid role")) {
    return "Vertex rechazo la peticion por configuracion.";
  }

  if (normalizedMessage.includes("seleccion valida")) {
    return "Selecciona algo antes de reinterpretar.";
  }

  if (
    normalizedMessage.includes("svg") ||
    normalizedMessage.includes("image") ||
    normalizedMessage.includes("imagen")
  ) {
    return "La IA no devolvio una imagen valida.";
  }

  return "No se pudo reinterpretar ahora.";
};

export const requestAiProposal = async (
  request: PreparedAiRequest,
): Promise<AiPrepareResponse> => {
  const response = await fetch("/api/ai/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(normalizeAiErrorMessage(payload?.error));
  }

  return payload as AiPrepareResponse;
};
