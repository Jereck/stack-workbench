import type { Metadata } from "next";
import {
  InformationPage,
  InformationSection,
} from "@/components/information-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How StackWorkbench handles preferences and keeps logs and comparison inputs on your device.",
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
      <InformationSection title="Workspace data">
        <p>
          Log Inspector and Integration Compare read local files and process
          data in your browser. Your input and results stay in memory. Clear the
          workspace to discard them. They stay out of URLs, browser storage, and
          telemetry.
        </p>
        <p>
          Copy and export create copies you control. Clearing the workspace
          leaves clipboard contents and downloaded files on your device. Review
          exported data before sharing it.
        </p>
        <p>
          Sending a payload or session from Log Inspector stages it in the
          current tab. Opening Integration Compare consumes that transfer.
          Reloading the page clears it.
        </p>
      </InformationSection>
      <InformationSection title="Comparison profiles">
        <p>
          Integration Compare saves profiles in this browser when you save
          settings or import a profile. Profile names and rule paths can include
          text you enter. Clear saved profiles from the Profiles tab.
        </p>
      </InformationSection>
    </InformationPage>
  );
}
