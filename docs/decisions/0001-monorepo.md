# ADR 0001 · Use a pnpm monorepo

**Status** · Accepted

## Context

StackWorkbench needs one coherent website and independent tools that can reuse UI and common processing. A small team needs atomic changes and a short local setup.

## Decision

Use pnpm workspaces and one lockfile. Keep the web shell in `apps/web`, each implemented tool in its own package under `tools`, and shared code in focused packages. Use explicit imports and routes. Tool packages must never import each other.

## Consequences

The team can change a route and its tool together and validate them in one CI run. Contributors must maintain package ownership and explicit dependencies. Add build orchestration only if repository size or build times justify it.
