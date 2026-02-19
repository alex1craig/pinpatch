import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { Button } from "@pinpatch/ui/components/button";
import { PopoverContent } from "@pinpatch/ui/components/popover";
import { Textarea } from "@pinpatch/ui/components/textarea";

type ComposerPanelProps = {
  body: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onBodyChange(value: string): void;
  onCancel(): void;
  onSubmit(): void;
};

export const ComposerPanel = ({ body, inputRef, onBodyChange, onCancel, onSubmit }: ComposerPanelProps): ReactElement => {
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
    <PopoverContent align="start" className="w-80 space-y-2 p-3" side="right" sideOffset={10}>
      <div className="text-xs font-semibold text-slate-800">Comment</div>
      <Textarea
        autoFocus
        data-testid="pinpatch-comment-input"
        onChange={(event) => onBodyChange(event.currentTarget.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Provide your patch!"
        ref={inputRef}
        value={body}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button data-testid="pinpatch-submit" onClick={onSubmit} type="button">
          Submit
        </Button>
      </div>
    </PopoverContent>
  );
};
