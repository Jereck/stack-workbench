# StackWorkbench

StackWorkbench is a privacy-first suite of developer utilities for inspecting, comparing, validating, and monitoring applications, APIs, and integrations. Its first tool, Log Inspector, searches application logs, decodes payloads, and exports redacted events in the browser. [Log Inspector product guide](docs/products/log-inspector.md)

## Stack and prerequisites

- Next.js App Router, React, and strict TypeScript.
- Tailwind CSS and shared shadcn/ui-style components.
- pnpm workspaces, ESLint, Prettier, Vitest, Playwright, and GitHub Actions.
- Node.js 24 LTS. Use the version in [.node-version](.node-version) to match CI.
- pnpm 12.23.0, pinned in [package.json](package.json). With Corepack installed, use `corepack enable` or prefix the commands below with `corepack` if another pnpm version is already on your PATH.

## Install and run

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Set `NEXT_TELEMETRY_DISABLED=1` in your environment to disable Next.js CLI telemetry locally. CI sets it for every step.

## Test and build

| Command                                 | Purpose                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm lint`                             | Run ESLint over the repository                                                   |
| `pnpm typecheck`                        | Check workspace and test TypeScript, then generate and check Next.js route types |
| `pnpm test`                             | Run Vitest unit tests                                                            |
| `pnpm exec playwright install chromium` | Install the browser for end-to-end tests                                         |
| `pnpm test:e2e`                         | Run Chromium tests against the local dev server on port 3000                     |
| `pnpm format`                           | Write Prettier formatting                                                        |
| `pnpm format:check`                     | Check Prettier formatting                                                        |
| `pnpm build`                            | Create the production web build                                                  |
| `pnpm start`                            | Serve the production build locally                                               |

Playwright starts the dev server locally if it is not already running. GitHub Actions checks Linux, macOS, and Windows. It uses a frozen install, runs formatting, lint, types, unit tests, and the build, then runs Playwright against the production build on port 3100.

## Repository structure

| Path                                                     | Responsibility                                                |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| [`apps/web`](apps/web)                                   | Website routes, branding, site composition, and tool registry |
| [`tools`](tools)                                         | Workspace location for independent tool packages              |
| [`packages/ui`](packages/ui)                             | Shared React UI primitives                                    |
| [`packages/shared`](packages/shared)                     | Framework-independent tool types and category definitions     |
| [`packages/log-parser`](packages/log-parser)             | Log format detection, event normalization, and exploration    |
| [`packages/payload-parser`](packages/payload-parser)     | Bounded decoding and JSON, XML, and SOAP detection            |
| [`packages/redaction-engine`](packages/redaction-engine) | Configurable redaction for export copies                      |
| [`docs/architecture`](docs/architecture)                 | Boundaries, tool development, privacy, and security           |
| [`docs/business`](docs/business)                         | Strategy and pricing hypotheses                               |
| [`docs/products`](docs/products)                         | Product specifications                                        |
| [`docs/decisions`](docs/decisions)                       | Architecture decision records                                 |
| [`tests`](tests)                                         | Unit tests, browser tests, and fixture guidance               |
| [`.github/workflows`](.github/workflows)                 | CI                                                            |

## Add a tool

Add its public metadata to the [tool registry](apps/web/src/lib/tools.ts). A planned entry gets a detail page automatically. Once the tool is functional, add its independent package under `tools/<slug>`, declare it as a web workspace dependency, and mount its entry point in an explicit App Router page. Reuse the tool page layout, add tests, and change the registry status to `available` in the same change. [Tool development guide](docs/architecture/tool-development.md)

Start with [project status](PROJECT_STATUS.md). The [development workflow](docs/development/workflow.md) covers machine setup and handoffs. See the [roadmap](ROADMAP.md) for candidate products and [AGENTS.md](AGENTS.md) for repository working conventions.
