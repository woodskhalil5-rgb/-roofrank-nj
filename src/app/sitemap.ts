import type { MetadataRoute } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export const revalidate = 3600;

/**
 * Only published profiles and target ZIP pages are listed. Nothing in review,
 * and no internal page, ever reaches the sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl.replace(/\/$/, "");

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/directory`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/methodology`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/claim`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/home-services`, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createSupabasePublicClient();

    const [{ data: zips }, { data: agents }] = await Promise.all([
      supabase.from("zip_area").select("zip").eq("is_target", true),
      supabase
        .from("agent")
        .select("slug, published_at")
        .eq("status", "published"),
    ]);

    const zipEntries: MetadataRoute.Sitemap = (zips ?? []).map((z) => ({
      url: `${base}/directory/${z.zip}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const agentEntries: MetadataRoute.Sitemap = (agents ?? []).map((a) => ({
      url: `${base}/agent/${a.slug}`,
      lastModified: a.published_at
        ? new Date(a.published_at as string)
        : undefined,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

    return [...staticEntries, ...zipEntries, ...agentEntries];
  } catch {
    return staticEntries;
  }
}
