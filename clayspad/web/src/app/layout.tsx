import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { Providers } from "@/providers";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PreviewBanner } from "@/components/chrome/PreviewBanner";
import { SITE_URL } from "@/lib/site";

const spaceGrotesk = Space_Grotesk({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

const description =
  "A launchpad on Robinhood Chain. Launch a token in one transaction: most of the supply is fired into the pool for good, and every swap after that pays the creator.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Clayspad — a launchpad on Robinhood Chain", template: "%s · Clayspad" },
  description,
  openGraph: {
    type: "website",
    siteName: "Clayspad",
    title: "Clayspad — the kiln has no door",
    description,
    images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "Clayspad" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clayspad — the kiln has no door",
    description,
    images: ["/brand/og-1200x630.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e0d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>
          <PreviewBanner />
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
