import { EventEmitter } from "node:events";
import type { SseEvent } from "../contracts/index";

const keyFor = (taskId: string, sessionId: string): string => `${taskId}:${sessionId}`;

export class TaskEventBus {
  private readonly emitter = new EventEmitter();

  subscribe(taskId: string, sessionId: string, listener: (event: SseEvent) => void): () => void {
    const key = keyFor(taskId, sessionId);
    this.emitter.on(key, listener);

    return () => {
      this.emitter.off(key, listener);
    };
  }

  publish(taskId: string, sessionId: string, event: SseEvent): void {
    this.emitter.emit(keyFor(taskId, sessionId), event);
  }
}
