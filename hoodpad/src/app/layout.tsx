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

/**
 * Absolute URLs for social cards. Vercel supplies its own hostname at build
 * time; set NEXT_PUBLIC_SITE_URL once there is a real domain.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:3000";

const description =
  "Plain tools for launching on Robinhood Chain. One transaction mints the supply, opens a single-sided pool and locks the position for good.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Hoodpad — plain tools for Robinhood Chain", template: "%s · Hoodpad" },
  description,
  openGraph: {
    type: "website",
    siteName: "Hoodpad",
    title: "Hoodpad — every launch gets nailed to the board",
    description,
    images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "Hoodpad" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hoodpad — every launch gets nailed to the board",
    description,
    images: ["/brand/og-1200x630.png"],
  },
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
