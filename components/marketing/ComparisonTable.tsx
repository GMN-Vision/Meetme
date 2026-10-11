import { BILLING_PLAN_MAP } from '@/lib/billing-plans';

export function ComparisonTable() {
  const free = BILLING_PLAN_MAP.free;
  const rows = [
    ['Group meeting length', `${free.maxMeetingMinutes / 60} hours`, '40 minutes', '60 minutes'],
    ['Meeting participants', String(free.maxParticipants), '100', '100'],
    ['Free recording method', 'Server-side cloud recording', 'Computer recording saved locally', 'Not included with a personal free account'],
    ['Free cloud recording allowance', `${free.recording.monthlyMinutes / 60} hours / month, ${free.recording.storageGb} GB, ${free.recording.retentionDays}-day retention`, 'Cloud recording requires a paid plan', 'Recording requires an eligible paid edition'],
    ['Where to find recordings', 'Watch or download in Melanam Recordings', 'On the computer that recorded the meeting', 'Google Drive on eligible paid editions'],
  ];
  return <section id="compare" className="mx-auto max-w-6xl px-4 py-24 sm:px-6" aria-labelledby="compare-title">
    <div className="mb-12 text-center">
      <p className="section-kicker mb-4">More time. More follow-through.</p>
      <h2 id="compare-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">See how Melanam compares.</h2>
      <p className="mx-auto mt-4 max-w-xl text-zinc-400">Compare free group meeting limits and recording options side by side.</p>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-zinc-800" tabIndex={0} role="region" aria-label="Free plan comparison; scroll horizontally on small screens">
      <table className="comparison-table">
        <caption className="sr-only">Melanam Free, Zoom Basic, and Google Meet personal account comparison</caption>
        <thead><tr><th scope="col">Free plan</th><th scope="col" className="comparison-highlight">Melanam</th><th scope="col">Zoom Basic</th><th scope="col">Google Meet</th></tr></thead>
        <tbody>{rows.map(([label, ...values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, index) => <td key={index} className={index === 0 ? 'comparison-highlight font-semibold' : ''}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="mt-5 text-xs leading-6 text-zinc-400">Group calls with 3 or more participants. Standard free accounts; exceptions and provider policies may apply. Melanam values are from its current Free plan. Competitor details checked October 11, 2026. Sources: <a className="underline underline-offset-4 hover:text-white" href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067966" target="_blank" rel="noreferrer">Zoom meeting limits</a>, <a className="underline underline-offset-4 hover:text-white" href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068002" target="_blank" rel="noreferrer">Zoom participant limits</a>, <a className="underline underline-offset-4 hover:text-white" href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059856" target="_blank" rel="noreferrer">Zoom computer and cloud recording</a>, <a className="underline underline-offset-4 hover:text-white" href="https://support.google.com/meet/answer/13396001?hl=en" target="_blank" rel="noreferrer">Google Meet free features</a>, and <a className="underline underline-offset-4 hover:text-white" href="https://support.google.com/meet/answer/10459644?hl=en" target="_blank" rel="noreferrer">Google Meet premium features</a>.</p>
  </section>;
}
