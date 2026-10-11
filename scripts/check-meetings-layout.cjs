// Render the real meeting components with fixture data, without authentication or database access.
// Generate CSS first: node node_modules/tailwindcss/lib/cli.js -i app/globals.css -o "$env:TEMP/melanam-meetings-preview.css"
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = require('../tests/load-typescript.cjs');
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const navigation = { usePathname: () => '/meetings', useRouter: () => ({ push() {} }) };
const fixtures = ['Design review', 'Weekly team sync', 'A longer meeting title to check how cards wrap on a smaller screen'].map((title, index) => ({ title, meetingId: `sample-${index}`, hostEmail: 'team@example.com', createdAt: `2026-10-0${index + 1}` }));
const { MeetingCard } = load('components/MeetingCard.tsx', { 'next/link': Link });
const { MeetingActions } = load('components/meetings/MeetingActions.tsx', {
  'next/navigation': navigation,
  '@/components/CreateMeetingModal': { CreateMeetingModal: () => null },
  '@/components/JoinModal': { JoinModal: () => null },
});
const { MeetingDashboard } = load('components/meetings/MeetingDashboard.tsx', {
  react: { ...React, useState: value => React.useState(Array.isArray(value) ? fixtures : value === true ? false : value) },
  '@/components/MeetingCard': { MeetingCard }, './MeetingActions': { MeetingActions }, './AIMeetingNotesPanel': { AIMeetingNotesPanel: () => null },
});
const { MeetingWorkspace } = load('components/meetings/MeetingWorkspace.tsx', {
  react: { ...React, useState: value => React.useState(value === false ? true : value) },
  'next/link': Link, 'next/navigation': navigation,
});
(async () => {
  const html = renderToStaticMarkup(React.createElement(MeetingWorkspace, null, React.createElement(MeetingDashboard)));
  const css = fs.readFileSync(path.join(os.tmpdir(), 'melanam-meetings-preview.css'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<html><head><style>${css}</style></head><body>${html}</body></html>`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
      assert.equal(await page.getByRole('article').count(), 3);
      assert.ok(await page.getByRole('button', { name: 'Start meeting', exact: true }).isVisible());
      await page.screenshot({ path: path.join(os.tmpdir(), `melanam-meetings-${width}.png`), fullPage: true });
    }
    console.log('Meeting layouts pass at 1440, 768, 375, and 320px with fixture data.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
