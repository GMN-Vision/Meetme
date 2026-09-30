import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const footerSections = [
  {
    title: 'Product',
    links: [
      { label: 'Workspace', href: '/lms' },
      { label: 'Course Builder', href: '/studio' },
      { label: 'Membership', href: '/pricing' },
      { label: 'Roadmap', href: '/roadmap' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Documentation', href: '/documentation' },
      { label: 'Help Center', href: '/help-center' },
      { label: 'Status', href: '/status' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#2a3039] bg-[#0b0d10]">
      <div className="mx-auto grid max-w-[80rem] gap-8 px-4 py-10 sm:px-5 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-base font-semibold text-[#f4f7fa]">Melanam</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#8f9aa8]">Secure video rooms, learning workspaces and AI meeting context in one place.</p>
          <Link href="/sign-in" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#ff6b7d] hover:text-[#ff4056]">
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {footerSections.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#aeb4bf]">{section.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[#c7d0d9] hover:text-[#ff6b7d]">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#2a3039]">
        <div className="mx-auto flex max-w-[80rem] flex-col gap-2 px-4 py-5 text-xs text-[#aeb4bf] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>Copyright 2036 Global Development Networks Ltd.</span>
          <span>Private by design</span>
        </div>
      </div>
    </footer>
  );
}
