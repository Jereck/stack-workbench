# Architecture overview

StackWorkbench uses one pnpm monorepo with explicit package dependencies. The Next.js App Router renders the public site and mounts tools at dedicated URLs. The initial pages are prerendered. Theme and workspace sidebar visibility are client-side preferences. The app owns the registry-backed workspace shell. Shared controls and layout primitives use semantic Tailwind tokens supplied by the app. [Design system](../design/design-system.md)

## Current boundaries

| Location          | Responsibility                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web`        | Site navigation and presentation, typed public tool registry, route metadata, and route adapters |
| `tools/<slug>`    | One private workspace package per implemented tool, with its UI and tool-specific processing     |
| `packages/ui`     | Shared UI primitives and styles that use the site's semantic design tokens                       |
| `packages/shared` | Framework-independent types and utilities with confirmed reuse                                   |
| `tests`           | Cross-workspace unit and browser checks, plus fixture guidelines                                 |

The web app may depend on tools and shared packages. Tool packages may depend on UI, shared types, and processing libraries. Shared packages must remain independent of tools and the app. Tools cannot depend on each other. Workspace packages export TypeScript source, and Next.js transpiles the packages it consumes. Server components are the default. Interactive browser code uses small client entry points, with sensitive input state owned by those components.

Log Inspector puts its browser UI, worker entry point, and export formatting in `tools/log-inspector`. `packages/log-parser` owns normalized events and calls `packages/payload-parser` for bounded decoding. `packages/redaction-engine` masks export copies. Those packages work independently of React, Next.js, and browser DOM APIs. [ADR 0003](../decisions/0003-log-inspector-workers.md)

## Future locations

Create these only when a product requires them.

| Proposed location | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `apps/api`        | Backend API for account-backed workflows and explicitly authorized server processing |
| `apps/worker`     | Background scheduling and job execution for monitoring and automation                |

ASP.NET Core, PostgreSQL, Supabase Auth, Stripe, and Quartz.NET are candidates for separate future decisions.
