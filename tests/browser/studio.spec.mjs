import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {installRenderAudit,renderHealth} from './render-audit.mjs';
import {makePreviewGif} from '../../scripts/visual-artifacts.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../data/rental-catalog.json',import.meta.url),'utf8'));
test.use({video:{mode:'on',size:{width:960,height:720}}});
async function frameOf(page){return page.frames().find(f=>f.parentFrame()===page.mainFrame());}
async function healthy(frame){const h=await frame.evaluate(renderHealth);expect(h.errors).toEqual([]);expect(h.lost).toBe(false);expect(h.colors).toBeGreaterThan(3);return h;}
async function capture(frame,info,name,frames){const path=info.outputPath(name+'.png');await frame.locator('#lp-canvas').screenshot({path});await info.attach(name,{path,contentType:'image/png'});frames?.push(path);}
test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit,{fullResolution:true});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');const f=await frameOf(page);await expect(f.locator('#lp-loading')).toBeHidden({timeout:60_000});await healthy(f);
});
test('studio: visible supplier plates, chargers, flatware and glassware with visual evidence',async({page},info)=>{
  test.setTimeout(8*60_000);const f=await frameOf(page),frames=[];
  await f.locator('#lp-tab-rentals').click();await f.locator('#lp-place-setting').click();await expect(f.locator('#lp-table-setting-status')).toBeVisible();await healthy(f);await capture(f,info,'01-place-settings',frames);
  for(const [category,slot,vendor]of [['china','china','classic'],['chargers','charger','party'],['flatware','flatware','classic'],['glassware','glass','party'],['napkins','napkin','party']]){
    await f.locator(`#lp-rental-components [data-category="${category}"]`).click();
    const item=catalog.items.find(i=>i.vendor===vendor&&i.preview?.slot===slot);
    await f.locator('#lp-rental-search').fill(item.id);await f.locator(`[data-rental-apply="${item.id}"]`).click();await healthy(f);
    expect(await f.evaluate(slot=>window.openai.widgetState.modelContent.rentals.applied[slot],slot)).toBe(item.id);
    await expect(f.locator('#lp-rental-applied')).toContainText(item.name);
    await capture(f,info,'02-'+slot,frames);
  }
  const names=await f.evaluate(()=>{const names=[];window.__renderAudit.scene.traverse(o=>{if(o.name)names.push(o.name);});return names;});
  expect(names.some(n=>n.includes('Rental china'))).toBe(true);expect(names.some(n=>n.includes('Rental cutlery'))).toBe(true);
  const overflow=await f.locator('#venue-pavilion-3d').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflow).toBe(false);
  const gif=info.outputPath('table-settings.gif');await makePreviewGif(frames,gif);await info.attach('Table settings comparison',{path:gif,contentType:'image/gif'});
  await page.screenshot({path:info.outputPath('studio-interface.png'),fullPage:true});
});
test('studio: repeated phone styling, photo looks and material-only updates remain stable',async({page},info)=>{
  test.setTimeout(8*60_000);const f=await frameOf(page),frames=[];
  await f.locator('#lp-tab-decor').click();
  for(const id of ['blueGarden','samanthaRyan','cassidyAustin']){
    await f.locator(`[data-photo-look="${id}"][data-part="all"]`).click();await healthy(f);await capture(f,info,id,frames);
  }
  const baseline=await healthy(f),before=await f.evaluate(()=>{let id;window.__renderAudit.scene.traverse(o=>{if(o.name==='Rental china')id=o.uuid;});return id;});
  for(let i=0;i<30;i++){
    await f.locator('[data-design="flowerA"]').evaluate((el,i)=>{el.value=['#f4eddd','#642c38','#829db5'][i%3];el.dispatchEvent(new Event('change',{bubbles:true}));},i);await healthy(f);
  }
  expect(await f.evaluate(()=>{let id;window.__renderAudit.scene.traverse(o=>{if(o.name==='Rental china')id=o.uuid;});return id;})).toBe(before);
  const after=await healthy(f);expect(after.geometries).toBeLessThanOrEqual(baseline.geometries+5);expect(after.textures).toBeLessThanOrEqual(baseline.textures+2);
  await info.attach('render-resource-budget.json',{body:JSON.stringify({baseline,after,notes:'Color edits retain furniture geometry; full-resolution browser render.'},null,2),contentType:'application/json'});
  await f.locator('[data-photo-look="cassidyAustin"][data-part="ceremony"]').click();await healthy(f);await capture(f,info,'ceremony-pedestals',frames);
  const stands=await f.evaluate(()=>{let count=0;window.__renderAudit.scene.traverse(o=>{if(o.name==='Ceremony pedestal')count++;});return count;});expect(stands).toBe(2);
  await f.evaluate(()=>{const color=document.querySelector('[data-design="flowerA"]'),vases=document.querySelector('[data-design="vaseCount"]');for(let i=0;i<45;i++){color.value=['#f4eddd','#642c38','#829db5'][i%3];color.dispatchEvent(new Event('change',{bubbles:true}));vases.value=String(i%8);vases.dispatchEvent(new Event('input',{bubbles:true}));vases.dispatchEvent(new Event('change',{bubbles:true}));}});await healthy(f);
  expect(await f.evaluate(()=>window.openai.widgetState.modelContent.design.vaseCount)).toBe(4);
  const gif=info.outputPath('wedding-looks.gif');await makePreviewGif(frames,gif);await info.attach('Photo-inspired looks',{path:gif,contentType:'image/gif'});
});
