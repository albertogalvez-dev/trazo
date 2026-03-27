export type AiActionId =
  | "reinterpret"
  | "paint";

export type SelectedCanvasElement = {
  id: string;
  type: string;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  opacity: number;
  fillStyle: string;
  roughness: number;
  fontFamily: string | null;
  fontSize: number | null;
  textAlign: string | null;
  verticalAlign: string | null;
};

export type PreparedAiRequest = {
  selectedElements: SelectedCanvasElement[];
  selectedElementIds: string[];
  selectedCount: number;
  selectedElementTypes: string[];
  actionIds: AiActionId[];
  note: string;
  preview: string;
  selectionImageDataUrl?: string | null;
};

type GuidedAction = {
  id: AiActionId;
  label: string;
};

type AiPreviewInput = {
  selectedCount: number;
  actionIds: readonly AiActionId[];
  note: string;
};

type PrepareAiRequestInput = {
  selectedElements: readonly SelectedCanvasElement[];
  actionIds: readonly AiActionId[];
  note: string;
};

export const AI_GUIDED_ACTIONS: readonly GuidedAction[] = [
  { id: "reinterpret", label: "Reinterpretar" },
  { id: "paint", label: "Pintar" },
];

const ensureSentence = (value: string) =>
  /[.!?]$/.test(value) ? value : `${value}.`;

const formatSelectedCount = (count: number) =>
  `${count} ${count === 1 ? "elemento" : "elementos"}`;

export const normalizeActionIds = (actionIds: readonly AiActionId[]) => {
  const uniqueActionIds = Array.from(new Set(actionIds)) as AiActionId[];

  if (uniqueActionIds.includes("reinterpret")) {
    return uniqueActionIds;
  }

  return ["reinterpret", ...uniqueActionIds] as AiActionId[];
};

export const buildAiPreview = ({
  selectedCount,
  actionIds,
  note,
}: AiPreviewInput) => {
  if (selectedCount === 0) {
    return "Selecciona un boceto o un texto a mano y la IA intentara reinterpretarlo dentro del canvas.";
  }

  const normalizedActionIds = normalizeActionIds(actionIds);
  const normalizedNote = note.trim();
  const previewParts = [
    `La IA reinterpretara ${formatSelectedCount(selectedCount)} en una version mas clara.`,
    "Si detecta texto a mano legible, intentara convertirlo en texto limpio.",
  ];

  if (normalizedActionIds.includes("paint")) {
    previewParts.push("Tambien reforzara color y rellenos.");
  }

  if (normalizedNote) {
    previewParts.push(`Matiz: ${ensureSentence(normalizedNote)}`);
  }

  return previewParts.join(" ");
};

export const prepareAiRequest = ({
  selectedElements,
  actionIds,
  note,
}: PrepareAiRequestInput): PreparedAiRequest => {
  const normalizedNote = note.trim();
  const normalizedActionIds = normalizeActionIds(actionIds);

  return {
    selectedElements: [...selectedElements],
    selectedElementIds: selectedElements.map((element) => element.id),
    selectedCount: selectedElements.length,
    selectedElementTypes: Array.from(
      new Set(selectedElements.map((element) => element.type)),
    ),
    actionIds: normalizedActionIds,
    note: normalizedNote,
    preview: buildAiPreview({
      selectedCount: selectedElements.length,
      actionIds: normalizedActionIds,
      note: normalizedNote,
    }),
  };
};
