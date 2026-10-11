import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pricing - Free, Pro, and Business Plans',
  description:
    'Compare Melanam Free, Pro, Business, and Enterprise plans for video meetings, AI notes, recordings, captions, credits, and workspace seats.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Melanam Pricing - Free, Pro, and Business Plans',
    description:
      'Choose a Melanam plan with unlimited meeting rooms, participant limits, workspace seats, AI notes, recordings, livestreams, and extra credits.',
    url: '/pricing',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Melanam Pricing - Free, Pro, and Business Plans',
    description:
      'Compare Melanam plans for team meetings, AI notes, recordings, captions, and extra credits.',
  },
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
