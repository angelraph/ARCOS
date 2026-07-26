import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These are TS-source workspace packages (no build step) — let Next transpile them
  // directly rather than expecting pre-compiled JS.
  transpilePackages: ["@arcos/shared", "@arcos/agents"],
  // @arcos/shared reads ABI JSON via fs.readFileSync with a computed path, which Next's
  // serverless file tracing can't detect statically — include it explicitly so it's
  // bundled into the deployed function.
  outputFileTracingIncludes: {
    "/dashboard": ["../../packages/shared/abis/**/*"],
    "/api/run": ["../../packages/shared/abis/**/*"],
    "/run": ["../../packages/shared/abis/**/*"],
  },
};

export default nextConfig;
