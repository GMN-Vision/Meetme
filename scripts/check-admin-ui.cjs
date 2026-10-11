const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const org = { _id: '123456789012345678901234', name: 'Example team', domain: 'example.com', billingPlan: 'basic', memberCount: 1, policies: { recordingAllowed: true, chatEnabled: true }, createdAt: '2026-10-01' };
    const user = { _id: 'user', name: 'Sample Member', email: 'member@example.com', role: 'user', status: 'active', organizationId: org._id, organizationName: org.name, createdAt: '2026-10-01' };
    const subscription = { _id: 'sub', userEmail: user.email, userName: user.name, plan: 'free', status: 'active', billingCycle: 'monthly', amount: 0, currency: 'INR', active: true, selected: true, creditBalance: 10, currentPeriodEnd: null };
    let writes = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let body = {};
      if (method !== 'GET') {
        writes++;
        const update = route.request().postDataJSON();
        if (path.endsWith('/organizations')) Object.assign(org, { name: update.name, domain: update.domain, billingPlan: update.billingPlan, policies: { recordingAllowed: update.recordingAllowed, chatEnabled: update.chatEnabled } });
        body = { success: true };
      } else if (path === '/api/auth/session') body = { user: { email: 'admin@example.com', role: 'admin' }, expires: '2099-01-01' };
      else if (path.endsWith('/stats')) body = { stats: { totalUsers: 1, totalOrganizations: 1, totalMeetings: 0, activeMeetings: 0, roles: { admin: 1, user: 1 } } };
      else if (path.endsWith('/users')) body = { users: [user] };
      else if (path.endsWith('/organizations')) body = { organizations: [org] };
      else if (path.endsWith('/meetings')) body = { meetings: [] };
      else if (path.endsWith('/subscriptions')) body = { subscriptions: [subscription] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://localhost:3000/admin');
    await page.getByRole('heading', { name: 'Admin dashboard' }).waitFor();
    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    await nav.getByRole('button', { name: 'People', exact: true }).click();
    await page.getByRole('button', { name: 'Edit access' }).click();
    await page.getByLabel('Account access', { exact: true }).selectOption('disabled');
    assert.equal(writes, 0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByText('Changes saved', { exact: true }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await nav.getByRole('button', { name: 'Organizations', exact: true }).count(), 0);
    assert.equal(await nav.getByRole('button', { name: 'Advanced', exact: true }).count(), 0);
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await nav.getByRole('button', { name: 'Plans & credits', exact: true }).click();
      await page.getByRole('button', { name: 'Edit membership' }).click();
      await page.getByRole('heading', { name: 'Edit membership' }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(os.tmpdir(), `melanam-admin-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('Admin UI passed: explicit saves, simplified navigation, membership editor, desktop and mobile. All API requests mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
