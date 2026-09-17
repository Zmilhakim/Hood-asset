import type { Metadata } from "next";
import { IBM_Plex_Mono, Oswald } from "next/font/google";
import { Providers } from "@/providers";
import { SITE_URL } from "@/lib/site";
import { TICKER } from "@/lib/addresses";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-oswald" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono-stack" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${TICKER} — one crate on Robinhood Chain`,
  description:
    "Packed once, sealed once. The whole supply opens one Uniswap v4 pool against native ETH, and the liquidity can never be withdrawn.",
  openGraph: {
    title: `${TICKER} — one crate on Robinhood Chain`,
    description: "Packed once, sealed once. Nobody opens it.",
    url: SITE_URL,
    siteName: TICKER,
  },
  twitter: { card: "summary_large_image", site: "@cratecoinxyz" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
