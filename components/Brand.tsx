import Link from 'next/link';
import { Video } from 'lucide-react';

export function Brand() {
  return <Link href="/" className="flex shrink-0 items-center gap-2.5 font-bold text-white" aria-label="Melanam home">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-950"><Video className="h-[18px] w-[18px]" strokeWidth={2} /></span>
    <span className="text-[15px] tracking-tight">Melanam</span>
  </Link>;
}
