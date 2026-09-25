import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Rail } from "@/components/chrome/Rail";
import { Providers } from "@/providers";
import { SITE_URL } from "@/lib/site";

const fraunces = Fraunces({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const description =
  "A launchpad on Robinhood Chain. One transaction mints a token, opens its pool, and buries the pool's share for good. The terms are constants in the contract, which is verified with its source published.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Snowly — a launchpad on Robinhood Chain", template: "%s · Snowly" },
  description,
  openGraph: {
    type: "website",
    siteName: "Snowly",
    title: "Snowly — what the glacier takes, it keeps",
    description,
  },
  twitter: { card: "summary_large_image", title: "Snowly", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1119" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <div className="flex min-h-dvh flex-col md:flex-row">
            <Rail />
            <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-12">
              <div className="mx-auto max-w-4xl">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
