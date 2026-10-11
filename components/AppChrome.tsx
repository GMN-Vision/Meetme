'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { SiteNavbar } from './SiteNavbar';
import { AppGuideChat } from './AppGuideChat';

export function AppChrome() {
  const pathname = usePathname();
  return (
    <Suspense fallback={null}>
      {pathname?.startsWith('/room/') ? <Navbar /> : <SiteNavbar />}
      <AppGuideChat />
    </Suspense>
  );
}
