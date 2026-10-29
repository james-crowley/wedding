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
  const fonts = await app.locator('body').evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(font => font.family.includes('Studio')).map(font => ({ family: font.family, status: font.status }));
  });
  expect(fonts).toHaveLength(2);
  expect(fonts.every(font => font.status === 'loaded')).toBe(true);
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
  await app.locator('#lp-tab-lounge').click();await app.locator('#lp-finishes summary').click();
  await app.locator('#lp-dance-width').fill('16');
  await app.locator('#lp-dance-width').press('Tab');
  await app.locator('#lp-tab-layout').click();await app.locator('#lp-bar-side').selectOption('lake');
  await page.reload();
  await expect(app.locator('#lp-loading')).toBeHidden({ timeout: 45_000 });
  await app.locator('#lp-tab-lounge').click();await app.locator('#lp-finishes summary').click();
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
  await expect(app.locator('#lp-ceremony-status')).toContainText('backless benches');
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
  await app.locator('#lp-tab-rentals').click();await app.locator('#lp-style-candles summary').click();
  await expect(app.locator('[data-design="candleHeight"]')).toBeDisabled();
  await expect(app.locator('[data-design="candleHeight"]')).toHaveValue('3');
});

test('decor color swatches and flower choices persist after reloading', async ({ page }, info) => {
  test.setTimeout(180_000);
  const app = page.frameLocator('#codex-visualization');
  await app.locator('#lp-tab-decor').click();
  await app.locator('[data-design="look"]').selectOption('ivoryPlum');
  await app.locator('#lp-tab-rentals').click();await app.locator('#lp-color-target').selectOption('flowerC');
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
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await app.locator('body').evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  expect(await app.locator('#lp-settings-tabs').evaluate(nav => [...nav.children].some(tab => tab.scrollWidth > tab.clientWidth + 1))).toBe(false);
});

test('row offsets are independent, and reset can be undone', async ({ page }) => {
  const app=page.frameLocator('#codex-visualization');
  const state=()=>app.locator('body').evaluate(()=>window.openai.widgetState.modelContent);
  await app.locator('#lp-row-2').fill('3');await app.locator('#lp-row-2').press('Tab');
  expect((await state()).rowOffsets).toEqual([2,3,2]);
  await app.locator('#lp-clear-couple').click();
  await app.locator('#lp-reset-open').click();await app.locator('#lp-reset-cancel').click();
  await expect(app.locator('#lp-capacity')).toContainText('88 guest seats');
  await app.locator('#lp-reset-open').click();await app.locator('#lp-reset-confirm').click();
  await expect(app.locator('#lp-capacity')).toContainText('96 guest seats');
  expect((await state()).rowOffsets).toEqual([2,0,2]);
  await app.locator('#lp-undo-reset').click();
  await expect(app.locator('#lp-capacity')).toContainText('88 guest seats');
  expect((await state()).rowOffsets).toEqual([2,3,2]);
});

test('bounded vase edits, new flowers, wood floor and cupcake displays stay renderable', async ({ page }) => {
  test.setTimeout(180_000);
  const app=page.frameLocator('#codex-visualization');
  const consoleErrors=[];page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  await app.locator('#lp-tab-rentals').click();await app.locator('#lp-style-flowers summary').click();
  await app.locator('[data-design="arrangement"]').selectOption('bud');
  let staleSnapshot;
  for(const value of ['0','1','999999','2','5','0','5']){
    const field=app.locator('[data-design="vaseCount"]');await field.fill(value);await field.press('Tab');
    await expect(field).toHaveValue(value==='999999'?'7':value);
    if(value==='2'){await expect.poll(()=>app.locator('body').evaluate(()=>window.openai.widgetState.modelContent.design.vaseCount)).toBe(2);staleSnapshot=await app.locator('body').evaluate(()=>window.openai.widgetState);}
  }
  await expect.poll(()=>app.locator('body').evaluate(()=>window.openai.widgetState.modelContent.design.vaseCount)).toBe(5);
  await app.locator('body').evaluate((_,snapshot)=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:snapshot}}})),staleSnapshot);
  await expect(app.locator('[data-design="vaseCount"]')).toHaveValue('5');
  for(const flower of ['ranunculus','anthurium','carnations'])await app.locator('[data-design="flowerStyle"]').selectOption(flower);
  await expect(app.locator('[data-design="flowerStyle"]')).toHaveValue('carnations');
  await app.locator('#lp-tab-lounge').click();await app.locator('#lp-finishes summary').click();await app.locator('#lp-dance-pattern').selectOption('wood');
  await app.locator('#lp-tab-layout').click();await app.locator('#lp-dessert-options summary').click();await app.locator('#lp-dessert-style').selectOption('mixed');
  await app.locator('#lp-cupcake-count').fill('72');await app.locator('#lp-cupcake-count').press('Tab');
  const state=await app.locator('body').evaluate(()=>window.openai.widgetState.modelContent);
  expect(state.dancePattern).toBe('wood');expect(state.cupcakeCount).toBe(72);expect(state.design.vaseCount).toBe(5);
  await app.locator('#lp-view').selectOption('houseInterior');
  await app.locator('#lp-tab-view').click();await expect(app.locator('#lp-house-cutaway')).toBeChecked();
  await app.locator('#lp-view').selectOption('houseLower');
  expect(await app.locator('#lp-canvas').evaluate(c=>!c.getContext('webgl2').isContextLost())).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('seated views follow guest tables, persist, and hand over to walking', async ({ page }, info) => {
  const app=page.frameLocator('#codex-visualization');
  const state=()=>app.locator('body').evaluate(()=>window.openai.widgetState);
  await app.locator('#lp-sit').click();
  await expect(app.locator('#lp-view')).toHaveValue('seat');
  await expect(app.locator('#lp-seat-side')).toBeDisabled();
  await expect(app.locator('#lp-seat-place option')).toHaveCount(2);
  await app.locator('#lp-seat-table').selectOption('table-5');
  await app.locator('#lp-seat-side').selectOption('-1');
  await app.locator('#lp-seat-place').selectOption('3');
  await app.locator('#lp-seat-look').selectOption('dance');
  await page.reload();await expect(app.locator('#lp-loading')).toBeHidden({timeout:45_000});
  await expect(app.locator('#lp-view')).toHaveValue('seat');
  await expect(app.locator('#lp-seat-table')).toHaveValue('table-5');
  await expect(app.locator('#lp-seat-side')).toHaveValue('-1');
  await expect(app.locator('#lp-seat-place')).toHaveValue('3');
  expect((await state()).privateContent.seat.look).toBe('dance');
  const saved=await state();saved.modelContent.positions.separate['table-5']={x:-16,z:4,r:Math.PI/2};
  saved.privateContent.seat={table:'table-5',side:1,place:2,look:'across',eye:3.8,yaw:0,pitch:-.04};
  await app.locator('body').evaluate((_,s)=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:s}}})),saved);
  await info.attach('seated-table-five',{body:await app.locator('#lp-stage').screenshot(),contentType:'image/png'});
  await app.locator('#lp-seat-stand').click();
  const walk=(await state()).privateContent.walk;
  expect(walk.x).toBeCloseTo(-13.5,3);expect(walk.z).toBeCloseTo(5,3);expect(walk.y).toBe(5.5);
  await app.locator('#lp-sit').click();
  await app.locator('#lp-tab-layout').click();await app.getByText('Choose which tables to keep',{exact:false}).first().click();
  await app.locator('#lp-table-5').uncheck();
  await expect(app.locator('#lp-seat-table')).toHaveValue('couple');
  await expect(app.locator('#lp-seat-table option[value="table-5"]')).toHaveCount(0);
  await app.locator('#lp-seat-next').click();await expect(app.locator('#lp-seat-table')).toHaveValue('table-1');
  await app.locator('#lp-orbit-mode').focus();await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');
  await expect(app.locator('#lp-view')).toHaveValue('walk');
});

test('florist looks and dress colors render with five or seven bud vases', async ({ page }, info) => {
  const app=page.frameLocator('#codex-visualization');
  const model=()=>app.locator('body').evaluate(()=>window.openai.widgetState.modelContent);
  await app.locator('#lp-tab-decor').click();
  await app.locator('#lp-look-cards [data-look="florist"]').click();
  await expect(app.locator('[data-design="vaseCount"]')).toHaveValue('5');
  let m=await model();expect(m.design.flowerStyle).toBe('florist');expect(m.design.vaseCount).toBe(5);expect(m.design.outdoorArborDecor).toBe('corners');expect(m.design.napkinColor).toBe('#642c38');
  await app.locator('#lp-look-cards [data-look="vasesOnly"]').click();
  await expect(app.locator('[data-design="vaseCount"]')).toHaveValue('7');
  m=await model();expect(m.design.vaseCount).toBe(7);expect(m.design.candleCount).toBe(0);expect(m.design.candleStyle).toBe('none');
  await app.locator('#lp-tab-rentals').click();await app.locator('#lp-style-flowers summary').click();
  await expect(app.locator('[data-design="vaseCount"]')).toHaveValue('7');
  for(const flower of ['hellebore','astrantia','sprayroses','florist'])await app.locator('[data-design="flowerStyle"]').selectOption(flower);
  await app.locator('#lp-tab-rentals').click();await app.locator('#lp-color-target').selectOption('napkinColor');
  await app.getByRole('button',{name:'Twilight #4f6875',exact:true}).click();
  await app.locator('#lp-sit').click();await app.locator('#lp-seat-table').selectOption('table-1');
  await page.reload();await expect(app.locator('#lp-loading')).toBeHidden({timeout:45_000});
  m=await model();expect(m.design.vaseCount).toBe(7);expect(m.design.flowerStyle).toBe('florist');expect(m.design.napkinColor).toBe('#4f6875');
  expect(await app.locator('#lp-canvas').evaluate(c=>!c.getContext('webgl2').isContextLost())).toBe(true);
  await page.setViewportSize({width:390,height:900});await expect(app.locator('#lp-seat-controls')).toBeVisible();
  expect(await app.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await info.attach('seated-mobile',{body:await page.screenshot(),contentType:'image/png'});
});
