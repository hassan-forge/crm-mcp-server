import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The MCP SDK spawns the server as a child process; keep it out of the bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
  // This app lives inside the server's repository; keep the build scoped to web/.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
