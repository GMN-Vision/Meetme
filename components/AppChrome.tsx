'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { SiteNavbar } from './SiteNavbar';
import { AppGuideChat } from './AppGuideChat';

export function AppChrome() {
  const pathname = usePathname();
  const isRoomPage = pathname?.startsWith('/room/');
  return (
    <Suspense fallback={null}>
      {isRoomPage ? <Navbar /> : <SiteNavbar />}
      {!isRoomPage && <AppGuideChat />}
    </Suspense>
  );
}
