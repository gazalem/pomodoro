import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9524f" }}>
        <svg width="130" height="130" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="24" fill="none" stroke="#ff7d6c" strokeWidth="6" />
          <path d="M32 8a24 24 0 1 1-23.2 18" fill="none" stroke="#fde8b4" strokeWidth="6" strokeLinecap="round" />
          <path d="M32 32V20M32 32l8 5" stroke="#fde8b4" strokeWidth="4.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
