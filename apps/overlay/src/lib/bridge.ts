import type { ProgressEvent, TerminalEvent } from "../components/types";

export const getBridgeOrigin = (): string => {
  const custom = (window as typeof window & { __PINPATCH_BRIDGE_URL?: string }).__PINPATCH_BRIDGE_URL;
  return custom ?? "http://localhost:7331";
};

export const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
};

type TaskEventHandlers = {
  onProgress(payload: ProgressEvent): void;
  onTerminal(payload: TerminalEvent): void;
  onError?(): void;
};

export const subscribeToTaskEvents = (
  bridgeOrigin: string,
  eventsUrl: string,
  handlers: TaskEventHandlers
): EventSource => {
  const source = new EventSource(`${bridgeOrigin}${eventsUrl}`);

  source.addEventListener("progress", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as ProgressEvent;
    handlers.onProgress(payload);
  });

  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as TerminalEvent;
    handlers.onTerminal(payload);
  });

  source.onerror = () => {
    handlers.onError?.();
  };

  return source;
};
