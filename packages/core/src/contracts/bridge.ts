import { z } from "zod";
import { UiChangePacketSchema, ViewportSchema } from "./artifacts";
import { ProviderNameSchema } from "./provider";

export const CreateTaskRequestSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().min(1),
  viewport: ViewportSchema,
  pin: z.object({
    x: z.number(),
    y: z.number(),
    body: z.string().min(1),
  }),
  uiChangePacket: UiChangePacketSchema,
  screenshotPath: z.string().min(1),
  screenshotDataUrl: z.string().startsWith("data:image/").optional(),
  clientTaskId: z.string().min(1).optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const CreateTaskResponseSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  status: z.literal("created"),
  taskPath: z.string(),
  eventsUrl: z.string(),
});
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

export const SubmitTaskRequestSchema = z.object({
  sessionId: z.string().min(1),
  provider: ProviderNameSchema,
  model: z.string().min(1),
  dryRun: z.boolean().default(false),
  debug: z.boolean().default(false),
  followUpBody: z.string().trim().min(1).optional(),
});
export type SubmitTaskRequest = z.infer<typeof SubmitTaskRequestSchema>;

export const SubmitTaskResponseSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.literal("queued"),
  acceptedAt: z.string().datetime(),
  eventsUrl: z.string().min(1),
});
export type SubmitTaskResponse = z.infer<typeof SubmitTaskResponseSchema>;

export const SseProgressEventSchema = z.object({
  type: z.literal("progress"),
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.enum([
    "queued",
    "running",
    "completed",
    "error",
    "cancelled",
    "timeout",
  ]),
  message: z.string().min(1),
  percent: z.number().min(0).max(100).optional(),
  timestamp: z.string().datetime(),
});
export type SseProgressEvent = z.infer<typeof SseProgressEventSchema>;

export const SseTerminalEventSchema = z.object({
  type: z.literal("terminal"),
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.enum(["completed", "error", "cancelled", "timeout"]),
  summary: z.string().min(1),
  changedFiles: z.array(z.string()),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type SseTerminalEvent = z.infer<typeof SseTerminalEventSchema>;

export const SseHeartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  timestamp: z.string().datetime(),
});
export type SseHeartbeatEvent = z.infer<typeof SseHeartbeatEventSchema>;

export const SseEventSchema = z.union([
  SseProgressEventSchema,
  SseTerminalEventSchema,
  SseHeartbeatEventSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
