import { test, expect } from '@playwright/test';
import { controls } from '../../scripts/ui-controls.mjs';
import { installRenderAudit, renderHealth } from './render-audit.mjs';

const auditControls=controls.filter(c=>c.type!=='file');
const noDraw=['#lp-walk-speed','#lp-tour-speed','#lp-color-target','#lp-rental-vendor','#lp-rental-category','#lp-rental-mode','#lp-rental-search'];

async function appFrame(page) { return page.frames().find(frame=>frame.parentFrame()===page.mainFrame()); }
async function healthy(frame,label,allowSky=false) {
  const health=await frame.evaluate(renderHealth);
  expect(health.errors,label).toEqual([]);expect(health.lost,label).toBe(false);
  expect(health.frames,label).toBeGreaterThan(0);expect(health.calls,label).toBeGreaterThan(0);
  expect(health.triangles,label).toBeGreaterThan(0);if(!allowSky)expect(health.colors,label).toBeGreaterThan(3);
  return health;
}
async function reveal(frame,selector) {
  if(/^#lp-seat-/.test(selector)&&await frame.locator('#lp-view').inputValue()!=='seat')await frame.locator('#lp-view').selectOption('seat');
  if(/^#lp-tour-/.test(selector)&&await frame.locator('#lp-view').inputValue()!=='tour')await frame.locator('#lp-view').selectOption('tour');
  if(selector==='#lp-eye'&&await frame.locator('#lp-view').inputValue()!=='walk')await frame.locator('#lp-view').selectOption('walk');
  await frame.locator(selector).evaluate(el=>{
    const panel=el.closest('[role="tabpanel"]');if(panel?.hidden)document.getElementById(panel.getAttribute('aria-labelledby')).click();
    for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  });
}
async function choose(frame,selector,value) {
  await reveal(frame,selector);
  const el=frame.locator(selector),type=await el.evaluate(el=>el.tagName==='SELECT'?'select':el.type);
  const before=await frame.evaluate(()=>window.__renderAudit.frames);
  if(type==='select')await el.selectOption(String(value));
  else if(type==='checkbox')await el.setChecked(value);
  else if(type==='color')await el.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  else {await el.fill(String(value));await el.press('Tab');}
  // Design changes are debounced for 100 ms. Wait for the actual render, not an
  // arbitrary screenshot delay or merely the changed value in the form.
  const changed=await frame.evaluate(()=>window.__renderAudit.frames)>before;
  if(!changed&&!noDraw.includes(selector)&&type!=='checkbox')await expect.poll(()=>frame.evaluate(()=>window.__renderAudit.frames),{message:`No new frame after ${selector}=${value}`}).toBeGreaterThan(before);
  await healthy(frame,`${selector}=${value}`,selector==='#lp-eye');
  if(type==='select'||type==='color'||type==='search')await expect(el).toHaveValue(String(value));
  if(type==='checkbox')await expect(el).toBeChecked({checked:value});
  if(type==='number'){
    const validity=await el.evaluate(el=>({valid:el.checkValidity(),value:Number(el.value),min:Number(el.min),max:Number(el.max)}));
    expect(validity.valid,`${selector} must display its normalized value after commit`).toBe(true);
    expect(Number.isFinite(validity.value)).toBe(true);expect(validity.value).toBeGreaterThanOrEqual(validity.min);expect(validity.value).toBeLessThanOrEqual(validity.max);
    expect(validity.value,`${selector} must apply the selected value, clamped to its declared bounds`).toBe(Math.max(validity.min,Math.min(validity.max,Number(value))));
  }
  // At 200 ft, a horizontal walking camera legitimately sees only sky. Prove
  // recovery using a known camera instead of calling that a broken renderer.
  if(selector==='#lp-eye'){await frame.locator('#lp-reset-camera').click();await healthy(frame,'Return from altitude to overview');}
}

test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');const frame=await appFrame(page);
  await expect(frame.locator('#lp-loading')).toBeHidden({timeout:45_000});await frame.locator('#lp-quality').evaluate(el=>{el.value='mobile';el.dispatchEvent(new Event('change',{bubbles:true}));});
  // Enumerate against the live DOM: newly introduced controls cannot silently
  // escape this source-derived inventory and its parameterized cases.
  const actual=await frame.locator('select,input').evaluateAll(els=>els.map(el=>el.id?'#'+el.id:`[data-design="${el.dataset.design}"]`).filter(s=>!/^#lp-table-\d+$/.test(s)).sort());
  expect(actual).toEqual(controls.map(c=>c.selector).sort());
  await healthy(frame,'Initial frame');
});

for(const control of auditControls) test(`option audit: ${control.selector} (${control.type})`,async({page},info)=>{
  test.setTimeout(8*60_000);const frame=await appFrame(page),selector=control.selector;
  if(selector.startsWith('#lp-seat-')&&selector!=='#lp-seat-table')await choose(frame,'#lp-seat-table','table-1');
  if(control.design==='napkinColor')await choose(frame,'[data-design="napkinStyle"]','folded');
  if(control.design==='glassColor')await choose(frame,'[data-design="glassware"]','tinted');
  if(selector.includes('outdoorArbor'))await frame.locator('#lp-view').selectOption('ceremony');
  if(selector.includes('indoorArbor'))await frame.locator('#lp-view').selectOption('arbor');
  if(selector.includes('sofa'))await frame.locator('#lp-view').selectOption('lounge');
  if(/^#lp-(tent|aisle|bench|deck)/.test(selector)){
    await choose(frame,'#lp-kitchen',true);await frame.locator('#lp-view').selectOption(selector.includes('tent')?'kitchen':'ceremony');
  }
  await reveal(frame,selector);
  let values=control.values;
  if(control.type==='select'){
    values=await frame.locator(selector).locator('option').evaluateAll(els=>els.map(el=>el.value));
    expect(values.length,`No live choices collected for ${selector}`).toBeGreaterThan(0);
    for(const declared of control.values)expect(values,`${selector} lost a declared choice`).toContain(declared);
  }
  // Seat selection starts on the couple's two seats; guest tables expose four.
  if(selector==='#lp-seat-place'){await choose(frame,'#lp-seat-table','table-1');values=['1','2','3','4'];}
  for(const value of values)await test.step(`${selector} → ${JSON.stringify(value)}`,()=>choose(frame,selector,value));
  await info.attach('options-checked.json',{body:JSON.stringify({selector,type:control.type,values},null,2),contentType:'application/json'});
});

test('measurements remain finite with empty dining rows and no guest tables',async({page})=>{
  test.setTimeout(8*60_000);
  const frame=await appFrame(page);await choose(frame,'#lp-measure-scope','all');
  for(const count of [64,32,0,8,96]){
    await choose(frame,'#lp-guests',count);await reveal(frame,'#lp-fit-guests');await frame.locator('#lp-fit-guests').click();
    await healthy(frame,`Fit ${count} guests with measurements`);
    expect(await frame.locator('#lp-labels').innerText()).not.toMatch(/NaN|Infinity/);
  }
});

test('all twelve generated table toggles remain reversible with measurements',async({page},info)=>{
  test.setTimeout(8*60_000);const frame=await appFrame(page);await choose(frame,'#lp-measure-scope','all');
  const checked=[];
  for(const state of [false,true])for(let table=1;table<=12;table++){
    const selector=`#lp-table-${table}`;await choose(frame,selector,state);checked.push({selector,state});
  }
  await info.attach('table-toggles.json',{body:JSON.stringify(checked),contentType:'application/json'});
});
