import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../src/storage/artifact-store";
import { nowIso } from "../src/runtime/ids";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pinpatch-artifact-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("ArtifactStore", () => {
  it("creates structure and reads/writes task and session artifacts", async () => {
    const cwd = await createTempDir();
    const store = new ArtifactStore(cwd);
    await store.ensureStructure();

    const timestamp = nowIso();
    await store.createTask({
      taskId: "task-a",
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "created",
      url: "/",
      viewport: { width: 1200, height: 800 },
      pin: { x: 1, y: 1 },
      comment: { body: "test" },
      uiChangePacket: {
        id: "packet-1",
        timestamp,
        url: "/",
        viewport: { width: 1200, height: 800 },
        element: {
          tag: "button",
          role: "button",
          text: "Hello",
          attributes: { class: "btn", "aria-label": null, "data-testid": null },
          boundingBox: { x: 1, y: 1, width: 20, height: 10 }
        },
        nearbyText: ["Hello"],
        domSnippet: "<button>Hello</button>",
        computedStyleSummary: { display: "inline-flex" },
        screenshotPath: ".pinpatch/screenshots/task-a.png",
        userRequest: "Move button"
      },
      screenshotPath: ".pinpatch/screenshots/task-a.png",
      sessions: ["session-a"],
      changedFiles: []
    });

    await store.createSession({
      sessionId: "session-a",
      taskId: "task-a",
      provider: "codex",
      model: "gpt-5.3-codex-spark",
      status: "queued",
      dryRun: false,
      startedAt: timestamp,
      updatedAt: timestamp,
      events: [
        {
          status: "queued",
          message: "queued",
          timestamp
        }
      ],
      changedFiles: []
    });

    const task = await store.getTask("task-a");
    const session = await store.getSession("session-a");

    expect(task?.taskId).toBe("task-a");
    expect(session?.sessionId).toBe("session-a");

    const screenshotPath = await store.writeScreenshot(
      "task-a",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgkM8Qd8AAAAASUVORK5CYII="
    );

    expect(screenshotPath).toBe(path.join(".pinpatch", "screenshots", "task-a.png"));
  });
});
