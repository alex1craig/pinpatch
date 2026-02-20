# pinpatch

Pinpatch lets you place pins on a running local app, generate implementation tasks, and execute them through supported providers (`codex` or `claude`).

## Install

Global install:

```bash
npm install -g pinpatch
pinpatch --help
```

Run without global install:

```bash
npx pinpatch@latest --help
```

## Prerequisites

- Node.js `>=18`
- A local web app running on `localhost` (default target port `3000`)
- For Codex execution: `codex` CLI installed and authenticated
- For Claude execution: `claude` CLI installed and authenticated

## Quick Start

1. Start your local app (example on `3000`).
2. Start Pinpatch:

```bash
pinpatch dev --target 3000
```

3. Open the proxied app at `http://localhost:3030`.
4. Press `c` to enter pin mode, click an element, and submit a request.

## Commands

```bash
pinpatch --help
pinpatch dev --target 3000
pinpatch implement <taskId>
pinpatch tasks
pinpatch tasks --prune
```

## Runtime Artifacts

Pinpatch writes runtime files to:

```text
.pinpatch/
  config.json
  tasks/
  sessions/
  screenshots/
  runtime/logs/
```

## Troubleshooting

- `Target localhost:<port> is unreachable`: start your app first.
- `Bridge port ... is already in use` / `Proxy port ... is already in use`: choose different ports.
- Provider process errors: verify `codex`/`claude` CLI authentication and PATH setup.

## Monorepo Source

For contributor workflows and e2e testing, see the repository root docs in `README.md` and `CONTRIBUTING.md`.
