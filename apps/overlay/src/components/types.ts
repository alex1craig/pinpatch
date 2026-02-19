export type PinStatus = "idle" | "queued" | "running" | "completed" | "error" | "cancelled" | "timeout";

export type OverlayPin = {
  id: string;
  x: number;
  y: number;
  targetRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  body: string;
  status: PinStatus;
  message: string;
  taskId?: string;
  sessionId?: string;
};

export type OverlayElement = {
  node: HTMLElement;
  rect: DOMRect;
};

export type ComposerState = {
  pinId: string;
  body: string;
  target: OverlayElement;
};

export type ProgressEvent = {
  type: "progress";
  taskId: string;
  sessionId: string;
  status: PinStatus;
  message: string;
  percent?: number;
  timestamp: string;
};

export type TerminalEvent = {
  type: "terminal";
  taskId: string;
  sessionId: string;
  status: "completed" | "error" | "cancelled" | "timeout";
  summary: string;
  changedFiles: string[];
  timestamp: string;
};

export type HoverBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
