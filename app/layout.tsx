import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Politily",
  description:
    "Political signal detection, contextual research briefs, and creator-ready alert scripts.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
