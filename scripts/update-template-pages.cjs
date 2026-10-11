const fs = require('fs');
const replaceRender=(file,render,transform=s=>s)=>{let s=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');s=transform(s);const at=s.lastIndexOf('\n  return (\n');if(at<0)throw Error(file);fs.writeFileSync(file,s.slice(0,at)+render);};

replaceRender('app/pricing/page.tsx', `
  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <header className="mb-14 text-center">
          <p className="section-kicker mb-4">Melanam pricing</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Simple, transparent pricing.</h1>
          <p className="mx-auto mb-8 mt-5 max-w-2xl text-zinc-400">Start free. Record on every plan. Upgrade for longer meetings, live captions, and AI notes.</p>
          <BillingToggle cycle={cycle} onChange={setCycle} />
          {loadingMembership && <p role="status" className="mt-4 text-sm text-zinc-400">Loading your plan…</p>}
        </header>
        {message && <div role="status" className={'mb-8 rounded-xl border p-4 text-sm ' + (message.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>{message.text}</div>}
        {currentPlan && <section className="mb-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
          <div><p className="section-kicker">Your current plan</p><h2 className="mt-2 text-2xl font-semibold text-white">{currentPlan.title}</h2><p className="mt-1 text-sm text-zinc-400">{membership.creditBalance == null ? 'Custom AI credits' : Math.round(membership.creditBalance) + ' AI credits remaining'}</p></div>
          <GradientBorderLink href="/meetings" variant="light">Go to meetings <ArrowRight className="h-4 w-4" /></GradientBorderLink>
        </section>}
        <PlanCards cycle={cycle} action={planKey => {
          const isCurrent = membership?.active && membership.plan === planKey;
          const blocked = planChangeBlocked(membership, planKey);
          return <><button onClick={() => selectPlan(planKey)} disabled={Boolean(isCurrent || busyKey || blocked || loadingMembership)} className={(planKey === 'pro' ? 'button-primary shimmer-btn' : 'button-secondary') + ' w-full'}>{isCurrent ? 'Current plan' : blocked ? 'Downgrade locked' : busyKey === planKey ? 'Working…' : planKey === 'free' ? 'Get started free' : planKey === 'enterprise' ? 'Contact sales' : 'Choose ' + BILLING_PLANS.find(plan => plan.key === planKey)?.title}</button>{blocked && <p className="mt-3 text-xs text-zinc-400">{blocked}</p>}</>;
        }} />
        <section className="py-24" aria-labelledby="plan-details-title">
          <h2 id="plan-details-title" className="mb-3 text-center text-3xl font-bold tracking-tight text-white">Find your perfect fit.</h2>
          <p className="mb-10 text-center text-zinc-400">Every plan detail, in one place.</p>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800" tabIndex={0} role="region" aria-label="Plan details; scroll horizontally">
            <table className="comparison-table"><caption className="sr-only">Melanam plan features and allowances</caption><thead><tr><th scope="col">Included</th>{BILLING_PLANS.map(plan => <th key={plan.key} scope="col">{plan.title}</th>)}</tr></thead><tbody>
              {planDetails.map(([label,key]) => <tr key={key}><th scope="row">{label}</th>{BILLING_PLANS.map(plan => <td key={plan.key}>{plan.limits[key]}</td>)}</tr>)}
            </tbody></table>
          </div>
          <p className="mt-4 text-xs leading-6 text-zinc-400">Recording allowances reset monthly in UTC, including annual plans. Recording storage is separate from file storage. One server recording at a time per workspace.</p>
        </section>
        <section aria-labelledby="credits-title">
          <div className="mb-10 text-center"><h2 id="credits-title" className="text-3xl font-bold tracking-tight text-white">A little extra, when you need it.</h2><p className="mt-4 text-zinc-400">Top up credits for AI notes and captions. Your recording allowance stays separate.</p></div>
          <div className="grid gap-4 md:grid-cols-3">{CREDIT_PACKS.map(pack => <article key={pack.key} className="template-card flex flex-col"><h3 className="text-lg font-semibold text-white">{pack.title}</h3><strong className="mt-4 text-3xl text-white">{formatInr(pack.amountInr)}</strong><p className="mt-2 text-sm text-zinc-300">{pack.credits} credits</p><p className="mb-6 mt-3 flex-1 text-sm text-zinc-400">{pack.description}</p><button onClick={() => openCheckout({ creditPackKey: pack.key })} disabled={!membership?.active || Boolean(busyKey)} className="button-secondary w-full">{busyKey === pack.key ? 'Opening…' : 'Add credits'}</button></article>)}</div>
          {!membership?.active && <p className="mt-4 text-center text-sm text-zinc-400">Activate a plan to add extra credits.</p>}
        </section>
      </div>
      <Footer />
    </>
  );
}
`,s=>s.replace("import Script from 'next/script';","import Script from 'next/script';\nimport { BillingToggle, PlanCards } from '@/components/marketing/PlanCards';\nimport type { BillingPlan } from '@/lib/billing-plans';").replace(/const valueStats =[\s\S]*?function planChangeBlocked/,`const planDetails: Array<[string, keyof BillingPlan['limits']]> = [
  ['Meeting length', 'meetingMinutes'], ['Participants', 'participants'], ['Meeting rooms', 'monthlyRooms'],
  ['Workspace seats', 'seats'], ['AI credits', 'credits'], ['Live captions', 'captions'], ['AI summaries', 'summaries'],
  ['Server recording', 'recordings'], ['File sharing', 'fileSharing'], ['File storage', 'storage'], ['Whiteboards', 'whiteboards'], ['Admin controls', 'adminControls'],
];

function planChangeBlocked`));

replaceRender('app/sign-in/[[...catch-all]]/page.tsx', `
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-lg flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center"><p className="section-kicker mb-4">Welcome to Melanam</p><h1 className="text-4xl font-bold tracking-tight text-white">Good conversations<br /><span className="text-zinc-500">start here.</span></h1><p className="mt-5 text-sm leading-6 text-zinc-400">One email. One secure link. Sign in or create your account to start meeting.</p></header>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Continue with email</h2><AuthHelpButton mode="sign-in" /></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">Email address</label><div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="input-modern !pl-11" /></div></div>
          <button type="submit" disabled={loading} className="button-primary shimmer-btn w-full">{loading ? 'Sending secure link…' : 'Send sign-in link'}</button>
        </form>
        {notice && <div role="alert" aria-live="polite" className={'mt-5 flex gap-3 rounded-xl border p-4 text-sm leading-6 ' + (notice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300')}>{notice.type === 'success' ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-1 h-4 w-4 shrink-0" />}<p>{notice.text}</p></div>}
        <p className="mt-5 text-center text-xs leading-6 text-zinc-500">No password needed. Your link is single-use.<br />Check your spam folder if it hasn’t arrived.</p>
      </div>
      <p className="mt-6 text-center text-xs leading-6 text-zinc-500">By continuing, you agree to our <Link href="/terms" className="text-zinc-300 underline underline-offset-4">Terms</Link> and <Link href="/privacy" className="text-zinc-300 underline underline-offset-4">Privacy Policy</Link>.</p>
      <Link href="/admin/login" className="mt-4 text-center text-xs text-zinc-400 hover:text-white">Admin sign in</Link>
    </div>
  );
}
`,s=>s.replace("import { signIn }", "import Link from 'next/link';\nimport { signIn }"));

for(const file of ['components/JoinModal.tsx','components/CreateMeetingModal.tsx']){
 let s=fs.readFileSync(file,'utf8');
 s=s.replace(/        <div className="absolute inset-x-0 top-0 h-1\.5[^\n]*\r?\n/,'');
 s=s.replace(/            <span className="rounded-full[\s\S]*?<\/span>\r?\n/,'');
 s=s.replace('A smooth create flow with a glass panel, subtle highlights, and quick launch behavior.','Give your meeting a name, add an agenda, and invite your people.');
 s=s.replaceAll('rounded-[2rem]','rounded-2xl').replace('z-50 flex','z-[1100] flex').replace('bg-zinc-950/40','bg-black/70');
 s=s.replace('border-red-200 bg-red-50','border-red-500/30 bg-red-500/10').replace('text-red-700','text-red-300');
 s=s.replace('<div className="surface-strong relative', '<div role="dialog" aria-modal="true" aria-label="'+(file.includes('Join')?'Join a meeting':'Create a meeting')+'" className="surface-strong relative');
 fs.writeFileSync(file,s);
}
let s=fs.readFileSync('app/admin/login/page.tsx','utf8');
s=s.replace('Admin billing console','Melanam administration').replace('Use the admin username and password from <span className="font-semibold">.env.local</span>.','Sign in with your administrator credentials to manage Melanam.').replace('rounded-[2rem]','rounded-2xl').replace('bg-zinc-900/80','bg-zinc-900');fs.writeFileSync('app/admin/login/page.tsx',s);
