# Tool development

## Register a tool

The [registry](../../apps/web/src/lib/tools.ts) consumes the [shared tool definition](../../packages/shared/src/index.ts). Supply a unique ID and lowercase, hyphen-separated slug, category, status, processing location, tier, SEO title and description, and display order. Use `planned` until the tool's actual workflow ships. Keep planned descriptions and metadata clear about availability.

The directory groups records into Inspect, Compare, Validate, and Monitor. The dynamic route `/tools/[slug]` prerenders planned entries from the registry and returns a 404 for unknown slugs. A planned page explains status and intended processing without accepting inputs.

## Ship an implementation

1. Add `tools/<slug>/package.json` with an explicit public export and the dependencies the tool uses. Keep the tool UI and processing in that package. Export interactive UI from a client entry point where browser APIs are needed.
2. Add the tool to `apps/web/package.json` with `workspace:*` and to `transpilePackages` in `apps/web/next.config.ts`. Add a Tailwind source path for the package if it ships Tailwind classes.
3. Add the explicit route `apps/web/src/app/tools/<slug>/page.tsx`. Read the registry entry for SEO metadata and the common `WorkspaceShell` layout. Have the route render the tool package's public component. Set the registry entry to `available` in the same change. The static route then owns the slug. Planned pages continue to use `ToolPage` and the public site chrome.
4. Add unit tests for the processing and browser tests for the user workflow, including keyboard access and input privacy. Verify the directory entry links to the working route and refresh the product spec.

Follow the [design system](../design/design-system.md) for toolbar, status, and inspector patterns. Keep domain-specific views and filtering in the tool package. Keep processing pure where possible. Handle malformed input with actionable messages, preserve access to valid results when appropriate, and use synthetic fixtures. Extract a processing engine when it has confirmed reuse or needs an independent runtime boundary.

For worker-backed tools, define a typed message contract and test completion, cancellation, and failure recovery. When the processor is introduced before its route, test the bundled worker through a loopback fixture and run privacy checks again through the real workspace once mounted. [Integration Compare worker decision](../decisions/0004-integration-comparison-engine.md)
