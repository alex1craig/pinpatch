import type { ProviderAdapter, ProviderName } from "@pinpatch/core";

export class ProviderRegistry {
  private readonly adapters: Map<ProviderName, ProviderAdapter>;
  private readonly enabledProviders: Set<ProviderName>;

  constructor(adapters: ProviderAdapter[], enabledProviders: ProviderName[] = ["codex"]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.name, adapter]));
    this.enabledProviders = new Set(enabledProviders);
  }

  getAdapter(provider: ProviderName): ProviderAdapter | undefined {
    if (!this.enabledProviders.has(provider)) {
      return undefined;
    }

    return this.adapters.get(provider);
  }

  getAnyAdapter(provider: ProviderName): ProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  isEnabled(provider: ProviderName): boolean {
    return this.enabledProviders.has(provider);
  }

  listEnabled(): ProviderName[] {
    return Array.from(this.enabledProviders.values());
  }
}
