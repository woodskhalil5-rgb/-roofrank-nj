import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';
import { TRADE_SLUGS } from '../lib/trades';
import { GUIDE_SLUGS } from '../lib/guides';

export default function sitemap(): MetadataRoute.Sitemap {
  const tradePaths = TRADE_SLUGS.map((t) => `/${t}`);
  const guidePaths = GUIDE_SLUGS.map((g) => `/guides/${g}`);
  const paths = ['', ...tradePaths, '/guides', ...guidePaths, '/join', '/privacy', '/terms'];

  // Trade pages convert, so they rank first among the non-home pages; guides
  // exist to be found, which is a different job from being the priority page.
  const priority = (p: string) => {
    if (p === '') return 1;
    if (tradePaths.includes(p)) return 0.9;
    if (guidePaths.includes(p)) return 0.7;
    return 0.5;
  };

  return paths.map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: priority(p),
  }));
}
