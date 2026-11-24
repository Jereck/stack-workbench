# StackWorkbench design system

StackWorkbench is a workbench for inspecting technical data. Keep the current task, primary action, and result in view. Use alignment, typography, and dividers to organize information. Use one accent and reserve status color for meaningful state. Give every empty state a short next action.

## Typography and spacing

- **Geist** is the interface face. Use 12px for metadata and form labels, 13px for compact controls, 14px for supporting copy, and 15–18px for section headings where extra hierarchy is needed. Public page titles can use 30px and the homepage headline can use 36–48px.
- **Geist Mono** is for logs, timestamps, IDs, payloads, and shortcut hints. Use 12px for rows and code views and 13px for Monaco. Preserve source text in details and clipboard actions even when rows use a compact preview.
- Both Latin variable fonts are served from the web app. System fallbacks cover other scripts. The local files come from the pinned Next.js distribution and carry the [Geist license](../../apps/web/public/fonts/OFL-Geist.txt).
- Use a 4px spacing base with 4–8px inside groups, 12–16px for workspace gutters, and 24–32px between public sections. Compact controls are generally 32px high. Use 5px control and 8px panel corners. Reserve the elevation token for floating content.

## Semantic tokens

The [theme source](../../apps/web/src/app/globals.css) maps CSS variables to Tailwind utility names. Both themes use the same role names. System preference supplies the initial theme.

| Role                | CSS variables                                                            | Application                                                                                    |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Surfaces            | `--background`, `--surface`, `--sidebar`                                 | Application and editor background, workspace and elevated content, navigation and status bands |
| Content             | `--foreground`, `--secondary`, `--muted-foreground`                      | Primary content, secondary copy, metadata and technical labels                                 |
| Boundaries          | `--border`, `--control-border`                                           | Subtle dividers, stronger input boundaries                                                     |
| Interaction         | `--hover`, `--selected`, `--focus`                                       | Hover surfaces, selected rows and views, visible focus                                         |
| Accent              | `--accent`, `--accent-hover`, `--accent-foreground`                      | Primary actions, active navigation, focused links                                              |
| Semantics           | `--success`, `--warning`, `--warning-soft`, `--danger`, `--danger-soft`  | Success, warning, and errors with text or another visible cue                                  |
| Code                | `--syntax-key`, semantic success and warning                             | Distinguish keys, strings, and values when highlighting code                                   |
| Geometry and motion | `--control-radius`, `--panel-radius`, `--elevation`, `--transition-fast` | Corners, floating surfaces, and short state transitions                                        |

## Components

- Use the shared [Button](../../packages/ui/src/button.tsx) and [workspace primitives](../../packages/ui/src/workspace.tsx). Use primary for the main action, outline for secondary actions that require a visible boundary, and ghost for low-emphasis actions.
- Use Lucide at 14–17px with a consistent stroke. Keep icons decorative when the label is visible. Icon-only controls need an accessible name, a title hint, and a visible focus ring.
- Use labeled native inputs and selects with `controlClass`. Use native disclosures for optional settings or help when that content fits in the flow. For a future dialog, use native dialog or an accessible primitive with an accessible name, Escape behavior, and focus restoration.
- Use the shared view-button style for related views. Use a group of native buttons with `aria-pressed` when each view is a command. If implementing an ARIA tablist, implement its arrow-key navigation and tab-panel relationships as well.
- Use tables for tabular data and a structured list for rows with independent actions. Align repeated columns, provide text severity labels, and distinguish the inspected event from export selection. Put overflow inside the data region.
- Use `EmptyState` for a concise title and next action. Use polite status text for loading, completion, and recoverable errors. Display an error next to the action or surface that needs attention. Keep keyboard hints alongside the relevant action and expose the shortcut via `aria-keyshortcuts`.

## Workspace pattern

Mount available tools in the app-owned [WorkspaceShell](../../apps/web/src/components/workspace-shell.tsx). The shell provides a compact header, registry-backed navigation, a current tool heading, a processing indicator, and optional help. Start the tool directly below its heading. Use a top toolbar for source actions and a short status line for operation feedback. At desktop widths, keep the results list stable while the detail inspector changes. At narrow widths, stack the inspector after the list and move focus to it when an event is opened. Restore focus to the event on exit. Use the editor size controls to trade raw-input space for more results.

Use document order and native controls to make the entire workflow reachable by keyboard. Check WCAG AA contrast for foreground values, meaningful control boundaries, and focus states in both themes. Respect reduced-motion preferences, use text alongside severity colors, test mobile without page-level horizontal scrolling, and keep working data in memory. Only documented non-sensitive preferences may use local storage.

Keep registry composition and routing in the web app, reusable presentation in `packages/ui`, and tool-specific layout, models, and worker orchestration in the tool package. Add shared primitives when a concrete tool needs them. Verify the real route with synthetic data before making it available.
