import { z } from "zod";
import { ProviderNameSchema, ProviderProgressStatusSchema } from "./provider";

export const PinStateSchema = z.enum([
  "idle",
  "queued",
  "running",
  "completed",
  "error",
  "cancelled",
  "timeout"
]);
export type PinState = z.infer<typeof PinStateSchema>;

export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type Viewport = z.infer<typeof ViewportSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const ElementDescriptorSchema = z.object({
  tag: z.string().min(1),
  role: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  attributes: z.record(z.union([z.string(), z.null()])),
  boundingBox: BoundingBoxSchema
});
export type ElementDescriptor = z.infer<typeof ElementDescriptorSchema>;

export const UiChangePacketSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  url: z.string().min(1),
  viewport: ViewportSchema,
  element: ElementDescriptorSchema,
  nearbyText: z.array(z.string()),
  domSnippet: z.string(),
  computedStyleSummary: z.record(z.string()),
  screenshotPath: z.string().min(1),
  userRequest: z.string().min(1)
});
export type UiChangePacket = z.infer<typeof UiChangePacketSchema>;

export const TaskStatusSchema = z.enum([
  "created",
  "queued",
  "running",
  "completed",
  "error",
  "cancelled",
  "timeout"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskCommentSchema = z.object({
  body: z.string().min(1)
});

export const TaskPinSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const TaskRecordSchema = z.object({
  taskId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: TaskStatusSchema,
  url: z.string().min(1),
  viewport: ViewportSchema,
  pin: TaskPinSchema,
  comment: TaskCommentSchema,
  uiChangePacket: UiChangePacketSchema,
  screenshotPath: z.string().min(1),
  provider: ProviderNameSchema.optional(),
  model: z.string().optional(),
  latestSessionId: z.string().optional(),
  sessions: z.array(z.string()),
  summary: z.string().optional(),
  changedFiles: z.array(z.string()).default([]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional()
});
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

export const SessionEventSchema = z.object({
  status: ProviderProgressStatusSchema,
  message: z.string().min(1),
  percent: z.number().min(0).max(100).optional(),
  timestamp: z.string().datetime()
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const SessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  taskId: z.string().min(1),
  provider: ProviderNameSchema,
  model: z.string().min(1),
  status: ProviderProgressStatusSchema,
  dryRun: z.boolean(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  events: z.array(SessionEventSchema),
  summary: z.string().optional(),
  changedFiles: z.array(z.string()).default([]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional()
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export const RuntimeLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const RuntimeLogEventSchema = z.object({
  timestamp: z.string().datetime(),
  level: RuntimeLogLevelSchema,
  component: z.string().min(1),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  event: z.string().min(1),
  message: z.string().min(1),
  meta: z.record(z.unknown()).optional()
});
export type RuntimeLogEvent = z.infer<typeof RuntimeLogEventSchema>;

export const PinpatchConfigSchema = z.object({
  provider: ProviderNameSchema.default("codex"),
  model: z.string().default("gpt-5.3-codex-spark"),
  target: z.number().int().positive().default(3000),
  debug: z.boolean().default(false),
  bridgePort: z.number().int().positive().default(7331),
  proxyPort: z.number().int().positive().default(3030)
});
export type PinpatchConfig = z.infer<typeof PinpatchConfigSchema>;
