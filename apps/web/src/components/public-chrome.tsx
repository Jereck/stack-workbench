"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function PublicChrome({
  position,
  workspacePaths,
}: {
  position: "header" | "footer";
  workspacePaths: string[];
}) {
  const pathname = usePathname();
  if (workspacePaths.includes(pathname)) return null;
  return position === "header" ? <SiteHeader /> : <SiteFooter />;
}
