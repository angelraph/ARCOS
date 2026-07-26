import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These are TS-source workspace packages (no build step) — let Next transpile them
  // directly rather than expecting pre-compiled JS.
  transpilePackages: ["@arcos/shared", "@arcos/agents"],
};

export default nextConfig;
