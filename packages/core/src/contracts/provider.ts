import { z } from "zod";
import type { TaskRecord } from "./artifacts";

export const ProviderNameSchema = z.enum(["codex", "claude", "cursor"]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

export const ProviderProgressStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "error",
  "cancelled",
  "timeout"
]);
export type ProviderProgressStatus = z.infer<typeof ProviderProgressStatusSchema>;

export const ProviderTerminalStatusSchema = z.enum(["completed", "error", "cancelled", "timeout"]);
export type ProviderTerminalStatus = z.infer<typeof ProviderTerminalStatusSchema>;

export const ProviderProgressSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  status: ProviderProgressStatusSchema,
  message: z.string().min(1),
  percent: z.number().min(0).max(100).optional(),
  timestamp: z.string().datetime()
});
export type ProviderProgress = z.infer<typeof ProviderProgressSchema>;

export const ProviderResultSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  status: ProviderTerminalStatusSchema,
  summary: z.string().min(1),
  changedFiles: z.array(z.string()),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional()
});
export type ProviderResult = z.infer<typeof ProviderResultSchema>;

export type ProviderTaskInput = {
  taskId: string;
  sessionId: string;
  task: TaskRecord;
  prompt: string;
  model: string;
  dryRun: boolean;
  debug: boolean;
  cwd: string;
  timeoutMs: number;
};

export interface ProviderAdapter {
  name: ProviderName;
  submitTask(input: ProviderTaskInput, onProgress: (event: ProviderProgress) => void): Promise<ProviderResult>;
  cancelTask(taskId: string, sessionId: string): Promise<void>;
}

export const ProviderErrorCodes = {
  ProviderUnavailable: "PROVIDER_UNAVAILABLE",
  ProviderNotEnabled: "PROVIDER_NOT_ENABLED",
  ProviderTimeout: "PROVIDER_TIMEOUT",
  ProcessFailed: "PROVIDER_PROCESS_FAILED",
  ValidationFailed: "PROVIDER_VALIDATION_FAILED",
  Unknown: "UNKNOWN"
} as const;
