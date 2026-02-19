import type { OverlayPin } from "../components/types";
import { fromViewportRatio, getViewportHeight, getViewportWidth, resolveTargetFromHint } from "./anchor";

export type GeometryResult = {
  x: number;
  y: number;
  targetRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export const resolvePinGeometry = (pin: OverlayPin): GeometryResult => {
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

export const withResolvedGeometry = (pin: OverlayPin): OverlayPin => {
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
