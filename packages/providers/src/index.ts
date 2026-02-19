import type { ProviderName } from "@pinpatch/core";
import { ClaudeProviderAdapter } from "./adapters/claude";
import { CodexProviderAdapter } from "./adapters/codex";
import { StubProviderAdapter } from "./adapters/stub";
import { ProviderRegistry } from "./registry";

export * from "./registry";
export * from "./adapters/claude";
export * from "./adapters/codex";
export * from "./adapters/stub";

export const createProviderRegistry = (enabledProviders: ProviderName[] = ["codex", "claude"]): ProviderRegistry => {
  const adapters = [new CodexProviderAdapter(), new ClaudeProviderAdapter(), new StubProviderAdapter("cursor")];
  return new ProviderRegistry(adapters, enabledProviders);
};
