'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { SiteNavbar } from './SiteNavbar';
import { AppGuideChat } from './AppGuideChat';

export function AppChrome() {
  const pathname = usePathname();
  const isRoomPage = pathname?.startsWith('/room/');
  // The presentation route is a focused document viewer inside the meeting.
  if (pathname === '/present') return null;
  return (
    <Suspense fallback={null}>
      {isRoomPage ? <Navbar /> : <SiteNavbar />}
      {!isRoomPage && <AppGuideChat />}
    </Suspense>
  );
}
