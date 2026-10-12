// Run against the development server: node scripts/check-theme-controls.cjs
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: 'no-preference' });
    await page.goto(process.env.UI_CHECK_URL || 'http://localhost:3000', { waitUntil: 'networkidle' });
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = [];
      for (const theme of ['UI 1', 'UI 2']) {
        await page.getByRole('button', { name: theme, exact: true }).click();
        const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
        const bounds = await nav.boundingBox();
        sizes.push({ width: bounds.width, height: bounds.height });
        assert.equal(bounds.width, Math.min(width - 32, 896));
        assert.equal(bounds.height, 66);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        const button = page.getByRole('link', { name: 'Start meeting free', exact: true });
        await button.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const light = button.locator('.hover-border-gradient__light');
        const background = () => light.evaluate(node => getComputedStyle(node).getPropertyValue('--light-angle'));
        const before = await background();
        await expect.poll(background, { timeout: 4000 }).not.toBe(before);
        await button.hover();
        await expect.poll(() => button.locator('.hover-border-gradient__glow').evaluate(node => getComputedStyle(node).opacity)).toBe('0.55');
        const hoveredAngle = await background();
        await expect.poll(background).not.toBe(hoveredAngle);
        await page.mouse.move(0, 0);
        await page.keyboard.press('Tab');
        await button.focus();
        await expect.poll(() => button.locator('.hover-border-gradient__glow').evaluate(node => getComputedStyle(node).opacity)).toBe('0.55');
        const focusedAngle = await background();
        await expect.poll(background).not.toBe(focusedAngle);
        await button.evaluate(node => node.blur());
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      assert.deepEqual(sizes[0], sizes[1], `Theme navbar mismatch at ${width}px`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'networkidle' });
    const light = page.getByRole('link', { name: 'Start meeting free', exact: true }).locator('.hover-border-gradient__light');
    const before = await light.evaluate(node => getComputedStyle(node).getPropertyValue('--light-angle'));
    await page.waitForTimeout(1500);
    assert.equal(await light.evaluate(node => getComputedStyle(node).getPropertyValue('--light-angle')), before, 'Reduced motion should stop rotation');
    console.log('Live checks passed: both themes, four viewport widths, animated borders, hover/focus glow, reduced motion, and identical navbar dimensions.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
