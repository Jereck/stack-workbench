import { describe, expect, it } from "vitest";
import {
  findTool,
  listTools,
  toolRegistry,
} from "../../apps/web/src/lib/tools";
import { toolCategories } from "../../packages/shared/src";

describe("tool registry", () => {
  it("uses unique URL-safe slugs and IDs and recognized categories", () => {
    const categories = toolCategories.map(({ id }) => id);

    expect(new Set(toolRegistry.map(({ id }) => id)).size).toBe(
      toolRegistry.length,
    );
    expect(new Set(toolRegistry.map(({ slug }) => slug)).size).toBe(
      toolRegistry.length,
    );

    for (const tool of toolRegistry) {
      expect(tool.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(categories).toContain(tool.category);
      expect(tool.seo.title.trim()).not.toBe("");
      expect(tool.seo.description.trim()).not.toBe("");
      expect(Number.isFinite(tool.order)).toBe(true);
    }
  });

  it("looks up exact slugs and leaves unknown routes unmatched", () => {
    expect(findTool("log-inspector")).toMatchObject({
      category: "inspect",
      availability: "available",
      processing: "browser",
      pricing: "free",
    });
    expect(findTool("Log-Inspector")).toBeUndefined();
    expect(findTool("unknown-tool")).toBeUndefined();
  });

  it("returns all entries in display order without exposing the registry array", () => {
    const listing = listTools();
    expect(listing).not.toBe(toolRegistry);
    expect(listing).toHaveLength(toolRegistry.length);
    expect(listing.map(({ order }) => order)).toEqual(
      toolRegistry
        .map(({ order }) => order)
        .sort((first, second) => first - second),
    );
  });
});
