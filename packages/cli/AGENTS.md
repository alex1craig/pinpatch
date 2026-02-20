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
- Enable both `codex` and `claude` adapters in runtime registry wiring.

## Important Details

- Overlay bundle path is auto-resolved (and auto-built in workspace context when available).
- Published CLI package declares a runtime dependency on `@pinpatch/overlay` so npm consumers can resolve the injected overlay bundle from `node_modules`.
- `dev` checks target port reachability before startup.
- Port conflicts should fail with actionable messaging.
- Root `pinpatch --help` includes a command/option matrix for `dev`, `implement`, and `tasks` (including provider/model guidance and defaults), plus shared keyboard behavior.
- Runtime cwd resolution prefers `INIT_CWD` and falls back to workspace-root inference when command cwd is the CLI package (common with `pnpm --filter ... exec`), before process cwd. This keeps `.pinpatch` artifacts and provider write scope targeting the project root.
- `dev` passes resolved provider/model into proxy injection globals so overlay submissions use runtime config without in-overlay provider UI.
- Keep `packages/cli/README.md` consumer-focused for npm users; monorepo contributor details belong in root docs.

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
