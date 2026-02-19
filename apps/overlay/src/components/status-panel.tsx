import type { ReactElement } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@pinpatch/ui/components/button";
import { PopoverContent } from "@pinpatch/ui/components/popover";
import type { OverlayPin } from "./types";

type StatusPanelProps = {
  contentRef?(element: HTMLDivElement | null): void;
  pin: OverlayPin;
  onCancel(): void;
  onClear(): void;
  onRetry(): void;
};

export const StatusPanel = ({ contentRef, pin, onCancel, onClear, onRetry }: StatusPanelProps): ReactElement => {
  const isInFlight = pin.status === "queued" || pin.status === "running";
  const isRetryable = pin.status === "error" || pin.status === "cancelled" || pin.status === "timeout";

  return (
    <PopoverContent
      align="start"
      className="relative min-w-60 space-y-2 p-2 text-xs text-slate-700"
      ref={contentRef}
      side="right"
      sideOffset={10}
    >
      {isRetryable ? (
        <button
          aria-label="Clear pin"
          className="absolute right-1 top-1 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          data-testid="pinpatch-clear-pin"
          onClick={onClear}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div data-testid="pinpatch-pin-message">{pin.message}</div>

      {isInFlight ? (
        <Button data-testid="pinpatch-cancel-pin" onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
      ) : null}

      {isRetryable ? (
        <Button data-testid="pinpatch-retry" onClick={onRetry} type="button" variant="secondary">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      ) : null}
    </PopoverContent>
  );
};
