import Link from 'next/link';
import Image from 'next/image';

export function Brand() {
  return <Link href="/" className="site-brand flex shrink-0 items-center" aria-label="Melanam home">
    <Image src="/images/melanam-logo-skyblue.svg" alt="Melanam" width={164} height={40} priority className="h-8 w-auto sm:h-9" />
  </Link>;
}
