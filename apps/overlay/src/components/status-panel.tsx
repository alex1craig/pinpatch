import type { KeyboardEvent, ReactElement } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@pinpatch/ui/components/button";
import { Textarea } from "@pinpatch/ui/components/textarea";
import type { OverlayPin } from "./types";
import { PanelShell } from "./panel-shell";

type StatusPanelProps = {
  container?: HTMLElement | null;
  contentRef?(element: HTMLDivElement | null): void;
  followUpBody: string;
  pin: OverlayPin;
  onCancel(): void;
  onClear(): void;
  onFollowUpBodyChange(value: string): void;
  onRetry(): void;
  onSubmitFollowUp(): void;
};

export const StatusPanel = ({
  container,
  contentRef,
  followUpBody,
  pin,
  onCancel,
  onClear,
  onFollowUpBodyChange,
  onRetry,
  onSubmitFollowUp
}: StatusPanelProps): ReactElement => {
  const isInFlight = pin.status === "queued" || pin.status === "running";
  const isRetryable = pin.status === "error" || pin.status === "cancelled" || pin.status === "timeout";
  const isCompleted = pin.status === "completed";
  const canSubmitFollowUp = followUpBody.trim().length > 0;

  const submitFollowUp = (): void => {
    if (!canSubmitFollowUp) {
      return;
    }

    onSubmitFollowUp();
  };

  const onFollowUpKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      submitFollowUp();
    }
  };

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
          {isCompleted ? (
            <>
              <Button data-testid="pinpatch-clear-pin" onClick={onClear} size="sm" type="button" variant="outline">
                Clear
              </Button>
              <Button
                data-testid="pinpatch-followup-submit"
                disabled={!canSubmitFollowUp}
                onClick={submitFollowUp}
                size="sm"
                type="button"
              >
                Submit
              </Button>
            </>
          ) : null}
        </>
      }
      title="Status"
    >
      <div data-testid="pinpatch-pin-message">{pin.message}</div>
      {isCompleted ? (
        <Textarea
          className="mt-2"
          data-testid="pinpatch-followup-input"
          onChange={(event) => onFollowUpBodyChange(event.currentTarget.value)}
          onKeyDown={onFollowUpKeyDown}
          placeholder="Add a follow-up prompt..."
          value={followUpBody}
        />
      ) : null}
    </PanelShell>
  );
};
