import {
  type ProviderAdapter,
  type ProviderName,
  type ProviderProgress,
  type ProviderResult,
  type ProviderTaskInput,
  ProviderErrorCodes,
  nowIso
} from "@pinpatch/core";

export class StubProviderAdapter implements ProviderAdapter {
  readonly name: ProviderName;

  constructor(name: ProviderName) {
    this.name = name;
  }

  async submitTask(input: ProviderTaskInput, _onProgress: (event: ProviderProgress) => void): Promise<ProviderResult> {
    return {
      taskId: input.taskId,
      sessionId: input.sessionId,
      status: "error",
      summary: `${this.name} adapter is scaffolded but not enabled in MVP`,
      changedFiles: [],
      errorCode: ProviderErrorCodes.ProviderNotEnabled,
      errorMessage: `${this.name} is scaffold only`
    };
  }

  async cancelTask(_taskId: string, _sessionId: string): Promise<void> {}
}
