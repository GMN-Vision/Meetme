import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Footer } from '../components/ui/footer';

type InfoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: Array<{
    title: string;
    body: string;
    items?: string[];
  }>;
  ctaHref?: string;
  ctaLabel?: string;
};

export function InfoPage({ eyebrow, title, description, sections, ctaHref = '/meetings', ctaLabel = 'Open workspace' }: InfoPageProps) {
  return (
    <>
      <div className="page-shell-wide pb-14">
        <header className="border-b border-[#27272a] pb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#a1a1aa] hover:text-[#3f3f46]">
            <ArrowLeft className="h-4 w-4" />
            Back to Melanam
          </Link>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.16em] text-[#3f3f46]">{eyebrow}</p>
          <h1 className="mt-3 max-w-4xl font-display text-3xl font-semibold leading-tight text-[#fafafa] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#a1a1aa]">{description}</p>
          <Link href={ctaHref} className="shimmer-btn mt-7 inline-flex items-center gap-2 rounded-full border border-[#3f3f46]/50 bg-[#3f3f46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#52525b]">
            <span>{ctaLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="mt-8 divide-y divide-[#27272a] border-y border-[#27272a]">
          {sections.map((section, index) => (
            <article key={section.title} className="grid gap-4 py-7 md:grid-cols-[minmax(160px,0.34fr)_1fr] md:gap-8">
              <div className="flex items-start gap-3">
                <span className="pt-0.5 text-xs font-bold text-[#3f3f46]">{String(index + 1).padStart(2, '0')}</span>
                <h2 className="text-base font-semibold text-[#fafafa]">{section.title}</h2>
              </div>
              <div>
                <p className="text-sm leading-7 text-[#a1a1aa]">{section.body}</p>
                {section.items ? (
                  <ul className="mt-5 grid gap-2 text-sm leading-6 text-[#d4d4d8] sm:grid-cols-2">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-[#34d399]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      </div>
      <Footer />
    </>
  );
}
