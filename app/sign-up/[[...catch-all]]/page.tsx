import { redirect } from 'next/navigation';

// Keep old links working while using one unified email entry point.
export default function SignUpRedirect({ searchParams }: { searchParams: { callbackUrl?: string; email?: string } }) {
  const query = new URLSearchParams();
  if (searchParams.callbackUrl) query.set('callbackUrl', searchParams.callbackUrl);
  if (searchParams.email) query.set('email', searchParams.email);
  redirect(`/sign-in${query.size ? `?${query}` : ''}`);
}
