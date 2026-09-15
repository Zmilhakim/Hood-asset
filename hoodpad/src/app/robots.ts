import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // The dashboard only ever shows the connected wallet's own notices, so
      // there is nothing there for a crawler to index.
      { userAgent: "*", allow: "/", disallow: "/dashboard" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
