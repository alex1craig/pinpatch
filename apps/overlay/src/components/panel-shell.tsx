import type { ReactElement, ReactNode } from "react";
import { PopoverContent } from "@pinpatch/ui/components/popover";
import { cn } from "@pinpatch/ui/lib";

type PanelShellProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  container?: HTMLElement | null;
  contentRef?(element: HTMLDivElement | null): void;
  footer?: ReactNode;
  title?: ReactNode;
};

export const PanelShell = ({
  bodyClassName,
  children,
  className,
  container,
  contentRef,
  footer,
  title
}: PanelShellProps): ReactElement => {
  return (
    <PopoverContent
      align="start"
      className={cn("relative z-[60] min-w-60 p-2", className)}
      container={container}
      ref={contentRef}
      side="right"
      sideOffset={10}
    >
      {title ? <div className="font-semibold leading-none">{title}</div> : null}
      <div className={cn("mt-2 text-xs text-foreground", bodyClassName)}>{children}</div>
      {footer ? <div className="mt-2 flex justify-end gap-2">{footer}</div> : null}
    </PopoverContent>
  );
};
