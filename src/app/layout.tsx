import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisionBharat — DataGenesis 2026 | AI Computer Vision Platform",
  description: "India-centric Dataset Engineering & From-Scratch Computer Vision Platform for DataGenesis 2026 National AI & CV Hackathon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0e17] text-[#e2e8f0] antialiased">
        {children}
      </body>
    </html>
  );
}
