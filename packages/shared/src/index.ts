export const toolCategories = [
  {
    id: "inspect",
    name: "Inspect",
    description: "Explore logs and application data.",
  },
  {
    id: "compare",
    name: "Compare",
    description: "Find meaningful differences between inputs.",
  },
  {
    id: "validate",
    name: "Validate",
    description: "Check data against expected rules and schemas.",
  },
  {
    id: "monitor",
    name: "Monitor",
    description: "Keep track of recurring integration checks.",
  },
] as const;

export type ToolCategory = (typeof toolCategories)[number]["id"];

export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly category: ToolCategory;
  readonly availability: "planned" | "available";
  readonly processing: "browser" | "server" | "hybrid";
  readonly pricing: "free" | "professional" | "team" | "business";
  readonly seo: {
    readonly title: string;
    readonly description: string;
  };
  readonly order: number;
}
