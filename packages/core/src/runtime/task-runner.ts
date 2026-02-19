import {
  type ProviderAdapter,
  type ProviderName,
  type ProviderProgress,
  type ProviderResult,
  type TaskRecord,
  type SessionRecord,
  ProviderErrorCodes
} from "../contracts/index";
import { nowIso } from "./ids";
import type { ArtifactStore } from "../storage/artifact-store";
import type { TaskEventBus } from "../bridge/event-bus";
import type { Logger } from "../logging/logger";

const toMillis = (timestamp: string): number => {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? Date.now() : value;
};

const forceMonotonicTimestamp = (nextTs: string, lastTs: number): { timestamp: string; millis: number } => {
  const parsed = toMillis(nextTs);
  if (parsed > lastTs) {
    return { timestamp: new Date(parsed).toISOString(), millis: parsed };
  }

  const shifted = lastTs + 1;
  return { timestamp: new Date(shifted).toISOString(), millis: shifted };
};

type InFlightTask = {
  adapter: ProviderAdapter;
  startedAt: number;
};

const TERMINAL_STATUSES = new Set<ProviderResult["status"]>(["completed", "error", "cancelled", "timeout"]);

const isTerminalStatus = (status: string): status is ProviderResult["status"] => TERMINAL_STATUSES.has(status as ProviderResult["status"]);

export type TaskRunnerOptions = {
  cwd: string;
  store: ArtifactStore;
  logger: Logger;
  eventBus: TaskEventBus;
  getProviderAdapter(provider: ProviderName): ProviderAdapter | undefined;
  defaultTimeoutMs?: number;
  dryRunTimeoutMs?: number;
};

export type RunTaskInput = {
  taskId: string;
  sessionId: string;
  provider: ProviderName;
  model: string;
  dryRun: boolean;
  debug: boolean;
};

export class TaskRunner {
  private readonly cwd: string;
  private readonly store: ArtifactStore;
  private readonly logger: Logger;
  private readonly eventBus: TaskEventBus;
  private readonly getProviderAdapter: TaskRunnerOptions["getProviderAdapter"];
  private readonly defaultTimeoutMs: number;
  private readonly dryRunTimeoutMs: number;
  private readonly inFlight = new Map<string, InFlightTask>();

  constructor(options: TaskRunnerOptions) {
    this.cwd = options.cwd;
    this.store = options.store;
    this.logger = options.logger;
    this.eventBus = options.eventBus;
    this.getProviderAdapter = options.getProviderAdapter;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000;
    this.dryRunTimeoutMs = options.dryRunTimeoutMs ?? 2 * 60 * 1000;
  }

  private key(taskId: string, sessionId: string): string {
    return `${taskId}:${sessionId}`;
  }

  async cancelTask(taskId: string, sessionId: string): Promise<void> {
    const key = this.key(taskId, sessionId);
    const entry = this.inFlight.get(key);

    if (!entry) {
      return;
    }

    await entry.adapter.cancelTask(taskId, sessionId);
    this.logger.info("Cancel request forwarded to provider", {
      component: "runner",
      taskId,
      sessionId,
      event: "task.cancel"
    });
  }

  async runTask(input: RunTaskInput): Promise<ProviderResult> {
    const { taskId, sessionId, provider, model, dryRun, debug } = input;
    const task = await this.store.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} does not exist`);
    }

    const queuedTimestamp = nowIso();
    await this.store.updateTask(taskId, (current) => ({
      ...current,
      status: "queued",
      provider,
      model,
      latestSessionId: sessionId,
      sessions: Array.from(new Set([...current.sessions, sessionId])),
      updatedAt: queuedTimestamp
    }));

    await this.store.createSession({
      sessionId,
      taskId,
      provider,
      model,
      status: "queued",
      dryRun,
      startedAt: queuedTimestamp,
      updatedAt: queuedTimestamp,
      events: [
        {
          status: "queued",
          message: "Task queued",
          timestamp: queuedTimestamp
        }
      ],
      changedFiles: []
    });

    const adapter = this.getProviderAdapter(provider);
    if (!adapter) {
      const unavailable: ProviderResult = {
        taskId,
        sessionId,
        status: "error",
        summary: `Provider ${provider} is not available in this runtime`,
        changedFiles: [],
        errorCode: ProviderErrorCodes.ProviderUnavailable,
        errorMessage: `Provider ${provider} was not registered`
      };
      await this.persistTerminalState(task, unavailable, provider, model, dryRun);
      return unavailable;
    }

    const queuedEvent = {
      type: "progress" as const,
      taskId,
      sessionId,
      status: "queued" as const,
      message: "Task queued",
      timestamp: queuedTimestamp
    };

    this.eventBus.publish(taskId, sessionId, queuedEvent);

    const key = this.key(taskId, sessionId);
    this.inFlight.set(key, {
      adapter,
      startedAt: Date.now()
    });

    let lastProgressTime = toMillis(queuedTimestamp);
    const timeoutMs = dryRun ? this.dryRunTimeoutMs : this.defaultTimeoutMs;
    let terminalCommitted = false;

    const handleProgress = async (event: ProviderProgress): Promise<void> => {
      if (terminalCommitted) {
        return;
      }

      const monotonic = forceMonotonicTimestamp(event.timestamp, lastProgressTime);
      lastProgressTime = monotonic.millis;

      const normalizedEvent: ProviderProgress = {
        ...event,
        timestamp: monotonic.timestamp
      };

      await this.store.updateSession(sessionId, (session) => {
        if (isTerminalStatus(session.status)) {
          return session;
        }

        return {
          ...session,
          status: normalizedEvent.status,
          updatedAt: normalizedEvent.timestamp,
          events: [
            ...session.events,
            {
              status: normalizedEvent.status,
              message: normalizedEvent.message,
              percent: normalizedEvent.percent,
              timestamp: normalizedEvent.timestamp
            }
          ]
        };
      });

      if (terminalCommitted) {
        return;
      }

      if (normalizedEvent.status === "running" || normalizedEvent.status === "queued") {
        await this.store.updateTask(taskId, (current) => {
          if (isTerminalStatus(current.status)) {
            return current;
          }

          return {
            ...current,
            status: normalizedEvent.status,
            updatedAt: normalizedEvent.timestamp
          };
        });
      }

      if (terminalCommitted) {
        return;
      }

      this.eventBus.publish(taskId, sessionId, {
        type: "progress",
        taskId,
        sessionId,
        status: normalizedEvent.status,
        message: normalizedEvent.message,
        percent: normalizedEvent.percent,
        timestamp: normalizedEvent.timestamp
      });

      this.logger.debug(normalizedEvent.message, {
        component: "runner",
        taskId,
        sessionId,
        event: "task.progress",
        meta: {
          status: normalizedEvent.status,
          percent: normalizedEvent.percent
        }
      });
    };

    try {
      const providerTaskPromise = adapter.submitTask(
        {
          taskId,
          sessionId,
          task,
          prompt: this.buildPrompt(task),
          model,
          dryRun,
          debug,
          cwd: this.cwd,
          timeoutMs
        },
        (event) => {
          void handleProgress(event);
        }
      );

      let timeoutHandle: NodeJS.Timeout | undefined;

      const timeoutPromise = new Promise<ProviderResult>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            taskId,
            sessionId,
            status: "timeout",
            summary: `Task timed out after ${timeoutMs}ms`,
            changedFiles: [],
            errorCode: ProviderErrorCodes.ProviderTimeout,
            errorMessage: `Provider timed out after ${timeoutMs}ms`
          });
        }, timeoutMs);
      });

      const result = await Promise.race([providerTaskPromise, timeoutPromise]);
      const normalizedResult = {
        ...result,
        taskId,
        sessionId
      };
      terminalCommitted = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      await this.persistTerminalState(task, normalizedResult, provider, model, dryRun);
      this.inFlight.delete(key);
      return normalizedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      const failedResult: ProviderResult = {
        taskId,
        sessionId,
        status: "error",
        summary: "Provider execution failed",
        changedFiles: [],
        errorCode: ProviderErrorCodes.ProcessFailed,
        errorMessage: message
      };

      terminalCommitted = true;
      await this.persistTerminalState(task, failedResult, provider, model, dryRun);
      this.inFlight.delete(key);
      return failedResult;
    }
  }

  private buildPrompt(task: TaskRecord): string {
    return [
      "You are implementing a UI change request from Pinpatch.",
      "Scope guardrails (must follow):",
      "- Implement only the requested UI change.",
      "- Do not edit, reformat, or reorganize unrelated files.",
      "- Never revert, overwrite, or clean up unrelated repo changes (other agents may be editing in parallel).",
      "- If unrelated files are modified or dirty, leave them untouched.",
      "- If you cannot complete the request without touching unrelated areas, stop and report the exact blocker.",
      `User request: ${task.comment.body}`,
      `Page URL: ${task.url}`,
      `Element: <${task.uiChangePacket.element.tag}> text=\"${task.uiChangePacket.element.text ?? ""}\"`,
      `Bounding box: ${JSON.stringify(task.uiChangePacket.element.boundingBox)}`,
      `Nearby text: ${task.uiChangePacket.nearbyText.join(" | ")}`,
      `DOM snippet: ${task.uiChangePacket.domSnippet}`,
      `Computed style summary: ${JSON.stringify(task.uiChangePacket.computedStyleSummary)}`,
      `Screenshot path: ${task.screenshotPath}`,
      "Apply the change in local files and summarize changed files."
    ].join("\n");
  }

  private async persistTerminalState(
    task: TaskRecord,
    result: ProviderResult,
    provider: ProviderName,
    model: string,
    dryRun: boolean
  ): Promise<void> {
    const finishedAt = nowIso();

    await this.store.updateSession(result.sessionId, (session) => ({
      ...session,
      provider,
      model,
      dryRun,
      status: result.status,
      summary: result.summary,
      changedFiles: result.changedFiles,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      endedAt: finishedAt,
      updatedAt: finishedAt,
      events: [
        ...session.events,
        {
          status: result.status,
          message: result.summary,
          timestamp: finishedAt
        }
      ]
    }));

    await this.store.updateTask(task.taskId, (current) => ({
      ...current,
      status: result.status,
      updatedAt: finishedAt,
      provider,
      model,
      summary: result.summary,
      changedFiles: result.changedFiles,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    }));

    this.eventBus.publish(task.taskId, result.sessionId, {
      type: "terminal",
      taskId: task.taskId,
      sessionId: result.sessionId,
      status: result.status,
      summary: result.summary,
      changedFiles: result.changedFiles,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      timestamp: finishedAt
    });

    this.logger.info(result.summary, {
      component: "runner",
      taskId: task.taskId,
      sessionId: result.sessionId,
      event: "task.terminal",
      meta: {
        status: result.status,
        changedFiles: result.changedFiles,
        errorCode: result.errorCode
      }
    });
  }
}
