import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';
import { TRADE_SLUGS } from '../lib/trades';
import { GUIDE_SLUGS } from '../lib/guides';
import { adminDb } from '../lib/server';

// Rebuilt hourly so newly listed profiles are discoverable.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tradePaths = TRADE_SLUGS.map((t) => `/${t}`);
  const guidePaths = GUIDE_SLUGS.map((g) => `/guides/${g}`);
  const paths = ['', '/start', ...tradePaths, '/pros', '/guides', ...guidePaths, '/join', '/road-pros', '/privacy', '/terms'];

  // Trade pages convert, so they rank first among the non-home pages; guides
  // exist to be found, which is a different job from being the priority page.
  // /start is the paid-search landing page: it carries its own canonical and
  // is listed, but deliberately below the trade pages so it never outranks
  // them for the queries those pages are actually written for.
  const priority = (p: string) => {
    if (p === '') return 1;
    if (tradePaths.includes(p)) return 0.9;
    if (p === '/start') return 0.8;
    if (guidePaths.includes(p)) return 0.7;
    return 0.5;
  };

  const fixed = paths.map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: priority(p),
  }));

  // Every listed directory profile, members and unclaimed alike.
  const db = adminDb();
  const { data } = db
    ? await db.from('roofers').select('slug').eq('listed', true)
        .in('status', ['approved', 'unclaimed']).not('slug', 'is', null)
    : { data: [] };
  const profiles = ((data ?? []) as { slug: string }[]).map((r) => ({
    url: `${SITE.url}/pros/${r.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...fixed, ...profiles];
}
