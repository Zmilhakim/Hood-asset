import type { Metadata, Viewport } from "next";
import { Archivo, Barlow, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Providers } from "@/providers";
import { SITE } from "@/lib/site";

const archivo = Archivo({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const barlow = Barlow({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-barlow",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Drainpad — a launchpad on Robinhood Chain", template: "%s · Drainpad" },
  description: SITE.description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Drainpad — water finds the lowest point and stays there",
    description: SITE.description,
    images: [{ url: "/brand/og-1200x628.jpg", width: 1200, height: 628, alt: "Drainpad" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Drainpad",
    description: SITE.description,
    images: ["/brand/og-1200x628.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9e7e2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${barlow.variable} ${plexMono.variable}`}>
      <body>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <Header />
            <main className="flex-1">
              <div className="mx-auto max-w-5xl px-5 md:px-8">{children}</div>
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
