import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Prove that the published model loads with all external network resources blocked.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  const app = page.frameLocator('#codex-visualization');
  await expect(app.locator('#lp-loading')).toBeHidden({ timeout: 45_000 });
  await expect(app.locator('#lp-capacity')).toContainText('96 guest seats');
  page.__venueErrors = errors;
});

test.afterEach(async ({ page }) => expect(page.__venueErrors).toEqual([]));

test('renders a real WebGL canvas without external requests', async ({ page }, info) => {
  const app = page.frameLocator('#codex-visualization');
  await expect(app.locator('#lp-canvas')).toBeVisible();
  expect(await app.locator('#lp-canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return Boolean(gl && !gl.isContextLost() && canvas.width > 0 && canvas.height > 0);
  })).toBe(true);
  await app.locator('#lp-view').selectOption('plan');
  await info.attach('venue-floor-plan', { body: await app.locator('#lp-stage').screenshot(), contentType: 'image/png' });
});

test('table removal updates capacity and can be reversed', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-clear-couple').click();
  await expect(app.locator('#lp-capacity')).toContainText('88 guest seats');
  await app.getByText('Choose which tables to keep', { exact: false }).first().click();
  await app.locator('#lp-table-8').check();
  await expect(app.locator('#lp-capacity')).toContainText('96 guest seats');
});

test('dance dimensions and reversible bar sides persist', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-finishes summary').click();
  await app.locator('#lp-dance-width').fill('16');
  await app.locator('#lp-dance-width').press('Tab');
  await app.locator('#lp-bar-side').selectOption('lake');
  await page.reload();
  await expect(app.locator('#lp-loading')).toBeHidden({ timeout: 45_000 });
  await app.locator('#lp-finishes summary').click();
  await expect(app.locator('#lp-dance-width')).toHaveValue('16');
  await expect(app.locator('#lp-bar-side')).toHaveValue('lake');
});

test('WASD takes over without a tour and stops when released', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-view').selectOption('inside');
  await app.locator('#lp-orbit-mode').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await expect(app.locator('#lp-view')).toHaveValue('walk');
  const position = () => app.locator('body').evaluate(() => window.openai.widgetState.privateContent.walk);
  const released = await position();
  await page.waitForTimeout(450);
  expect(await position()).toEqual(released);
  await page.keyboard.press('Escape');
  await app.locator('#lp-orbit-mode').click();
  await expect(app.locator('#lp-view')).toHaveValue('perspective');
});

test('view height resizes by keyboard and drag', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  const handle = app.locator('#lp-resize');
  const stage = app.locator('#lp-stage');
  const initial = await stage.evaluate(el => el.clientHeight);
  await handle.focus();
  await handle.press('ArrowUp');
  await expect.poll(() => stage.evaluate(el => el.clientHeight)).toBe(initial - 40);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => stage.evaluate(el => el.clientHeight)).toBeLessThan(initial - 60);
});

test('ceremony, tent and ceiling options render without runtime errors', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-tab-ceremony').click();
  await app.locator('#lp-kitchen').check();
  await app.locator('#lp-tent-side').selectOption('both');
  await app.locator('#lp-tent-style').selectOption('peak');
  await app.locator('#lp-aisle-decor').selectOption('mixed');
  await app.locator('#lp-view').selectOption('ceremony');
  await expect(app.locator('#lp-ceremony-status')).toContainText('backed benches');
  await app.locator('#lp-tab-view').click();
  await app.locator('#lp-lighting').selectOption('lanterns');
  await app.locator('#lp-ceiling-decor').selectOption('greenery');
  await app.locator('#lp-walk-inside').click();
  await expect(app.locator('#lp-view')).toHaveValue('walk');
});

test('guided tour respects reduced motion and supports jumping', async ({ page }) => {
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-tour-start').click();
  await expect(app.locator('#lp-tour-status')).toContainText('Paused');
  await app.locator('#lp-tour-next').click();
  await expect(app.locator('#lp-tour-status')).toContainText('Pavilion approach');
  await app.locator('#lp-tour-control').click();
  await expect(app.locator('#lp-view')).toHaveValue('walk');
});

test('coordinated decor looks render without changing the floor plan', async ({ page }) => {
  test.setTimeout(180_000);
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-view').selectOption('table');
  await app.locator('#lp-tab-decor').click();
  const initial = await app.locator('body').evaluate(() => window.openai.widgetState.modelContent);
  for (const [look, flower, arrangement] of [['ivoryPlum','mixed','mixed'],['plumGarden','dahlias','low'],['blueMeadow','delphinium','meadow'],['pistachio','roses','bud']]) {
    await app.locator('[data-design="look"]').selectOption(look);
    await expect(app.locator('[data-design="flowerStyle"]')).toHaveValue(flower);
    await expect(app.locator('[data-design="arrangement"]')).toHaveValue(arrangement);
    await expect(app.locator('#lp-capacity')).toContainText('96 guest seats');
    const state = await app.locator('body').evaluate(() => window.openai.widgetState.modelContent);
    expect(state.design.trailingGreenery).toBe(true);
    expect(state.design.glassware).not.toBe('none');
    for (const key of ['layout','length','width','danceWidth','danceDepth','disabledTables','positions']) expect(state[key]).toEqual(initial[key]);
  }
  await expect(app.locator('#lp-style-summary')).toContainText('votives');
  await app.locator('#lp-style-candles summary').click();
  await expect(app.locator('[data-design="candleHeight"]')).toBeDisabled();
  await expect(app.locator('[data-design="candleHeight"]')).toHaveValue('3');
});

test('decor color swatches and flower choices persist after reloading', async ({ page }, info) => {
  test.setTimeout(180_000);
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-tab-decor').click();
  await app.locator('[data-design="look"]').selectOption('ivoryPlum');
  await app.locator('#lp-color-target').selectOption('flowerC');
  await app.getByRole('button', { name: 'Mauve #ad829a', exact: true }).click();
  await expect(app.locator('[data-design="flowerC"]')).toHaveValue('#ad829a');
  await expect(app.getByRole('button', { name: 'Mauve #ad829a', exact: true })).toHaveAttribute('aria-pressed','true');
  await app.locator('#lp-style-flowers summary').click();
  await app.locator('[data-design="flowerStyle"]').selectOption('anemones');
  await app.locator('#lp-focus-table').click();
  await info.attach('styled-table', { body: await app.locator('#lp-stage').screenshot(), contentType: 'image/png' });
  await page.reload();
  await expect(app.locator('#lp-loading')).toBeHidden({ timeout: 45_000 });
  await app.locator('#lp-tab-decor').click();
  await expect(app.locator('[data-design="look"]')).toHaveValue('custom');
  await expect(app.locator('[data-design="flowerC"]')).toHaveValue('#ad829a');
  await expect(app.locator('[data-design="flowerStyle"]')).toHaveValue('anemones');
  await expect(app.locator('[data-design="napkinStyle"]')).toHaveValue('gathered');
});
