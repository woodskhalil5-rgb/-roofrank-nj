import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';
import { TRADE_SLUGS } from '../lib/trades';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['', ...TRADE_SLUGS.map((t) => `/${t}`), '/join', '/privacy', '/terms'];
  return paths.map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: p === '' ? 1 : p.startsWith('/') && TRADE_SLUGS.some((t) => p === `/${t}`) ? 0.9 : 0.5,
  }));
}
