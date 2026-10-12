import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pomodoro",
    short_name: "Pomodoro",
    description: "Focus timer with automatic breaks, lunch scheduling, tasks and reports. Works offline; your data stays on your device.",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#f9524f",
    theme_color: "#f9524f",
    icons: [
      { src: `${BASE_PATH}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: `${BASE_PATH}/apple-icon`, sizes: "180x180", type: "image/png" },
    ],
  };
}
