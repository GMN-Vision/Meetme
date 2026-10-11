'use client';

interface GlowCardProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function GlowCard({ id, className = '', children }: GlowCardProps) {
  return (
    <div
      id={id}
      className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 ${className}`}
    >
      <div className="relative z-10 rounded-[inherit]">{children}</div>
    </div>
  );
}
