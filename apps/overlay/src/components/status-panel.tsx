import type { ReactElement } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@pinpatch/ui/components/button";
import type { OverlayPin } from "./types";
import { PanelShell } from "./panel-shell";

type StatusPanelProps = {
  container?: HTMLElement | null;
  contentRef?(element: HTMLDivElement | null): void;
  pin: OverlayPin;
  onCancel(): void;
  onClear(): void;
  onRetry(): void;
};

export const StatusPanel = ({
  container,
  contentRef,
  pin,
  onCancel,
  onClear,
  onRetry
}: StatusPanelProps): ReactElement => {
  const isInFlight = pin.status === "queued" || pin.status === "running";
  const isRetryable = pin.status === "error" || pin.status === "cancelled" || pin.status === "timeout";

  return (
    <PanelShell
      container={container}
      contentRef={contentRef}
      footer={
        <>
          {isInFlight ? (
            <Button data-testid="pinpatch-cancel-pin" onClick={onCancel} size="sm" type="button" variant="outline">
              Cancel
            </Button>
          ) : null}
          {isRetryable ? (
            <>
              <Button data-testid="pinpatch-clear-pin" onClick={onClear} size="sm" type="button" variant="outline">
                Clear
              </Button>
              <Button data-testid="pinpatch-retry" onClick={onRetry} size="sm" type="button" variant="secondary">
                <RotateCcw /> Retry
              </Button>
            </>
          ) : null}
        </>
      }
      title="Status"
    >
      <div data-testid="pinpatch-pin-message">{pin.message}</div>
    </PanelShell>
  );
};
