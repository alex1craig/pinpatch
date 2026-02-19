# Providers Package Agent Guide

Scope: `packages/providers/**`

## Purpose

- Implements provider adapter registry and concrete provider adapters.

## Key Files

- `packages/providers/src/index.ts`
- `packages/providers/src/registry.ts`
- `packages/providers/src/adapters/codex.ts`
- `packages/providers/src/adapters/stub.ts`

## Current MVP Behavior

- Active provider: `codex`
- Scaffold-only providers: `claude`, `cursor` (stub adapters)

## Codex Adapter Notes

- Uses subprocess execution (`codex` by default).
- Env overrides:
  - `PINPATCH_CODEX_BIN`
  - `PINPATCH_CODEX_ARGS`
- Initial running progress message includes the command preview with only the user-typed prompt text (JSON-escaped), not full guardrail/system prompt content.
- Deterministic fixture mode:
  - `PINPATCH_PROVIDER_FIXTURE=1` (also supports legacy `PINPATCH_CODEX_MOCK`)

## Adapter Contract Expectations

- Must emit progress events during execution.
- Must return terminal status with summary and changed files.
- Must support cancel behavior for active sessions.
- Error mapping should stay aligned with core provider error codes.

## Commands

- Build:
  - `pnpm --filter @pinpatch/providers build`
- Typecheck:
  - `pnpm --filter @pinpatch/providers typecheck`
- Tests:
  - `pnpm --filter @pinpatch/providers test`

## Editing Guidelines

- Keep provider-specific logic inside adapters; keep registry generic.
- If changing adapter output shape, update core contracts first.
- Preserve fixture-mode behavior for smoke/e2e stability.
