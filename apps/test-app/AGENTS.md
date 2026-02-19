# Test App Agent Guide

Scope: `apps/test-app/**`

## Purpose

- This is the fixture app used to validate Pinpatch behavior end-to-end.
- It is intentionally simple and stable for smoke testing, not a production UI.

## Routes

- `/` (home route)
- `/settings` (secondary route for multi-page coverage)

If routes change, update Playwright tests in the same PR.

## Key Files

- `apps/test-app/src/App.tsx`: route UI and test targets.
- `apps/test-app/tests/pinpatch.spec.ts`: smoke tests (must cover all routes).
- `apps/test-app/playwright.config.ts`: local web server orchestration for e2e.

## Testing Contract

- Smoke tests should verify core pin flow on each route.
- Smoke tests should verify that hovering a pin shows the target-element highlight overlay.
- Smoke tests should verify keyboard shortcut clearing of pins (`Meta+Backspace` on macOS, `Control+Delete` elsewhere) and that in-flight pins trigger bridge cancellation.
- Keep `data-testid` selectors stable for:
  - clickable target elements for pin placement
  - route navigation controls

## Commands

- Run app:
  - `pnpm --filter @pinpatch/test-app dev`
- Typecheck:
  - `pnpm --filter @pinpatch/test-app typecheck`
- Build:
  - `pnpm --filter @pinpatch/test-app build`
- E2E smoke:
  - `pnpm --filter @pinpatch/test-app test:e2e`

## Notes

- Playwright starts both the Vite test app and Pinpatch runtime.
- E2E uses fixture provider mode for deterministic results.
