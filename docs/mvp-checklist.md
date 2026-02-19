# MVP Checklist Traceability

This file maps scope checklist items to tests and validation steps.

| Checklist item | Coverage |
| --- | --- |
| CLI commands (`dev`, `implement`, `tasks`) | `packages/cli/tests/cli.integration.test.ts` (planned) + manual smoke |
| Overlay interaction (`c`, `Escape`, pin flow) | `apps/test-app/tests/pinpatch.spec.ts` |
| Protocol endpoints and schemas | `packages/core/tests/bridge.contract.test.ts` |
| `.pinpatch` artifacts and debug logs | `packages/core/tests/artifacts.test.ts`, Playwright smoke |
| Proxy injection and ws forwarding | `packages/proxy/tests/proxy.integration.test.ts` |
