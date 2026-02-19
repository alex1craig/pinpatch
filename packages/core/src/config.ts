import path from "node:path";
import { promises as fs } from "node:fs";
import { PinpatchConfigSchema, type PinpatchConfig, type ProviderName } from "./contracts/index";

export type ConfigOverrides = Partial<{
  provider: ProviderName;
  model: string;
  target: number;
  debug: boolean;
  bridgePort: number;
  proxyPort: number;
}>;

export const DEFAULT_CONFIG: PinpatchConfig = {
  provider: "codex",
  model: "gpt-5.3-codex-spark",
  target: 3000,
  debug: false,
  bridgePort: 7331,
  proxyPort: 3030
};

const DEFAULT_CLAUDE_MODEL = "sonnet";

const resolveConfigPath = (cwd: string): string => path.join(cwd, ".pinpatch", "config.json");

const omitUndefined = <T extends Record<string, unknown>>(value: T): Partial<T> => {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as Partial<T>;
};

export const readConfigFile = async (cwd: string): Promise<Partial<PinpatchConfig>> => {
  const configPath = resolveConfigPath(cwd);

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return PinpatchConfigSchema.partial().parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    return {};
  }
};

export const resolveConfig = async (cwd: string, overrides: ConfigOverrides = {}): Promise<PinpatchConfig> => {
  const fileConfig = await readConfigFile(cwd);
  const overrideConfig = omitUndefined(overrides);
  const hasCliModelOverride = Object.prototype.hasOwnProperty.call(overrideConfig, "model");
  const hasFileModel = Object.prototype.hasOwnProperty.call(fileConfig, "model");
  const hasFileProvider = Object.prototype.hasOwnProperty.call(fileConfig, "provider");
  const isBaselineFileModel =
    hasFileModel &&
    hasFileProvider &&
    fileConfig.model === DEFAULT_CONFIG.model &&
    fileConfig.provider === DEFAULT_CONFIG.provider;

  const merged: PinpatchConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...overrideConfig
  };

  const shouldUseClaudeDefault =
    merged.provider === "claude" &&
    merged.model === DEFAULT_CONFIG.model &&
    !hasCliModelOverride &&
    (!hasFileModel || isBaselineFileModel);

  if (shouldUseClaudeDefault) {
    merged.model = DEFAULT_CLAUDE_MODEL;
  }

  return PinpatchConfigSchema.parse(merged);
};

export const ensureConfigFile = async (cwd: string): Promise<PinpatchConfig> => {
  const configPath = resolveConfigPath(cwd);
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  try {
    const raw = await fs.readFile(configPath, "utf8");
    return PinpatchConfigSchema.parse(JSON.parse(raw));
  } catch {
    await fs.writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    return DEFAULT_CONFIG;
  }
};

export const getConfigPath = resolveConfigPath;
