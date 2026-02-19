import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Popover, PopoverTrigger } from "@pinpatch/ui/components/popover";
import { PIN_CURSOR } from "./components/pin-glyph";
import { ComposerPanel } from "./components/composer-panel";
import { getPinClass, PinStatusIcon } from "./components/pin-visuals";
import { StatusPanel } from "./components/status-panel";
import type {
  ComposerState,
  HoverBounds,
  OverlayElement,
  OverlayPin,
  ProgressEvent,
  TerminalEvent
} from "./components/types";
import "./styles.css";

const getBridgeOrigin = (): string => {
  const custom = (window as typeof window & { __PINPATCH_BRIDGE_URL?: string }).__PINPATCH_BRIDGE_URL;
  return custom ?? "http://localhost:7331";
};

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
};

const randomId = (): string => {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const extractNearbyText = (element: HTMLElement): string[] => {
  const parent = element.parentElement;
  if (!parent) {
    return [];
  }

  return parent.innerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
};

const computedStyleSummary = (element: HTMLElement): Record<string, string> => {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    padding: style.padding,
    fontSize: style.fontSize,
    backgroundColor: style.backgroundColor
  };
};

const toTaskId = (): string => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${date}-${suffix}`;
};

const captureScreenshot = async (): Promise<string> => {
  try {
    const html2canvasModule = await import("html2canvas");
    const html2canvas = html2canvasModule.default as unknown as (
      element: HTMLElement,
      options: {
        logging: boolean;
        useCORS: boolean;
        backgroundColor: string | null;
        ignoreElements: (element: Element) => boolean;
      }
    ) => Promise<HTMLCanvasElement>;

    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      backgroundColor: null,
      ignoreElements: (element: Element) => {
        return element.id === "pinpatch-overlay-root" || element.closest("#pinpatch-overlay-root") !== null;
      }
    });
    return canvas.toDataURL("image/png");
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1, 1);
    }
    return canvas.toDataURL("image/png");
  }
};

const OverlayApp = (): ReactElement => {
  const [commentMode, setCommentMode] = useState(false);
  const [pins, setPins] = useState<OverlayPin[]>([]);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoverBox, setHoverBox] = useState<DOMRect | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);

  const hoveredElementRef = useRef<OverlayElement | null>(null);
  const streamMapRef = useRef(new Map<string, EventSource>());
  const pinElementMapRef = useRef(new Map<string, HTMLButtonElement>());
  const panelElementMapRef = useRef(new Map<string, HTMLDivElement>());
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const isMac = useMemo(() => /mac/i.test(navigator.platform), []);
  const bridgeOrigin = useMemo(() => getBridgeOrigin(), []);

  const dismissComposer = (): void => {
    setComposer((current) => {
      if (current) {
        setPins((existing) => existing.filter((pin) => pin.id !== current.pinId));
      }
      return null;
    });
  };

  const isInFlightPin = (pin: OverlayPin): boolean => {
    return pin.status === "queued" || pin.status === "running";
  };

  const cancelPinIfInFlight = (pin: OverlayPin): void => {
    if (!isInFlightPin(pin) || !pin.taskId || !pin.sessionId) {
      return;
    }

    void postJson<{ status: "cancelled" }>(`${bridgeOrigin}/api/tasks/${pin.taskId}/cancel`, {
      sessionId: pin.sessionId
    }).catch(() => undefined);
  };

  const clearPin = (pin: OverlayPin): void => {
    cancelPinIfInFlight(pin);

    const source = streamMapRef.current.get(pin.id);
    if (source) {
      source.close();
      streamMapRef.current.delete(pin.id);
    }

    pinElementMapRef.current.delete(pin.id);
    panelElementMapRef.current.delete(pin.id);

    setComposer((current) => (current?.pinId === pin.id ? null : current));
    setHoveredPinId((current) => (current === pin.id ? null : current));
    setPins((existing) => existing.filter((entry) => entry.id !== pin.id));
  };

  const clearAllPins = (): void => {
    for (const pin of pins) {
      cancelPinIfInFlight(pin);
    }

    for (const source of streamMapRef.current.values()) {
      source.close();
    }

    streamMapRef.current.clear();
    pinElementMapRef.current.clear();
    panelElementMapRef.current.clear();
    setComposer(null);
    setHoveredPinId(null);
    setHoverBox(null);
    setPins([]);
  };

  const setPinElement = (pinId: string, element: HTMLButtonElement | null): void => {
    if (element) {
      pinElementMapRef.current.set(pinId, element);
      return;
    }

    pinElementMapRef.current.delete(pinId);
  };

  const setPanelElement = (pinId: string, element: HTMLDivElement | null): void => {
    if (element) {
      panelElementMapRef.current.set(pinId, element);
      return;
    }

    panelElementMapRef.current.delete(pinId);
  };

  const getHoverBounds = (pinId: string): HoverBounds | null => {
    const pinElement = pinElementMapRef.current.get(pinId);
    if (!pinElement) {
      return null;
    }

    const pinRect = pinElement.getBoundingClientRect();
    const panelElement = panelElementMapRef.current.get(pinId);
    if (!panelElement) {
      return {
        left: pinRect.left,
        top: pinRect.top,
        right: pinRect.right,
        bottom: pinRect.bottom
      };
    }

    const panelRect = panelElement.getBoundingClientRect();
    return {
      left: Math.min(pinRect.left, panelRect.left),
      top: Math.min(pinRect.top, panelRect.top),
      right: Math.max(pinRect.right, panelRect.right),
      bottom: Math.max(pinRect.bottom, panelRect.bottom)
    };
  };

  useEffect(() => {
    const root = document.documentElement;
    if (commentMode) {
      root.classList.add("pinpatch-comment-mode");
      root.style.setProperty("--pinpatch-comment-cursor", PIN_CURSOR);
    } else {
      root.classList.remove("pinpatch-comment-mode");
      root.style.removeProperty("--pinpatch-comment-cursor");
    }

    return () => {
      root.classList.remove("pinpatch-comment-mode");
      root.style.removeProperty("--pinpatch-comment-cursor");
    };
  }, [commentMode]);

  useEffect(() => {
    if (!composer) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => window.cancelAnimationFrame(handle);
  }, [composer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      const isDeleteKey = event.key === "Delete" || event.key === "Backspace";
      const isClearAllShortcut =
        isDeleteKey && ((isMac && event.metaKey && !event.ctrlKey) || (!isMac && event.ctrlKey && !event.metaKey));
      if (isClearAllShortcut) {
        event.preventDefault();
        event.stopPropagation();
        clearAllPins();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        if (isTyping) {
          return;
        }

        setCommentMode((current) => !current);
        if (commentMode) {
          setHoverBox(null);
        }
      }

      if (event.key === "Escape") {
        setCommentMode(false);
        setHoverBox(null);
        dismissComposer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commentMode, isMac, pins]);

  useEffect(() => {
    if (!hoveredPinId) {
      return;
    }

    const onMouseMove = (event: MouseEvent): void => {
      const bounds = getHoverBounds(hoveredPinId);
      if (!bounds) {
        setHoveredPinId((current) => (current === hoveredPinId ? null : current));
        return;
      }

      const insideBounds =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!insideBounds) {
        setHoveredPinId((current) => (current === hoveredPinId ? null : current));
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [hoveredPinId]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      if (!commentMode) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target || target.closest("#pinpatch-overlay-root")) {
        return;
      }

      const rect = target.getBoundingClientRect();
      hoveredElementRef.current = {
        node: target,
        rect
      };
      setHoverBox(rect);
    };

    const onClick = (event: MouseEvent): void => {
      if (!commentMode) {
        return;
      }

      const target = hoveredElementRef.current;
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const pinId = randomId();
      setPins((existing) => [
        ...existing,
        {
          id: pinId,
          x: event.clientX,
          y: event.clientY,
          targetRect: {
            left: target.rect.left,
            top: target.rect.top,
            width: target.rect.width,
            height: target.rect.height
          },
          body: "",
          status: "idle",
          message: ""
        }
      ]);

      setComposer({
        pinId,
        body: "",
        target
      });

      setCommentMode(false);
      setHoverBox(null);
    };

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [commentMode]);

  useEffect(() => {
    return () => {
      for (const source of streamMapRef.current.values()) {
        source.close();
      }
      streamMapRef.current.clear();
    };
  }, []);

  const hoveredPinTargetRect = useMemo(() => {
    if (!hoveredPinId) {
      return null;
    }

    const pin = pins.find((entry) => entry.id === hoveredPinId);
    return pin?.targetRect ?? null;
  }, [hoveredPinId, pins]);

  const subscribeToEvents = (pinId: string, eventsUrl: string): void => {
    const source = new EventSource(`${bridgeOrigin}${eventsUrl}`);
    streamMapRef.current.set(pinId, source);

    source.addEventListener("progress", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as ProgressEvent;
      setPins((existing) =>
        existing.map((pin) =>
          pin.id === pinId
            ? {
              ...pin,
              status: payload.status,
              message: payload.message
            }
            : pin
        )
      );
    });

    source.addEventListener("terminal", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as TerminalEvent;

      setPins((existing) =>
        existing.map((pin) =>
          pin.id === pinId
            ? {
              ...pin,
              status: payload.status,
              message: payload.summary
            }
            : pin
        )
      );

      source.close();
      streamMapRef.current.delete(pinId);
    });

    source.onerror = () => {
      source.close();
      streamMapRef.current.delete(pinId);
    };
  };

  const submitPin = async (): Promise<void> => {
    if (!composer) {
      return;
    }

    const pin = pins.find((entry) => entry.id === composer.pinId);
    if (!pin || !composer.body.trim()) {
      return;
    }

    const clientTaskId = toTaskId();
    const sessionId = randomId();
    const screenshotDataUrl = await captureScreenshot();

    const element = composer.target.node;
    const rect = composer.target.rect;

    const uiChangePacket = {
      id: randomId(),
      timestamp: new Date().toISOString(),
      url: `${window.location.pathname}${window.location.search}`,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      element: {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        text: element.textContent?.trim() ?? null,
        attributes: {
          class: element.getAttribute("class"),
          "aria-label": element.getAttribute("aria-label"),
          "data-testid": element.getAttribute("data-testid")
        },
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      },
      nearbyText: extractNearbyText(element),
      domSnippet: element.outerHTML.slice(0, 3000),
      computedStyleSummary: computedStyleSummary(element),
      screenshotPath: `.pinpatch/screenshots/${clientTaskId}.png`,
      userRequest: composer.body
    };

    setPins((existing) =>
      existing.map((entry) =>
        entry.id === composer.pinId
          ? {
            ...entry,
            body: composer.body,
            status: "queued",
            message: "Creating task..."
          }
          : entry
      )
    );

    try {
      const createResponse = await postJson<{
        taskId: string;
        sessionId: string;
        eventsUrl: string;
      }>(`${bridgeOrigin}/api/tasks`, {
        sessionId,
        url: `${window.location.pathname}${window.location.search}`,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        pin: {
          x: pin.x,
          y: pin.y
        },
        comment: {
          body: composer.body
        },
        uiChangePacket,
        screenshotPath: `.pinpatch/screenshots/${clientTaskId}.png`,
        screenshotDataUrl,
        clientTaskId
      });

      await postJson(`${bridgeOrigin}/api/tasks/${createResponse.taskId}/submit`, {
        sessionId: createResponse.sessionId,
        provider: "codex",
        model: "gpt-5.3-codex-spark",
        dryRun: false,
        debug: false
      });

      setPins((existing) =>
        existing.map((entry) =>
          entry.id === composer.pinId
            ? {
              ...entry,
              taskId: createResponse.taskId,
              sessionId: createResponse.sessionId,
              status: "queued",
              message: "Queued"
            }
            : entry
        )
      );

      subscribeToEvents(composer.pinId, createResponse.eventsUrl);
      setComposer(null);
    } catch (error) {
      setPins((existing) =>
        existing.map((entry) =>
          entry.id === composer.pinId
            ? {
              ...entry,
              status: "error",
              message: error instanceof Error ? error.message : "Failed to submit"
            }
            : entry
        )
      );
    }
  };

  const retryPin = async (pin: OverlayPin): Promise<void> => {
    if (!pin.taskId) {
      return;
    }

    const sessionId = randomId();
    setPins((existing) =>
      existing.map((entry) =>
        entry.id === pin.id
          ? {
            ...entry,
            status: "queued",
            sessionId,
            message: "Retry queued"
          }
          : entry
      )
    );

    try {
      const response = await postJson<{ eventsUrl: string }>(`${bridgeOrigin}/api/tasks/${pin.taskId}/submit`, {
        sessionId,
        provider: "codex",
        model: "gpt-5.3-codex-spark",
        dryRun: false,
        debug: false
      });

      subscribeToEvents(pin.id, response.eventsUrl);
    } catch (error) {
      setPins((existing) =>
        existing.map((entry) =>
          entry.id === pin.id
            ? {
              ...entry,
              status: "error",
              message: error instanceof Error ? error.message : "Retry failed"
            }
            : entry
        )
      );
    }
  };

  return (
    <>
      {hoverBox && commentMode ? (
        <div
          className="pointer-events-none fixed border-2 border-blue-500 bg-blue-300/15"
          data-testid="pinpatch-hover-highlight"
          style={{
            left: hoverBox.left,
            top: hoverBox.top,
            width: hoverBox.width,
            height: hoverBox.height
          }}
        />
      ) : null}

      {hoveredPinTargetRect && !commentMode ? (
        <div
          className="pointer-events-none fixed border-2 border-emerald-500 bg-emerald-300/15"
          data-testid="pinpatch-pin-target-highlight"
          style={{
            left: hoveredPinTargetRect.left,
            top: hoveredPinTargetRect.top,
            width: hoveredPinTargetRect.width,
            height: hoveredPinTargetRect.height
          }}
        />
      ) : null}

      {pins.map((pin) => {
        const isHovered = hoveredPinId === pin.id;
        const isComposerPin = composer?.pinId === pin.id;
        const showStatusPanel = isHovered && !isComposerPin && pin.status !== "idle";

        return (
          <div
            className="pointer-events-none fixed"
            key={pin.id}
            style={{
              left: pin.x,
              top: pin.y
            }}
          >
            <Popover open={showStatusPanel || isComposerPin}>
              <PopoverTrigger asChild>
                <button
                  className={`pointer-events-auto flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-lg shadow-slate-900/20 ${getPinClass(pin.status)}`}
                  data-testid="pinpatch-pin"
                  onMouseEnter={() => setHoveredPinId(pin.id)}
                  ref={(element) => {
                    setPinElement(pin.id, element);
                  }}
                  type="button"
                >
                  <PinStatusIcon status={pin.status} />
                </button>
              </PopoverTrigger>

              {showStatusPanel ? (
                <StatusPanel
                  contentRef={(element) => {
                    setPanelElement(pin.id, element);
                  }}
                  onCancel={() => clearPin(pin)}
                  onClear={() => clearPin(pin)}
                  onRetry={() => {
                    void retryPin(pin);
                  }}
                  pin={pin}
                />
              ) : null}

              {isComposerPin ? (
                <ComposerPanel
                  body={composer.body}
                  inputRef={composerInputRef}
                  onBodyChange={(value) => {
                    setComposer((current) => (current ? { ...current, body: value } : current));
                  }}
                  onCancel={dismissComposer}
                  onSubmit={() => {
                    void submitPin();
                  }}
                />
              ) : null}
            </Popover>
          </div>
        );
      })}
    </>
  );
};

const mountOverlay = (): void => {
  const globalWindow = window as typeof window & { __PINPATCH_OVERLAY_MOUNTED__?: boolean };
  if (globalWindow.__PINPATCH_OVERLAY_MOUNTED__) {
    return;
  }

  globalWindow.__PINPATCH_OVERLAY_MOUNTED__ = true;

  const container = document.createElement("div");
  container.id = "pinpatch-overlay-root";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<OverlayApp />);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountOverlay(), { once: true });
} else {
  mountOverlay();
}
