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
- `apps/test-app/src/styles.css`: Tailwind/globals imports and source scanning only.
- `apps/test-app/tests/pinpatch.spec.ts`: smoke tests (must cover all routes).
- `apps/test-app/playwright.config.ts`: local web server orchestration for e2e.

## Styling Contract

- `apps/test-app/src/styles.css` must import `@pinpatch/ui/globals.css`.
- The app should opt into shared theme with `.pinpatch-ui-theme`.
- `apps/test-app/src/App.tsx` should use basic HTML elements only (no shared UI React components).
- Prefer Tailwind utility classes in TSX; avoid custom CSS rules in `styles.css`.

## Testing Contract

- Smoke tests should verify core pin flow on each route.
- Smoke tests should verify that hovering a pin shows the target-element highlight overlay.
- Smoke tests should verify pin alignment survives viewport resize.
- Smoke tests should verify route-scoped pin persistence:
  - pins created on one route are hidden on other routes
  - pins reappear with correct alignment when returning to their route
  - pins persist after reload within the same tab session
- Smoke tests should verify keyboard shortcut clearing of pins (`Meta+Backspace` on macOS, `Control+Delete` elsewhere) and that in-flight pins trigger bridge cancellation.
- Smoke tests should verify that clicking outside an open composer dismisses it and removes the draft pin.
- Smoke tests should verify composer keyboard behavior (`Shift+Enter` newline, `Enter` submit).
- Completion checks should prefer stable behavior hooks (for example `data-status`) over raw color class assertions.
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
