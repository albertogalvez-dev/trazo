import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import {
  AI_GUIDED_ACTIONS,
  prepareAiRequest,
  type AiActionId,
  type PreparedAiRequest,
  type SelectedCanvasElement,
} from "./lib/ai-panel";
import { requestAiProposal, type AiPrepareResponse } from "./lib/ai-api";
import {
  applyAiProposalToScene,
  enrichAiRequestWithSelectionSnapshot,
} from "./lib/excalidraw-ai";
import { GuidedTour, type GuidedTourStep } from "./components/GuidedTour";

const USER_NAME_KEY = "trazo:userName";
const AI_PANEL_POSITION_KEY = "trazo:aiPanelPosition";
const APP_TOUR_SEEN_KEY = "trazo:guideTourSeen:v3";
const PANEL_WIDTH = 360;
const PANEL_MARGIN = 24;

const FONT_FAMILY_LABELS: Record<number, string> = {
  1: "Virgil",
  2: "Helvetica",
  3: "Cascadia",
};

const HELP_DIALOG_TITLES = new Set(["Ayuda", "Help"]);
const PROFILE_LINKS = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/alberto-galvez-aguado/",
  },
  {
    label: "GitHub",
    href: "https://github.com/albertogalvez-dev",
  },
  {
    label: "Portfolio",
    href: "https://albertogalvez-dev.github.io/",
  },
] as const;

type PanelPosition = {
  x: number;
  y: number;
};

type ApplyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const findElementByText = (
  root: ParentNode,
  selector: string,
  matcher: (text: string) => boolean,
) => {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));

  return (
    elements.find((element) => matcher(element.textContent?.trim() ?? "")) ?? null
  );
};

const injectHelpDialogExtras = () => {
  const titles = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[role='dialog'] h1, [role='dialog'] h2, [role='dialog'] h3",
    ),
  );
  const helpTitle = titles.find((title) =>
    HELP_DIALOG_TITLES.has(title.textContent?.trim() ?? ""),
  );

  if (!helpTitle) {
    return;
  }

  const dialog = helpTitle.closest<HTMLElement>("[role='dialog']");

  if (!dialog || dialog.querySelector("[data-trazo-help-extra='true']")) {
    return;
  }

  const extraBlock = document.createElement("section");
  extraBlock.className = "trazo-help-extra";
  extraBlock.dataset.trazoHelpExtra = "true";

  const paragraph = document.createElement("p");
  paragraph.className = "trazo-help-extra__text";
  paragraph.textContent =
    "Trazo explora una forma mas visual de convertir bocetos en piezas presentadas con IA. Si quieres seguir el proyecto o contactar conmigo, aqui tienes mis enlaces.";

  const linksRow = document.createElement("div");
  linksRow.className = "trazo-help-extra__links";

  for (const link of PROFILE_LINKS) {
    const anchor = document.createElement("a");
    anchor.className = "trazo-help-extra__link";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label;
    linksRow.append(anchor);
  }

  extraBlock.append(paragraph, linksRow);

  const insertionTarget =
    helpTitle.parentElement?.nextElementSibling ?? helpTitle;

  insertionTarget.insertAdjacentElement("afterend", extraBlock);
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getPanelSize = (panelElement: HTMLElement | null) => ({
  width: panelElement?.offsetWidth ?? PANEL_WIDTH,
  height: panelElement?.offsetHeight ?? 560,
});

const clampPanelPosition = (
  position: PanelPosition,
  panelElement: HTMLElement | null,
): PanelPosition => {
  if (typeof window === "undefined") {
    return position;
  }

  const panelSize = getPanelSize(panelElement);
  const maxX = Math.max(
    PANEL_MARGIN,
    window.innerWidth - panelSize.width - PANEL_MARGIN,
  );
  const maxY = Math.max(
    PANEL_MARGIN,
    window.innerHeight - panelSize.height - PANEL_MARGIN,
  );

  return {
    x: clamp(position.x, PANEL_MARGIN, maxX),
    y: clamp(position.y, PANEL_MARGIN, maxY),
  };
};

const getDefaultPanelPosition = (panelElement: HTMLElement | null): PanelPosition => {
  if (typeof window === "undefined") {
    return { x: PANEL_MARGIN, y: PANEL_MARGIN };
  }

  return clampPanelPosition(
    {
      x: window.innerWidth - getPanelSize(panelElement).width - PANEL_MARGIN,
      y: PANEL_MARGIN,
    },
    panelElement,
  );
};

const readStoredPanelPosition = (): PanelPosition | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(AI_PANEL_POSITION_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PanelPosition>;

    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }

    return {
      x: parsed.x,
      y: parsed.y,
    };
  } catch {
    return null;
  }
};

const getSelectionSummary = (selectedCount: number) => {
  if (selectedCount === 1) {
    return "1 elemento seleccionado";
  }

  return `${selectedCount} elementos seleccionados`;
};

const getFontFamilyLabel = (element: OrderedExcalidrawElement) => {
  if (!("fontFamily" in element)) {
    return null;
  }

  return FONT_FAMILY_LABELS[element.fontFamily] ?? null;
};

const deriveSelectedElements = (
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
): SelectedCanvasElement[] => {
  const selectedElementIds = appState.selectedElementIds ?? {};

  if (Object.keys(selectedElementIds).length === 0) {
    return [];
  }

  return elements
    .filter((element) => !element.isDeleted && selectedElementIds[element.id])
    .map((element) => ({
      id: element.id,
      type: element.type,
      width: element.width,
      height: element.height,
      angle: element.angle,
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      fillStyle: element.fillStyle,
      roughness: element.roughness,
      fontFamily: getFontFamilyLabel(element),
      fontSize: "fontSize" in element ? element.fontSize : null,
      textAlign: "textAlign" in element ? element.textAlign : null,
      verticalAlign: "verticalAlign" in element ? element.verticalAlign : null,
    }));
};

type AiSidebarPanelProps = {
  selectedElements: readonly SelectedCanvasElement[];
  sceneElementCount: number;
  onRequestProposal: (
    request: PreparedAiRequest,
  ) => Promise<AiPrepareResponse>;
  onApplyProposal: (
    response: AiPrepareResponse,
    selectedElementIds: string[],
  ) => Promise<{ applied: boolean; changedElements: number }>;
  onSelectAll: () => void;
  statusRef: RefObject<HTMLElement | null>;
  actionsRef: RefObject<HTMLElement | null>;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  applyButtonRef: RefObject<HTMLButtonElement | null>;
};

function AiSidebarPanel({
  selectedElements,
  sceneElementCount,
  onRequestProposal,
  onApplyProposal,
  onSelectAll,
  statusRef,
  actionsRef,
  noteRef,
  applyButtonRef,
}: AiSidebarPanelProps) {
  const [activeActionIds, setActiveActionIds] = useState<AiActionId[]>([
    "reinterpret",
  ]);
  const [note, setNote] = useState("");
  const [applyState, setApplyState] = useState<ApplyState>({ status: "idle" });
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
  });
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [hasLoadedPanelPosition, setHasLoadedPanelPosition] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelPositionRef = useRef(panelPosition);
  const stopDraggingRef = useRef<(() => void) | null>(null);

  const selectedCount = selectedElements.length;
  const hasSelection = selectedCount > 0;
  const hasDraft =
    activeActionIds.some((actionId) => actionId !== "reinterpret") ||
    note.trim().length > 0;
  const isApplying = applyState.status === "loading";
  const canReset = hasDraft && !isApplying;
  const canSelectAll =
    sceneElementCount > 0 && !isApplying && selectedCount !== sceneElementCount;

  useEffect(() => {
    panelPositionRef.current = panelPosition;
  }, [panelPosition]);

  useEffect(() => {
    const storedPosition = readStoredPanelPosition();
    const initialPosition = storedPosition ?? getDefaultPanelPosition(panelRef.current);

    setPanelPosition(clampPanelPosition(initialPosition, panelRef.current));
    setHasLoadedPanelPosition(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedPanelPosition || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      AI_PANEL_POSITION_KEY,
      JSON.stringify(panelPosition),
    );
  }, [hasLoadedPanelPosition, panelPosition]);

  useEffect(() => {
    const handleResize = () => {
      setPanelPosition((currentPosition) =>
        clampPanelPosition(currentPosition, panelRef.current),
      );
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopDraggingRef.current?.();
    };
  }, []);

  const handleToggleAction = (actionId: AiActionId) => {
    if (!hasSelection || isApplying) return;

    if (actionId === "reinterpret") {
      return;
    }

    setActiveActionIds((currentActionIds) =>
      currentActionIds.includes(actionId)
        ? currentActionIds.filter(
            (currentActionId) => currentActionId !== actionId,
          )
        : [...currentActionIds, actionId],
    );
  };

  const handleReset = () => {
    if (!canReset) return;

    setActiveActionIds(["reinterpret"]);
    setNote("");
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isApplying) {
      return;
    }

    event.preventDefault();
    stopDraggingRef.current?.();

    const pointerOffset = {
      x: event.clientX - panelPositionRef.current.x,
      y: event.clientY - panelPositionRef.current.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPanelPosition(
        clampPanelPosition(
          {
            x: moveEvent.clientX - pointerOffset.x,
            y: moveEvent.clientY - pointerOffset.y,
          },
          panelRef.current,
        ),
      );
    };

    const stopDragging = () => {
      setIsPanelDragging(false);
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      stopDraggingRef.current = null;
    };

    setIsPanelDragging(true);
    document.body.style.userSelect = "none";
    stopDraggingRef.current = stopDragging;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
  };

  const handleApply = async () => {
    if (!hasSelection || isApplying) return;

    const preparedRequest = prepareAiRequest({
      selectedElements,
      actionIds: activeActionIds,
      note,
    });

    setApplyState({ status: "loading" });

    try {
      const response = await onRequestProposal(preparedRequest);
      const applicationResult = await onApplyProposal(
        response,
        preparedRequest.selectedElementIds,
      );

      setApplyState({
        status: "success",
        message: applicationResult.applied
          ? response.proposal.summary
          : "Vertex respondio, pero no devolvio una reinterpretacion aplicable sobre la seleccion actual.",
      });

      console.log("[Trazo AI] Prepared request", preparedRequest);
      console.log("[Trazo AI] Vertex proposal", response);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo conectar con la IA.";

      setApplyState({
        status: "error",
        message,
      });
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`ai-sidebar ${isPanelDragging ? "is-dragging" : ""}`}
      style={{
        left: panelPosition.x,
        top: panelPosition.y,
      }}
    >
      <div className="ai-sidebar__inner">
        <div
          className="ai-sidebar__chrome"
          onPointerDown={handleDragStart}
          aria-label="Mover panel de IA"
        >
          <img
            src="/gemini-panel.svg"
            alt="Trazo AI"
            className="ai-sidebar__logo"
          />
        </div>

        <section
          ref={statusRef}
          className={`ai-panel-status ${hasSelection ? "is-active" : "is-empty"}`}
        >
          <span className="ai-panel-status__label">
            {hasSelection
              ? getSelectionSummary(selectedCount)
              : "Sin seleccion activa"}
          </span>
          <p>
            {hasSelection
              ? "La IA trabajara solo sobre esta seleccion."
              : "Selecciona un boceto o texto a mano y la IA trabajara solo sobre esa parte."}
          </p>

          <div className="ai-panel-status__actions">
            <button
              type="button"
              className="ai-inline-button"
              onClick={onSelectAll}
              disabled={!canSelectAll}
            >
              Seleccionar todo
            </button>
          </div>
        </section>

        <section ref={actionsRef} className="ai-panel-section">
          <span className="ai-panel-section__title">Accion</span>

          <div className="ai-chip-grid">
            {AI_GUIDED_ACTIONS.map((action) => {
              const isActive = activeActionIds.includes(action.id);
              const isLocked = action.id === "reinterpret";

              return (
                <button
                  key={action.id}
                  type="button"
                  className={`ai-chip ${isActive ? "is-active" : ""} ${
                    isLocked ? "is-locked" : ""
                  }`}
                  onClick={() => handleToggleAction(action.id)}
                  disabled={!hasSelection || isApplying}
                  aria-pressed={isActive}
                  aria-disabled={isLocked}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </section>

        <label className="ai-panel-section">
          <span className="ai-panel-section__title">Matiz</span>

          <textarea
            ref={noteRef}
            className="ai-note-field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={!hasSelection || isApplying}
          />
        </label>

        {applyState.status !== "idle" && (
          <section className="ai-panel-section">
            <div className={`ai-feedback ai-feedback--${applyState.status}`}>
              <p>
                {applyState.status === "loading"
                  ? "Generando una imagen a partir del boceto..."
                  : applyState.message}
              </p>
            </div>
          </section>
        )}

        <div className="ai-panel-footer">
          <button
            type="button"
            className="ai-secondary-button"
            onClick={handleReset}
            disabled={!canReset}
          >
            Cancelar
          </button>

          <button
            ref={applyButtonRef}
            type="button"
            className="ai-primary-button"
            onClick={() => {
              void handleApply();
            }}
            disabled={!hasSelection || isApplying}
          >
            {isApplying ? "Reinterpretando..." : "Reinterpretar"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [name, setName] = useState("");
  const [entered, setEntered] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [hasLoadedTourPreference, setHasLoadedTourPreference] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [activeTourStepId, setActiveTourStepId] = useState<string | null>(null);
  const [sceneElementCount, setSceneElementCount] = useState(0);
  const [selectedElements, setSelectedElements] = useState<SelectedCanvasElement[]>(
    [],
  );
  const selectionSignatureRef = useRef("");
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const aiStatusRef = useRef<HTMLElement | null>(null);
  const aiActionsRef = useRef<HTMLElement | null>(null);
  const aiNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const aiApplyButtonRef = useRef<HTMLButtonElement | null>(null);

  const getToolbarTarget = () =>
    canvasStageRef.current?.querySelector<HTMLElement>(".App-toolbar-container") ??
    null;

  const getMenuButton = () =>
    canvasStageRef.current?.querySelector<HTMLElement>(".App-menu_top button") ??
    null;

  const getHelpMenuItem = () =>
    findElementByText(
      document,
      "[data-testid='dropdown-menu'] button, [data-testid='dropdown-menu'] a",
      (text) => text.includes("Ayuda") || text.includes("Help"),
    );

  const getExportMenuItem = () =>
    findElementByText(
      document,
      "[data-testid='dropdown-menu'] button, [data-testid='dropdown-menu'] a",
      (text) => text.includes("Exportar imagen"),
    );

  const getHelpDialogTarget = () =>
    document.querySelector<HTMLElement>("[data-trazo-help-extra='true']");

  const getMenuTarget = () => getExportMenuItem() ?? getMenuButton();
  const getHelpTarget = () =>
    getHelpDialogTarget() ?? getHelpMenuItem() ?? getMenuButton();

  useEffect(() => {
    const savedName = localStorage.getItem(USER_NAME_KEY);
    const savedTourPreference = localStorage.getItem(APP_TOUR_SEEN_KEY);

    if (savedName) {
      setName(savedName);
    }

    setHasSeenTour(savedTourPreference === "1");
    setHasLoadedTourPreference(true);
  }, []);

  useEffect(() => {
    if (!entered || !hasLoadedTourPreference || hasSeenTour) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsTourOpen(true);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [entered, hasLoadedTourPreference, hasSeenTour]);

  useEffect(() => {
    if (!entered) {
      return;
    }

    const observer = new MutationObserver(() => {
      injectHelpDialogExtras();
    });

    injectHelpDialogExtras();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [entered]);

  useEffect(() => {
    if (!isTourOpen) {
      return;
    }

    const refreshSpotlight = () => {
      window.dispatchEvent(new Event("resize"));
    };
    const closeTransientUi = () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    };

    if (activeTourStepId === "export") {
      const menuButton = getMenuButton();

      if (!menuButton) {
        return;
      }

      if (!getExportMenuItem()) {
        menuButton.click();
      }

      const firstTimeoutId = window.setTimeout(refreshSpotlight, 80);
      const secondTimeoutId = window.setTimeout(refreshSpotlight, 180);

      return () => {
        window.clearTimeout(firstTimeoutId);
        window.clearTimeout(secondTimeoutId);
      };
    }

    if (activeTourStepId === "socials") {
      const menuButton = getMenuButton();

      if (!menuButton) {
        return;
      }

      if (!getHelpDialogTarget()) {
        if (!getHelpMenuItem()) {
          menuButton.click();
        }

        const helpMenuItem = getHelpMenuItem();

        if (helpMenuItem) {
          helpMenuItem.click();
        }
      }

      const firstTimeoutId = window.setTimeout(refreshSpotlight, 120);
      const secondTimeoutId = window.setTimeout(refreshSpotlight, 260);
      const thirdTimeoutId = window.setTimeout(refreshSpotlight, 420);

      return () => {
        window.clearTimeout(firstTimeoutId);
        window.clearTimeout(secondTimeoutId);
        window.clearTimeout(thirdTimeoutId);
      };
    }

    if (getHelpDialogTarget() || getExportMenuItem() || getHelpMenuItem()) {
      closeTransientUi();
    }
  }, [activeTourStepId, isTourOpen]);

  useEffect(() => {
    if (isTourOpen) {
      return;
    }

    if (getHelpDialogTarget() || getExportMenuItem() || getHelpMenuItem()) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    }
  }, [isTourOpen]);

  const handleStart = () => {
    const trimmedName = name.trim();

    if (!trimmedName || isStarting) return;

    setIsStarting(true);
    setName(trimmedName);
    localStorage.setItem(USER_NAME_KEY, trimmedName);

    window.setTimeout(() => {
      setEntered(true);
    }, 650);
  };

  const handleCanvasChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
  ) => {
    setSceneElementCount(elements.filter((element) => !element.isDeleted).length);

    const nextSelectedElements = deriveSelectedElements(elements, appState);
    const nextSignature = JSON.stringify(nextSelectedElements);

    if (nextSignature === selectionSignatureRef.current) {
      return;
    }

    selectionSignatureRef.current = nextSignature;
    setSelectedElements(nextSelectedElements);
  };

  const handleApplyProposal = async (
    response: AiPrepareResponse,
    selectedElementIds: string[],
  ) => {
    if (!excalidrawApiRef.current) {
      throw new Error("El editor todavia no esta listo para aplicar cambios.");
    }

    return applyAiProposalToScene({
      api: excalidrawApiRef.current,
      response,
      selectedElementIds,
    });
  };

  const handleSelectAll = () => {
    if (!excalidrawApiRef.current) {
      return;
    }

    const visibleElements = excalidrawApiRef.current
      .getSceneElementsIncludingDeleted()
      .filter((element) => !element.isDeleted);

    if (visibleElements.length === 0) {
      return;
    }

    excalidrawApiRef.current.updateScene({
      appState: {
        selectedElementIds: Object.fromEntries(
          visibleElements.map((element) => [element.id, true]),
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const handleRequestProposal = async (request: PreparedAiRequest) => {
    if (!excalidrawApiRef.current) {
      throw new Error("El editor todavia no esta listo para reinterpretar.");
    }

    const enrichedRequest = await enrichAiRequestWithSelectionSnapshot({
      api: excalidrawApiRef.current,
      request,
    });

    return requestAiProposal(enrichedRequest);
  };

  const handleCloseTour = () => {
    setIsTourOpen(false);
    setHasSeenTour(true);
    window.localStorage.setItem(APP_TOUR_SEEN_KEY, "1");
  };

  const tourSteps: GuidedTourStep[] = [
    {
      id: "canvas",
      title: "Canvas",
      description:
        "Aqui dibujas el boceto, escribes a mano o montas la idea inicial que quieras reinterpretar.",
      placement: "center",
      getTarget: () => canvasStageRef.current,
    },
    {
      id: "toolbar",
      title: "Herramientas",
      description: [
        "Usa estas herramientas para crear cajas, flechas, texto y formas basicas antes de pasar por la IA.",
        "Si quieres algo mas libre, el lapiz te sirve para bocetar a mano alzada directamente sobre la pizarra.",
      ],
      getTarget: getToolbarTarget,
    },
    {
      id: "selection",
      title: "Seleccion activa",
      description: [
        "La IA no actua sobre todo el tablero. Solo trabaja sobre la parte que selecciones.",
        "Si quieres ir mas rapido, puedes usar el boton Seleccionar todo del panel de IA.",
      ],
      getTarget: () => aiStatusRef.current,
    },
    {
      id: "actions",
      title: "Acciones de IA",
      description: [
        "Reinterpretar transforma el boceto en una version mas presentada.",
        "Pintar empuja el acabado visual.",
      ],
      getTarget: () => aiActionsRef.current,
    },
    {
      id: "note",
      title: "Matiz",
      description:
        "Aqui puedes decirle a la IA lo que quieres: por ejemplo, estilo, tono, estructura o una aclaracion corta.",
      getTarget: () => aiNoteRef.current,
    },
    {
      id: "apply",
      title: "Aplicar",
      description:
        "Cuando tengas algo seleccionado, pulsa aqui para reinterpretarlo dentro del canvas.",
      getTarget: () => aiApplyButtonRef.current,
    },
    {
      id: "export",
      title: "Exportar",
      description:
        "Desde este menu superior puedes abrir el archivo, exportar la imagen final o guardarla cuando el resultado ya te convenza.",
      getTarget: getMenuTarget,
    },
    {
      id: "socials",
      title: "Mis enlaces",
      description:
        "En Ayuda tienes mis enlaces a LinkedIn, GitHub y Portfolio por si quieres seguir Trazo o contactar conmigo.",
      getTarget: getHelpTarget,
    },
  ];

  return (
    <div className="app-shell">
      <div
        className={`workspace-shell ${
          entered ? "workspace-shell--entered" : "workspace-shell--welcome"
        }`}
      >
        <div ref={canvasStageRef} className="canvas-stage">
          <Excalidraw
            theme="light"
            langCode="es-ES"
            name="Trazo"
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            onChange={handleCanvasChange}
            UIOptions={{
              welcomeScreen: false,
              dockedSidebarBreakpoint: 100000,
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                loadScene: true,
                saveToActiveFile: false,
                toggleTheme: false,
                saveAsImage: true,
                export: {
                  saveFileToDisk: true,
                },
              },
              tools: {
                image: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        </div>

        {entered && (
          <AiSidebarPanel
            selectedElements={selectedElements}
            sceneElementCount={sceneElementCount}
            onRequestProposal={handleRequestProposal}
            onApplyProposal={handleApplyProposal}
            onSelectAll={handleSelectAll}
            statusRef={aiStatusRef}
            actionsRef={aiActionsRef}
            noteRef={aiNoteRef}
            applyButtonRef={aiApplyButtonRef}
          />
        )}
      </div>

      {!entered && (
        <div className="welcome-overlay">
          <div className="scene-aura scene-aura-left" />
          <div className="scene-aura scene-aura-right" />

          <div className="welcome-card">
            <div className="brand-area">
              <img
                src="/logo_login.webp"
                alt="Trazo"
                className="brand-art"
              />
            </div>

            <div className="form-zone">
              <div className="name-field">
                <input
                  type="text"
                  placeholder="Introduce tu nombre"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleStart();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                disabled={isStarting}
                className={`start-button ${isStarting ? "is-clicked" : ""}`}
                onClick={handleStart}
              >
                <span>COMENZAR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <GuidedTour
        open={entered && isTourOpen}
        steps={tourSteps}
        onStepChange={(step) => {
          setActiveTourStepId(step?.id ?? null);
        }}
        onClose={() => {
          handleCloseTour();
        }}
      />
    </div>
  );
}

export default App;
