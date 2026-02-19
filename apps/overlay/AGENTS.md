# Overlay Agent Guide

Scope: `apps/overlay/**`

## Purpose

- Builds the injected browser overlay used during `pinpatch dev`.
- Handles comment mode UX, pin placement, composer UI, task submission, and SSE progress updates.

## Key Files

- `apps/overlay/src/entry.tsx`: overlay runtime and UI logic.
- `apps/overlay/src/styles.css`: Tailwind v4 import + overlay-specific CSS.
- `apps/overlay/src/components/types.ts`: shared overlay domain types.
- `apps/overlay/src/components/pin-glyph.tsx`: shared pin cursor/icon glyph.
- `apps/overlay/src/components/pin-visuals.tsx`: pin status icon and style mapping.
- `apps/overlay/src/components/status-panel.tsx`: hover status panel UI.
- `apps/overlay/src/components/composer-panel.tsx`: comment composer panel UI.

## Behavioral Contracts

- `c` toggles comment mode (unless typing in an input/textarea/contenteditable).
- `Escape` exits comment mode and dismisses an open comment composer panel.
- `Cmd+Delete` (macOS) or `Ctrl+Delete` (non-macOS) clears all pins and closes open pin streams.
- Deleting an in-flight pin (`queued`/`running`) triggers bridge cancellation before removing it from the UI.
- Comment mode cursor is globally overridden to the same 16px pin glyph used for idle pins (white fill with visible dark outline) via `html.pinpatch-comment-mode`.
- Pins transition through statuses:
  - `idle -> queued -> running -> completed|error|cancelled|timeout`
- Hovering a pin highlights the original target element bounding box captured when the pin was created.
- Completed pins remain visible until manually cleared.
- Status and composer UI are rendered in popovers anchored to each pin trigger.
- Running/queued pins expose a bottom `Cancel` button in the status panel that cancels the in-flight task before removing the pin.
- Error/cancelled/timeout pins expose retry and dismiss controls.
- Comment composer actions use an outline-styled Cancel button and a primary Submit button.
- When a pin is created, the comment textarea auto-focuses so typing can start immediately.

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
- Keep overlay self-contained and non-invasive:
  - do not block app interactions outside comment mode
  - avoid breaking target app styles
- If adding test IDs or behavior expected by e2e, update:
  - `apps/test-app/tests/pinpatch.spec.ts`
