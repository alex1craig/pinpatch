import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pinpatch-config-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe("resolveConfig", () => {
  it("applies precedence CLI > file > defaults", async () => {
    const cwd = await createTempDir();
    await fs.mkdir(path.join(cwd, ".pinpatch"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, ".pinpatch", "config.json"),
      JSON.stringify(
        {
          provider: "codex",
          model: "file-model",
          target: 1111,
          debug: false,
          bridgePort: 9000,
          proxyPort: 9100
        },
        null,
        2
      ),
      "utf8"
    );

    const config = await resolveConfig(cwd, {
      target: 3333,
      provider: "codex"
    });

    expect(config.provider).toBe("codex");
    expect(config.model).toBe("file-model");
    expect(config.target).toBe(3333);
    expect(config.debug).toBe(false);
    expect(config.bridgePort).toBe(9000);
    expect(config.proxyPort).toBe(9100);
  });

  it("uses provider default model when provider is overridden without a model", async () => {
    const cwd = await createTempDir();
    const config = await resolveConfig(cwd, {
      provider: "claude"
    });

    expect(config.provider).toBe("claude");
    expect(config.model).toBe("sonnet");
  });

  it("uses provider default model from config file when model is omitted", async () => {
    const cwd = await createTempDir();
    await fs.mkdir(path.join(cwd, ".pinpatch"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, ".pinpatch", "config.json"),
      JSON.stringify(
        {
          provider: "claude"
        },
        null,
        2
      ),
      "utf8"
    );

    const config = await resolveConfig(cwd);

    expect(config.provider).toBe("claude");
    expect(config.model).toBe("sonnet");
  });

  it("preserves explicit CLI model when provider is overridden", async () => {
    const cwd = await createTempDir();
    const config = await resolveConfig(cwd, {
      provider: "claude",
      model: "claude-opus-4-20251001"
    });

    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-opus-4-20251001");
  });
});
