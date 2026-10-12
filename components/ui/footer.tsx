import Link from 'next/link';
import { Brand } from '@/components/Brand';

const sections = [
  { title: 'Product', links: [['Features', '/#features'], ['Pricing', '/pricing'], ['Compare', '/#compare'], ['Meetings', '/meetings']] },
  { title: 'Resources', links: [['Documentation', '/documentation'], ['Help center', '/help-center']] },
  { title: 'Company', links: [['About Melanam', '/about'], ['Security', '/security'], ['Admin', '/admin/login']] },
  { title: 'Contact', links: [['General enquiries', 'mailto:gdnvision360@gmail.com'], ['Support', 'mailto:gmnnetwork@gmail.com']] },
];

export function Footer() {
  return <footer className="site-footer border-t border-zinc-800 bg-zinc-950 px-4 py-16 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2"><Brand /><p className="mt-4 max-w-xs text-sm leading-6 text-zinc-400">Melanam brings video meetings, recordings, and AI meeting notes together in one workspace.</p></div>
        {sections.map(section => <div key={section.title}><h3 className="text-sm font-semibold text-white">{section.title}</h3><ul className="mt-4 space-y-3">{section.links.map(([label,href]) => <li key={href}><Link href={href} className="text-sm text-zinc-400 transition hover:text-white">{label}</Link></li>)}</ul></div>)}
      </div>
      <div className="mt-12 flex flex-col justify-between gap-3 border-t border-zinc-800 pt-8 text-xs text-zinc-500 sm:flex-row"><p className="design-copyright">© 2026 Global Development Networks Ltd. All rights reserved.</p><p className="design-blue">Connect. Converse. Collaborate. Create.</p></div>
    </div>
  </footer>;
}
