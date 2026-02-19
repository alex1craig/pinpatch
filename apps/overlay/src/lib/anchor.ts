import type { PinAnchor, TargetHint } from "../components/types";
import { asFiniteNumber, asRecord, sanitizeTextHint } from "./parsing";

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const getViewportWidth = (): number => {
  return Math.max(window.innerWidth, 1);
};

export const getViewportHeight = (): number => {
  return Math.max(window.innerHeight, 1);
};

export const toViewportRatio = (value: number, size: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) {
    return 0;
  }

  return clamp(value / size, 0, 1);
};

export const fromViewportRatio = (ratio: number, size: number): number => {
  const safeRatio = Number.isFinite(ratio) ? ratio : 0;
  return clamp(safeRatio, 0, 1) * Math.max(size, 1);
};

const escapeSelector = (value: string): string => {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value);
  }

  return value.replace(/(["\\])/g, "\\$1");
};

const normalizeClassHint = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .join(" ");

  return normalized || undefined;
};

export const buildTargetHint = (element: HTMLElement): TargetHint => {
  return {
    testId: sanitizeTextHint(element.getAttribute("data-testid")),
    id: sanitizeTextHint(element.id),
    ariaLabel: sanitizeTextHint(element.getAttribute("aria-label")),
    tag: element.tagName.toLowerCase(),
    className: normalizeClassHint(element.getAttribute("class")),
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
    className: normalizeClassHint(typeof record.className === "string" ? record.className : null),
    text: sanitizeTextHint(typeof record.text === "string" ? record.text : null)
  };
};

const getNodeDepth = (node: HTMLElement): number => {
  let depth = 0;
  let cursor: HTMLElement | null = node;

  while (cursor?.parentElement) {
    depth += 1;
    cursor = cursor.parentElement;
  }

  return depth;
};

const rankCandidates = (candidates: HTMLElement[]): HTMLElement | null => {
  if (candidates.length === 0) {
    return null;
  }

  const [best] = [...candidates].sort((left, right) => {
    const depthDelta = getNodeDepth(right) - getNodeDepth(left);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const leftArea = Math.max(leftRect.width * leftRect.height, 0);
    const rightArea = Math.max(rightRect.width * rightRect.height, 0);
    if (leftArea === rightArea) {
      return 0;
    }

    return leftArea < rightArea ? -1 : 1;
  });

  return best ?? null;
};

export const resolveTargetFromHint = (targetHint: TargetHint): HTMLElement | null => {
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
  let candidates = Array.from(document.querySelectorAll(tag)).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );

  if (targetHint.ariaLabel) {
    const byAria = document.querySelector(`${tag}[aria-label="${escapeSelector(targetHint.ariaLabel)}"]`);
    if (byAria instanceof HTMLElement) {
      return byAria;
    }
  }

  let hasHeuristic = false;

  if (targetHint.className) {
    const classMatches = candidates.filter((node) => normalizeClassHint(node.getAttribute("class")) === targetHint.className);
    const [onlyClassMatch] = classMatches;
    if (classMatches.length === 1 && onlyClassMatch) {
      return onlyClassMatch;
    }

    if (classMatches.length > 1) {
      candidates = classMatches;
      hasHeuristic = true;
    }
  }

  if (targetHint.text) {
    const text = targetHint.text.trim();
    if (text) {
      const textMatches = candidates.filter((node) => node.textContent?.trim() === text);
      const [onlyTextMatch] = textMatches;
      if (textMatches.length === 1 && onlyTextMatch) {
        return onlyTextMatch;
      }

      if (textMatches.length > 1) {
        candidates = textMatches;
        hasHeuristic = true;
      }
    }
  }

  if (!hasHeuristic) {
    return null;
  }

  return rankCandidates(candidates);
};

export const buildAnchor = (
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
    targetHint: {
      tag: "pinpatch-missing-target"
    }
  };
};

export const normalizePinAnchor = (
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
