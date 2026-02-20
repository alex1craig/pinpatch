# NPM Release Runbook

This repository uses a single release script as the source of truth:

- `./scripts/npm-release.sh`
- `./scripts/bump-version.sh`

Run help for all commands/options:

```bash
./scripts/npm-release.sh --help
./scripts/bump-version.sh --help
```

## Version Bump

Bump all publishable packages in lockstep before release:

```bash
# patch/minor/major bump from current version
./scripts/bump-version.sh patch

# or set an explicit version
./scripts/bump-version.sh 0.1.2
```

## Default Release Flow

Validation + packaging + registry readiness checks:

```bash
./scripts/npm-release.sh all
```

Full flow including publish + post-publish verification:

```bash
./scripts/npm-release.sh all --publish-with-all
```

## Command Reference

Preflight quality gates:

```bash
./scripts/npm-release.sh preflight
```

Pack + external consumer verification:

```bash
./scripts/npm-release.sh pack-verify
```

Registry auth/connectivity checks:

```bash
./scripts/npm-release.sh registry-readiness
```

Publish with default `latest` tag:

```bash
./scripts/npm-release.sh publish --tag latest
```

Post-publish verification:

```bash
./scripts/npm-release.sh post-verify --tag latest
```

Rollback/deprecate bad release and restore `latest`:

```bash
./scripts/npm-release.sh rollback --bad-version <badVersion> --good-version <goodVersion>
```

## What The Script Publishes

Dependency order:

1. `@pinpatch/core`
2. `@pinpatch/providers`
3. `@pinpatch/proxy`
4. `@pinpatch/ui`
5. `@pinpatch/overlay`
6. `pinpatch`

## Important Notes

- If `registry-readiness` fails on `npm whoami`, run `npm adduser` or `npm login` first.
- The script defaults to `--no-git-checks` for publish; use `--git-checks` to enforce git checks.
- `pack-verify` includes:
  - `npm pack --dry-run` for each publishable package
  - tarball install in a temp external directory
  - `npx pinpatch --help` and `npx pinpatch tasks`
  - overlay runtime check that fails if fallback overlay script is served
