import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  type ProviderAdapter,
  type ProviderProgress,
  type ProviderResult,
  type ProviderTaskInput,
  ProviderErrorCodes,
  nowIso
} from "@pinpatch/core";

const parseArgString = (input: string): string[] => {
  return input
    .split(" ")
    .map((piece) => piece.trim())
    .filter(Boolean);
};

const isFixtureEnabled = (): boolean => {
  const fixture = process.env.PINPATCH_PROVIDER_FIXTURE ?? process.env.PINPATCH_CODEX_MOCK;
  return fixture === "1" || fixture?.toLowerCase() === "true";
};

const buildMockChangedFile = (input: ProviderTaskInput): string => {
  const guessedPath = input.task.uiChangePacket.element.attributes["data-testid"];
  if (typeof guessedPath === "string" && guessedPath.length > 0) {
    return `src/components/${guessedPath}.tsx`;
  }

  return "src/components/ExampleComponent.tsx";
};

export class CodexProviderAdapter implements ProviderAdapter {
  readonly name = "codex" as const;

  private readonly inFlight = new Map<string, ChildProcessWithoutNullStreams>();

  async submitTask(input: ProviderTaskInput, onProgress: (event: ProviderProgress) => void): Promise<ProviderResult> {
    if (isFixtureEnabled()) {
      return this.submitFixture(input, onProgress);
    }

    const bin = process.env.PINPATCH_CODEX_BIN ?? "codex";
    const baseArgs = parseArgString(process.env.PINPATCH_CODEX_ARGS ?? "exec");
    const args = [
      ...baseArgs,
      "--model",
      input.model,
      ...(input.dryRun ? ["--dry-run"] : []),
      input.prompt
    ];

    onProgress({
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "running",
      message: `Running Codex command: ${bin} ${[...args.slice(0, -1), "<prompt>"].join(" ")}`,
      percent: 5,
      timestamp: nowIso()
    });

    return await new Promise<ProviderResult>((resolve) => {
      const child = spawn(bin, args, {
        cwd: input.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      });

      const key = `${input.taskId}:${input.sessionId}`;
      this.inFlight.set(key, child);

      let stdout = "";
      let stderr = "";
      let completed = false;

      const timeoutHandle = setTimeout(() => {
        if (completed) {
          return;
        }

        child.kill("SIGTERM");
        completed = true;
        this.inFlight.delete(key);
        resolve({
          taskId: input.taskId,
          sessionId: input.sessionId,
          status: "timeout",
          summary: `Codex timed out after ${input.timeoutMs}ms`,
          changedFiles: [],
          errorCode: ProviderErrorCodes.ProviderTimeout,
          errorMessage: stderr || "Timed out"
        });
      }, input.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;

        onProgress({
          taskId: input.taskId,
          sessionId: input.sessionId,
          status: "running",
          message: text.trim() || "Codex is working",
          timestamp: nowIso()
        });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        if (completed) {
          return;
        }

        completed = true;
        clearTimeout(timeoutHandle);
        this.inFlight.delete(key);

        resolve({
          taskId: input.taskId,
          sessionId: input.sessionId,
          status: "error",
          summary: "Failed to start Codex process",
          changedFiles: [],
          errorCode: ProviderErrorCodes.ProcessFailed,
          errorMessage: error.message
        });
      });

      child.on("close", (code, signal) => {
        if (completed) {
          return;
        }

        completed = true;
        clearTimeout(timeoutHandle);
        this.inFlight.delete(key);

        const changedFiles = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("CHANGED:"))
          .map((line) => line.replace("CHANGED:", "").trim());

        const summary = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1);

        if (code === 0) {
          resolve({
            taskId: input.taskId,
            sessionId: input.sessionId,
            status: "completed",
            summary: summary ?? "Codex execution completed",
            changedFiles
          });
          return;
        }

        if (signal === "SIGTERM" || signal === "SIGINT") {
          resolve({
            taskId: input.taskId,
            sessionId: input.sessionId,
            status: "cancelled",
            summary: "Codex execution cancelled",
            changedFiles,
            errorCode: ProviderErrorCodes.ProcessFailed,
            errorMessage: stderr || "Cancelled"
          });
          return;
        }

        resolve({
          taskId: input.taskId,
          sessionId: input.sessionId,
          status: "error",
          summary: "Codex execution failed",
          changedFiles,
          errorCode: ProviderErrorCodes.ProcessFailed,
          errorMessage: stderr || `Process exited with code ${code}`
        });
      });
    });
  }

  async cancelTask(taskId: string, sessionId: string): Promise<void> {
    const key = `${taskId}:${sessionId}`;
    const child = this.inFlight.get(key);
    if (!child) {
      return;
    }

    child.kill("SIGINT");
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }, 500);
  }

  private async submitFixture(
    input: ProviderTaskInput,
    onProgress: (event: ProviderProgress) => void
  ): Promise<ProviderResult> {
    onProgress({
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "running",
      message: "Scanning repository",
      percent: 25,
      timestamp: nowIso()
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    onProgress({
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "running",
      message: "Applying UI changes",
      percent: 80,
      timestamp: nowIso()
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    return {
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "completed",
      summary: input.dryRun ? "Dry run completed" : "Applied UI request",
      changedFiles: [buildMockChangedFile(input)]
    };
  }
}
