"use client";

import { HelpCircle, X } from 'lucide-react';
import { useState } from 'react';

type AuthHelpButtonProps = {
  mode: 'sign-in' | 'sign-up';
};

export function AuthHelpButton({ mode }: AuthHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const isSignUp = mode === 'sign-up';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
        aria-expanded={open}
        aria-label="Show sign in and sign up help"
      >
        <HelpCircle className="h-4 w-4" />
        Help
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                {isSignUp ? 'How sign up works' : 'How sign in works'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                {isSignUp
                  ? 'Enter your email and open the secure magic link sent to your inbox.'
                  : 'Enter your email and we will send a secure magic link. New accounts are created automatically.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 rounded-xl bg-zinc-800 p-3 text-xs leading-5 text-zinc-300">
            <>
              Use the same email screen whether this is your first visit or you are returning.
              {isSignUp ? ' Existing links now open that screen too.' : ''}
            </>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">
            Admin users should use the admin login because admin accounts are provisioned separately.
          </p>
        </div>
      ) : null}
    </div>
  );
}
