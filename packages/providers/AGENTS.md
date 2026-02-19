# Providers Package Agent Guide

Scope: `packages/providers/**`

## Purpose

- Implements provider adapter registry and concrete provider adapters.

## Key Files

- `packages/providers/src/index.ts`
- `packages/providers/src/registry.ts`
- `packages/providers/src/adapters/claude.ts`
- `packages/providers/src/adapters/codex.ts`
- `packages/providers/src/adapters/stub.ts`

## Current MVP Behavior

- Active providers: `codex`, `claude`
- Scaffold-only provider: `cursor` (stub adapter)

## Codex Adapter Notes

- Uses subprocess execution (`codex` by default).
- Initial running progress message includes the command preview with only the user-typed prompt text (JSON-escaped), not full guardrail/system prompt content.

## Claude Adapter Notes

- Uses subprocess execution (`claude` by default).
- Closes child stdin immediately after spawn to prevent `claude -p` hangs when launched with piped stdio.
- Dry runs force `--permission-mode plan` regardless of base args.
- Parses Claude JSON output and treats `is_error: true` as provider failure.

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
