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
  delete process.env.PINPATCH_PROVIDER;
  delete process.env.PINPATCH_MODEL;
  delete process.env.PINPATCH_TARGET;
  delete process.env.PINPATCH_DEBUG;

  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe("resolveConfig", () => {
  it("applies precedence CLI > env > file > defaults", async () => {
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

    process.env.PINPATCH_MODEL = "env-model";
    process.env.PINPATCH_TARGET = "2222";
    process.env.PINPATCH_DEBUG = "true";

    const config = await resolveConfig(cwd, {
      target: 3333,
      provider: "codex"
    });

    expect(config.provider).toBe("codex");
    expect(config.model).toBe("env-model");
    expect(config.target).toBe(3333);
    expect(config.debug).toBe(true);
    expect(config.bridgePort).toBe(9000);
    expect(config.proxyPort).toBe(9100);
  });
});
