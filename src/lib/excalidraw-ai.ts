import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  newElementWith,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { PreparedAiRequest } from "./ai-panel";
import type { AiPrepareResponse } from "./ai-api";

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type ExcalidrawSkeletonArray = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>;

type ExcalidrawSkeleton = ExcalidrawSkeletonArray[number];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se pudo leer la captura de la seleccion."));
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer la captura de la seleccion."));
    };

    reader.readAsDataURL(blob);
  });

const loadImageSize = (dataUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };

    image.onerror = () => {
      reject(new Error("No se pudo leer la imagen generada por la IA."));
    };

    image.src = dataUrl;
  });

const normalizeImageMimeType = (value: string): BinaryFileData["mimeType"] => {
  switch (value) {
    case "image/jpeg":
    case "image/webp":
    case "image/gif":
    case "image/bmp":
    case "image/avif":
    case "image/jfif":
    case "image/svg+xml":
      return value;
    case "image/png":
    default:
      return "image/png";
  }
};

const getBounds = (element: OrderedExcalidrawElement): Bounds => {
  const minX = Math.min(element.x, element.x + element.width);
  const maxX = Math.max(element.x, element.x + element.width);
  const minY = Math.min(element.y, element.y + element.height);
  const maxY = Math.max(element.y, element.y + element.height);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getCombinedBounds = (
  elements: readonly OrderedExcalidrawElement[],
): Bounds | null => {
  if (elements.length === 0) {
    return null;
  }

  const boundsList = elements.map(getBounds);
  const minX = Math.min(...boundsList.map((bounds) => bounds.minX));
  const minY = Math.min(...boundsList.map((bounds) => bounds.minY));
  const maxX = Math.max(...boundsList.map((bounds) => bounds.maxX));
  const maxY = Math.max(...boundsList.map((bounds) => bounds.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const expandSelectedSceneElements = (
  sceneElements: readonly OrderedExcalidrawElement[],
  selectedIdSet: Set<string>,
) => {
  const expandedIds = new Set(selectedIdSet);

  for (const element of sceneElements) {
    if (element.isDeleted) {
      continue;
    }

    if ("containerId" in element && element.containerId) {
      if (selectedIdSet.has(element.containerId)) {
        expandedIds.add(element.id);
      }
    }
  }

  return sceneElements.filter(
    (element): element is OrderedExcalidrawElement =>
      !element.isDeleted && expandedIds.has(element.id),
  );
};

const getSelectedSceneElements = (
  api: ExcalidrawImperativeAPI,
  selectedElementIds: string[],
) => {
  const selectedIdSet = new Set(selectedElementIds);

  return expandSelectedSceneElements(
    api.getSceneElementsIncludingDeleted(),
    selectedIdSet,
  );
};

const createExportAppState = (appState: AppState) => ({
  exportBackground: true,
  exportScale: 1,
  viewBackgroundColor: appState.viewBackgroundColor,
  theme: appState.theme,
});

const buildSelectionSnapshot = async ({
  elements,
  appState,
  files,
}: {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}) => {
  const blob = await exportToBlob({
    elements,
    files,
    appState: createExportAppState(appState),
    maxWidthOrHeight: 768,
    exportPadding: 24,
    mimeType: "image/png",
  });

  return blobToDataUrl(blob);
};

const generateFileId = () =>
  `trazo-ai-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` as BinaryFileData["id"];

const fitIntoBounds = ({
  naturalWidth,
  naturalHeight,
  bounds,
}: {
  naturalWidth: number;
  naturalHeight: number;
  bounds: Bounds;
}) => {
  const safeWidth = Math.max(naturalWidth, 1);
  const safeHeight = Math.max(naturalHeight, 1);
  const scale = Math.min(bounds.width / safeWidth, bounds.height / safeHeight);
  const width = Math.max(48, safeWidth * scale);
  const height = Math.max(48, safeHeight * scale);

  return {
    width,
    height,
    x: bounds.minX + (bounds.width - width) / 2,
    y: bounds.minY + (bounds.height - height) / 2,
  };
};

const buildImageSkeleton = ({
  fileId,
  svgWidth,
  svgHeight,
  selectionBounds,
}: {
  fileId: BinaryFileData["id"];
  svgWidth: number;
  svgHeight: number;
  selectionBounds: Bounds;
}): ExcalidrawSkeleton => {
  const fitted = fitIntoBounds({
    naturalWidth: svgWidth,
    naturalHeight: svgHeight,
    bounds: selectionBounds,
  });

  return {
    type: "image",
    x: fitted.x,
    y: fitted.y,
    width: fitted.width,
    height: fitted.height,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
};

export const enrichAiRequestWithSelectionSnapshot = async ({
  api,
  request,
}: {
  api: ExcalidrawImperativeAPI;
  request: PreparedAiRequest;
}) => {
  const selectedSceneElements = getSelectedSceneElements(
    api,
    request.selectedElementIds,
  );

  if (selectedSceneElements.length === 0) {
    return request;
  }

  try {
    const selectionImageDataUrl = await buildSelectionSnapshot({
      elements: selectedSceneElements,
      appState: api.getAppState(),
      files: api.getFiles(),
    });

    return {
      ...request,
      selectionImageDataUrl,
    };
  } catch {
    return request;
  }
};

export const applyAiProposalToScene = async ({
  api,
  response,
  selectedElementIds,
}: {
  api: ExcalidrawImperativeAPI;
  response: AiPrepareResponse;
  selectedElementIds: string[];
}) => {
  const sceneElements = api.getSceneElementsIncludingDeleted();
  const selectedSceneElements = getSelectedSceneElements(api, selectedElementIds);
  const selectionBounds = getCombinedBounds(selectedSceneElements);

  if (!selectionBounds) {
    return {
      applied: false,
      changedElements: 0,
    };
  }

  if (!response.proposal.imageDataUrl) {
    return {
      applied: false,
      changedElements: 0,
    };
  }

  const imageSize = await loadImageSize(response.proposal.imageDataUrl).catch(
    () => null,
  );

  if (!imageSize) {
    return {
      applied: false,
      changedElements: 0,
    };
  }

  const fileId = generateFileId();
  const file: BinaryFileData = {
    id: fileId,
    mimeType: normalizeImageMimeType(response.proposal.mimeType),
    dataURL: response.proposal.imageDataUrl as BinaryFileData["dataURL"],
    created: Date.now(),
    lastRetrieved: Date.now(),
  };
  const imageSkeleton = buildImageSkeleton({
    fileId,
    svgWidth: clamp(imageSize.width, 120, 4096),
    svgHeight: clamp(imageSize.height, 120, 4096),
    selectionBounds,
  });
  const imageElements = convertToExcalidrawElements([imageSkeleton], {
    regenerateIds: true,
  });

  if (imageElements.length === 0) {
    return {
      applied: false,
      changedElements: 0,
    };
  }

  api.addFiles([file]);

  const imageIdSet = new Set(imageElements.map((element) => element.id));
  const selectedIdSet = new Set(selectedSceneElements.map((element) => element.id));
  const nextElements = sceneElements.map((element) => {
    if (element.isDeleted || !selectedIdSet.has(element.id)) {
      return element;
    }

    return newElementWith(element, { isDeleted: true });
  });

  api.updateScene({
    elements: [...nextElements, ...imageElements],
    appState: {
      selectedElementIds: Object.fromEntries(
        Array.from(imageIdSet).map((id) => [id, true]),
      ),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return {
    applied: true,
    changedElements: imageElements.length,
  };
};
