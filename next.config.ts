import type { NextConfig } from "next";

// Author: Fahad Ameen Rajput
//
// `cacheComponents` / `partialPrefetching` (enabled by the create-next-app
// template) are intentionally off: they are incompatible with the
// `export const dynamic = "force-dynamic"` route segment config we rely on so
// that provider availability is computed per request (the Docker image is
// built without any API keys).
const nextConfig: NextConfig = {
  output: "standalone",
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
