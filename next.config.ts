import type { NextConfig } from "next";

// Serving from a sub-path, e.g. "/pomodoro" for https://<user>.github.io/pomodoro.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Fully static site: the database is SQLite (WebAssembly) running in the browser.
  // (Cache Components / Partial Prefetching are off: they only affect server
  // rendering, and a static export has none.)
  output: "export",
  basePath: basePath || undefined,
  // Emit /report/index.html so any static host serves /report/ correctly.
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    agentFeedback: true,
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
