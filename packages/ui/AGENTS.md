# UI Package Agent Guide

Scope: `packages/ui/**`

## Purpose

- Shared React UI primitives used by overlay and test app.

## Structure

- Components:
  - `packages/ui/src/components/button.tsx`
  - `packages/ui/src/components/popover.tsx`
  - `packages/ui/src/components/textarea.tsx`
- Utilities:
  - `packages/ui/src/lib/utils.ts`
- Styles:
  - `packages/ui/src/globals.css`

## Component Notes

- `Button` variants currently include: `default`, `secondary`, `outline`, `ghost`, and `destructive`.
- `PopoverContent` forwards refs to the underlying Radix content element.

## Import Convention

- Use direct subpath imports:
  - `@pinpatch/ui/components/button`
  - `@pinpatch/ui/components/textarea`
  - `@pinpatch/ui/components/popover`
  - `@pinpatch/ui/lib`
  - `@pinpatch/ui/lib/utils`
- Do not add or rely on a root barrel import (`@pinpatch/ui`).
- Do not use `.js` suffixes in TypeScript import specifiers.

## Packaging Notes

- Package exports are subpath-based and map to built `dist/*` outputs.
- `tsup` entrypoints compile each component/util directly.

## Styling Notes

- Tailwind v4 is used directly in apps.
- No shared tailwind preset package is used.
- Avoid introducing app-specific styling assumptions into shared primitives.

## Commands

- Build:
  - `pnpm --filter @pinpatch/ui build`
- Typecheck:
  - `pnpm --filter @pinpatch/ui typecheck`
- Tests:
  - `pnpm --filter @pinpatch/ui test`

## Editing Guidelines

- Keep components generic and composable.
- Preserve button ref forwarding behavior.
- If changing subpath exports, validate overlay and test-app typecheck/build immediately.
