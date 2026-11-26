import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pas de pastille Next.js en développement : elle gêne les captures de la page.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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
