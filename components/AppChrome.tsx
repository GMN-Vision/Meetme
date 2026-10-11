'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { SiteNavbar } from './SiteNavbar';

export function AppChrome() {
  const pathname = usePathname();
  return (
    <Suspense fallback={null}>
      {pathname?.startsWith('/room/') ? <Navbar /> : <SiteNavbar />}
    </Suspense>
  );
}
