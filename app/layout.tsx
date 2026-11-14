import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Politily",
  description:
    "India and world news, youth and public-affairs research, source trails, and hourly IST briefings.",
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
