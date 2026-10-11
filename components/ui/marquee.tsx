'use client';

interface MarqueeItem {
  title: string;
  description: string;
}

interface MarqueeProps {
  items: MarqueeItem[];
  className?: string;
}

export function Marquee({ items, className = '' }: MarqueeProps) {
  const loopItems = [...items, ...items];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="marquee flex gap-4">
        {loopItems.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className="w-[240px] shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
            <p className="mt-2 text-xs text-zinc-400">{item.description}</p>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#eef4fb] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#eef4fb] to-transparent" />
    </div>
  );
}
