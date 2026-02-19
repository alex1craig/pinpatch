# Overlay Agent Guide

Scope: `apps/overlay/**`

## Purpose

- Builds the injected browser overlay used during `pinpatch dev`.
- Handles pin mode UX, pin placement, composer UI, task submission, and SSE progress updates.

## Key Files

- `apps/overlay/src/entry.tsx`: mount/bootstrap only; forces overlay light theme.
- `apps/overlay/src/components/overlay-app.tsx`: overlay runtime state + UI composition.
- `apps/overlay/src/styles.css`: imports Tailwind + shared globals and keeps only global overlay rules.
- `apps/overlay/src/components/types.ts`: shared overlay domain types.
- `apps/overlay/src/components/panel-shell.tsx`: shared panel layout (title/body/footer + dismiss).
- `apps/overlay/src/components/pin-glyph.tsx`: shared pin cursor/icon glyph.
- `apps/overlay/src/components/pin-visuals.tsx`: pin status icon and style mapping.
- `apps/overlay/src/components/status-panel.tsx`: hover status panel UI.
- `apps/overlay/src/components/composer-panel.tsx`: pin composer panel UI.
- `apps/overlay/src/lib/*`: bridge, anchor math, geometry, storage, packet helpers.
- `apps/overlay/src/hooks/*`: navigation, keyboard, and hover behavior hooks.

## Behavioral Contracts

- `c` toggles pin mode (unless typing in an input/textarea/contenteditable).
- `Escape` exits pin mode and dismisses an open pin composer panel.
- `Cmd+Delete` (macOS) or `Ctrl+Delete` (non-macOS) clears all pins and closes open pin streams.
- Deleting an in-flight pin (`queued`/`running`) triggers bridge cancellation before removing it from the UI.
- Pin mode cursor is globally overridden to the same 16px pin glyph used for idle pins (white fill with visible dark outline) via `html.pinpatch-pin-mode`.
- Pins transition through statuses:
  - `idle -> queued -> running -> completed|error|cancelled|timeout`
- Pins are route-scoped by `pathname + search`; only pins for the current route render, but all routes share one in-memory store.
- Pins persist in browser `sessionStorage` for the life of the tab and are restored on reload/navigation.
- Pin geometry is anchor-based:
  - resolve target by stored element hints when available
  - fallback to viewport-relative ratios when target resolution fails
  - recalculate visible pin coordinates on resize
- Hovering a pin highlights the current resolved target bounding box (or fallback rect when unresolved).
- Completed pins remain visible until manually cleared.
- Status and composer UI are rendered in popovers anchored to each pin trigger.
- Running/queued pins expose a bottom `Cancel` button in the status panel that cancels the in-flight task before removing the pin.
- Error/cancelled/timeout pins expose retry and dismiss controls.
- Pin composer actions use an outline-styled Cancel button and a primary Submit button.
- When a pin is created, the pin textarea auto-focuses so typing can start immediately.
- Restored in-flight pins (`queued`/`running` with `taskId` + `sessionId`) re-subscribe to SSE progress streams.

## Layering and Theme Rules

- Overlay root is always light mode (`.pinpatch-ui-theme[data-theme="light"]` + `color-scheme: light`).
- Popovers must render into `#pinpatch-overlay-root` via popover portal `container`.
- Popovers must stack above highlight overlays (highlights lower z-index, popovers higher z-index).

## Integration Points

- Bridge origin from `window.__PINPATCH_BRIDGE_URL` (fallback `http://localhost:7331`).
- HTTP endpoints:
  - `POST /api/tasks`
  - `POST /api/tasks/:taskId/submit`
  - `POST /api/tasks/:taskId/cancel`
- SSE endpoint:
  - `GET /api/tasks/:taskId/events?sessionId=...`

## UI Import Rule

- Import directly from UI subpaths:
  - `@pinpatch/ui/components/button`
  - `@pinpatch/ui/components/popover`
  - `@pinpatch/ui/components/spinner`
  - `@pinpatch/ui/components/textarea`
  - `@pinpatch/ui/lib`
- Do not import from `@pinpatch/ui` root export.

## Development Commands

- Build overlay:
  - `pnpm --filter @pinpatch/overlay build`
- Typecheck:
  - `pnpm --filter @pinpatch/overlay typecheck`

## Editing Guidelines

- Keep DOM event listeners balanced with cleanup in `useEffect`.
- Prefer Tailwind utilities in TSX for component styling; keep `styles.css` limited to global selectors (`#pinpatch-overlay-root`, pin-mode cursor overrides).
- Keep overlay self-contained and non-invasive:
  - do not block app interactions outside pin mode
  - avoid breaking target app styles
- If adding test IDs or behavior expected by e2e, update:
  - `apps/test-app/tests/pinpatch.spec.ts`
