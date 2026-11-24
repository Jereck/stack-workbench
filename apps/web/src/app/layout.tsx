import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { PublicChrome } from "@/components/public-chrome";
import { listTools } from "@/lib/tools";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "StackWorkbench | Privacy-first developer tools",
    template: "%s | StackWorkbench",
  },
  description:
    "A privacy-first developer workbench. Search application logs, inspect payloads, and follow failed requests on your device.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const workspacePaths = listTools()
    .filter((tool) => tool.availability === "available")
    .map(({ slug }) => "/tools/" + slug);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <ThemeProvider defaultTheme="system" storageKey="stack-workbench-theme">
          <a
            href="#content"
            className="sr-only rounded-lg bg-surface px-4 py-3 font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10"
          >
            Skip to content
          </a>
          <PublicChrome position="header" workspacePaths={workspacePaths} />
          <main
            id="content"
            tabIndex={-1}
            className="flex-1 focus:outline-none"
          >
            {children}
          </main>
          <PublicChrome position="footer" workspacePaths={workspacePaths} />
        </ThemeProvider>
      </body>
    </html>
  );
}
