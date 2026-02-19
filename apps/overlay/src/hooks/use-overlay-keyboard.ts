import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseOverlayKeyboardArgs = {
  clearAllPins(): void;
  pinMode: boolean;
  dismissComposer(): void;
  isMac: boolean;
  setPinMode: Dispatch<SetStateAction<boolean>>;
  setHoverBox: Dispatch<SetStateAction<DOMRect | null>>;
};

export const useOverlayKeyboard = ({
  clearAllPins,
  pinMode,
  dismissComposer,
  isMac,
  setPinMode,
  setHoverBox,
}: UseOverlayKeyboardArgs): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      const isDeleteKey = event.key === "Delete" || event.key === "Backspace";
      const isClearAllShortcut =
        isDeleteKey &&
        ((isMac && event.metaKey && !event.ctrlKey) ||
          (!isMac && event.ctrlKey && !event.metaKey));
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

        setPinMode((current) => !current);
        if (pinMode) {
          setHoverBox(null);
        }
      }

      if (event.key === "Escape") {
        setPinMode(false);
        setHoverBox(null);
        dismissComposer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearAllPins, pinMode, dismissComposer, isMac, setPinMode, setHoverBox]);
};
