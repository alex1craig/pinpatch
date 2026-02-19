import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../src/storage/artifact-store";
import { createLogger } from "../src/logging/logger";
import { createBridgeServer } from "../src/bridge/server";
import type {
  ProviderAdapter,
  ProviderTaskInput,
  ProviderProgress,
  ProviderResult,
} from "../src/contracts/provider";
import { nowIso } from "../src/runtime/ids";

class MockCodexAdapter implements ProviderAdapter {
  name = "codex" as const;
  lastPrompt: string | undefined;
  prompts: string[] = [];

  async submitTask(
    input: ProviderTaskInput,
    onProgress: (event: ProviderProgress) => void,
  ): Promise<ProviderResult> {
    this.lastPrompt = input.prompt;
    this.prompts.push(input.prompt);

    onProgress({
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "running",
      message: "mock running",
      percent: 50,
      timestamp: nowIso(),
    });

    return {
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "completed",
      summary: "mock completed",
      changedFiles: ["src/example.ts"],
    };
  }

  async cancelTask(): Promise<void> {}
}

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pinpatch-bridge-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

const waitForTaskStatus = async (
  store: ArtifactStore,
  taskId: string,
  status: "completed" | "error" | "cancelled" | "timeout",
): Promise<void> => {
  let attempts = 0;
  while (attempts < 120) {
    const task = await store.getTask(taskId);
    if (task?.status === status) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
    attempts += 1;
  }

  throw new Error(`Timed out waiting for task ${taskId} to reach status ${status}`);
};

const waitForTaskState = async (
  store: ArtifactStore,
  taskId: string,
  predicate: (task: NonNullable<Awaited<ReturnType<ArtifactStore["getTask"]>>>) => boolean,
  description: string,
): Promise<void> => {
  let attempts = 0;
  while (attempts < 120) {
    const task = await store.getTask(taskId);
    if (task && predicate(task)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
    attempts += 1;
  }

  throw new Error(`Timed out waiting for task ${taskId}: ${description}`);
};

describe("bridge API contracts", () => {
  it("creates and submits task through required endpoints", async () => {
    const cwd = await createTempDir();
    const store = new ArtifactStore(cwd);
    await store.ensureStructure();
    const logger = createLogger({
      store,
      debugEnabled: true,
      component: "test",
    });

    const mockAdapter = new MockCodexAdapter();

    const bridge = createBridgeServer({
      cwd,
      port: 0,
      store,
      logger,
      getProviderAdapter: (provider) =>
        provider === "codex" ? mockAdapter : undefined,
    });

    const createResponse = await request(bridge.app)
      .post("/api/tasks")
      .send({
        sessionId: "session-1",
        url: "/billing",
        viewport: { width: 1000, height: 700 },
        pin: { x: 100, y: 200, body: "Move button" },
        uiChangePacket: {
          id: "packet-1",
          timestamp: nowIso(),
          url: "/billing",
          viewport: { width: 1000, height: 700 },
          element: {
            tag: "button",
            role: "button",
            text: "Upgrade",
            attributes: {
              class: "btn",
              "aria-label": null,
              "data-testid": null,
            },
            boundingBox: { x: 10, y: 10, width: 100, height: 30 },
          },
          nearbyText: ["Pricing"],
          domSnippet: "<button>Upgrade</button>",
          computedStyleSummary: { display: "inline-flex" },
          screenshotPath: ".pinpatch/screenshots/packet.png",
          userRequest: "Move button",
        },
        screenshotPath: ".pinpatch/screenshots/packet.png",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe("created");

    const submitResponse = await request(bridge.app)
      .post(`/api/tasks/${createResponse.body.taskId}/submit`)
      .send({
        sessionId: "session-1",
        provider: "codex",
        model: "gpt-5.3-codex-spark",
        dryRun: false,
        debug: true,
      });

    expect(submitResponse.status).toBe(202);
    expect(submitResponse.body.status).toBe("queued");

    const taskId = String(createResponse.body.taskId);
    await waitForTaskStatus(store, taskId, "completed");

    const completedTask = await store.getTask(taskId);
    expect(completedTask?.status).toBe("completed");
    expect(mockAdapter.lastPrompt).toContain("Scope guardrails (must follow):");
    expect(mockAdapter.lastPrompt).toContain(
      "Implement only the requested UI change.",
    );
    expect(mockAdapter.lastPrompt).toContain(
      "Never revert, overwrite, or clean up unrelated repo changes",
    );

    const followUpBody = "Now make the button primary and add a subtle shadow.";
    const followUpSubmitResponse = await request(bridge.app)
      .post(`/api/tasks/${createResponse.body.taskId}/submit`)
      .send({
        sessionId: "session-2",
        provider: "codex",
        model: "gpt-5.3-codex-spark",
        dryRun: false,
        debug: true,
        followUpBody,
      });

    expect(followUpSubmitResponse.status).toBe(202);
    expect(followUpSubmitResponse.body.status).toBe("queued");

    await waitForTaskState(
      store,
      taskId,
      (task) => task.latestSessionId === "session-2" && task.status === "completed",
      "second submit to reach completed state",
    );

    const updatedTask = await store.getTask(taskId);
    expect(updatedTask?.pin.body).toBe(followUpBody);
    expect(updatedTask?.uiChangePacket.userRequest).toBe(followUpBody);

    expect(mockAdapter.prompts).toHaveLength(2);
    expect(mockAdapter.prompts[1]).toContain(`User request: ${followUpBody}`);
  });

  it("rejects blank follow-up body", async () => {
    const cwd = await createTempDir();
    const store = new ArtifactStore(cwd);
    await store.ensureStructure();
    const logger = createLogger({
      store,
      debugEnabled: true,
      component: "test",
    });

    const mockAdapter = new MockCodexAdapter();

    const bridge = createBridgeServer({
      cwd,
      port: 0,
      store,
      logger,
      getProviderAdapter: (provider) =>
        provider === "codex" ? mockAdapter : undefined,
    });

    const createResponse = await request(bridge.app)
      .post("/api/tasks")
      .send({
        sessionId: "session-1",
        url: "/billing",
        viewport: { width: 1000, height: 700 },
        pin: { x: 100, y: 200, body: "Move button" },
        uiChangePacket: {
          id: "packet-1",
          timestamp: nowIso(),
          url: "/billing",
          viewport: { width: 1000, height: 700 },
          element: {
            tag: "button",
            role: "button",
            text: "Upgrade",
            attributes: {
              class: "btn",
              "aria-label": null,
              "data-testid": null,
            },
            boundingBox: { x: 10, y: 10, width: 100, height: 30 },
          },
          nearbyText: ["Pricing"],
          domSnippet: "<button>Upgrade</button>",
          computedStyleSummary: { display: "inline-flex" },
          screenshotPath: ".pinpatch/screenshots/packet.png",
          userRequest: "Move button",
        },
        screenshotPath: ".pinpatch/screenshots/packet.png",
      });

    expect(createResponse.status).toBe(201);

    const submitResponse = await request(bridge.app)
      .post(`/api/tasks/${createResponse.body.taskId}/submit`)
      .send({
        sessionId: "session-2",
        provider: "codex",
        model: "gpt-5.3-codex-spark",
        dryRun: false,
        debug: true,
        followUpBody: "   ",
      });

    expect(submitResponse.status).toBe(400);
    expect(mockAdapter.prompts).toHaveLength(0);
  });
});
