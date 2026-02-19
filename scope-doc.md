# Pinpatch

> Press `c`. Drop a Figma-style comment. Submit to Codex.

Pinpatch is an npm-installable tool for annotating a locally running app and sending actionable UI comments to a coding agent.

The initial release is intentionally narrow: Codex is the only supported coding agent provider, with scaffolding reserved for future Claude Code and Cursor integration.

---

# 1. Vision

Pinpatch removes friction between:

- Inspecting UI in the browser
- Finding the right code to edit
- Writing context-heavy prompts

The core interaction is:

1. Developer runs `pinpatch dev`
2. Opens the proxied localhost app
3. Presses `c` to enter commenting mode (cursor changes to a message icon)
4. Presses `c` or `Escape` to exit commenting mode
5. Clicks target UI and leaves a Figma-comment-style note
6. Submits comment to the coding agent provider (Codex for MVP)
7. Tracks pin state until the request is complete

Pinpatch structures context.
Codex performs edits.
The developer stays in control.

---

# 2. Core Feature Set (MVP)

- Comment mode toggles with `c`; exits with `c` or `Escape`
- Cursor switches to a message/comment icon while comment mode is active
- Figma-comment-style comment composer attached to a circular pin
- Lucide is the icon library for overlay/UI iconography
- Submit action routes to coding agent provider integration
- Codex is the only supported provider for now
- Claude Code and Cursor integration scaffolding exists but is not user-enabled
- Pin state lifecycle:
  - Loading state uses a Lucide spinner icon
  - Hovering a loading pin shows coding agent progress text
  - Completed requests remove the pin from the canvas
- Configurable model selection, defaulting to `gpt-5.3-codex-spark`
- All Pinpatch-generated artifacts (tasks, session info, screenshots, config, runtime metadata) live under `.pinpatch/`
- Turborepo monorepo, organized for open source development
- Overlay implemented as a basic React app with Tailwind + shadcn, then built as an injected script
- All `apps/*` share Tailwind and shadcn primitives via `packages/ui` + shared Tailwind preset
- CLI includes a `--target` field for selecting localhost port
- CLI includes a global `--debug` mode with extensive logging
- Distributed as an easily installable npm package

---

# 3. Installation

Global install:

```bash
npm install -g pinpatch
```

Requirements:

- Node.js >= 18
- Codex CLI available locally

---

# 4. CLI Commands

## `pinpatch dev`

Starts:

- Bridge server (default `localhost:7331`)
- Reverse proxy server (default `localhost:3030`)
- Injected overlay client

Usage:

```bash
pinpatch dev --target 3000 --debug
```

`--target` is the localhost port for the app under development (for example, `3000` maps to `http://localhost:3000`).
`--debug` enables extensive logging across proxy, overlay bridge, task lifecycle, provider invocation, and timing/diagnostic events.

The developer opens:

```text
http://localhost:3030
```

Overlay features:

- Hover highlight
- `c` hotkey enters/exits commenting mode
- `Escape` exits commenting mode
- Message-icon cursor in commenting mode
- Figma-style circular pin + composer UI
- Pin loading state with Lucide spinner
- Hover-on-pin progress status while Codex is running
- Pin removal on completion
- Screenshot capture
- UI Change Packet generation
- Submit comment to Codex integration

---

## `pinpatch implement <task-id>`

Invokes Codex to edit local files.

Options:

```bash
--provider codex
--model gpt-5.3-codex-spark
--dry-run
--debug
```

Example:

```bash
pinpatch implement 2026-02-18-abc123 --provider codex --model gpt-5.3-codex-spark --debug
```

Notes:

- `codex` is the only supported provider in MVP
- Internal provider abstraction is kept so Claude Code and Cursor can be added later without redesigning the CLI

Flow:

1. Pinpatch loads the UI Change Packet
2. Builds structured AI prompt
3. Invokes Codex
4. Codex edits local files (or returns dry-run output)
5. Pinpatch prints summary of modified files

Pinpatch does not generate diffs or manage Git.

---

## `pinpatch tasks`

Lists tasks stored in `.pinpatch/tasks`.
All Pinpatch task/session artifacts are persisted under `.pinpatch/`.

Usage:

```bash
pinpatch tasks
pinpatch tasks --prune
```

`--prune` removes expired runtime logs and orphaned session records under `.pinpatch/`.

---

# 5. Configuration

Model selection is configurable in Pinpatch config.
Config file location: `.pinpatch/config.json`.

Default:

```json
{
  "provider": "codex",
  "model": "gpt-5.3-codex-spark"
}
```

---

# 6. Architecture Overview

Pinpatch is a Turborepo monorepo with three runtime layers:

1. CLI Runtime
2. Reverse Proxy Injection Layer
3. Overlay Client (React -> injected script)

---

## 6.1 CLI Runtime

Responsibilities:

- Start and manage bridge server
- Start reverse proxy
- Parse `--target` localhost port
- Parse global `--debug` flag
- Persist all Pinpatch runtime artifacts in `.pinpatch/` (tasks, sessions, screenshots, config, and runtime metadata)
- Invoke provider adapters from `packages/providers` (Codex active in MVP)
- Display edit summaries
- Provide dry-run capability
- Emit extensive structured debug logs to console and `.pinpatch/runtime/logs/`

---

## 6.2 Reverse Proxy Injection

Pinpatch runs a lightweight proxy server that:

- Forwards HTTP traffic to the selected localhost target port
- Injects overlay script into `text/html` responses
- Forwards WebSocket connections (HMR compatible)

This allows Pinpatch to work without changing app source code or build config.

---

## 6.3 Overlay Client

The overlay is authored as a basic React app using Tailwind + shadcn + Lucide icons from shared workspace UI packages, then bundled for script injection by the proxy.

Provides:

- Element hover detection
- Bounding box highlight
- `c` hotkey to enter/exit commenting mode
- `Escape` to exit commenting mode
- Message-icon cursor in commenting mode
- Click-to-pin Figma-style comment bubbles
- Circular pin state machine (idle, loading, done)
- Loading spinner icon via Lucide
- Hover progress tooltip for in-flight Codex work
- Auto-removal of pin after completion
- Screenshot capture
- Context extraction
- Comment submission to bridge server and Codex

---

# 7. UI Change Packet

Pinpatch generates a structured, stack-agnostic description of the selected UI element.

This packet is the core artifact passed to Codex.

## Packet Schema (JSON)

```json
{
  "id": "uuid",
  "timestamp": "ISO-8601",
  "url": "/billing",
  "viewport": {
    "width": 1440,
    "height": 900
  },
  "element": {
    "tag": "button",
    "role": "button",
    "text": "Upgrade",
    "attributes": {
      "class": "btn-primary large",
      "aria-label": null,
      "data-testid": null
    },
    "boundingBox": {
      "x": 812,
      "y": 412,
      "width": 164,
      "height": 40
    }
  },
  "nearbyText": ["Pricing", "$99/mo", "Cancel anytime"],
  "domSnippet": "<button class=\"btn-primary large\">Upgrade</button>",
  "computedStyleSummary": {
    "display": "inline-flex",
    "padding": "16px 24px",
    "fontSize": "16px",
    "backgroundColor": "rgb(0, 112, 243)"
  },
  "screenshotPath": ".pinpatch/screenshots/abc123.png",
  "userRequest": "Move this button to the right and reduce padding."
}
```

---

# 8. Provider Integration

## 8.1 Codex (Supported)

- Uses local Codex tooling
- Reads and edits files in working directory
- Returns edit summary/progress updates

## 8.2 Claude Code (Scaffold Only)

- Adapter interface and placeholder wiring only
- Not exposed as a supported provider in MVP flows

## 8.3 Cursor (Scaffold Only)

- Adapter interface and placeholder wiring only
- Not exposed as a supported provider in MVP flows

---

# 9. Safety Controls

- `--dry-run` previews proposed edits
- `--debug` emits extensive diagnostic logs for troubleshooting
- Summary of modified files displayed
- Tasks logged in `.pinpatch/tasks`
- Session info and screenshots logged under `.pinpatch/`
- Developers remain responsible for version control

Example:

```bash
pinpatch implement 123 --provider codex --dry-run
```

---

# 10. Project Directory Structure

Pinpatch creates:

```text
.project-root/
  .pinpatch/
    tasks/
    sessions/
    screenshots/
    runtime/
      logs/
    config.json
```

`.pinpatch/` is the single root for all Pinpatch-generated files and is automatically added to `.gitignore`.

---

# 11. Open Source Repository Structure

Turborepo layout:

```text
pinpatch/
  apps/
    overlay/
    test-app/
  packages/
    cli/
    proxy/
    core/
    ui/
    providers/
      codex/
      claude/   # scaffold
      cursor/   # scaffold
  docs/
  scripts/
  turbo.json
  package.json
  README.md
  CONTRIBUTING.md
  LICENSE
```

`apps/test-app/` is a minimal React + Vite app used for end-to-end smoke testing during local development and CI.
`packages/ui/` contains shared shadcn-based UI components, shared style tokens, UI utilities, and the shared Tailwind preset/config consumed by all `apps/*`.
`packages/providers/` contains the shared provider layer plus provider-specific adapters.

---

# 12. Technical Requirements

- Node.js >= 18
- Cross-platform (macOS, Linux, Windows)
- No browser extension required
- No build-config modification required
- Works with any HTML-rendering stack through proxy injection
- Lucide is the standard icon library for product UI
- All Pinpatch-generated files must be stored under `.pinpatch/`
- CLI supports `--debug` mode with extensive logging for development and troubleshooting
- All apps in `apps/*` must use Tailwind v4 CSS-first configuration (no custom shared preset required)
- All apps in `apps/*` must consume shared shadcn primitives/components from `packages/ui/`

---

# 13. Implementation Contracts

The following contracts are required before implementation work is considered complete.

## 13.1 Provider Adapter Contract

All provider adapters in `packages/providers/*` must implement the same interface:

```ts
type ProviderProgress = {
  taskId: string;
  sessionId: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "error"
    | "cancelled"
    | "timeout";
  message: string;
  percent?: number;
  timestamp: string;
};

type ProviderResult = {
  taskId: string;
  sessionId: string;
  status: "completed" | "error" | "cancelled" | "timeout";
  summary: string;
  changedFiles: string[];
  errorCode?: string;
  errorMessage?: string;
};

interface ProviderAdapter {
  name: "codex" | "claude" | "cursor";
  submitTask(
    input: ProviderTaskInput,
    onProgress: (event: ProviderProgress) => void,
  ): Promise<ProviderResult>;
  cancelTask(taskId: string, sessionId: string): Promise<void>;
}
```

Behavior requirements:

- Provider calls must include timeout handling and return `timeout` status on expiry
- Failures must map to stable `errorCode` values for CLI and UI handling
- Progress events must be monotonic in time and tied to `taskId` + `sessionId`

## 13.2 Overlay-Bridge Protocol

Overlay-to-bridge communication must use explicit event contracts.

- Command transport: HTTP POST from overlay to bridge
- Progress transport: SSE stream from bridge to overlay
- Every request must include a `taskId` and `sessionId`

Required endpoints:

- `POST /api/tasks` creates a task from comment payload
- `POST /api/tasks/:taskId/submit` starts provider execution
- `POST /api/tasks/:taskId/cancel` requests cancellation
- `GET /api/tasks/:taskId/events?sessionId=...` streams progress events

Request/response schemas:

`POST /api/tasks` request body:

```json
{
  "sessionId": "uuid",
  "url": "/billing",
  "viewport": { "width": 1440, "height": 900 },
  "pin": { "x": 812, "y": 412 },
  "comment": { "body": "Move this button to the right and reduce padding." },
  "uiChangePacket": {
    "id": "uuid",
    "element": {},
    "nearbyText": [],
    "domSnippet": ""
  },
  "screenshotPath": ".pinpatch/screenshots/abc123.png"
}
```

`POST /api/tasks` response body (`201 Created`):

```json
{
  "taskId": "2026-02-18-abc123",
  "sessionId": "uuid",
  "status": "created",
  "taskPath": ".pinpatch/tasks/2026-02-18-abc123.json",
  "eventsUrl": "/api/tasks/2026-02-18-abc123/events?sessionId=uuid"
}
```

`POST /api/tasks/:taskId/submit` request body:

```json
{
  "sessionId": "uuid",
  "provider": "codex",
  "model": "gpt-5.3-codex-spark",
  "dryRun": false,
  "debug": false
}
```

`POST /api/tasks/:taskId/submit` response body (`202 Accepted`):

```json
{
  "taskId": "2026-02-18-abc123",
  "sessionId": "uuid",
  "status": "queued",
  "acceptedAt": "2026-02-18T22:10:00.000Z",
  "eventsUrl": "/api/tasks/2026-02-18-abc123/events?sessionId=uuid"
}
```

`GET /api/tasks/:taskId/events?sessionId=...` SSE event payload (`event: progress`):

```json
{
  "type": "progress",
  "taskId": "2026-02-18-abc123",
  "sessionId": "uuid",
  "status": "running",
  "message": "Searching the repository for matching UI components",
  "percent": 42,
  "timestamp": "2026-02-18T22:10:05.000Z"
}
```

`GET /api/tasks/:taskId/events?sessionId=...` SSE terminal payload (`event: terminal`):

```json
{
  "type": "terminal",
  "taskId": "2026-02-18-abc123",
  "sessionId": "uuid",
  "status": "completed",
  "summary": "Updated button layout and spacing",
  "changedFiles": ["src/components/BillingButton.tsx"],
  "timestamp": "2026-02-18T22:10:22.000Z"
}
```

## 13.3 `.pinpatch` Storage Schema and Lifecycle

All runtime artifacts must follow these file locations:

- `.pinpatch/config.json`
- `.pinpatch/tasks/<taskId>.json`
- `.pinpatch/sessions/<sessionId>.json`
- `.pinpatch/screenshots/<taskId>.png`
- `.pinpatch/runtime/logs/<date>.jsonl`

Lifecycle rules:

- Task file created on comment submit
- Session file created when provider run starts
- Session file updated on each progress event and closed on terminal status
- Log files rotate daily and by size threshold
- `pinpatch tasks --prune` removes expired runtime logs and orphaned sessions

## 13.4 Pin State Machine

Pin states:

- `idle`
- `queued`
- `running`
- `completed` (auto-remove pin after completion delay)
- `error` (pin remains with retry affordance)
- `cancelled` (pin remains with retry affordance)
- `timeout` (pin remains with retry affordance)

UX rules:

- Hovering `queued`/`running` shows provider progress text
- Retry creates a new `sessionId` for same `taskId`
- Terminal states must always be represented in task/session records

## 13.5 Configuration Precedence

Configuration precedence order (highest to lowest):

1. CLI flags (`--provider`, `--model`, `--target`, `--debug`)
2. Environment variables (`PINPATCH_PROVIDER`, `PINPATCH_MODEL`, `PINPATCH_TARGET`, `PINPATCH_DEBUG`)
3. `.pinpatch/config.json`
4. Built-in defaults

Default values:

- `provider`: `codex`
- `model`: `gpt-5.3-codex-spark`
- `debug`: `false`

## 13.6 Debug Logging Spec

Debug mode must write structured JSONL logs and human-readable console logs.

- File format: JSONL at `.pinpatch/runtime/logs/*.jsonl`
- Required fields: `timestamp`, `level`, `component`, `taskId`, `sessionId`, `event`, `message`, `meta`
- Log levels: `debug`, `info`, `warn`, `error`
- Sensitive data redaction: tokens, auth headers, absolute home-directory paths
- Rotation policy: daily plus max-size cutoff per file

## 13.7 `pinpatch dev` Failure Behavior

Required startup/runtime error handling:

- If proxy port is occupied, fail with clear error and suggested free-port command
- If target localhost port is unreachable, show actionable message and retry hint
- If overlay injection fails for a response, pass through target HTML and emit debug warning
- If websocket forwarding fails, show warning with reconnect attempts and backoff

## 13.8 MVP Acceptance Tests

The smoke-test app in `apps/test-app` must include scripted acceptance tests for:

- Enter/exit comment mode with `c` and `Escape`
- Place comment pin and submit task
- Receive progress updates on hover during running state
- Resolve success path with pin auto-removal
- Resolve error path with retry
- Verify `.pinpatch` artifact creation (task/session/screenshot/log)
- Verify `--debug` logs contain required fields

## 13.9 Shared UI and Tailwind Contract

All `apps/*` must use shared UI and styling primitives from workspace packages.

- Shared component source: `packages/ui/`
- Shared Tailwind usage contract: Tailwind defaults with CSS `@source` directives for app + workspace package scanning
- App-local components are allowed for feature-specific UI, but base primitives must come from `packages/ui/`
- App-local Tailwind customization is allowed only as additive CSS-first extension (e.g., local layers/variables) over Tailwind defaults
- shadcn component generation should target `packages/ui/` to prevent per-app drift
- The smoke-test app and overlay app must both prove compatibility with shared UI packages

---

# 14. MVP Feature Checklist

- [ ] Global npm install works
- [ ] `pinpatch dev --target <port>` starts proxy workflow
- [ ] CLI supports global `--debug` mode
- [ ] CLI supports `--model` option for provider model selection
- [ ] Reverse proxy injection works
- [ ] WebSocket forwarding works
- [ ] Hover highlight works
- [ ] `c` hotkey enters commenting mode
- [ ] `c` and `Escape` exit commenting mode
- [ ] Cursor changes to message icon in commenting mode
- [ ] Figma-style circular comment pin + composer works
- [ ] Pin loading state shows Lucide spinner
- [ ] Hovering loading pin shows provider progress
- [ ] Pin disappears on completion
- [ ] Screenshot capture works
- [ ] UI Change Packet generation works
- [ ] Submit comment connects to Codex
- [ ] Codex edits and summary output work
- [ ] Model config exists with default `gpt-5.3-codex-spark`
- [ ] Claude Code provider scaffold exists (not enabled)
- [ ] Cursor provider scaffold exists (not enabled)
- [ ] Dry-run mode works
- [ ] `pinpatch tasks --prune` removes expired logs and orphaned sessions
- [ ] Overlay-bridge request/response schemas are implemented for task create/submit/events
- [ ] Extensive debug logs are emitted and persisted under `.pinpatch/runtime/logs/`
- [ ] All Pinpatch-generated files are stored under `.pinpatch/`
- [ ] Repo includes a basic React + Vite smoke-test app
- [ ] `packages/ui` provides shared shadcn-based components for all `apps/*`
- [ ] All `apps/*` use Tailwind defaults without custom shared color/preset extensions
- [ ] Monorepo is cleanly structured for open source contribution

---

# 15. Success Criteria

Pinpatch is successful if:

- Comment-mode interaction feels Figma-like and predictable
- UI-to-Codex workflow is fast and reliable
- The MVP stays intentionally Codex-first without provider ambiguity
- The repository is clean, documented, and contribution-ready for open source

---

# 16. Philosophy

Pinpatch should feel:

- Lightweight
- Developer-native
- Predictable
- Transparent
- Open-source ready

Pinpatch structures UI intent.
Codex modifies local files.
Developers stay in control.
