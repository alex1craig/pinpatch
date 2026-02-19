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

const parseBoolean = (input: string | undefined): boolean | undefined => {
  if (input === undefined) {
    return undefined;
  }

  if (["1", "true", "yes", "on"].includes(input.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(input.toLowerCase())) {
    return false;
  }

  return undefined;
};

const parseNumber = (input: string | undefined): number | undefined => {
  if (input === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

  const envConfig = omitUndefined({
    provider: process.env.PINPATCH_PROVIDER as ProviderName | undefined,
    model: process.env.PINPATCH_MODEL,
    target: parseNumber(process.env.PINPATCH_TARGET),
    debug: parseBoolean(process.env.PINPATCH_DEBUG),
    bridgePort: parseNumber(process.env.PINPATCH_BRIDGE_PORT),
    proxyPort: parseNumber(process.env.PINPATCH_PROXY_PORT)
  });

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...omitUndefined(overrides)
  };

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
