import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CRM MCP Console",
  description: "Call the CRM MCP server's tools, switch its policy and watch the audit log.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
