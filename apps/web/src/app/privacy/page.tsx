import type { Metadata } from "next";
import {
  InformationPage,
  InformationSection,
} from "@/components/information-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How StackWorkbench handles site preferences and keeps Log Inspector data on your device.",
};

export default function PrivacyPage() {
  return (
    <InformationPage
      title="Privacy"
      summary="StackWorkbench is designed to keep sensitive engineering data on your device whenever possible."
    >
      <InformationSection title="This site today">
        <p>
          The site has no third-party analytics or session recording. If you
          choose a theme, this site stores that preference in your browser.
        </p>
      </InformationSection>
      <InformationSection title="Log Inspector data">
        <p>
          Log Inspector reads local files and processes logs in your browser.
          Your input and results stay in memory. Clear the workspace to discard
          them. They stay out of URLs, browser storage, and telemetry.
        </p>
        <p>
          Copy and export create copies you control. Clearing the workspace
          leaves clipboard contents and downloaded files on your device. Review
          exported data before sharing it.
        </p>
      </InformationSection>
    </InformationPage>
  );
}
