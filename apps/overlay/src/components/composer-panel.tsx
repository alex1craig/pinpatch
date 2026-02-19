import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { Button } from "@pinpatch/ui/components/button";
import { Textarea } from "@pinpatch/ui/components/textarea";
import { PanelShell } from "./panel-shell";

type ComposerPanelProps = {
  body: string;
  container?: HTMLElement | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onBodyChange(value: string): void;
  onCancel(): void;
  onSubmit(): void;
};

export const ComposerPanel = ({
  body,
  container,
  inputRef,
  onBodyChange,
  onCancel,
  onSubmit
}: ComposerPanelProps): ReactElement => {
  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <PanelShell
      className="w-80"
      container={container}
      footer={
        <>
          <Button onClick={onCancel} size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button data-testid="pinpatch-submit" onClick={onSubmit} size="sm" type="button">
            Submit
          </Button>
        </>
      }
      title="Pin"
    >
      <Textarea
        autoFocus
        data-testid="pinpatch-pin-input"
        onChange={(event) => onBodyChange(event.currentTarget.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Provide your patch..."
        ref={inputRef}
        value={body}
      />
    </PanelShell>
  );
};
