import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Pomodoro", template: "%s · Pomodoro" },
  description: "Focus timer with automatic breaks, lunch scheduling, tasks and productivity reports.",
  applicationName: "Pomodoro",
  appleWebApp: { capable: true, title: "Pomodoro", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#f9524f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
