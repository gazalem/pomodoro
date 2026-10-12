import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pomodoro",
    short_name: "Pomodoro",
    description: "Focus timer with automatic breaks, lunch scheduling, tasks and reports.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f9524f",
    theme_color: "#f9524f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
