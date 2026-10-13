'use client';

import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Brand } from './Brand';
import { DesignSwitcher } from './DesignTheme';

export function SiteNavbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const loggedIn = status === 'authenticated';
  const inWorkspace = pathname.startsWith('/meetings');
  const links = inWorkspace ? [] : [
    { label: 'Features', href: '/#features' }, { label: 'Pricing', href: '/pricing' }, { label: 'Compare', href: '/#compare' },
  ];
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false); };
    if (open) { document.addEventListener('keydown', escape); document.addEventListener('pointerdown', outside); }
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <header ref={header} className="site-header fixed left-1/2 top-4 z-[1000] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2">
    <nav aria-label="Main navigation" className="site-navigation flex items-center justify-between gap-3 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-3 backdrop-blur-md">
      <Brand />
      {!inWorkspace && <DesignSwitcher menu={pathname === '/'} />}
      {links.length > 0 && <div className="hidden items-center gap-1 lg:flex">
        {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} className="rounded-full px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white">{link.label}</Link>)}
      </div>}
      <div className="hidden items-center gap-3 lg:flex">
        <Link href={session?.user?.role === 'admin' ? '/admin' : '/admin/login'} className="text-xs text-zinc-400 hover:text-white">Admin</Link>
        {loggedIn ? <>
          <button onClick={() => void signOut({ callbackUrl: '/' })} className="px-2 text-sm text-zinc-400 hover:text-white">Sign out</button>
          <HoverBorderGradient as={Link} href="/meetings" className="button-primary shimmer-btn !min-h-9 !px-4 !py-2">My meetings</HoverBorderGradient>
        </> : <>
          <Link href="/sign-in" className="text-sm text-zinc-400 hover:text-white">Sign in</Link>
          <HoverBorderGradient as={Link} href="/sign-in" className="button-primary shimmer-btn !min-h-9 !px-4 !py-2">Get started</HoverBorderGradient>
        </>}
      </div>
      <button ref={toggle} type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 lg:hidden">{open ? <X size={20} /> : <Menu size={20} />}</button>
    </nav>
    {open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="mt-2 grid gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-xl backdrop-blur-md">
      {[...links, {label: 'Help center', href: '/help-center'}, {label: 'Admin', href: session?.user?.role === 'admin' ? '/admin' : '/admin/login'}].map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800">{link.label}</Link>)}
      <div className="my-2 border-t border-zinc-800" />
      <HoverBorderGradient as={Link} href={loggedIn ? '/meetings' : '/sign-in'} onClick={() => setOpen(false)}>{loggedIn ? 'My meetings' : 'Get started'}</HoverBorderGradient>
      {loggedIn && <button onClick={() => void signOut({ callbackUrl: '/' })} className="button-secondary mt-2">Sign out</button>}
    </nav>}
  </header>;
}
