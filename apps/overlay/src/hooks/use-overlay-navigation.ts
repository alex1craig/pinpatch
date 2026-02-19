import { useEffect, useState } from "react";
import { getRouteKey } from "../lib/ids";

const NAVIGATION_EVENT = "pinpatch:navigation";

type UseOverlayNavigationArgs = {
  onRouteChange?(routeKey: string): void;
};

export const useOverlayNavigation = ({ onRouteChange }: UseOverlayNavigationArgs = {}): string => {
  const [currentRouteKey, setCurrentRouteKey] = useState<string>(() => getRouteKey());

  useEffect(() => {
    const syncRouteState = (): void => {
      const nextRouteKey = getRouteKey();
      setCurrentRouteKey(nextRouteKey);
      onRouteChange?.(nextRouteKey);
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
  }, [onRouteChange]);

  return currentRouteKey;
};
