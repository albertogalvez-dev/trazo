import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type GuidedTourStep = {
  id: string;
  title: string;
  description: string | string[];
  getTarget: () => HTMLElement | null;
  placement?: "auto" | "center";
};

type GuidedTourProps = {
  open: boolean;
  steps: readonly GuidedTourStep[];
  onClose: (completed: boolean) => void;
  onStepChange?: (step: GuidedTourStep | null) => void;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const VIEWPORT_GAP = 16;
const SPOTLIGHT_PADDING = 12;
const CARD_WIDTH = 320;
const DEFAULT_CARD_HEIGHT = 212;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isVisibleTarget = (target: HTMLElement | null) =>
  Boolean(target && target.getClientRects().length > 0);

const getSpotlightRect = (target: HTMLElement): SpotlightRect => {
  const rect = target.getBoundingClientRect();
  const left = clamp(
    rect.left - SPOTLIGHT_PADDING,
    VIEWPORT_GAP,
    window.innerWidth - VIEWPORT_GAP,
  );
  const top = clamp(
    rect.top - SPOTLIGHT_PADDING,
    VIEWPORT_GAP,
    window.innerHeight - VIEWPORT_GAP,
  );
  const right = clamp(
    rect.right + SPOTLIGHT_PADDING,
    VIEWPORT_GAP,
    window.innerWidth - VIEWPORT_GAP,
  );
  const bottom = clamp(
    rect.bottom + SPOTLIGHT_PADDING,
    VIEWPORT_GAP,
    window.innerHeight - VIEWPORT_GAP,
  );

  return {
    left,
    top,
    width: Math.max(120, right - left),
    height: Math.max(56, bottom - top),
  };
};

const getCardPosition = (
  spotlightRect: SpotlightRect,
  cardHeight: number,
  placement: GuidedTourStep["placement"] = "auto",
): CSSProperties => {
  const maxWidth = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);

  if (placement === "center") {
    return {
      width: maxWidth,
      left: clamp(
        window.innerWidth / 2 - maxWidth / 2,
        VIEWPORT_GAP,
        window.innerWidth - maxWidth - VIEWPORT_GAP,
      ),
      top: clamp(
        window.innerHeight / 2 - cardHeight / 2,
        VIEWPORT_GAP,
        window.innerHeight - cardHeight - VIEWPORT_GAP,
      ),
    };
  }

  const left = clamp(
    spotlightRect.left + spotlightRect.width / 2 - maxWidth / 2,
    VIEWPORT_GAP,
    window.innerWidth - maxWidth - VIEWPORT_GAP,
  );

  let top = spotlightRect.top + spotlightRect.height + 16;

  if (top + cardHeight > window.innerHeight - VIEWPORT_GAP) {
    top = spotlightRect.top - cardHeight - 16;
  }

  if (top < VIEWPORT_GAP) {
    top = window.innerHeight - cardHeight - VIEWPORT_GAP;
  }

  return {
    width: maxWidth,
    left,
    top: clamp(
      top,
      VIEWPORT_GAP,
      window.innerHeight - cardHeight - VIEWPORT_GAP,
    ),
  };
};

export function GuidedTour({
  open,
  steps,
  onClose,
  onStepChange,
}: GuidedTourProps) {
  const availableSteps = useMemo(
    () => steps.filter((step) => isVisibleTarget(step.getTarget())),
    [steps],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const activeStep =
    open && availableSteps.length > 0 ? availableSteps[activeIndex] : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || availableSteps.length === 0) {
      return;
    }

    setActiveIndex((currentIndex) =>
      clamp(currentIndex, 0, availableSteps.length - 1),
    );
  }, [availableSteps.length, open]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) {
      return;
    }

    setCardHeight(cardRef.current.offsetHeight || DEFAULT_CARD_HEIGHT);
  }, [activeIndex, open, spotlightRect]);

  useEffect(() => {
    if (!open || !activeStep) {
      setSpotlightRect(null);
      return;
    }

    const updateSpotlight = () => {
      const target = activeStep.getTarget();

      if (!target || !isVisibleTarget(target)) {
        setSpotlightRect(null);
        return;
      }

      setSpotlightRect(getSpotlightRect(target));
    };

    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);

    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [activeStep, open]);

  useEffect(() => {
    onStepChange?.(open ? activeStep : null);
  }, [activeStep, onStepChange, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !activeStep || !spotlightRect) {
    return null;
  }

  const isLastStep = activeIndex === availableSteps.length - 1;
  const cardPosition = getCardPosition(
    spotlightRect,
    cardHeight,
    activeStep.placement,
  );
  const descriptionParagraphs = Array.isArray(activeStep.description)
    ? activeStep.description
    : [activeStep.description];

  return (
    <div className="guided-tour" role="dialog" aria-modal="true">
      <div className="guided-tour__scrim" />

      <div
        className="guided-tour__spotlight"
        style={{
          top: spotlightRect.top,
          left: spotlightRect.left,
          width: spotlightRect.width,
          height: spotlightRect.height,
        }}
      />

      <div
        ref={cardRef}
        className="guided-tour__card"
        style={cardPosition}
      >
        <span className="guided-tour__step">
          Paso {activeIndex + 1} de {availableSteps.length}
        </span>

        <h3>{activeStep.title}</h3>
        <div className="guided-tour__body">
          {descriptionParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="guided-tour__actions">
          <button
            type="button"
            className="guided-tour__ghost"
            onClick={() => onClose(false)}
          >
            Omitir
          </button>

          <div className="guided-tour__primary-actions">
            {activeIndex > 0 && (
              <button
                type="button"
                className="guided-tour__ghost"
                onClick={() => setActiveIndex((currentIndex) => currentIndex - 1)}
              >
                Atras
              </button>
            )}

            <button
              type="button"
              className="guided-tour__solid"
              onClick={() => {
                if (isLastStep) {
                  onClose(true);
                  return;
                }

                setActiveIndex((currentIndex) => currentIndex + 1);
              }}
            >
              {isLastStep ? "Entendido" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
