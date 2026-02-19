# Core Package Agent Guide

Scope: `packages/core/**`

## Purpose

- Canonical domain layer for Pinpatch:
  - contracts and schemas
  - config resolution
  - artifact persistence
  - bridge API server
  - task orchestration/event fan-out
  - runtime logging

## Key Directories

- `packages/core/src/contracts`
- `packages/core/src/storage`
- `packages/core/src/runtime`
- `packages/core/src/bridge`
- `packages/core/src/logging`

## Critical Invariants

- Contracts in `src/contracts/*` are the single source of truth.
- Config precedence must remain:
  - CLI overrides > env > `.pinpatch/config.json` > defaults.
- Artifact structure must remain under project cwd:
  - `.pinpatch/config.json`
  - `.pinpatch/tasks/`
  - `.pinpatch/sessions/`
  - `.pinpatch/screenshots/`
  - `.pinpatch/runtime/logs/`
- Core owns durable on-disk artifacts in `.pinpatch`; do not move overlay tab/session UI state here (overlay uses browser `sessionStorage` by design).
- Writes should stay atomic through fs helpers.
- Provider prompt payloads (built in `runtime/task-runner.ts`) must keep strict scope guardrails so coding agents do not touch unrelated files or overwrite concurrent work.
- Provider prompt payloads must treat the captured selected element as the default edit target; page/global-wrapper edits should only occur when explicitly requested.

## Bridge API Surface

- `GET /health`
- `GET /overlay.js`
- `POST /api/tasks`
- `POST /api/tasks/:taskId/submit` (supports optional `followUpBody` override)
- `POST /api/tasks/:taskId/cancel`
- `GET /api/tasks/:taskId/events?sessionId=...` (SSE)

## Testing

- Tests are in `packages/core/tests`.
- Must cover contracts, config precedence, artifact behavior, and bridge API contracts.

## Commands

- Build:
  - `pnpm --filter @pinpatch/core build`
- Typecheck:
  - `pnpm --filter @pinpatch/core typecheck`
- Tests:
  - `pnpm --filter @pinpatch/core test`

## Editing Guidelines

- Any contract/schema change requires checking all downstream consumers:
  - overlay
  - providers
  - CLI
  - tests
- Keep failure behavior explicit and avoid silent data loss.
