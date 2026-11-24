import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  poweredByHeader: false,
  transpilePackages: [
    "@stack-workbench/log-inspector",
    "@stack-workbench/log-parser",
    "@stack-workbench/payload-parser",
    "@stack-workbench/redaction-engine",
    "@stack-workbench/shared",
    "@stack-workbench/ui",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default config;
