import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing'],
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard/',
          '/enterprise/',
          '/meetings/',
          '/recordings/',
          '/room/',
          '/sign-in/',
          '/sign-up/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
