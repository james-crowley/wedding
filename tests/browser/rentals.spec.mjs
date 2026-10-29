import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {installRenderAudit,renderHealth} from './render-audit.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../data/rental-catalog.json',import.meta.url),'utf8'));
const previews=catalog.items.filter(item=>item.preview),batchSize=40;
async function frameOf(page){return page.frames().find(frame=>frame.parentFrame()===page.mainFrame());}
async function healthy(frame,label){const h=await frame.evaluate(renderHealth);expect(h.errors,label).toEqual([]);expect(h.lost,label).toBe(false);expect(h.calls,label).toBeGreaterThan(0);expect(h.colors,label).toBeGreaterThan(3);return h;}
async function find(frame,item){await frame.locator('#lp-rental-search').fill(item.id);await expect(frame.locator(`#lp-rental-results [data-rental-id="${item.id}"]`)).toBeVisible();}
async function apply(frame,item){await find(frame,item);await frame.locator(`[data-rental-apply="${item.id}"]`).click();await healthy(frame,item.name);expect(await frame.evaluate(slot=>window.openai.widgetState.modelContent.rentals.applied[slot],item.preview.slot)).toBe(item.id);}

test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');const frame=await frameOf(page);await expect(frame.locator('#lp-loading')).toBeHidden({timeout:45_000});await frame.locator('#lp-reset-camera').click();await frame.locator('#lp-tab-rentals').click();
});

for(let start=0;start<previews.length;start+=batchSize){
  const batch=previews.slice(start,start+batchSize);
  test(`rental preview matrix ${start+1}–${start+batch.length}: every supplier option`,async({page},info)=>{
    test.setTimeout(12*60_000);const frame=await frameOf(page),checked=[];
    // Interior option permutations retain the real model but hide outdoor
    // context during rasterization. Exterior products keep that context visible.
    const exterior=batch.some(item=>['tent','arbor'].includes(item.preview.slot));
    if(!exterior){await frame.locator('#lp-context').evaluate(el=>el.click());await healthy(frame,'Interior-only context');}
    for(const item of batch)await test.step(item.vendor+' · '+item.name,async()=>{await apply(frame,item);checked.push(item.id);});
    await info.attach('rental-options-checked.json',{body:JSON.stringify(checked),contentType:'application/json'});
  });
}

test('rental choices persist, become custom after edits, export, import and reset',async({page})=>{
  test.setTimeout(12*60_000);let frame=await frameOf(page);
  const napkin=previews.find(i=>i.vendor==='party'&&i.preview.slot==='napkin'),sofa=previews.find(i=>i.preview.slot==='sofa');
  await apply(frame,napkin);await apply(frame,sofa);
  const reference=catalog.items.find(i=>!i.preview);await find(frame,reference);await frame.locator(`[data-rental-save="${reference.id}"]`).click();
  await expect(frame.locator('#lp-rental-shortlist')).toContainText(reference.name);
  const [csv]=await Promise.all([page.waitForEvent('download'),frame.locator('#lp-rental-export').click()]);
  const csvText=readFileSync(await csv.path(),'utf8');expect(csvText).toContain(sofa.url);expect(csvText).toContain(reference.url);expect(csvText).toContain('Saved for quote only');
  await page.reload();frame=await frameOf(page);await expect(frame.locator('#lp-loading')).toBeHidden({timeout:45_000});
  expect(await frame.evaluate(()=>Object.keys(window.openai.widgetState.modelContent.rentals.applied).sort())).toEqual(['napkin','sofa']);
  await frame.locator('#lp-tab-decor').click();await frame.locator('[data-design="napkinColor"]').evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;el.value='#010203';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await healthy(frame,'Custom napkin edit');expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.applied.napkin)).toBeUndefined();
  expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.shortlist)).toContain(napkin.id);
  await frame.locator('#lp-tab-save').click();const [layout]=await Promise.all([page.waitForEvent('download'),frame.locator('#lp-save').click()]);const json=readFileSync(await layout.path(),'utf8');
  await frame.locator('#lp-reset-open').click();await frame.locator('#lp-reset-confirm').click();expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.shortlist)).toEqual([]);
  await frame.locator('#lp-undo-reset').click();expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.applied.sofa)).toBe(sofa.id);
  await frame.locator('#lp-load').setInputFiles({name:'rental-layout.json',mimeType:'application/json',buffer:Buffer.from(json)});await healthy(frame,'Imported rental selection');
  await frame.locator('#lp-tab-rentals').click();await frame.locator('[data-rental-custom="sofa"]').click();expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.applied.sofa)).toBeUndefined();
  expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.design.sofaLength)).toBe(sofa.preview.design.sofaLength);
  await frame.locator('#lp-rental-mode').selectOption('saved');await frame.locator('#lp-rental-search').fill('');await expect(frame.locator('#lp-rental-results-status')).toContainText('3 matching');
  await frame.locator('#lp-rental-results [data-rental-save]').first().click();await expect(frame.locator('#lp-rental-results-status')).toContainText('2 matching');await healthy(frame,'Reference-only list change');
});

test('supplier links open the exact product page and narrow catalog stays usable',async({page,context})=>{
  test.setTimeout(8*60_000);const frame=await frameOf(page),item=previews.find(i=>i.preview.slot==='sofa');await find(frame,item);
  // Fulfill the external destination rather than testing the vendor's uptime.
  await context.route(item.url,route=>route.fulfill({body:'<title>Vendor listing</title>'}));
  const [popup]=await Promise.all([context.waitForEvent('page'),frame.locator(`#lp-rental-results a[href="${item.url}"]`).click()]);
  await popup.waitForLoadState('domcontentloaded');expect(popup.url()).toBe(item.url);await popup.close();
  await page.setViewportSize({width:390,height:900});await expect(frame.locator('[data-rental-apply]').first()).toBeVisible();
  const overflow=await frame.locator('#lp-panel-rentals').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflow).toBe(false);await healthy(frame,'Narrow rental catalog');
});

test('mixed suppliers retain independent place settings when changing a coordinated look',async({page},info)=>{
  test.setTimeout(12*60_000);const frame=await frameOf(page);await frame.locator('#lp-context').evaluate(el=>el.click());
  const chosen=[];
  for(const slot of ['chair','china','flatware','charger','napkin','sofa']){
    const item=previews.find(i=>i.preview.slot===slot&&(slot==='napkin'?i.vendor==='party':i.vendor==='classic'));
    await apply(frame,item);chosen.push(item);
  }
  const sofa=chosen.find(i=>i.preview.slot==='sofa');
  const measured=await frame.evaluate(()=>{let object;window.__renderAudit.scene.traverse(o=>{if(o.userData.id==='sofa-1')object=o;});return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).toArray();});
  expect(measured[0]).toBeCloseTo(sofa.preview.design.sofaLength,4);expect(measured[1]).toBeCloseTo(sofa.preview.design.sofaHeight,4);expect(measured[2]).toBeCloseTo(sofa.preview.design.sofaDepth,4);
  await frame.locator('#lp-tab-decor').click();await frame.locator('[data-look="florist"]').click();await healthy(frame,'Coordinated look after supplier choices');
  const applied=await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.applied);
  for(const slot of ['chair','china','flatware','charger'])expect(applied[slot]).toBe(chosen.find(i=>i.preview.slot===slot).id);
  expect(await frame.evaluate(()=>window.openai.widgetState.modelContent.rentals.shortlist.length)).toBe(6);
  await info.attach('mixed-vendor-choices.json',{body:JSON.stringify(chosen.map(i=>({id:i.id,vendor:i.vendor,slot:i.preview.slot}))),contentType:'application/json'});
  await frame.locator('#lp-tab-rentals').click();await expect(frame.locator('#lp-rental-applied')).toContainText('Classic Party Rentals');await healthy(frame,'Attributed mixed design');
});
