# UI Package Agent Guide

Scope: `packages/ui/**`

## Purpose

- Shared React UI primitives used by overlay and test app.

## Structure

- Components:
  - `packages/ui/src/components/button.tsx`
  - `packages/ui/src/components/popover.tsx`
  - `packages/ui/src/components/textarea.tsx`
  - `packages/ui/src/components/card.tsx`
  - `packages/ui/src/components/badge.tsx`
  - `packages/ui/src/components/separator.tsx`
  - `packages/ui/src/components/spinner.tsx`
- Utilities:
  - `packages/ui/src/lib/utils.ts`
- Styles:
  - `packages/ui/src/globals.css`

## Component Notes

- `Button` variants include: `default`, `secondary`, `outline`, `ghost`, `destructive`, and `link`.
- `PopoverContent` forwards refs and accepts an optional `container` to control portal root.
- `Spinner` is the shared loading indicator and should be reused instead of ad-hoc spinning icons.

## Import Convention

- Use direct subpath imports:
  - `@pinpatch/ui/components/button`
  - `@pinpatch/ui/components/card`
  - `@pinpatch/ui/components/badge`
  - `@pinpatch/ui/components/separator`
  - `@pinpatch/ui/components/spinner`
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

- Theme styles are opt-in via `.pinpatch-ui-theme`; importing globals must not force host-page restyling.
- Dark mode is opt-in per theme wrapper (`.pinpatch-ui-theme.dark` or `[data-theme="dark"]`).
- Shared primitives should prefer token-based classes (`bg-primary`, `text-muted-foreground`, etc.) over app-specific palette values.

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
- When adding shadcn components, always use the CLI command:
  - `pnpm dlx shadcn@latest add <component>`
  - If re-generating an existing component, use `-o` to overwrite.
- If changing subpath exports, validate overlay and test-app typecheck/build immediately.
