# Proxy Package Agent Guide

Scope: `packages/proxy/**`

## Purpose

- Reverse proxy for local target apps during `pinpatch dev`.
- Injects overlay bootstrap scripts into HTML responses.
- Forwards WebSocket upgrades (required for Vite HMR/dev servers).

## Key File

- `packages/proxy/src/index.ts`

## Runtime Behavior

- Uses `http-proxy` with:
  - `changeOrigin: true`
  - `ws: true`
  - `selfHandleResponse: true`
- Forces `accept-encoding: identity` to simplify HTML transformation.
- Injects:
  - `window.__PINPATCH_BRIDGE_URL`
  - `<script src="http://localhost:<bridgePort>/overlay.js" data-pinpatch-overlay="true"></script>`
- Avoids double-injection if `data-pinpatch-overlay` is present.

## Failure Handling

- If injection fails, forward original response body.
- Proxy errors should return a 502 JSON response when possible.

## Known Note

- Node may print `[DEP0060] util._extend` warning from `http-proxy` internals.

## Commands

- Build:
  - `pnpm --filter @pinpatch/proxy build`
- Typecheck:
  - `pnpm --filter @pinpatch/proxy typecheck`
- Tests:
  - `pnpm --filter @pinpatch/proxy test`

## Editing Guidelines

- Keep behavior fail-open for proxied apps.
- Preserve WebSocket upgrade forwarding when modifying proxy logic.
