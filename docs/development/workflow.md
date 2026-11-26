# Development workflow

## Set up a machine

Install Git and the exact Node.js version in [`.node-version`](../../.node-version) (24.21.0). Use pnpm 12.23.0 from [`package.json`](../../package.json). A native Node installation or any version manager that supports your OS is sufficient. Run these commands from the repository root.

| Platform | Prerequisites                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | Git for Windows and native Node for your architecture. Run from PowerShell or Git Bash. If PowerShell blocks a package-manager shim, use Command Prompt or the corresponding `.cmd` shim. |
| macOS    | Git and native Node. On Apple Silicon use arm64 Node so native dependencies and Chromium match. Install Command Line Tools if Git prompts for them.                                       |
| Linux    | Git, Node and Playwright's system libraries. On CI or a supported Linux distro, install those with `pnpm exec playwright install --with-deps chromium` if needed.                         |

Enable Corepack with `corepack enable` if using it to load the pinned pnpm, or place an installation of the pinned pnpm on PATH. Verify `node --version` and `pnpm --version` before installing. If a shim resolves an older version, check `Get-Command node,pnpm -All` in PowerShell or `type -a node pnpm` in Bash or zsh.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app needs no account, service credentials, or database. To disable Next.js CLI telemetry for local commands, set `$env:NEXT_TELEMETRY_DISABLED = "1"` in PowerShell or `export NEXT_TELEMETRY_DISABLED=1` in Bash or zsh. CI and the Playwright-managed server set it explicitly.

## Validate changes

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Run type checking and build sequentially because both generate files under `apps/web/.next`. Local Playwright starts the dev server on loopback port 3000 or reuses a running one. Ensure that port belongs to this checkout. To mirror production CI, build first and set `CI=1` for the shell that runs Playwright (`$env:CI = "1"` in PowerShell or `export CI=1` in Bash or zsh). That run starts the production server on port 3100 and expects the port to be free. Restore your normal shell environment afterward.

The Playwright development project opens Pro through the development simulator. Under CI it starts a separate dev server on port 3101. The primary Chromium project verifies Free access on the production build. Use `pnpm exec playwright test --project=chromium-development` for the simulator and Pro workflows.

The committed lockfile includes platform-specific optional native packages for the build and test stack. Keep optional dependencies enabled. Reinstall on the destination machine and let Playwright install its matching browser there.

## Branches and machine changes

1. Read [project status](../../PROJECT_STATUS.md), inspect `git status --short --branch` and the current diff, then read the relevant product spec and ADRs.
2. Start a focused feature branch from up-to-date main using `git switch -c <branch-name>`. Keep unrelated edits intact. Commit, push, and deploy only with explicit approval.
3. Before switching machines, preserve the work in an approved branch or transfer the local changes separately. A local stash stays on its source machine. On the destination machine, fetch and switch to the same branch or apply the transferred changes, recheck Git status, then rerun setup.
4. Keep local dependencies, generated output, browser caches, and secrets on the machine where they belong. Git attributes and EditorConfig define LF across platforms. Match filename casing in imports and use a two-step move through a temporary filename for case-only renames on insensitive filesystems.

## Add a tool

Follow the [tool development guide](../architecture/tool-development.md). Keep implementation in `tools/<slug>` and routing and registry metadata in `apps/web`. Use synthetic fixtures, test the actual route and privacy behavior, and change its registry status when the feature works and is tested.

## Finish a session

Review the diff and run the applicable checks. Record pass counts, host and browser, failed or skipped checks and their causes, and the next logical task in [project status](../../PROJECT_STATUS.md). Update affected product specs, update or add an ADR when a decision changes, and update the [changelog](../../CHANGELOG.md), [backlog](backlog.md), and [known issues](known-issues.md) as applicable. Record unfinished work before handing off.
