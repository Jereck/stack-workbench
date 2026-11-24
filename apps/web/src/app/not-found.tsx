import Link from "next/link";
import { buttonVariants } from "@stack-workbench/ui/button";
import { InformationPage } from "@/components/information-page";

export default function NotFoundPage() {
  return (
    <InformationPage
      title="Page not found"
      summary="Check the address or browse the tools directory."
    >
      <div>
        <Link href="/tools" className={buttonVariants()}>
          Browse tools
        </Link>
      </div>
    </InformationPage>
  );
}
