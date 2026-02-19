import path from "node:path";
import { existsSync } from "node:fs";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import {
  ArtifactStore,
  createBridgeServer,
  createLogger,
  generateSessionId,
  resolveConfig,
  TaskEventBus,
  TaskRunner,
  type ProviderName
} from "@pinpatch/core";
import { createProviderRegistry } from "@pinpatch/providers";
import { createReverseProxy } from "@pinpatch/proxy";

const cliEntrypointDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
const packageRootFromCli = ["bin", "dist", "src"].includes(path.basename(cliEntrypointDir))
  ? path.resolve(cliEntrypointDir, "..")
  : cliEntrypointDir;
const workspaceRootFromCli = path.resolve(packageRootFromCli, "../..");

const resolveRuntimeCwd = (): string => {
  const initCwd = process.env.INIT_CWD?.trim();
  if (initCwd) {
    const resolved = path.resolve(initCwd);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  const cwd = process.cwd();

  const workspaceRootFromCwd = path.resolve(cwd, "../..");
  const workspaceMarkerFromCwd = path.join(workspaceRootFromCwd, "pnpm-workspace.yaml");
  const appearsToBeCliPackage = path.basename(cwd) === "cli" && path.basename(path.dirname(cwd)) === "packages";
  if (appearsToBeCliPackage && existsSync(workspaceMarkerFromCwd)) {
    return workspaceRootFromCwd;
  }

  const workspaceMarker = path.join(workspaceRootFromCli, "pnpm-workspace.yaml");
  if (cwd === packageRootFromCli && existsSync(workspaceMarker)) {
    return workspaceRootFromCli;
  }

  return cwd;
};

type DevCommandOptions = {
  target?: number;
  provider?: ProviderName;
  model?: string;
  debug?: boolean;
  bridgePort?: number;
  proxyPort?: number;
};

type ImplementCommandOptions = {
  provider?: ProviderName;
  model?: string;
  dryRun?: boolean;
  debug?: boolean;
};

type TasksCommandOptions = {
  prune?: boolean;
  debug?: boolean;
};

const waitForSignal = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const onSignal = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
};

const targetReachable = async (port: number): Promise<boolean> => {
  return await new Promise<boolean>((resolve) => {
    const request = http.get(
      {
        host: "localhost",
        port,
        path: "/",
        timeout: 1500
      },
      () => {
        request.destroy();
        resolve(true);
      }
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
};

const resolveOverlayBundlePath = (cwd: string): string | undefined => {
  const candidates = [
    process.env.PINPATCH_OVERLAY_SCRIPT_PATH,
    path.join(cwd, "apps", "overlay", "dist", "pinpatch-overlay.iife.js"),
    path.join(cwd, "node_modules", "@repo", "overlay", "dist", "pinpatch-overlay.iife.js"),
    path.join(packageRootFromCli, "node_modules", "@repo", "overlay", "dist", "pinpatch-overlay.iife.js"),
    path.join(workspaceRootFromCli, "apps", "overlay", "dist", "pinpatch-overlay.iife.js"),
    path.join(resolveRuntimeCwd(), "apps", "overlay", "dist", "pinpatch-overlay.iife.js")
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const maybeBuildOverlay = (workspaceRoot: string): string | undefined => {
    const overlayWorkspace = path.join(workspaceRoot, "apps", "overlay", "package.json");
    if (!existsSync(overlayWorkspace)) {
      return undefined;
    }

    const output = spawnSync("pnpm", ["--filter", "@pinpatch/overlay", "build"], {
      cwd: workspaceRoot,
      stdio: "inherit"
    });

    if (output.status === 0) {
      const builtPath = path.join(workspaceRoot, "apps", "overlay", "dist", "pinpatch-overlay.iife.js");
      if (existsSync(builtPath)) {
        return builtPath;
      }
    }

    return undefined;
  };

  const buildRoots = Array.from(new Set([cwd, workspaceRootFromCli]));
  for (const buildRoot of buildRoots) {
    const built = maybeBuildOverlay(buildRoot);
    if (built) {
      return built;
    }
  }

  return undefined;
};

const runDev = async (options: DevCommandOptions): Promise<void> => {
  const cwd = resolveRuntimeCwd();
  const store = new ArtifactStore(cwd);
  await store.ensureStructure();
  await store.ensureGitignoreEntry();

  const config = await resolveConfig(cwd, {
    provider: options.provider,
    model: options.model,
    target: options.target,
    debug: options.debug,
    bridgePort: options.bridgePort,
    proxyPort: options.proxyPort
  });

  const logger = createLogger({
    store,
    component: "cli",
    debugEnabled: config.debug
  });

  const reachable = await targetReachable(config.target);
  if (!reachable) {
    throw new Error(
      `Target localhost:${config.target} is unreachable. Start your app first and retry. Hint: lsof -i :${config.target}`
    );
  }

  const overlayScriptPath = resolveOverlayBundlePath(cwd);

  const providerRegistry = createProviderRegistry(["codex"]);
  const bridge = createBridgeServer({
    cwd,
    port: config.bridgePort,
    store,
    logger,
    overlayScriptPath,
    getProviderAdapter: (provider) => providerRegistry.getAdapter(provider)
  });

  const proxy = createReverseProxy({
    targetPort: config.target,
    proxyPort: config.proxyPort,
    bridgePort: config.bridgePort,
    logger
  });

  try {
    await bridge.start();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      throw new Error(`Bridge port ${config.bridgePort} is already in use. Hint: lsof -i :${config.bridgePort}`);
    }

    throw error;
  }

  try {
    await proxy.start();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      await bridge.stop();
      throw new Error(`Proxy port ${config.proxyPort} is already in use. Hint: lsof -i :${config.proxyPort}`);
    }

    await bridge.stop();
    throw error;
  }

  console.log(`Pinpatch dev ready`);
  console.log(`Target app: http://localhost:${config.target}`);
  console.log(`Proxied app: http://localhost:${config.proxyPort}`);
  console.log(`Bridge API: http://localhost:${config.bridgePort}`);

  await waitForSignal();

  await proxy.stop();
  await bridge.stop();
};

const runImplement = async (taskId: string, options: ImplementCommandOptions): Promise<void> => {
  const cwd = resolveRuntimeCwd();
  const store = new ArtifactStore(cwd);
  await store.ensureStructure();
  await store.ensureGitignoreEntry();

  const config = await resolveConfig(cwd, {
    provider: options.provider,
    model: options.model,
    debug: options.debug
  });

  const logger = createLogger({
    store,
    component: "cli",
    debugEnabled: config.debug
  });

  const task = await store.getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} was not found under .pinpatch/tasks`);
  }

  const providerRegistry = createProviderRegistry(["codex"]);
  const eventBus = new TaskEventBus();
  const runner = new TaskRunner({
    cwd,
    store,
    logger,
    eventBus,
    getProviderAdapter: (provider) => providerRegistry.getAdapter(provider)
  });

  const sessionId = generateSessionId();
  const result = await runner.runTask({
    taskId,
    sessionId,
    provider: config.provider,
    model: config.model,
    dryRun: Boolean(options.dryRun),
    debug: config.debug
  });

  console.log(`Task ${taskId} -> ${result.status}`);
  console.log(result.summary);
  if (result.changedFiles.length > 0) {
    console.log("Changed files:");
    for (const changedFile of result.changedFiles) {
      console.log(` - ${changedFile}`);
    }
  }

  if (result.status !== "completed") {
    process.exitCode = 1;
  }
};

const runTasks = async (options: TasksCommandOptions): Promise<void> => {
  const cwd = resolveRuntimeCwd();
  const store = new ArtifactStore(cwd);
  await store.ensureStructure();

  if (options.prune) {
    const result = await store.prune();
    console.log(`Pruned logs: ${result.removedLogs}`);
    console.log(`Pruned orphan sessions: ${result.removedSessions}`);
    return;
  }

  const tasks = await store.listTasks();
  tasks.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  if (tasks.length === 0) {
    console.log("No tasks found in .pinpatch/tasks");
    return;
  }

  console.table(
    tasks.map((task) => ({
      taskId: task.taskId,
      status: task.status,
      updatedAt: task.updatedAt,
      provider: task.provider ?? "-",
      model: task.model ?? "-",
      latestSessionId: task.latestSessionId ?? "-"
    }))
  );
};

const program = new Command();
program
  .name("pinpatch")
  .description("Pinpatch CLI")
  .version("0.1.0");

program
  .command("dev")
  .description("Start Pinpatch bridge + proxy runtime")
  .option("--target <port>", "Target app localhost port", (value) => Number.parseInt(value, 10))
  .option("--provider <name>", "Provider name (codex only in MVP)")
  .option("--model <model>", "Provider model")
  .option("--bridge-port <port>", "Bridge server port", (value) => Number.parseInt(value, 10))
  .option("--proxy-port <port>", "Proxy server port", (value) => Number.parseInt(value, 10))
  .option("--debug", "Enable debug logs", false)
  .action(async (options: DevCommandOptions) => {
    await runDev(options);
  });

program
  .command("implement")
  .description("Execute a saved task through provider adapter")
  .argument("<taskId>", "Task id")
  .option("--provider <name>", "Provider name")
  .option("--model <model>", "Provider model")
  .option("--dry-run", "Do not apply provider edits", false)
  .option("--debug", "Enable debug logs", false)
  .action(async (taskId: string, options: ImplementCommandOptions) => {
    await runImplement(taskId, options);
  });

program
  .command("tasks")
  .description("List or prune task/session artifacts")
  .option("--prune", "Prune expired logs and orphan sessions", false)
  .option("--debug", "Enable debug logs", false)
  .action(async (options: TasksCommandOptions) => {
    await runTasks(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
