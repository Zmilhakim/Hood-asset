import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/board`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/launch`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
