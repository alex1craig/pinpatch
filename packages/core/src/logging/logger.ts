import os from "node:os";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { RuntimeLogEventSchema, type RuntimeLogEvent } from "../contracts/index";
import type { ArtifactStore } from "../storage/artifact-store";
import { nowIso } from "../runtime/ids";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerMeta = Record<string, unknown>;

export type Logger = {
  debug(message: string, details?: Omit<RuntimeLogEvent, "timestamp" | "level" | "message">): void;
  info(message: string, details?: Omit<RuntimeLogEvent, "timestamp" | "level" | "message">): void;
  warn(message: string, details?: Omit<RuntimeLogEvent, "timestamp" | "level" | "message">): void;
  error(message: string, details?: Omit<RuntimeLogEvent, "timestamp" | "level" | "message">): void;
};

const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    const home = os.homedir();

    return value
      .replaceAll(home, "~")
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
      .replace(/(token=)[^\s&]+/gi, "$1[REDACTED]");
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      if (["token", "authorization", "auth", "apiKey", "apikey"].includes(key.toLowerCase())) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactValue(fieldValue);
      }
    }

    return output;
  }

  return value;
};

const getDateKey = (dateIso: string): string => dateIso.slice(0, 10);

const resolveLogPath = (logsDir: string, timestamp: string, maxFileSizeBytes: number): string => {
  const dateKey = getDateKey(timestamp);
  let index = 0;

  while (true) {
    const candidateName = index === 0 ? `${dateKey}.jsonl` : `${dateKey}-${index}.jsonl`;
    const candidatePath = path.join(logsDir, candidateName);

    if (!existsSync(candidatePath)) {
      return candidatePath;
    }

    const size = statSync(candidatePath).size;
    if (size < maxFileSizeBytes) {
      return candidatePath;
    }

    index += 1;
  }
};

export const createLogger = (options: {
  store: ArtifactStore;
  debugEnabled: boolean;
  component: string;
  maxFileSizeBytes?: number;
}): Logger => {
  const { store, debugEnabled, component, maxFileSizeBytes = 2 * 1024 * 1024 } = options;

  const emit = (level: LogLevel, message: string, details?: Omit<RuntimeLogEvent, "timestamp" | "level" | "message">): void => {
    if (level === "debug" && !debugEnabled) {
      return;
    }

    const timestamp = nowIso();

    const payload = RuntimeLogEventSchema.parse({
      timestamp,
      level,
      component: details?.component ?? component,
      taskId: details?.taskId,
      sessionId: details?.sessionId,
      event: details?.event ?? "log",
      message,
      meta: redactValue(details?.meta ?? {}) as LoggerMeta
    });

    const line = `[${payload.timestamp}] ${payload.level.toUpperCase()} ${payload.component}: ${payload.message}`;
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    const logPath = resolveLogPath(store.logsDir, timestamp, maxFileSizeBytes);
    void store.appendLog(logPath, payload);
  };

  return {
    debug: (message, details) => emit("debug", message, details),
    info: (message, details) => emit("info", message, details),
    warn: (message, details) => emit("warn", message, details),
    error: (message, details) => emit("error", message, details)
  };
};
