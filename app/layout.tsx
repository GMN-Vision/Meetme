import type { Metadata } from 'next';
import { AppChrome } from '../components/AppChrome';
import { Providers } from './providers';
import ThemeInitializer from '../components/ThemeInitializer';
import '@excalidraw/excalidraw/index.css';
import './globals.css';
import './design-magenta.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import { absoluteUrl, getPublicSiteUrl, SEO_KEYWORDS, SITE_DESCRIPTION, SITE_NAME } from '../lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: 'Melanam - Video Meetings, AI Notes, and Recordings',
    template: '%s | Melanam',
  },
  description: SITE_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: SITE_NAME,
    title: 'Melanam - Video Meetings, AI Notes, and Recordings',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Melanam - Video Meetings, AI Notes, and Recordings',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  category: 'technology',
};

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon.svg'),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl('/'),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: absoluteUrl('/'),
    description: SITE_DESCRIPTION,
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '0',
      highPrice: '2999',
      priceCurrency: 'INR',
      offerCount: 3,
      url: absoluteUrl('/pricing'),
    },
  },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-design="magenta" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.design=localStorage.getItem('melanam-design')==='current'?'current':'magenta'}catch(e){}" }} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </head>
      <body>
        <div className="noise-overlay" aria-hidden="true" />
        <Providers>
          <ThemeInitializer />
          <AppChrome />
          <main className="app-main">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}

