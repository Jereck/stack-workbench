# StackWorkbench agent instructions

- Keep routing, the registry, and site composition in `apps/web`. Put each implemented tool in its own `tools/<slug>` workspace package. Tools may use shared packages and must never import another tool or the web app.
- Use strict TypeScript, explicit package exports, small modules, and pure processing functions where practical. Match project lint and formatting conventions. Keep routes thin and controls keyboard accessible.
- Process sensitive inputs in memory and on-device by default. Require explicit authorization for uploads. Keep those inputs out of URLs, storage, logs, console output, telemetry, and error reports. Render untrusted content as text. Use synthetic or appropriately licensed public fixtures.
- Use pnpm and the pinned version. Check dependency compatibility and necessity, and include the regenerated lockfile for dependency changes. Keep secrets out of the repository.
- Cover behavior and regressions at the appropriate level. Run format check, lint, typecheck, unit tests, build, and the browser checks relevant to the change. Report any check you could not run.
- Update affected docs, product status, and architecture decisions as part of the change. Mark a tool available only when its real route works and is tested.
- Stay within the requested scope. Get explicit approval before deploying, committing, pushing, or creating paid infrastructure.
- A change is done when its normal entry point works, required checks pass, and affected documentation is current.

## Development continuity

Before editing, read [PROJECT_STATUS.md](PROJECT_STATUS.md) and the applicable product, architecture, and decision documents. Inspect Git status and existing changes, confirm the requested scope, and preserve accepted architecture unless the task explicitly reconsiders it.

Update relevant tests and docs and run the applicable validation. After meaningful work, refresh project status with results, incomplete work, and the next logical task. Update the backlog, changelog, and known issues when applicable. Follow the [development workflow](docs/development/workflow.md).

See [architecture](docs/architecture/overview.md), [tool development](docs/architecture/tool-development.md), and [privacy and security](docs/architecture/privacy-and-security.md).
