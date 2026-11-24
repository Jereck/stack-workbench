import type { Metadata } from "next";
import Link from "next/link";
import {
  InformationPage,
  InformationSection,
} from "@/components/information-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn what StackWorkbench is building for developers and integration teams.",
};

export default function AboutPage() {
  return (
    <InformationPage
      title="About StackWorkbench"
      summary="StackWorkbench is a privacy-first suite of utilities for the engineers who build, test, and support applications and integrations."
    >
      <InformationSection title="Built for troubleshooting">
        <p>
          Application issues rarely stay in one system. The suite is designed
          around the logs, payloads, configuration, and integration checks
          engineers use to diagnose those problems.
        </p>
      </InformationSection>
      <InformationSection title="The first tool">
        <p>
          Log Inspector searches and filters application logs in your browser.
          Use it to investigate exceptions, inspect payloads, and follow related
          events across an API integration.
        </p>
        <Link
          href="/tools/log-inspector"
          className="rounded-sm font-semibold text-accent underline underline-offset-4"
        >
          Open Log Inspector
        </Link>
      </InformationSection>
    </InformationPage>
  );
}
