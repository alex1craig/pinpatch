import type { OverlayPin } from "../components/types";
import { normalizePinAnchor } from "./anchor";
import { withResolvedGeometry } from "./geometry";
import { isPinStatus } from "./pin-status";
import { asFiniteNumber, asRecord } from "./parsing";

const PIN_STORAGE_KEY = "pinpatch.overlay.pins.v1";
const PIN_STORAGE_VERSION = 1;

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

export const readPersistedPins = (currentRouteKey: string): OverlayPin[] => {
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

export const persistPins = (pins: OverlayPin[]): void => {
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
