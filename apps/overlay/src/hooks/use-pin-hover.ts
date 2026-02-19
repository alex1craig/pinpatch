import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { HoverBounds } from "../components/types";

type UsePinHoverArgs = {
  getHoverBounds(pinId: string): HoverBounds | null;
  hoveredPinId: string | null;
  setHoveredPinId: Dispatch<SetStateAction<string | null>>;
};

export const usePinHover = ({ getHoverBounds, hoveredPinId, setHoveredPinId }: UsePinHoverArgs): void => {
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
  }, [getHoverBounds, hoveredPinId, setHoveredPinId]);
};
