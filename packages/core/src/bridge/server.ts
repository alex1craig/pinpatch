import { createServer, type Server } from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  CreateTaskRequestSchema,
  SubmitTaskRequestSchema,
  type ProviderName,
  type SseEvent,
  type TaskRecord,
} from "../contracts/index";
import { generateTaskId, nowIso } from "../runtime/ids";
import type { ArtifactStore } from "../storage/artifact-store";
import type { Logger } from "../logging/logger";
import { TaskEventBus } from "./event-bus";
import { TaskRunner } from "../runtime/task-runner";
import type { ProviderAdapter } from "../contracts/provider";

const sanitizeTaskId = (candidate: string): string =>
  candidate.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);

const serializeSse = (
  eventName: "progress" | "terminal" | "heartbeat",
  payload: SseEvent,
): string => {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
};

const fallbackOverlayScript = `
(function(){
  if (window.__PINPATCH_OVERLAY_FALLBACK__) return;
  window.__PINPATCH_OVERLAY_FALLBACK__ = true;
  console.warn('[pinpatch] overlay bundle is missing. Build apps/overlay first.');
})();
`;

export type BridgeServerOptions = {
  cwd: string;
  port: number;
  store: ArtifactStore;
  logger: Logger;
  overlayScriptPath?: string;
  getProviderAdapter(provider: ProviderName): ProviderAdapter | undefined;
};

export type BridgeServerHandle = {
  app: express.Express;
  server: Server;
  eventBus: TaskEventBus;
  taskRunner: TaskRunner;
  start(): Promise<void>;
  stop(): Promise<void>;
};

const resolveAvailableTaskId = async (
  store: ArtifactStore,
  initialTaskId?: string,
): Promise<string> => {
  if (initialTaskId) {
    const candidate = sanitizeTaskId(initialTaskId);
    const existing = await store.getTask(candidate);
    if (!existing) {
      return candidate;
    }
  }

  let tries = 0;
  while (tries < 10) {
    const candidate = generateTaskId();
    const existing = await store.getTask(candidate);
    if (!existing) {
      return candidate;
    }
    tries += 1;
  }

  throw new Error("Failed to allocate a unique task id");
};

export const createBridgeServer = (
  options: BridgeServerOptions,
): BridgeServerHandle => {
  const app = express();
  const eventBus = new TaskEventBus();
  const taskRunner = new TaskRunner({
    cwd: options.cwd,
    store: options.store,
    logger: options.logger,
    eventBus,
    getProviderAdapter: options.getProviderAdapter,
  });

  app.use(cors());
  app.use(express.json({ limit: "25mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/overlay.js", async (_req, res) => {
    const requestedPath = options.overlayScriptPath;

    if (requestedPath) {
      try {
        const script = await fs.readFile(path.resolve(requestedPath), "utf8");
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.status(200).send(script);
        return;
      } catch {
        options.logger.warn(
          "Overlay bundle not found, serving fallback overlay script",
          {
            component: "bridge",
            event: "overlay.fallback",
            meta: {
              overlayScriptPath: requestedPath,
            },
          },
        );
      }
    }

    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.status(200).send(fallbackOverlayScript);
  });

  app.post("/api/tasks", async (req: Request, res: Response) => {
    const parsed = CreateTaskRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload = parsed.data;
    const taskId = await resolveAvailableTaskId(
      options.store,
      payload.clientTaskId,
    );

    let screenshotPath = payload.screenshotPath;
    if (payload.screenshotDataUrl) {
      screenshotPath = await options.store.writeScreenshot(
        taskId,
        payload.screenshotDataUrl,
      );
    }

    const createdAt = nowIso();

    const taskRecord: TaskRecord = {
      taskId,
      createdAt,
      updatedAt: createdAt,
      status: "created",
      url: payload.url,
      viewport: payload.viewport,
      pin: payload.pin,
      uiChangePacket: {
        ...payload.uiChangePacket,
        screenshotPath,
        userRequest: payload.pin.body,
      },
      screenshotPath,
      sessions: [payload.sessionId],
      latestSessionId: payload.sessionId,
      changedFiles: [],
    };

    await options.store.createTask(taskRecord);

    options.logger.info("Task created", {
      component: "bridge",
      taskId,
      sessionId: payload.sessionId,
      event: "task.created",
      meta: {
        screenshotPath,
      },
    });

    res.status(201).json({
      taskId,
      sessionId: payload.sessionId,
      status: "created",
      taskPath: `.pinpatch/tasks/${taskId}.json`,
      eventsUrl: `/api/tasks/${taskId}/events?sessionId=${payload.sessionId}`,
    });
  });

  app.post("/api/tasks/:taskId/submit", async (req: Request, res: Response) => {
    const taskId = String(req.params.taskId ?? "");
    if (!taskId) {
      res.status(400).json({ error: "taskId is required" });
      return;
    }

    const task = await options.store.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const parsed = SubmitTaskRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload = parsed.data;

    void taskRunner
      .runTask({
        taskId,
        sessionId: payload.sessionId,
        provider: payload.provider,
        model: payload.model,
        dryRun: payload.dryRun,
        debug: payload.debug,
      })
      .catch((error: unknown) => {
        options.logger.error("Provider task execution failed", {
          component: "bridge",
          taskId,
          sessionId: payload.sessionId,
          event: "task.run.error",
          meta: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });

    const acceptedAt = nowIso();
    res.status(202).json({
      taskId,
      sessionId: payload.sessionId,
      status: "queued",
      acceptedAt,
      eventsUrl: `/api/tasks/${taskId}/events?sessionId=${payload.sessionId}`,
    });
  });

  app.post("/api/tasks/:taskId/cancel", async (req: Request, res: Response) => {
    const taskId = String(req.params.taskId ?? "");
    const sessionId = String(req.body?.sessionId ?? "");

    if (!taskId || !sessionId) {
      res.status(400).json({ error: "taskId and sessionId are required" });
      return;
    }

    await taskRunner.cancelTask(taskId, sessionId);
    res.status(202).json({ taskId, sessionId, status: "cancelled" });
  });

  app.get("/api/tasks/:taskId/events", async (req: Request, res: Response) => {
    const taskId = String(req.params.taskId ?? "");
    const sessionId = String(req.query.sessionId ?? "");
    if (!taskId || !sessionId) {
      res
        .status(400)
        .json({ error: "taskId and sessionId query params are required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const push = (event: SseEvent): void => {
      const type =
        event.type === "terminal"
          ? "terminal"
          : event.type === "heartbeat"
            ? "heartbeat"
            : "progress";
      res.write(serializeSse(type, event));
    };

    push({
      type: "heartbeat",
      timestamp: nowIso(),
    });

    const unsubscribe = eventBus.subscribe(taskId, sessionId, push);

    const heartbeat = setInterval(() => {
      push({
        type: "heartbeat",
        timestamp: nowIso(),
      });
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  const server = createServer(app);

  return {
    app,
    server,
    eventBus,
    taskRunner,
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, () => {
          server.off("error", reject);
          resolve();
        });
      });
      options.logger.info(
        `Bridge listening on http://localhost:${options.port}`,
        {
          component: "bridge",
          event: "bridge.started",
        },
      );
    },
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      options.logger.info("Bridge stopped", {
        component: "bridge",
        event: "bridge.stopped",
      });
    },
  };
};
