import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ChessChat — Conversations, analyzed like chess",
    template: "%s · ChessChat",
  },
  description:
    "A messaging platform where every message is automatically reviewed by AI and marked with a chess-style reaction: Best, Great, Excellent, Mistake, Miss or Blunder.",
  applicationName: "ChessChat",
};

export const viewport: Viewport = {
  themeColor: "#1b1917",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink-800 text-cream-100 antialiased">{children}</body>
    </html>
  );
}
