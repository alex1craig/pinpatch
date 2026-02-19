import path from "node:path";
import { promises as fs } from "node:fs";
import {
  PinpatchConfigSchema,
  RuntimeLogEventSchema,
  SessionRecordSchema,
  TaskRecordSchema,
  type PinpatchConfig,
  type RuntimeLogEvent,
  type SessionRecord,
  type TaskRecord
} from "../contracts/index";
import { ensureDir, listJsonFiles, readJsonIfExists, writeJsonAtomic } from "../utils/fs";
import { DEFAULT_CONFIG } from "../config";

export type PruneResult = {
  removedLogs: number;
  removedSessions: number;
};

export class ArtifactStore {
  readonly cwd: string;
  readonly rootDir: string;
  readonly tasksDir: string;
  readonly sessionsDir: string;
  readonly screenshotsDir: string;
  readonly runtimeDir: string;
  readonly logsDir: string;
  readonly configPath: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.rootDir = path.join(cwd, ".pinpatch");
    this.tasksDir = path.join(this.rootDir, "tasks");
    this.sessionsDir = path.join(this.rootDir, "sessions");
    this.screenshotsDir = path.join(this.rootDir, "screenshots");
    this.runtimeDir = path.join(this.rootDir, "runtime");
    this.logsDir = path.join(this.runtimeDir, "logs");
    this.configPath = path.join(this.rootDir, "config.json");
  }

  async ensureStructure(): Promise<void> {
    await ensureDir(this.tasksDir);
    await ensureDir(this.sessionsDir);
    await ensureDir(this.screenshotsDir);
    await ensureDir(this.logsDir);

    const existingConfig = await readJsonIfExists<PinpatchConfig>(this.configPath);
    if (!existingConfig) {
      await writeJsonAtomic(this.configPath, DEFAULT_CONFIG);
    }
  }

  async ensureGitignoreEntry(): Promise<void> {
    const gitignorePath = path.join(this.cwd, ".gitignore");

    try {
      const content = await fs.readFile(gitignorePath, "utf8");
      if (!content.includes(".pinpatch/")) {
        await fs.appendFile(gitignorePath, "\n.pinpatch/\n", "utf8");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await fs.writeFile(gitignorePath, ".pinpatch/\n", "utf8");
        return;
      }

      throw error;
    }
  }

  getTaskPath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  getRelativePath(absolutePath: string): string {
    return path.relative(this.cwd, absolutePath);
  }

  async readConfig(): Promise<PinpatchConfig> {
    const data = await readJsonIfExists<PinpatchConfig>(this.configPath);
    return PinpatchConfigSchema.parse({ ...DEFAULT_CONFIG, ...data });
  }

  async writeConfig(config: PinpatchConfig): Promise<void> {
    const validated = PinpatchConfigSchema.parse(config);
    await writeJsonAtomic(this.configPath, validated);
  }

  async createTask(task: TaskRecord): Promise<TaskRecord> {
    const validated = TaskRecordSchema.parse(task);
    await writeJsonAtomic(this.getTaskPath(validated.taskId), validated);
    return validated;
  }

  async getTask(taskId: string): Promise<TaskRecord | undefined> {
    const raw = await readJsonIfExists<TaskRecord>(this.getTaskPath(taskId));
    if (!raw) {
      return undefined;
    }

    return TaskRecordSchema.parse(raw);
  }

  async updateTask(taskId: string, updater: (current: TaskRecord) => TaskRecord): Promise<TaskRecord> {
    const current = await this.getTask(taskId);
    if (!current) {
      throw new Error(`Task ${taskId} does not exist`);
    }

    const updated = TaskRecordSchema.parse(updater(current));
    await writeJsonAtomic(this.getTaskPath(taskId), updated);
    return updated;
  }

  async listTasks(): Promise<TaskRecord[]> {
    const files = await listJsonFiles(this.tasksDir);
    const rows = await Promise.all(
      files.map(async (filePath) => {
        const raw = await readJsonIfExists<TaskRecord>(filePath);
        return raw ? TaskRecordSchema.parse(raw) : undefined;
      })
    );

    return rows.filter((row): row is TaskRecord => row !== undefined);
  }

  async createSession(session: SessionRecord): Promise<SessionRecord> {
    const validated = SessionRecordSchema.parse(session);
    await writeJsonAtomic(this.getSessionPath(validated.sessionId), validated);
    return validated;
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const raw = await readJsonIfExists<SessionRecord>(this.getSessionPath(sessionId));
    if (!raw) {
      return undefined;
    }

    return SessionRecordSchema.parse(raw);
  }

  async updateSession(sessionId: string, updater: (current: SessionRecord) => SessionRecord): Promise<SessionRecord> {
    const current = await this.getSession(sessionId);
    if (!current) {
      throw new Error(`Session ${sessionId} does not exist`);
    }

    const updated = SessionRecordSchema.parse(updater(current));
    await writeJsonAtomic(this.getSessionPath(sessionId), updated);
    return updated;
  }

  async listSessions(): Promise<SessionRecord[]> {
    const files = await listJsonFiles(this.sessionsDir);
    const rows = await Promise.all(
      files.map(async (filePath) => {
        const raw = await readJsonIfExists<SessionRecord>(filePath);
        return raw ? SessionRecordSchema.parse(raw) : undefined;
      })
    );

    return rows.filter((row): row is SessionRecord => row !== undefined);
  }

  async writeScreenshot(taskId: string, screenshotDataUrl: string): Promise<string> {
    const matches = screenshotDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(?<bytes>.+)$/);
    if (!matches?.groups?.bytes) {
      throw new Error("Invalid screenshot payload");
    }

    const filePath = path.join(this.screenshotsDir, `${taskId}.png`);
    const buffer = Buffer.from(matches.groups.bytes, "base64");
    await fs.writeFile(filePath, buffer);
    return this.getRelativePath(filePath);
  }

  async appendLog(logPath: string, event: RuntimeLogEvent): Promise<void> {
    const validated = RuntimeLogEventSchema.parse(event);
    await fs.appendFile(logPath, `${JSON.stringify(validated)}\n`, "utf8");
  }

  async prune(options?: { logsOlderThanDays?: number; orphanSessionAgeHours?: number }): Promise<PruneResult> {
    const logsOlderThanDays = options?.logsOlderThanDays ?? 14;
    const orphanSessionAgeHours = options?.orphanSessionAgeHours ?? 24;

    const logFiles = await fs.readdir(this.logsDir).catch(() => []);
    const cutoffLogs = Date.now() - logsOlderThanDays * 24 * 60 * 60 * 1000;
    let removedLogs = 0;

    for (const file of logFiles) {
      const fullPath = path.join(this.logsDir, file);
      const stats = await fs.stat(fullPath).catch(() => undefined);
      if (!stats) {
        continue;
      }

      if (stats.mtimeMs < cutoffLogs) {
        await fs.unlink(fullPath);
        removedLogs += 1;
      }
    }

    const tasks = await this.listTasks();
    const taskIds = new Set(tasks.map((task) => task.taskId));
    const sessions = await this.listSessions();
    const cutoffSessions = Date.now() - orphanSessionAgeHours * 60 * 60 * 1000;
    let removedSessions = 0;

    for (const session of sessions) {
      const updatedAtMs = Date.parse(session.updatedAt);
      const isOrphan = !taskIds.has(session.taskId);

      if (isOrphan && updatedAtMs < cutoffSessions) {
        await fs.unlink(this.getSessionPath(session.sessionId));
        removedSessions += 1;
      }
    }

    return {
      removedLogs,
      removedSessions
    };
  }
}
