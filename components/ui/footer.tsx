import Link from 'next/link';
import { Brand } from '@/components/Brand';

const sections = [
  { title: 'Product', links: [['Features', '/#features'], ['Pricing', '/pricing'], ['Compare', '/#compare'], ['Meetings', '/meetings']] },
  { title: 'Resources', links: [['Documentation', '/documentation'], ['Help center', '/help-center'], ['Status', '/status'], ['Roadmap', '/roadmap']] },
  { title: 'Company', links: [['About Melanam', '/about'], ['Security', '/security'], ['Admin', '/admin/login']] },
  { title: 'Legal', links: [['Privacy policy', '/privacy'], ['Terms of service', '/terms']] },
];

export function Footer() {
  return <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-16 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2"><Brand /><p className="mt-4 max-w-xs text-sm leading-6 text-zinc-400">A simpler way to meet, share ideas, and stay connected. Built around your conversations.</p></div>
        {sections.map(section => <div key={section.title}><h3 className="text-sm font-semibold text-white">{section.title}</h3><ul className="mt-4 space-y-3">{section.links.map(([label,href]) => <li key={href}><Link href={href} className="text-sm text-zinc-400 transition hover:text-white">{label}</Link></li>)}</ul></div>)}
      </div>
      <div className="mt-12 flex flex-col justify-between gap-3 border-t border-zinc-800 pt-8 text-xs text-zinc-500 sm:flex-row"><p>© {new Date().getFullYear()} Global Development Networks Ltd. All rights reserved.</p><p>Melanam. Make every conversation count.</p></div>
    </div>
  </footer>;
}
