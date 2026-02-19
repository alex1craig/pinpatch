import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Popover, PopoverTrigger } from "@pinpatch/ui/components/popover";
import { ComposerPanel } from "./composer-panel";
import { PIN_CURSOR } from "./pin-glyph";
import { getPinClass, PinStatusIcon } from "./pin-visuals";
import { StatusPanel } from "./status-panel";
import type { ComposerState, HoverBounds, OverlayElement, OverlayPin } from "./types";
import { useOverlayKeyboard } from "../hooks/use-overlay-keyboard";
import { useOverlayNavigation } from "../hooks/use-overlay-navigation";
import { usePinHover } from "../hooks/use-pin-hover";
import { buildAnchor, resolveTargetFromHint } from "../lib/anchor";
import { getBridgeOrigin, postJson, subscribeToTaskEvents } from "../lib/bridge";
import { withResolvedGeometry } from "../lib/geometry";
import { getRouteKey, randomId, toTaskId } from "../lib/ids";
import { readPersistedPins, persistPins } from "../lib/storage";
import { buildUiChangePacket, captureScreenshot } from "../lib/ui-change-packet";

export const OverlayApp = (): ReactElement => {
  const [pinMode, setPinMode] = useState(false);
  const [pins, setPins] = useState<OverlayPin[]>([]);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoverBox, setHoverBox] = useState<DOMRect | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);

  const hoveredElementRef = useRef<OverlayElement | null>(null);
  const streamMapRef = useRef(new Map<string, EventSource>());
  const pinElementMapRef = useRef(new Map<string, HTMLButtonElement>());
  const panelElementMapRef = useRef(new Map<string, HTMLDivElement>());
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);

  const isMac = useMemo(() => /mac/i.test(navigator.platform), []);
  const bridgeOrigin = useMemo(() => getBridgeOrigin(), []);
  const overlayContainer = useMemo(() => document.getElementById("pinpatch-overlay-root"), []);

  const currentRouteKey = useOverlayNavigation({
    onRouteChange: useCallback((nextRouteKey: string): void => {
      setPins((existingPins) =>
        existingPins.map((pin) => (pin.routeKey === nextRouteKey ? withResolvedGeometry(pin) : pin))
      );
      setHoverBox(null);
    }, [])
  });

  const visiblePins = useMemo(() => {
    return pins.filter((pin) => pin.routeKey === currentRouteKey);
  }, [pins, currentRouteKey]);

  const isInFlightPin = useCallback((pin: OverlayPin): boolean => {
    return pin.status === "queued" || pin.status === "running";
  }, []);

  const subscribeToEvents = useCallback(
    (pinId: string, eventsUrl: string): void => {
      const existing = streamMapRef.current.get(pinId);
      if (existing) {
        existing.close();
      }

      const source = subscribeToTaskEvents(bridgeOrigin, eventsUrl, {
        onProgress: (payload) => {
          setPins((existingPins) =>
            existingPins.map((pin) =>
              pin.id === pinId
                ? {
                  ...pin,
                  status: payload.status,
                  message: payload.message
                }
                : pin
            )
          );
        },
        onTerminal: (payload) => {
          setPins((existingPins) =>
            existingPins.map((pin) =>
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
        },
        onError: () => {
          source.close();
          streamMapRef.current.delete(pinId);
        }
      });

      streamMapRef.current.set(pinId, source);
    },
    [bridgeOrigin]
  );

  const cancelPinIfInFlight = useCallback(
    (pin: OverlayPin): void => {
      if (!isInFlightPin(pin) || !pin.taskId || !pin.sessionId) {
        return;
      }

      void postJson<{ status: "cancelled" }>(`${bridgeOrigin}/api/tasks/${pin.taskId}/cancel`, {
        sessionId: pin.sessionId
      }).catch(() => undefined);
    },
    [bridgeOrigin, isInFlightPin]
  );

  const dismissComposer = useCallback((): void => {
    setComposer((current) => {
      if (current) {
        setPins((existingPins) => existingPins.filter((pin) => pin.id !== current.pinId));
      }
      return null;
    });
  }, []);

  const clearPin = useCallback(
    (pin: OverlayPin): void => {
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
      setPins((existingPins) => existingPins.filter((entry) => entry.id !== pin.id));
    },
    [cancelPinIfInFlight]
  );

  const clearAllPins = useCallback((): void => {
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
  }, [cancelPinIfInFlight, pins]);

  const setPinElement = useCallback((pinId: string, element: HTMLButtonElement | null): void => {
    if (element) {
      pinElementMapRef.current.set(pinId, element);
      return;
    }

    pinElementMapRef.current.delete(pinId);
  }, []);

  const setPanelElement = useCallback((pinId: string, element: HTMLDivElement | null): void => {
    if (element) {
      panelElementMapRef.current.set(pinId, element);
      return;
    }

    panelElementMapRef.current.delete(pinId);
  }, []);

  const getHoverBounds = useCallback((pinId: string): HoverBounds | null => {
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
  }, []);

  usePinHover({
    getHoverBounds,
    hoveredPinId,
    setHoveredPinId
  });

  useOverlayKeyboard({
    clearAllPins,
    pinMode,
    dismissComposer,
    isMac,
    setPinMode,
    setHoverBox
  });

  useEffect(() => {
    const root = document.documentElement;
    if (pinMode) {
      root.classList.add("pinpatch-pin-mode");
      root.style.setProperty("--pinpatch-pin-cursor", PIN_CURSOR);
    } else {
      root.classList.remove("pinpatch-pin-mode");
      root.style.removeProperty("--pinpatch-pin-cursor");
    }

    return () => {
      root.classList.remove("pinpatch-pin-mode");
      root.style.removeProperty("--pinpatch-pin-cursor");
    };
  }, [pinMode]);

  useEffect(() => {
    const hydratedPins = readPersistedPins(getRouteKey());
    setPins(hydratedPins);

    for (const pin of hydratedPins) {
      if (!isInFlightPin(pin) || !pin.taskId || !pin.sessionId) {
        continue;
      }

      subscribeToEvents(pin.id, `/api/tasks/${pin.taskId}/events?sessionId=${pin.sessionId}`);
    }

    hydratedRef.current = true;
  }, [isInFlightPin, subscribeToEvents]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    persistPins(pins);
  }, [pins]);

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
    if (!hoveredPinId) {
      return;
    }

    const hoveredPin = pins.find((pin) => pin.id === hoveredPinId);
    if (!hoveredPin || hoveredPin.routeKey !== currentRouteKey) {
      setHoveredPinId(null);
    }
  }, [currentRouteKey, hoveredPinId, pins]);

  useEffect(() => {
    if (!composer) {
      return;
    }

    const composerPin = pins.find((pin) => pin.id === composer.pinId);
    if (!composerPin || composerPin.routeKey !== currentRouteKey) {
      setComposer(null);
    }
  }, [composer, currentRouteKey, pins]);

  useEffect(() => {
    if (!composer) {
      return;
    }

    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const composerPanel = panelElementMapRef.current.get(composer.pinId);
      if (composerPanel?.contains(target)) {
        return;
      }

      dismissComposer();
    };

    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [composer, dismissComposer]);

  useEffect(() => {
    let frame = 0;

    const scheduleResolve = (): void => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setPins((existingPins) =>
          existingPins.map((pin) => (pin.routeKey === currentRouteKey ? withResolvedGeometry(pin) : pin))
        );
      });
    };

    window.addEventListener("resize", scheduleResolve);
    scheduleResolve();

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", scheduleResolve);
    };
  }, [currentRouteKey]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      if (!pinMode) {
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
      if (!pinMode) {
        return;
      }

      const target = hoveredElementRef.current;
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const pinId = randomId();
      const anchor = buildAnchor(
        event.clientX,
        event.clientY,
        {
          left: target.rect.left,
          top: target.rect.top,
          width: target.rect.width,
          height: target.rect.height
        },
        target.node
      );

      const pin: OverlayPin = {
        id: pinId,
        routeKey: currentRouteKey,
        x: event.clientX,
        y: event.clientY,
        targetRect: {
          left: target.rect.left,
          top: target.rect.top,
          width: target.rect.width,
          height: target.rect.height
        },
        anchor,
        body: "",
        status: "idle",
        message: ""
      };

      setPins((existingPins) => [...existingPins, pin]);

      setComposer({
        pinId,
        body: "",
        target
      });

      setPinMode(false);
      setHoverBox(null);
    };

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [pinMode, currentRouteKey]);

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

    const pin = visiblePins.find((entry) => entry.id === hoveredPinId);
    return pin?.targetRect ?? null;
  }, [hoveredPinId, visiblePins]);

  const submitPin = async (): Promise<void> => {
    if (!composer) {
      return;
    }

    const { body, pinId, target } = composer;
    const existingPin = pins.find((entry) => entry.id === pinId);
    if (!existingPin || !body.trim()) {
      return;
    }

    const pin = withResolvedGeometry(existingPin);
    const targetElement = resolveTargetFromHint(pin.anchor.targetHint) ?? target.node;
    const rect = targetElement.getBoundingClientRect();

    setComposer(null);

    setPins((existingPins) =>
      existingPins.map((entry) =>
        entry.id === pinId
          ? {
            ...entry,
            x: pin.x,
            y: pin.y,
            targetRect: pin.targetRect,
            body,
            status: "queued",
            message: "Creating task..."
          }
          : entry
      )
    );

    const clientTaskId = toTaskId();
    const sessionId = randomId();
    const screenshotDataUrl = await captureScreenshot();

    const uiChangePacket = buildUiChangePacket({
      clientTaskId,
      rect,
      targetElement,
      userRequest: body
    });

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
          y: pin.y,
          body
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

      setPins((existingPins) =>
        existingPins.map((entry) =>
          entry.id === pinId
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

      subscribeToEvents(pinId, createResponse.eventsUrl);
    } catch (error) {
      setPins((existingPins) =>
        existingPins.map((entry) =>
          entry.id === pinId
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
    setPins((existingPins) =>
      existingPins.map((entry) =>
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
      setPins((existingPins) =>
        existingPins.map((entry) =>
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
      {hoverBox && pinMode ? (
        <div
          className="pointer-events-none fixed z-10 border-2 border-blue-500 bg-blue-300/15"
          data-testid="pinpatch-hover-highlight"
          style={{
            left: hoverBox.left,
            top: hoverBox.top,
            width: hoverBox.width,
            height: hoverBox.height
          }}
        />
      ) : null}

      {hoveredPinTargetRect && !pinMode ? (
        <div
          className="pointer-events-none fixed z-10 border-2 border-emerald-500 bg-emerald-300/15"
          data-testid="pinpatch-pin-target-highlight"
          style={{
            left: hoveredPinTargetRect.left,
            top: hoveredPinTargetRect.top,
            width: hoveredPinTargetRect.width,
            height: hoveredPinTargetRect.height
          }}
        />
      ) : null}

      {visiblePins.map((pin) => {
        const isHovered = hoveredPinId === pin.id;
        const isComposerPin = composer?.pinId === pin.id;
        const showStatusPanel = isHovered && !isComposerPin && pin.status !== "idle";

        return (
          <div
            className="pointer-events-none fixed z-20"
            key={pin.id}
            style={{
              left: pin.x,
              top: pin.y
            }}
          >
            <Popover open={showStatusPanel || isComposerPin}>
              <PopoverTrigger asChild>
                <button
                  className={`pointer-events-auto inline-flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-lg ${getPinClass(pin.status)}`}
                  data-status={pin.status}
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
                  container={overlayContainer}
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
                  container={overlayContainer}
                  contentRef={(element) => {
                    setPanelElement(pin.id, element);
                  }}
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
