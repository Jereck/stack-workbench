import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationSection } from "@/components/information-page";
import { ToolPage } from "@/components/tool-page";
import { findTool, listTools } from "@/lib/tools";

type Props = PageProps<"/tools/[slug]">;

export const dynamicParams = false;

export function generateStaticParams() {
  return listTools()
    .filter((tool) => tool.availability === "planned")
    .map(({ slug }) => ({ slug }));
}

async function getPlannedTool(params: Props["params"]) {
  const { slug } = await params;
  const tool = findTool(slug);
  if (tool?.availability !== "planned") notFound();
  return tool;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seo } = await getPlannedTool(params);
  return seo;
}

export default async function PlannedToolPage({ params }: Props) {
  const tool = await getPlannedTool(params);

  return (
    <ToolPage tool={tool}>
      <div className="max-w-2xl">
        <InformationSection title="Availability">
          <p>{tool.name} is planned and is currently unavailable.</p>
        </InformationSection>
      </div>
    </ToolPage>
  );
}
