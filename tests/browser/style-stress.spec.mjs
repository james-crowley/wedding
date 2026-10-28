import { test, expect } from '@playwright/test';
import { controls } from '../../scripts/ui-controls.mjs';
import { installRenderAudit, renderHealth } from './render-audit.mjs';

const design=key=>`[data-design="${key}"]`;
async function frameOf(page){return page.frames().find(f=>f.parentFrame()===page.mainFrame());}
async function health(frame,label){const h=await frame.evaluate(renderHealth);expect(h.errors,label).toEqual([]);expect(h.lost,label).toBe(false);expect(h.colors,label).toBeGreaterThan(3);return h;}
async function expose(frame,selector){await frame.locator(selector).evaluate(el=>{const panel=el.closest('[role="tabpanel"]');if(panel?.hidden)document.getElementById(panel.getAttribute('aria-labelledby')).click();for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});}
async function pick(frame,selector,value){await expose(frame,selector);const before=await frame.evaluate(()=>window.__renderAudit.frames);await frame.locator(selector).selectOption(String(value));await expect.poll(()=>frame.evaluate(()=>window.__renderAudit.frames)).toBeGreaterThan(before);await health(frame,`${selector}=${value}`);}

test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');await expect((await frameOf(page)).locator('#lp-loading')).toBeHidden({timeout:45_000});
});

for(const target of controls.find(c=>c.selector==='#lp-color-target').values)test(`every palette swatch applied to ${target}`,async({page},info)=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);await expose(frame,'#lp-color-target');await frame.locator('#lp-color-target').selectOption(target);
  const colors=await frame.locator('#lp-palette-swatches button').evaluateAll(els=>els.map(el=>el.dataset.color));expect(colors.length).toBeGreaterThan(10);
  for(const color of colors)await test.step(`${target}=${color}`,async()=>{
    const before=await frame.evaluate(()=>window.__renderAudit.frames);
    const button=frame.locator(`#lp-palette-swatches [data-color="${color}"]`);await button.click();
    await expect.poll(()=>frame.evaluate(()=>window.__renderAudit.frames)).toBeGreaterThan(before);await health(frame,`${target}=${color}`);
    expect(await frame.evaluate(target=>window.openai.widgetState.modelContent.design[target],target)).toBe(color);
    await expect(button).toHaveAttribute('aria-pressed','true');
  });
  await info.attach('swatches-checked.json',{body:JSON.stringify({target,colors}),contentType:'application/json'});
});

for(const location of ['indoor','outdoor'])for(const shape of controls.find(c=>c.design===location+'Arbor').values)test(`${location} arbor ${shape}: every dressing`,async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);await frame.locator('#lp-view').selectOption(location==='outdoor'?'ceremony':'arbor');
  await pick(frame,design(location+'Arbor'),shape);
  for(const dressing of controls.find(c=>c.design===location+'ArborDecor').values)await test.step(dressing,()=>pick(frame,design(location+'ArborDecor'),dressing));
});

for(const flower of controls.find(c=>c.design==='flowerStyle').values)test(`flower ${flower}: every arrangement`,async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);await frame.locator('#lp-view').selectOption('table');await pick(frame,design('flowerStyle'),flower);
  for(const arrangement of controls.find(c=>c.design==='arrangement').values)await test.step(arrangement,()=>pick(frame,design('arrangement'),arrangement));
});

for(const vase of controls.find(c=>c.design==='vaseStyle').values)test(`vase ${vase}: every candle style`,async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);await frame.locator('#lp-view').selectOption('table');await pick(frame,design('vaseStyle'),vase);
  for(const candle of controls.find(c=>c.design==='candleStyle').values)await test.step(candle,()=>pick(frame,design('candleStyle'),candle));
});

test('rapid themes, colors and pending numeric edits coalesce without losing the last choice',async({page},info)=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);await pick(frame,design('look'),'florist');
  const baseline=await health(frame,'Baseline'),terrain=await frame.evaluate(()=>{let id;window.__renderAudit.scene.traverse(o=>{if(o.isInstancedMesh&&o.count>10000)id=o.geometry.uuid;});return id;});
  const samples=[];
  for(let round=0;round<12;round++){
    const before=await frame.evaluate(()=>window.__renderAudit.frames);
    await frame.evaluate(round=>{
      const change=(selector,value)=>{const el=document.querySelector(selector);el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
      // Exercise real handlers in one burst, as queued clicks/picker events can
      // arrive. No awaits that give an old debounce callback a head start.
      for(let repeat=0;repeat<3;repeat++)for(const card of document.querySelectorAll('[data-look]'))card.click();
      for(const button of document.querySelectorAll('#lp-palette-swatches button'))button.click();
      change('[data-design="look"]','florist');change('[data-design="vaseCount"]',round%2?7:5);change('[data-design="look"]','custom');
      change('[data-design="flowerA"]','#642c38');change('[data-design="flowerA"]','#f4eddd');
    },round);
    await expect.poll(()=>frame.evaluate(()=>window.__renderAudit.frames)).toBeGreaterThan(before);
    const h=await health(frame,`Rapid switch ${round}`);samples.push(h);
    expect(h.frames-before,'The burst should coalesce, not render every queued click').toBeLessThan(8);
    const state=await frame.evaluate(()=>window.openai.widgetState.modelContent.design);
    expect(state.vaseCount).toBe(round%2?7:5);expect(state.flowerA).toBe('#f4eddd');expect(state.look).toBe('custom');
  }
  expect(await frame.evaluate(()=>{let id;window.__renderAudit.scene.traverse(o=>{if(o.isInstancedMesh&&o.count>10000)id=o.geometry.uuid;});return id;})).toBe(terrain);
  // Equal final recipes must settle at the same resource footprint, rather than
  // allocating another forest, texture set or geometry set on every edit.
  const equal=samples.filter((_,i)=>i%2===1);expect(Math.max(...equal.map(s=>s.geometries))-Math.min(...equal.map(s=>s.geometries))).toBeLessThan(5);
  expect(Math.max(...samples.map(s=>s.textures))).toBeLessThanOrEqual(baseline.textures+1);
  await info.attach('rapid-switch-resources.json',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
  await page.reload();await expect((await frameOf(page)).locator('#lp-loading')).toBeHidden({timeout:45_000});
  const restored=await frameOf(page);await health(restored,'Reload after rapid changes');
  expect(await restored.evaluate(()=>window.openai.widgetState.modelContent.design.vaseCount)).toBe(7);
});

test('render audit detects invalid geometry and a blank render',async({page})=>{
  const frame=await frameOf(page);await health(frame,'Valid baseline');
  const detected=await frame.evaluate(()=>{
    let geometry;window.__renderAudit.scene.traverse(o=>{if(!geometry&&o.geometry?.attributes.position)geometry=o.geometry;});
    const array=geometry.attributes.position.array,old=array[0];array[0]=NaN;return {old,uuid:geometry.uuid};
  });
  expect((await frame.evaluate(renderHealth)).errors.some(e=>e.includes('Invalid geometry'))).toBe(true);
  await frame.evaluate(({uuid,old})=>window.__renderAudit.scene.traverse(o=>{if(o.geometry?.uuid===uuid)o.geometry.attributes.position.array[0]=old;}),detected);
  await health(frame,'Geometry restored');
  const colors=await frame.evaluate(()=>{const r=window.__renderAudit.renderer;r.setClearColor('#000000',1);r.clear();return true;});expect(colors).toBe(true);
  expect((await frame.evaluate(renderHealth)).colors).toBeLessThanOrEqual(1);
});

test('conditional controls disable and re-enable with their visual dependencies',async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);
  for(const [key,off,on,dependents]of [
    ['runnerStyle','none','lace',['runnerColor','runnerWidth']],
    ['vaseStyle','none','cut',['vaseCount','vaseHeight','vaseColor','stemsPerVase']],
    ['flowerStyle','none','mixed',['flowerDensity','stemsPerVase']],
    ['napkinStyle','none','folded',['napkinColor']],
    ['glassware','none','tinted',['glassColor']],
    ['candleStyle','none','taper',['candleCount','candleHeight','candleColor']]
  ]){
    await pick(frame,design(key),off);for(const dependent of dependents)await expect(frame.locator(design(dependent))).toBeDisabled();
    await pick(frame,design(key),on);for(const dependent of dependents)await expect(frame.locator(design(dependent))).toBeEnabled();
  }
  await pick(frame,design('candleStyle'),'votive');await expect(frame.locator(design('candleHeight'))).toBeDisabled();await expect(frame.locator(design('candleHeight'))).toHaveValue('3');
  await frame.locator('#lp-view').selectOption('seat');await expose(frame,'#lp-seat-table');await frame.locator('#lp-seat-table').selectOption('couple');
  await expect(frame.locator('#lp-seat-side')).toBeDisabled();await expect(frame.locator('#lp-seat-look option[value="couple"]')).toHaveAttribute('disabled','');
  await frame.locator('#lp-seat-table').selectOption('table-1');await expect(frame.locator('#lp-seat-side')).toBeEnabled();
  await frame.locator('#lp-view').selectOption('plan');await expect(frame.locator('#lp-roof')).toBeDisabled();await health(frame,'Plan controls');
  await frame.locator('#lp-view').selectOption('tour');for(const id of ['lp-roof','lp-context','lp-action'])await expect(frame.locator('#'+id)).toBeDisabled();await health(frame,'Tour controls');
});
