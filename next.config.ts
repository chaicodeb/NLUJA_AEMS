import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/admin/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
