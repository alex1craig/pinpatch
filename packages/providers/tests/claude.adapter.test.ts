import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderTaskInput } from "@pinpatch/core";
import { ClaudeProviderAdapter } from "../src/adapters/claude";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pinpatch-claude-test-"));
  tempDirs.push(dir);
  return dir;
};

const writeNodeScript = async (content: string): Promise<string> => {
  const dir = await createTempDir();
  const filePath = path.join(dir, "script.cjs");
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
};

const createProviderInput = (overrides: Partial<ProviderTaskInput> = {}): ProviderTaskInput => {
  const timestamp = new Date().toISOString();
  return {
    taskId: "task-1",
    sessionId: "session-1",
    task: {
      taskId: "task-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "created",
      url: "/",
      viewport: { width: 1280, height: 800 },
      pin: { x: 100, y: 120, body: "Move the button" },
      uiChangePacket: {
        id: "packet-1",
        timestamp,
        url: "/",
        viewport: { width: 1280, height: 800 },
        element: {
          tag: "button",
          role: "button",
          text: "Upgrade",
          attributes: {
            "data-testid": "upgrade-button"
          },
          boundingBox: { x: 10, y: 20, width: 120, height: 36 }
        },
        nearbyText: ["Pricing"],
        domSnippet: "<button data-testid='upgrade-button'>Upgrade</button>",
        computedStyleSummary: {
          display: "inline-flex"
        },
        screenshotPath: ".pinpatch/screenshots/task-1.png",
        userRequest: "Move the button"
      },
      screenshotPath: ".pinpatch/screenshots/task-1.png",
      sessions: ["session-1"],
      changedFiles: []
    },
    prompt: "Prompt body",
    model: "sonnet",
    dryRun: false,
    debug: false,
    cwd: process.cwd(),
    timeoutMs: 2000,
    ...overrides
  };
};

afterEach(async () => {
  delete process.env.PINPATCH_CLAUDE_BIN;
  delete process.env.PINPATCH_CLAUDE_ARGS;
  delete process.env.PINPATCH_PROVIDER_FIXTURE;
  delete process.env.PINPATCH_CLAUDE_MOCK;

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("ClaudeProviderAdapter", () => {
  it("parses changed files and summary from JSON output", async () => {
    const scriptPath = await writeNodeScript(`
      const response = {
        is_error: false,
        result: "CHANGED: src/components/Button.tsx\\nUpdated button spacing."
      };
      console.log(JSON.stringify(response));
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = scriptPath;

    const adapter = new ClaudeProviderAdapter();
    const progressEvents: string[] = [];
    const result = await adapter.submitTask(
      createProviderInput(),
      (event) => progressEvents.push(event.status)
    );

    expect(progressEvents).toContain("running");
    expect(result.status).toBe("completed");
    expect(result.changedFiles).toEqual(["src/components/Button.tsx"]);
    expect(result.summary).toBe("Updated button spacing.");
  });

  it("maps is_error=true payloads to provider error", async () => {
    const scriptPath = await writeNodeScript(`
      const response = {
        is_error: true,
        result: "Failed to authenticate."
      };
      console.log(JSON.stringify(response));
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = scriptPath;

    const adapter = new ClaudeProviderAdapter();
    const result = await adapter.submitTask(createProviderInput(), () => undefined);

    expect(result.status).toBe("error");
    expect(result.summary).toBe("Failed to authenticate.");
    expect(result.errorCode).toBe("PROVIDER_PROCESS_FAILED");
    expect(result.errorMessage).toContain("Failed to authenticate.");
  });

  it("forces permission-mode plan for dry-run tasks", async () => {
    const scriptPath = await writeNodeScript(`
      const hasPlan = process.argv.includes("--permission-mode") && process.argv.includes("plan");
      const result = hasPlan
        ? "CHANGED: src/components/DryRun.tsx\\nDry run completed."
        : "Missing plan mode.";
      console.log(JSON.stringify({ is_error: !hasPlan, result }));
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = `${scriptPath} --permission-mode acceptEdits`;

    const adapter = new ClaudeProviderAdapter();
    const result = await adapter.submitTask(
      createProviderInput({
        dryRun: true
      }),
      () => undefined
    );

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("Dry run completed.");
  });

  it("closes stdin so claude subprocesses do not hang waiting for input EOF", async () => {
    const scriptPath = await writeNodeScript(`
      let done = false;
      process.stdin.resume();
      process.stdin.on("end", () => {
        done = true;
        console.log(JSON.stringify({ is_error: false, result: "CHANGED: src/components/Input.tsx\\\\nClosed stdin." }));
      });
      setTimeout(() => {
        if (!done) {
          console.log(JSON.stringify({ is_error: true, result: "stdin was not closed." }));
        }
      }, 200);
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = scriptPath;

    const adapter = new ClaudeProviderAdapter();
    const result = await adapter.submitTask(createProviderInput(), () => undefined);

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("Closed stdin.");
  });

  it("times out long-running processes", async () => {
    const scriptPath = await writeNodeScript(`
      setTimeout(() => {
        console.log(JSON.stringify({ is_error: false, result: "CHANGED: src/x.ts\\nDone." }));
      }, 5000);
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = scriptPath;

    const adapter = new ClaudeProviderAdapter();
    const result = await adapter.submitTask(
      createProviderInput({
        timeoutMs: 50
      }),
      () => undefined
    );

    expect(result.status).toBe("timeout");
    expect(result.errorCode).toBe("PROVIDER_TIMEOUT");
  });

  it("supports cancellation for active sessions", async () => {
    const scriptPath = await writeNodeScript(`
      setInterval(() => {
        process.stdout.write("");
      }, 50);
    `);

    process.env.PINPATCH_CLAUDE_BIN = process.execPath;
    process.env.PINPATCH_CLAUDE_ARGS = scriptPath;

    const adapter = new ClaudeProviderAdapter();
    const input = createProviderInput({
      taskId: "task-cancel",
      sessionId: "session-cancel",
      timeoutMs: 5000
    });

    const runPromise = adapter.submitTask(input, () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await adapter.cancelTask("task-cancel", "session-cancel");
    const result = await runPromise;

    expect(result.status).toBe("cancelled");
  });

  it("uses fixture mode for deterministic local runs", async () => {
    process.env.PINPATCH_PROVIDER_FIXTURE = "1";

    const adapter = new ClaudeProviderAdapter();
    const result = await adapter.submitTask(createProviderInput(), () => undefined);

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("Applied UI request");
    expect(result.changedFiles).toEqual(["src/components/upgrade-button.tsx"]);
  });
});
