import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
  PinAnchor,
  PinStatus,
  ProgressEvent,
  TargetHint,
  TerminalEvent
} from "./components/types";
import "./styles.css";

const PIN_STORAGE_KEY = "pinpatch.overlay.pins.v1";
const PIN_STORAGE_VERSION = 1;
const NAVIGATION_EVENT = "pinpatch:navigation";

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

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getViewportWidth = (): number => {
  return Math.max(window.innerWidth, 1);
};

const getViewportHeight = (): number => {
  return Math.max(window.innerHeight, 1);
};

const toViewportRatio = (value: number, size: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) {
    return 0;
  }

  return clamp(value / size, 0, 1);
};

const fromViewportRatio = (ratio: number, size: number): number => {
  const safeRatio = Number.isFinite(ratio) ? ratio : 0;
  return clamp(safeRatio, 0, 1) * Math.max(size, 1);
};

const toTaskId = (): string => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${date}-${suffix}`;
};

const getRouteKey = (): string => {
  return `${window.location.pathname}${window.location.search}`;
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

const isPinStatus = (status: unknown): status is PinStatus => {
  return (
    status === "idle" ||
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "timeout"
  );
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const sanitizeTextHint = (value: string | null): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 200);
};

const escapeSelector = (value: string): string => {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value);
  }

  return value.replace(/(["\\])/g, "\\$1");
};

const buildTargetHint = (element: HTMLElement): TargetHint => {
  return {
    testId: sanitizeTextHint(element.getAttribute("data-testid")),
    id: sanitizeTextHint(element.id),
    ariaLabel: sanitizeTextHint(element.getAttribute("aria-label")),
    tag: element.tagName.toLowerCase(),
    text: sanitizeTextHint(element.textContent)
  };
};

const normalizeTargetHint = (value: unknown): TargetHint | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const tag = sanitizeTextHint(typeof record.tag === "string" ? record.tag : null);
  if (!tag) {
    return null;
  }

  return {
    tag,
    testId: sanitizeTextHint(typeof record.testId === "string" ? record.testId : null),
    id: sanitizeTextHint(typeof record.id === "string" ? record.id : null),
    ariaLabel: sanitizeTextHint(typeof record.ariaLabel === "string" ? record.ariaLabel : null),
    text: sanitizeTextHint(typeof record.text === "string" ? record.text : null)
  };
};

const resolveTargetFromHint = (targetHint: TargetHint): HTMLElement | null => {
  if (targetHint.testId) {
    const byTestId = document.querySelector(`[data-testid="${escapeSelector(targetHint.testId)}"]`);
    if (byTestId instanceof HTMLElement) {
      return byTestId;
    }
  }

  if (targetHint.id) {
    const byId = document.getElementById(targetHint.id);
    if (byId instanceof HTMLElement) {
      return byId;
    }
  }

  const tag = targetHint.tag || "div";

  if (targetHint.ariaLabel) {
    const byAria = document.querySelector(
      `${tag}[aria-label="${escapeSelector(targetHint.ariaLabel)}"]`
    );
    if (byAria instanceof HTMLElement) {
      return byAria;
    }
  }

  if (targetHint.text) {
    const text = targetHint.text.trim();
    if (text) {
      const candidates = document.querySelectorAll(tag);
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const candidateText = node.textContent?.trim();
        if (candidateText === text) {
          return node;
        }
      }
    }
  }

  return null;
};

type GeometryResult = {
  x: number;
  y: number;
  targetRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

const buildAnchor = (
  x: number,
  y: number,
  targetRect: { left: number; top: number; width: number; height: number },
  targetNode: HTMLElement
): PinAnchor => {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();

  const targetWidth = Math.max(targetRect.width, 1);
  const targetHeight = Math.max(targetRect.height, 1);

  return {
    viewportRatio: {
      x: toViewportRatio(x, viewportWidth),
      y: toViewportRatio(y, viewportHeight)
    },
    targetRectRatio: {
      left: toViewportRatio(targetRect.left, viewportWidth),
      top: toViewportRatio(targetRect.top, viewportHeight),
      width: toViewportRatio(targetRect.width, viewportWidth),
      height: toViewportRatio(targetRect.height, viewportHeight)
    },
    targetOffsetRatio: {
      x: clamp((x - targetRect.left) / targetWidth, 0, 1),
      y: clamp((y - targetRect.top) / targetHeight, 0, 1)
    },
    targetHint: buildTargetHint(targetNode)
  };
};

const buildFallbackAnchor = (
  x: number,
  y: number,
  targetRect: { left: number; top: number; width: number; height: number }
): PinAnchor => {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();

  return {
    viewportRatio: {
      x: toViewportRatio(x, viewportWidth),
      y: toViewportRatio(y, viewportHeight)
    },
    targetRectRatio: {
      left: toViewportRatio(targetRect.left, viewportWidth),
      top: toViewportRatio(targetRect.top, viewportHeight),
      width: toViewportRatio(targetRect.width, viewportWidth),
      height: toViewportRatio(targetRect.height, viewportHeight)
    },
    targetOffsetRatio: {
      x: targetRect.width > 0 ? clamp((x - targetRect.left) / targetRect.width, 0, 1) : 0.5,
      y: targetRect.height > 0 ? clamp((y - targetRect.top) / targetRect.height, 0, 1) : 0.5
    },
    // This intentionally resolves to no elements, forcing viewport-ratio fallback.
    targetHint: {
      tag: "pinpatch-missing-target"
    }
  };
};

const normalizePinAnchor = (
  value: unknown,
  fallback: { x: number; y: number; targetRect: { left: number; top: number; width: number; height: number } }
): PinAnchor => {
  const record = asRecord(value);
  if (!record) {
    return buildFallbackAnchor(fallback.x, fallback.y, fallback.targetRect);
  }

  const viewportRatioRecord = asRecord(record.viewportRatio);
  const targetRectRatioRecord = asRecord(record.targetRectRatio);
  const targetOffsetRatioRecord = asRecord(record.targetOffsetRatio);
  const targetHint = normalizeTargetHint(record.targetHint);

  if (!viewportRatioRecord || !targetRectRatioRecord || !targetOffsetRatioRecord || !targetHint) {
    return buildFallbackAnchor(fallback.x, fallback.y, fallback.targetRect);
  }

  return {
    viewportRatio: {
      x: clamp(asFiniteNumber(viewportRatioRecord.x, toViewportRatio(fallback.x, getViewportWidth())), 0, 1),
      y: clamp(asFiniteNumber(viewportRatioRecord.y, toViewportRatio(fallback.y, getViewportHeight())), 0, 1)
    },
    targetRectRatio: {
      left: clamp(
        asFiniteNumber(targetRectRatioRecord.left, toViewportRatio(fallback.targetRect.left, getViewportWidth())),
        0,
        1
      ),
      top: clamp(
        asFiniteNumber(targetRectRatioRecord.top, toViewportRatio(fallback.targetRect.top, getViewportHeight())),
        0,
        1
      ),
      width: clamp(
        asFiniteNumber(targetRectRatioRecord.width, toViewportRatio(fallback.targetRect.width, getViewportWidth())),
        0,
        1
      ),
      height: clamp(
        asFiniteNumber(targetRectRatioRecord.height, toViewportRatio(fallback.targetRect.height, getViewportHeight())),
        0,
        1
      )
    },
    targetOffsetRatio: {
      x: clamp(asFiniteNumber(targetOffsetRatioRecord.x, 0.5), 0, 1),
      y: clamp(asFiniteNumber(targetOffsetRatioRecord.y, 0.5), 0, 1)
    },
    targetHint
  };
};

const resolvePinGeometry = (pin: OverlayPin): GeometryResult => {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  const target = resolveTargetFromHint(pin.anchor.targetHint);

  if (target) {
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + rect.width * pin.anchor.targetOffsetRatio.x,
      y: rect.top + rect.height * pin.anchor.targetOffsetRatio.y,
      targetRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    };
  }

  return {
    x: fromViewportRatio(pin.anchor.viewportRatio.x, viewportWidth),
    y: fromViewportRatio(pin.anchor.viewportRatio.y, viewportHeight),
    targetRect: {
      left: fromViewportRatio(pin.anchor.targetRectRatio.left, viewportWidth),
      top: fromViewportRatio(pin.anchor.targetRectRatio.top, viewportHeight),
      width: fromViewportRatio(pin.anchor.targetRectRatio.width, viewportWidth),
      height: fromViewportRatio(pin.anchor.targetRectRatio.height, viewportHeight)
    }
  };
};

const withResolvedGeometry = (pin: OverlayPin): OverlayPin => {
  const resolved = resolvePinGeometry(pin);
  if (
    pin.x === resolved.x &&
    pin.y === resolved.y &&
    pin.targetRect.left === resolved.targetRect.left &&
    pin.targetRect.top === resolved.targetRect.top &&
    pin.targetRect.width === resolved.targetRect.width &&
    pin.targetRect.height === resolved.targetRect.height
  ) {
    return pin;
  }

  return {
    ...pin,
    x: resolved.x,
    y: resolved.y,
    targetRect: resolved.targetRect
  };
};

const normalizeOverlayPin = (value: unknown, currentRouteKey: string): OverlayPin | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = typeof record.id === "string" && record.id ? record.id : null;
  if (!id) {
    return null;
  }

  const targetRectRecord = asRecord(record.targetRect);
  const fallbackTargetRect = {
    left: asFiniteNumber(targetRectRecord?.left, 0),
    top: asFiniteNumber(targetRectRecord?.top, 0),
    width: asFiniteNumber(targetRectRecord?.width, 0),
    height: asFiniteNumber(targetRectRecord?.height, 0)
  };

  const fallbackX = asFiniteNumber(record.x, 0);
  const fallbackY = asFiniteNumber(record.y, 0);

  const routeKey = typeof record.routeKey === "string" && record.routeKey ? record.routeKey : currentRouteKey;
  const anchor = normalizePinAnchor(record.anchor, {
    x: fallbackX,
    y: fallbackY,
    targetRect: fallbackTargetRect
  });

  const statusCandidate = record.status;
  const status = isPinStatus(statusCandidate) ? statusCandidate : "idle";

  return {
    id,
    routeKey,
    x: fallbackX,
    y: fallbackY,
    targetRect: fallbackTargetRect,
    anchor,
    body: typeof record.body === "string" ? record.body : "",
    status,
    message: typeof record.message === "string" ? record.message : "",
    taskId: typeof record.taskId === "string" && record.taskId ? record.taskId : undefined,
    sessionId: typeof record.sessionId === "string" && record.sessionId ? record.sessionId : undefined
  };
};

const readPersistedPins = (currentRouteKey: string): OverlayPin[] => {
  try {
    const raw = window.sessionStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    const parsedRecord = asRecord(parsed);

    let candidates: unknown[] = [];
    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else if (parsedRecord && parsedRecord.version === PIN_STORAGE_VERSION && Array.isArray(parsedRecord.pins)) {
      candidates = parsedRecord.pins;
    }

    const pins: OverlayPin[] = [];
    for (const candidate of candidates) {
      const normalized = normalizeOverlayPin(candidate, currentRouteKey);
      if (!normalized) {
        continue;
      }

      pins.push(withResolvedGeometry(normalized));
    }

    return pins;
  } catch {
    return [];
  }
};

const persistPins = (pins: OverlayPin[]): void => {
  const payload = {
    version: PIN_STORAGE_VERSION,
    pins
  };

  try {
    window.sessionStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Intentionally ignore storage failures.
  }
};

const OverlayApp = (): ReactElement => {
  const [commentMode, setCommentMode] = useState(false);
  const [pins, setPins] = useState<OverlayPin[]>([]);
  const [currentRouteKey, setCurrentRouteKey] = useState<string>(() => getRouteKey());
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

      const source = new EventSource(`${bridgeOrigin}${eventsUrl}`);
      streamMapRef.current.set(pinId, source);

      source.addEventListener("progress", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as ProgressEvent;
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
      });

      source.addEventListener("terminal", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as TerminalEvent;

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
      });

      source.onerror = () => {
        source.close();
        streamMapRef.current.delete(pinId);
      };
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
    const syncRouteState = (): void => {
      const nextRouteKey = getRouteKey();
      setCurrentRouteKey(nextRouteKey);
      setPins((existingPins) =>
        existingPins.map((pin) => (pin.routeKey === nextRouteKey ? withResolvedGeometry(pin) : pin))
      );
      setHoverBox(null);
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args): void {
      originalPushState.apply(window.history, args);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
    };

    window.history.replaceState = function (...args): void {
      originalReplaceState.apply(window.history, args);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
    };

    window.addEventListener(NAVIGATION_EVENT, syncRouteState);
    window.addEventListener("popstate", syncRouteState);
    window.addEventListener("hashchange", syncRouteState);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener(NAVIGATION_EVENT, syncRouteState);
      window.removeEventListener("popstate", syncRouteState);
      window.removeEventListener("hashchange", syncRouteState);
    };
  }, []);

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
  }, [clearAllPins, commentMode, dismissComposer, isMac]);

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

      setCommentMode(false);
      setHoverBox(null);
    };

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [commentMode, currentRouteKey]);

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

    const existingPin = pins.find((entry) => entry.id === composer.pinId);
    if (!existingPin || !composer.body.trim()) {
      return;
    }

    const pin = withResolvedGeometry(existingPin);
    const targetElement = resolveTargetFromHint(pin.anchor.targetHint) ?? composer.target.node;
    const rect = targetElement.getBoundingClientRect();

    setPins((existingPins) =>
      existingPins.map((entry) =>
        entry.id === pin.id
          ? {
            ...entry,
            x: pin.x,
            y: pin.y,
            targetRect: pin.targetRect
          }
          : entry
      )
    );

    const clientTaskId = toTaskId();
    const sessionId = randomId();
    const screenshotDataUrl = await captureScreenshot();

    const uiChangePacket = {
      id: randomId(),
      timestamp: new Date().toISOString(),
      url: `${window.location.pathname}${window.location.search}`,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      element: {
        tag: targetElement.tagName.toLowerCase(),
        role: targetElement.getAttribute("role"),
        text: targetElement.textContent?.trim() ?? null,
        attributes: {
          class: targetElement.getAttribute("class"),
          "aria-label": targetElement.getAttribute("aria-label"),
          "data-testid": targetElement.getAttribute("data-testid")
        },
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      },
      nearbyText: extractNearbyText(targetElement),
      domSnippet: targetElement.outerHTML.slice(0, 3000),
      computedStyleSummary: computedStyleSummary(targetElement),
      screenshotPath: `.pinpatch/screenshots/${clientTaskId}.png`,
      userRequest: composer.body
    };

    setPins((existingPins) =>
      existingPins.map((entry) =>
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

      setPins((existingPins) =>
        existingPins.map((entry) =>
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
      setPins((existingPins) =>
        existingPins.map((entry) =>
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

      {visiblePins.map((pin) => {
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
