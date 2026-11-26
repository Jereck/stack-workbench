# Tool workspaces

Place each implemented tool in a workspace package here. Each package owns its workflow and tool-specific code, and exposes a small entry point to the web app. Log Inspector lives in [`tools/log-inspector`](log-inspector). [Tool development guide](../docs/architecture/tool-development.md)

[`tools/integration-compare`](integration-compare) contains the comparison workspace, browser worker, and cancellable client adapter.
