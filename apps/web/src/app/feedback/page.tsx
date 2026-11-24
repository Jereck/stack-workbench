import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@stack-workbench/ui/button";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Feedback availability for StackWorkbench.",
};

export default function FeedbackPage() {
  return (
    <InformationPage
      title="Feedback"
      summary="Feedback submissions are currently unavailable."
    >
      <div>
        <Link href="/tools" className={buttonVariants({ variant: "outline" })}>
          Browse the tools directory
        </Link>
      </div>
    </InformationPage>
  );
}
