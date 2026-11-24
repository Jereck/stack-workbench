import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "StackWorkbench | Privacy-first developer tools",
    template: "%s | StackWorkbench",
  },
  description:
    "A privacy-first workbench for inspecting, comparing, validating, and monitoring applications and integrations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
          <SiteHeader />
          <main
            id="content"
            tabIndex={-1}
            className="flex-1 focus:outline-none"
          >
            {children}
          </main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
