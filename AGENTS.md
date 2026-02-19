# Pinpatch Agent Guide

This file is the top-level operating guide for agents working in this repository.

## Scope

- Applies to the whole repo unless a deeper `AGENTS.md` overrides details.
- Product source of truth is `scope-doc.md`.

## Required Reading and Docs Maintenance

- Always read any `AGENTS.md` and `README.md` files in the parts of the codebase you are working in (and applicable parent directories). These are placed intentionally to provide local context and instructions; nested `AGENTS.md` rules take precedence within their directory scope.
- Keep docs up to date as you change things:
  - If you modify code within a directory tree that has an `AGENTS.md`, update that `AGENTS.md` to reflect new/changed behavior, routes, schema objects, commands, and constraints.
  - If you make cross-cutting changes that affect multiple areas, update the relevant `AGENTS.md` files in each area (and any referenced `README.md`).
  - Prefer linking to a canonical `AGENTS.md` rather than duplicating the same guidance in multiple places.

## Repo Layout

- `packages/core`: contracts, config, artifacts, bridge server, task runner, logging.
- `packages/cli`: `pinpatch` CLI command surface.
- `packages/providers`: provider registry/adapters (`codex` + `claude` active, `cursor` scaffolded).
- `packages/proxy`: reverse proxy + HTML injection + WebSocket forwarding.
- `packages/ui`: shared UI components used by apps.
- `apps/overlay`: injected overlay bundle.
- `apps/test-app`: fixture app and Playwright smoke tests.
- `docs`: checklist/docs.

## Current Product Behavior (MVP)

- CLI commands:
  - `pinpatch --help` (includes command usage + overlay keyboard shortcuts)
  - `pinpatch dev --target <port>`
  - `pinpatch implement <taskId>`
  - `pinpatch tasks`
  - `pinpatch tasks --prune`
- Runtime writes artifacts to `./.pinpatch` in current working directory.
- Storage split is intentional:
  - Durable runtime/task artifacts live in `./.pinpatch` (CLI/core-owned).
  - Overlay pin UI state lives in browser `sessionStorage` (tab-scoped, fast local UX, no direct browser filesystem writes).
- Provider support includes `codex` and `claude`; `cursor` remains stub-only.
- Overlay is injected by proxy through bridge-served `/overlay.js`.

## Tooling and Commands

- Package manager: `pnpm`
- Build orchestration: `turbo`
- Language: TypeScript + React (apps)
- Root quality commands:
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
- Pre-commit hook uses `simple-git-hooks` and executes:
  - `pnpm pre-commit` -> `pnpm lint && pnpm typecheck && pnpm test`

## Local Dev Workflows

- Install:
  - `pnpm install`
- Run test app:
  - `pnpm --filter @pinpatch/test-app dev`
- Run Pinpatch CLI from source:
  - `pnpm --filter pinpatch exec tsx src/index.ts dev --target 3000`

## Critical Invariants

- Keep contracts in `packages/core/src/contracts/*` as the canonical schema source.
- Preserve config precedence: CLI flags > `.pinpatch/config.json` > defaults.
- Use `@pinpatch/*` import routes for cross-package imports.
- In TypeScript source, do not use `.js` suffixes in import specifiers.
- Do not commit generated `.pinpatch/` artifacts.
- Keep proxy injection fail-open: if injection fails, target response must still pass through.
- Keep smoke coverage aligned with available test-app routes.

## Known Implementation Notes

- Proxy uses `http-proxy@1.18.x`; Node may show `[DEP0060] util._extend` warning from dependency internals.
- Overlay bundle is auto-discovered/built by CLI when possible; no manual overlay path env should be required for normal repo usage.
- UI package uses direct subpath imports (`@pinpatch/ui/components/*`, `@pinpatch/ui/lib`), not a root barrel export.

## When Making Changes

- Prefer small, isolated edits and keep package boundaries clear.
- If you add/rename routes in test app, update Playwright smoke tests in same change.
- If you modify bridge payloads or provider result fields, update:
  - zod schemas
  - runtime persistence
  - overlay/CLI usage
  - tests
