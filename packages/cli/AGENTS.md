# CLI Package Agent Guide

Scope: `packages/cli/**`

## Purpose

- Defines the `pinpatch` CLI command surface and runtime orchestration.

## Key File

- `packages/cli/src/index.ts`

## Commands Implemented

- `pinpatch --help` (includes command usage + overlay keyboard shortcuts)
- `pinpatch dev`
- `pinpatch implement <taskId>`
- `pinpatch tasks`
- `pinpatch tasks --prune`

## Responsibilities

- Parse CLI flags/options.
- Resolve runtime config (delegates precedence logic to core).
- Ensure `.pinpatch` structure and `.gitignore` entry via core storage.
- Start/stop bridge + reverse proxy for `dev`.
- Trigger provider execution for `implement`.
- Print task listings and prune output for `tasks`.

## Important Details

- Overlay bundle path is auto-resolved (and auto-built in workspace context when available).
- `dev` checks target port reachability before startup.
- Port conflicts should fail with actionable messaging.
- Runtime cwd resolution prefers `INIT_CWD` and falls back to workspace-root inference when command cwd is the CLI package (common with `pnpm --filter ... exec`), before process cwd. This keeps `.pinpatch` artifacts and provider write scope targeting the project root.

## Commands

- Build:
  - `pnpm --filter pinpatch build`
- Typecheck:
  - `pnpm --filter pinpatch typecheck`
- Run from source:
  - `pnpm --filter pinpatch exec tsx src/index.ts --help`

## Editing Guidelines

- Keep CLI output concise and actionable.
- Avoid moving validation/business logic into CLI when it belongs in core.
- Maintain compatibility with `packages/cli/bin/pinpatch.mjs` entrypoint behavior.
