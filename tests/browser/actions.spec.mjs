import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installRenderAudit, renderHealth } from './render-audit.mjs';

const groups={
  navigation:['lp-reset-camera','lp-orbit-mode','lp-walk-inside','lp-stop-motion','lp-left','lp-right','lp-in','lp-out','lp-forward','lp-backward','lp-strafe-left','lp-strafe-right','lp-resize'],
  seated:['lp-sit','lp-seat-show','lp-seat-stand','lp-seat-prev','lp-seat-next','lp-seat-recenter'],
  tour:['lp-tour-start','lp-tour-play','lp-tour-prev','lp-tour-next','lp-tour-restart','lp-tour-control','lp-tour-exit'],
  furniture:['lp-fit-guests','lp-clear-couple','lp-turn','lp-remove-table'],
  reset:['lp-reset-open','lp-reset-confirm','lp-reset-cancel','lp-undo-reset'],
  events:['lp-event-reception','lp-event-patio','lp-event-ceremony','lp-event-rehearsal'],
  patio:['lp-patio-show','lp-patio-walk'],
  versions:['lp-design-save','lp-design-restore','lp-snapshot','lp-brief','lp-undo','lp-redo'],
  tabs:['lp-tab-lounge','lp-tab-patio','lp-tab-layout','lp-tab-decor','lp-tab-ceremony','lp-tab-view','lp-tab-rentals','lp-tab-save'],
  focus:['lp-focus-table','lp-focus-arbor','lp-focus-ceremony','lp-focus-sofas'],
  rentals:['lp-rental-prev','lp-rental-next','lp-rental-export'],
  studio:['lp-table-closeup','lp-table-overview','lp-place-setting'],
  recovery:['lp-restore-render'],
  rehearsal:['lp-rehearsal-show','lp-rehearsal-walk'],
  sharing:['lp-share-create','lp-share-copy','lp-share-native','lp-share-original','lp-share-personal'],
  save:['lp-save']
};
const source=readFileSync(new URL('../../src/model.html',import.meta.url),'utf8');
const buttonIds=[...source.matchAll(/<button\b([^>]*)>/g)].map(m=>m[1].match(/\bid="([^"]+)"/)?.[1]).filter(Boolean).sort();

async function frameOf(page){await page.frameLocator('#codex-visualization').locator('#lp-canvas').waitFor({state:'attached',timeout:60_000});const frame=page.frames().find(f=>f.parentFrame()===page.mainFrame());await frame.locator('#lp-loading').waitFor({state:'hidden',timeout:60_000});return frame;}
async function healthy(frame,label){const h=await frame.evaluate(renderHealth);expect(h.errors,label).toEqual([]);expect(h.lost,label).toBe(false);expect(h.colors,label).toBeGreaterThan(3);return h;}
async function expose(frame,id){await frame.locator('#'+id).evaluate(el=>{const panel=el.closest('[role="tabpanel"]');if(panel?.hidden)document.getElementById(panel.getAttribute('aria-labelledby')).click();for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});}
async function click(frame,id,seen){await expose(frame,id);await frame.locator('#'+id).click();seen.add(id);await healthy(frame,id);}

test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit);await page.addInitScript(()=>{if(top===window)Object.defineProperty(navigator,'share',{value:async()=>{}});});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');await expect((await frameOf(page)).locator('#lp-loading')).toBeHidden({timeout:45_000});
  const frame=await frameOf(page);await frame.locator('#lp-reset-camera').click();await frame.locator('#lp-quality').evaluate(el=>{el.value='mobile';el.dispatchEvent(new Event('change',{bubbles:true}));});await frame.locator('#lp-tab-decor').click();
  expect([...new Set(Object.values(groups).flat())].sort(),'Every identified button needs an action workflow').toEqual(buttonIds);
});

for(const group of Object.keys(groups))test(`action audit: ${group}`,async({page},info)=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page),seen=new Set();const act=id=>click(frame,id,seen);
  if(group==='navigation'){
    for(const id of ['lp-reset-camera','lp-left','lp-right','lp-in','lp-out','lp-walk-inside','lp-forward','lp-backward','lp-strafe-left','lp-strafe-right','lp-stop-motion','lp-orbit-mode'])await act(id);
    await act('lp-resize');await frame.locator('#lp-resize').press('ArrowUp');await healthy(frame,'Canvas resize');
  }else if(group==='seated'){
    for(const id of ['lp-sit','lp-seat-next','lp-seat-prev','lp-seat-recenter','lp-seat-show','lp-seat-stand'])await act(id);
  }else if(group==='tour'){
    await act('lp-tour-start');await act('lp-tour-next');await act('lp-tour-prev');
    await act('lp-tour-play');await act('lp-tour-play');await act('lp-tour-restart');await act('lp-tour-control');
    await act('lp-tour-start');await act('lp-tour-exit');
  }else if(group==='furniture'){
    await act('lp-fit-guests');await act('lp-clear-couple');await expose(frame,'lp-object');await frame.locator('#lp-object').selectOption('table-1');await act('lp-turn');await act('lp-remove-table');
  }else if(group==='reset'){
    const original=await frame.evaluate(()=>window.openai.widgetState.modelContent);
    await act('lp-reset-open');await act('lp-reset-cancel');expect(await frame.evaluate(()=>window.openai.widgetState.modelContent)).toEqual(original);
    await act('lp-reset-open');await act('lp-reset-confirm');await act('lp-undo-reset');expect(await frame.evaluate(()=>window.openai.widgetState.modelContent)).toEqual(original);
  }else if(group==='rentals'){
    await act('lp-rental-next');await act('lp-rental-prev');const [download]=await Promise.all([page.waitForEvent('download'),act('lp-rental-export')]);expect(download.suggestedFilename()).toBe('wedding-rental-shortlist.csv');
  }else if(group==='recovery'){
    await frame.evaluate(()=>window.__renderAudit.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());await expect(frame.locator('#lp-recovery')).toBeVisible();
    await expose(frame,'lp-restore-render');await frame.locator('#lp-restore-render').click();seen.add('lp-restore-render');await expect(frame.locator('#lp-recovery')).toBeHidden();await healthy(frame,'Recovery action');
  }else if(group==='studio'){
    for(const id of groups.studio)await act(id);
    for(const tab of ['rentals','lounge']){await frame.locator('#lp-tab-'+tab).click();for(const category of await frame.locator('[data-category]').evaluateAll(els=>els.filter(el=>!el.hidden).map(el=>el.dataset.category))){await frame.locator(`[data-category="${category}"]`).click();await healthy(frame,'Component '+category);await expect(frame.locator('#lp-rental-category')).toHaveValue(category);}}
  }else if(group==='versions'){
    await act('lp-design-save');await frame.locator('[data-board-action="remove"]').click();await act('lp-design-restore');
    await expose(frame,'lp-guests');await frame.locator('#lp-guests').fill('80');await frame.locator('#lp-guests').press('Tab');await act('lp-undo');await act('lp-redo');
    for(const id of ['lp-snapshot','lp-brief']){const [download]=await Promise.all([page.waitForEvent('download'),act(id)]);expect(download.suggestedFilename()).toBe(id==='lp-snapshot'?'venue-design.png':'venue-planning-brief.html');}
  }else if(group==='sharing'){
    await act('lp-share-create');await expect(frame.locator('#lp-share-copy')).toBeEnabled();await act('lp-share-copy');await act('lp-share-native');const url=await frame.locator('#lp-share-url').inputValue();
    await Promise.all([page.waitForEvent('load'),page.goto(url)]);let shared=await frameOf(page);await Promise.all([page.waitForEvent('load'),shared.locator('#lp-share-original').click()]);seen.add('lp-share-original');shared=await frameOf(page);await healthy(shared,'Reload linked design');
    await Promise.all([page.waitForEvent('load'),shared.locator('#lp-share-personal').click()]);seen.add('lp-share-personal');await expect(page).not.toHaveURL(/#design=/);await healthy(await frameOf(page),'Return to personal design');
  }else if(group==='save'){
    const [download]=await Promise.all([page.waitForEvent('download'),act('lp-save')]);expect(download.suggestedFilename()).toBe('venue-pavilion-layout.json');
    const data=JSON.parse(await frame.locator('#lp-layout-json').inputValue());data.model.design.flowerA='#642c38';
    await frame.locator('#lp-load').setInputFiles({name:'layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await expect.poll(()=>frame.evaluate(()=>window.openai.widgetState.modelContent.design.flowerA)).toBe('#642c38');await healthy(frame,'Imported layout');
    await frame.locator('#lp-load').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});
    await expect(frame.locator('#lp-selection')).not.toHaveText('Saved layout loaded.');await healthy(frame,'Rejected invalid JSON');
  }else for(const id of groups[group])await act(id);
  expect([...seen].sort()).toEqual([...groups[group]].sort());
  await info.attach('actions-checked.json',{body:JSON.stringify([...seen]),contentType:'application/json'});
});

test('all look cards render, retain layout and select the matching recipe',async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page),positions=await frame.evaluate(()=>window.openai.widgetState.modelContent.positions);
  const keys=await frame.locator('[data-look]').evaluateAll(els=>els.map(el=>el.dataset.look));expect(keys.length).toBeGreaterThan(4);
  for(const key of keys){const before=await frame.evaluate(()=>window.__renderAudit.frames);await frame.locator(`[data-look="${key}"]`).click();await expect.poll(()=>frame.evaluate(()=>window.__renderAudit.frames)).toBeGreaterThan(before);await healthy(frame,key);await expect(frame.locator(`[data-look="${key}"]`)).toHaveAttribute('aria-pressed','true');}
  expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.positions)).toEqual(positions);
});

test('light, dark and narrow layouts keep rendering after option changes',async({page})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page);
  for(const width of [390,1440])for(const colorScheme of ['dark','light']){
    await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});await frame.locator('[data-look="florist"]').click();
    await expect.poll(()=>frame.evaluate(()=>window.openai.widgetState.modelContent.design.look)).toBe('florist');await healthy(frame,`${width}px ${colorScheme}`);
  }
});
