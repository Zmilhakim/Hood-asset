import type { Metadata, Viewport } from "next";
import { Big_Shoulders_Stencil, Courier_Prime } from "next/font/google";
import { Providers } from "@/providers";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-stencil-stack",
});
const type = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-type-stack" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "The dock, $CRATE",
  description:
    "One crate on Robinhood Chain. Packed once, sealed once. Every figure on the dock is read from the chain.",
  openGraph: {
    title: "The dock, $CRATE",
    description: "One crate on Robinhood Chain. Packed once, sealed once. Nobody opens it.",
    url: SITE_URL,
    siteName: "$CRATE",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "$CRATE — one crate on the dock" }],
  },
  // A link posted to X is scraped once, when the post is made. A card missing
  // at that moment is missing for the life of the post.
  twitter: {
    card: "summary_large_image",
    site: "@cratecoinxyz",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#D6B078",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${stencil.variable} ${type.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
