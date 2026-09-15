import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Rye } from "next/font/google";

import "./globals.css";
import { Providers } from "@/providers";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ArrivalsTicker } from "@/components/board/ArrivalsTicker";

const rye = Rye({ weight: "400", subsets: ["latin"], variable: "--font-rye", display: "swap" });

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Hoodpad", template: "%s · Hoodpad" },
  description:
    "Plain tools for launching on Robinhood Chain. Post a notice, open a pool, read every figure straight from the chain.",
};

export const viewport: Viewport = {
  themeColor: "#14301e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rye.variable} ${plexMono.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>
          <SiteHeader />
          <ArrivalsTicker />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
