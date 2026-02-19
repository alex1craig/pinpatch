import type { ProviderName } from "@pinpatch/core";
import { CodexProviderAdapter } from "./adapters/codex";
import { StubProviderAdapter } from "./adapters/stub";
import { ProviderRegistry } from "./registry";

export * from "./registry";
export * from "./adapters/codex";
export * from "./adapters/stub";

export const createProviderRegistry = (enabledProviders: ProviderName[] = ["codex"]): ProviderRegistry => {
  const adapters = [new CodexProviderAdapter(), new StubProviderAdapter("claude"), new StubProviderAdapter("cursor")];
  return new ProviderRegistry(adapters, enabledProviders);
};
