'use client';

import { SessionProvider } from 'next-auth/react';
import { DesignThemeProvider } from '@/components/DesignTheme';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><DesignThemeProvider>{children}</DesignThemeProvider></SessionProvider>;
}
