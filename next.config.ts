import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "pdf-lib"],
  outputFileTracingIncludes: {
    "/api/*/*": ["./public/brand/emblem.png"],
    "/*": ["./node_modules/.prisma/client/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
