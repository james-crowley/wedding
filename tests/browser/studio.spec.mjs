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
  await f.locator('#lp-tab-rentals').click();
  for(let i=0;i<30;i++){
    await f.locator('[data-design="flowerA"]').evaluate((el,i)=>{el.value=['#f4eddd','#642c38','#829db5'][i%3];el.dispatchEvent(new Event('change',{bubbles:true}));},i);await healthy(f);
  }
  expect(await f.evaluate(()=>{let id;window.__renderAudit.scene.traverse(o=>{if(o.name==='Rental china')id=o.uuid;});return id;})).toBe(before);
  const after=await healthy(f);expect(after.geometries).toBeLessThanOrEqual(baseline.geometries+5);expect(after.textures).toBeLessThanOrEqual(baseline.textures+2);
  await info.attach('render-resource-budget.json',{body:JSON.stringify({baseline,after,notes:'Color edits retain furniture geometry; full-resolution browser render.'},null,2),contentType:'application/json'});
  const tableColors=await f.evaluate(()=>{const d=window.openai.widgetState.modelContent.design;return[d.flowerA,d.flowerB,d.flowerC];});
  await f.locator('#lp-tab-decor').click();await f.locator('[data-photo-look="cassidyAustin"][data-part="ceremony"]').click();await healthy(f);await capture(f,info,'ceremony-pedestals',frames);
  const stands=await f.evaluate(()=>{let count=0;window.__renderAudit.scene.traverse(o=>{if(o.name==='Ceremony pedestal')count++;});return count;});expect(stands).toBe(2);expect(await f.evaluate(()=>{const d=window.openai.widgetState.modelContent.design;return[d.flowerA,d.flowerB,d.flowerC];})).toEqual(tableColors);
  await f.evaluate(()=>{const color=document.querySelector('[data-design="flowerA"]'),vases=document.querySelector('[data-design="vaseCount"]');for(let i=0;i<45;i++){color.value=['#f4eddd','#642c38','#829db5'][i%3];color.dispatchEvent(new Event('change',{bubbles:true}));vases.value=String(i%8);vases.dispatchEvent(new Event('input',{bubbles:true}));vases.dispatchEvent(new Event('change',{bubbles:true}));}});await healthy(f);
  expect(await f.evaluate(()=>window.openai.widgetState.modelContent.design.vaseCount)).toBe(4);
  const gif=info.outputPath('wedding-looks.gif');await makePreviewGif(frames,gif);await info.attach('Photo-inspired looks',{path:gif,contentType:'image/gif'});
});

test('studio: rehearsal porch seats, buffet trays, bar and saved walkthrough',async({page},info)=>{
  test.setTimeout(8*60_000);const f=await frameOf(page);
  await f.locator('#lp-event-rehearsal').click();await healthy(f);
  await expect(f.locator('#lp-view')).toHaveValue('rehearsal');
  const counts=()=>f.evaluate(()=>{const counts={seats:0,tables:0,trays:0,bar:0};window.__renderAudit.scene.traverse(o=>{if(o.userData.rehearsalSeat)counts.seats++;if(o.name==='Rehearsal banquet table')counts.tables++;if(o.name==='Buffet serving tray')counts.trays++;if(o.name==='Rehearsal bartending station')counts.bar++;});return counts;});
  expect(await counts()).toEqual({seats:35,tables:6,trays:3,bar:1});
  expect(await f.evaluate(()=>window.__renderAudit.scene.getObjectByName('Porch ceiling').visible)).toBe(false);
  await capture(f,info,'rehearsal-35-porch');
  for(const seats of [30,32,35]){
    await f.locator('#lp-rehearsal-seats').fill(String(seats));await f.locator('#lp-rehearsal-seats').press('Tab');await healthy(f);expect((await counts()).seats).toBe(seats);
  }
  // Real chair positions prove the center route and porch edges stay clear.
  const bounds=await f.evaluate(()=>{const points=[];window.__renderAudit.scene.updateMatrixWorld(true);window.__renderAudit.scene.traverse(o=>{if(o.userData.rehearsalSeat)points.push(o.children[0].getWorldPosition(new THREE.Vector3()).toArray());});return points;});
  expect(bounds.length).toBe(35);for(const [x,,z]of bounds){expect(Math.abs(x)).toBeGreaterThanOrEqual(5);expect(Math.abs(x)).toBeLessThanOrEqual(22);expect(z).toBeGreaterThan(-75);expect(z).toBeLessThan(-66);}
  await f.locator('#lp-view').selectOption('rehearsalSeat');await healthy(f);await capture(f,info,'rehearsal-seated');expect(await f.evaluate(()=>window.__renderAudit.scene.getObjectByName('Porch ceiling').visible)).toBe(true);
  await f.locator('#lp-view').selectOption('rehearsalBuffet');await healthy(f);await capture(f,info,'rehearsal-buffet-bar');
  async function stationVisible(view,name,p){await f.locator('#lp-view').selectOption(view);await healthy(f);const sightlines=await f.evaluate(({name,p})=>{
    const {scene,camera}=window.__renderAudit;scene.updateMatrixWorld(true);
    return [[name,p]].map(([name,p])=>{
      const group=scene.getObjectByName(name),point=group.localToWorld(new THREE.Vector3(...p)),projected=point.clone().project(camera),ray=new THREE.Raycaster(camera.position,point.clone().sub(camera.position).normalize());
      const hits=ray.intersectObjects(scene.children,true).filter(hit=>{let o=hit.object;while(o){if(!o.visible)return false;o=o.parent;}const m=hit.object.material;return hit.object.isMesh&&!hit.object.isLine&&!hit.object.isHelper&&m&&!Array.isArray(m)&&!(m.transparent&&m.opacity<.8);});
      const first=hits[0];let owner=first?.object,visible=false;while(owner){if(owner===group)visible=true;owner=owner.parent;}
      return {name,inFrame:Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95&&projected.z<1,visible,first:first?.object.name};
    });
  },{name,p});for(const sight of sightlines){expect(sight.inFrame,JSON.stringify(sight)).toBe(true);expect(sight.visible,JSON.stringify(sight)).toBe(true);}}
  await stationVisible('rehearsalBuffet','Rehearsal tray buffet',[-4,2.8,0]);
  await stationVisible('rehearsalBar','Rehearsal bartending station',[0,3.57,0]);await capture(f,info,'rehearsal-bar');

  await f.locator('#lp-rehearsal-bar').uncheck();await f.locator('#lp-rehearsal-buffet').uncheck();await healthy(f);expect(await counts()).toEqual({seats:35,tables:6,trays:0,bar:0});
  await f.locator('#lp-rehearsal-bar').check();await f.locator('#lp-rehearsal-buffet').check();await healthy(f);
  await f.locator('#lp-rehearsal-walk').click();const h=await healthy(f);expect(h.camera[1]).toBeCloseTo(17.05,1);expect(h.camera[2]).toBeCloseTo(-66,1);
  await f.locator('#lp-canvas').focus();await page.keyboard.press('w');await healthy(f);
  const stored=await f.evaluate(()=>window.openai.widgetState.modelContent);expect(stored.rehearsal).toBe(true);expect(stored.rehearsalSeats).toBe(35);
  await page.reload();const reloaded=await frameOf(page);await expect(reloaded.locator('#lp-loading')).toBeHidden();await healthy(reloaded);expect(await reloaded.evaluate(()=>window.openai.widgetState.modelContent.rehearsal)).toBe(true);
});

test('studio: resizable inspector, canonical controls and patio equipment',async({page},info)=>{
  test.setTimeout(8*60_000);const f=await frameOf(page),width=page.viewportSize().width;
  if(width>1100){
    const divider=f.locator('#lp-divider');await divider.focus();await divider.press('ArrowLeft');await expect(divider).toHaveAttribute('aria-valuenow','460');
    const bounds=await divider.boundingBox();await page.mouse.move(bounds.x+8,bounds.y+40);await page.mouse.down();await page.mouse.move(bounds.x-100,bounds.y+40,{steps:6});await page.mouse.up();expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(500);
  }else await expect(f.locator('#lp-divider')).toBeHidden();
  await f.locator('#lp-tab-rentals').click();expect(await f.locator('[data-design="napkinColor"]').evaluate(el=>el.closest('[role=tabpanel]').id)).toBe('lp-panel-rentals');
  await f.locator('#lp-tab-lounge').click();expect(await f.locator('[data-design="sofaStyle"]').evaluate(el=>el.closest('[role=tabpanel]').id)).toBe('lp-panel-lounge');expect(await f.locator('#lp-dance-pattern').evaluate(el=>el.closest('[role=tabpanel]').id)).toBe('lp-panel-lounge');
  await f.locator('#lp-tab-layout').click();await f.locator('#lp-tab-layout').focus();await f.locator('#lp-tab-layout').press('ArrowRight');await expect(f.locator('#lp-tab-rentals')).toBeFocused();await expect(f.locator('#lp-tab-rentals')).toHaveAttribute('aria-selected','true');
  await f.locator('#lp-event-patio').click();await healthy(f);
  const parts=await f.evaluate(()=>{const names=[];window.__renderAudit.scene.traverse(o=>{if(o.name.startsWith('Patio ')||o.name==='Venue fire table')names.push(o.name);});return names;});expect(parts.filter(n=>n==='Patio cocktail table')).toHaveLength(4);for(const n of ['Patio grazing','Patio guestbook','Patio welcome','Patio bar','Venue fire table'])expect(parts).toContain(n);
  await f.locator('#lp-patio-table-style').selectOption('fitted');await f.locator('#lp-patio-decor').selectOption('both');await f.locator('#lp-patio-guides').check();await healthy(f);await capture(f,info,'cocktail-patio');
  const piers=await f.evaluate(()=>{const points=[];window.__renderAudit.scene.traverse(o=>{if(o.name==='Patio support pier')points.push(o.position.x);});return points;});expect(piers).toHaveLength(6);expect(piers.every(x=>Math.abs(x)>=6)).toBe(true);
  const fire=await f.evaluate(()=>{const o=window.__renderAudit.scene.getObjectByName('Venue fire table'),b=new THREE.Box3().setFromObject(o),s=b.getSize(new THREE.Vector3());return {minX:b.min.x,w:s.x,d:s.z};});expect(fire.d).toBeGreaterThan(fire.w);expect(fire.minX).toBeGreaterThan(5);
  const fireSight=await f.evaluate(()=>{const {scene,camera}=window.__renderAudit;scene.updateMatrixWorld(true);const group=scene.getObjectByName('Venue fire table'),point=group.localToWorld(new THREE.Vector3(0,2.9,0)),projected=point.clone().project(camera),ray=new THREE.Raycaster(camera.position,point.clone().sub(camera.position).normalize());const hits=ray.intersectObjects(scene.children,true).filter(hit=>{let o=hit.object;while(o){if(!o.visible)return false;o=o.parent;}const m=hit.object.material;return hit.object.isMesh&&m&&!Array.isArray(m)&&!(m.transparent&&m.opacity<.8);});let owner=hits[0]?.object,visible=false;while(owner){if(owner===group)visible=true;owner=owner.parent;}return {inFrame:Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95&&projected.z<1,visible,first:hits[0]?.object.name};});expect(fireSight.inFrame,JSON.stringify(fireSight)).toBe(true);expect(fireSight.visible,JSON.stringify(fireSight)).toBe(true);

  await f.locator('#lp-patio-bar').uncheck();await healthy(f);expect(await f.evaluate(()=>Boolean(window.__renderAudit.scene.getObjectByName('Patio bar')))).toBe(false);
  await f.locator('#lp-event-rehearsal').click();await f.locator('#lp-rehearsal-layout').selectOption('cafe');await healthy(f);await expect(f.locator('#lp-rehearsal-status')).toContainText('24 seats shown / 35 requested');
  await f.locator('#lp-rehearsal-layout').selectOption('farmhouse');await healthy(f);await expect(f.locator('#lp-rehearsal-status')).toContainText('32 seats shown / 35 requested');await f.locator('#lp-rehearsal-layout').selectOption('banquet');await healthy(f);
  const before=await f.evaluate(()=>window.openai.widgetState.privateContent.navigation.editorWidth);await page.reload();const next=await frameOf(page);await expect(next.locator('#lp-loading')).toBeHidden();await healthy(next);expect(await next.evaluate(()=>window.openai.widgetState.privateContent.navigation.editorWidth)).toBe(before);
  await page.screenshot({path:info.outputPath('refined-workspace.png'),fullPage:true});
});
test('studio: undo, compare versions, safe exports and persistence across release URLs',async({page},info)=>{
  test.setTimeout(8*60_000);const f=await frameOf(page);
  await f.locator('#lp-tab-save').click();await f.locator('#lp-design-name').fill('Ivory <garden>');await f.locator('#lp-design-save').click();
  await f.locator('#lp-event-patio').click();await f.locator('#lp-patio-tables').fill('6');await f.locator('#lp-patio-tables').press('Tab');await healthy(f);await f.locator('#lp-undo').click();await healthy(f);expect(await f.evaluate(()=>window.openai.widgetState.modelContent.patioTables)).toBe(4);await f.locator('#lp-redo').click();await healthy(f);expect(await f.evaluate(()=>window.openai.widgetState.modelContent.patioTables)).toBe(6);
  await f.locator('#lp-tab-save').click();await f.locator('#lp-design-name').fill('More mingling');await f.locator('#lp-design-save').click();await expect(f.locator('.lp-version-card')).toHaveCount(2);
  for(let i=0;i<2;i++)await f.locator('[data-board-action="compare"]').nth(i).click();await expect(f.locator('.lp-compare-table .lp-different')).not.toHaveCount(0);
  await f.locator('[data-board-action="load"]').first().click();await healthy(f);expect(await f.evaluate(()=>window.openai.widgetState.modelContent.patioTables)).toBe(4);
  await f.locator('[data-board-action="remove"]').first().click();await expect(f.locator('.lp-version-card')).toHaveCount(1);await f.locator('#lp-design-restore').click();await expect(f.locator('.lp-version-card')).toHaveCount(2);
  for(let i=0;i<4;i++)await f.locator('#lp-design-save').click();await expect(f.locator('.lp-version-card')).toHaveCount(6);await f.locator('#lp-design-save').click();await expect(f.locator('#lp-design-status')).toContainText('Six versions');
  for(const [id,name]of [['lp-snapshot','venue-design.png'],['lp-brief','venue-planning-brief.html']]){const [download]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),f.locator('#'+id).click()]);expect(download.suggestedFilename()).toBe(name);const path=await download.path();const bytes=readFileSync(path);if(id==='lp-snapshot')expect(bytes.subarray(1,4).toString()).toBe('PNG');else{expect(bytes.toString()).toContain('Ivory &lt;garden&gt;');expect(bytes.toString()).not.toContain('<script>');}await info.attach(name,{path,contentType:id==='lp-snapshot'?'image/png':'text/html'});}
  await expect(f.locator('#lp-save-status')).toHaveText('Saved on this device');await page.goto('/?v=next-release');const next=await frameOf(page);await expect(next.locator('#lp-loading')).toBeHidden();expect(await next.evaluate(()=>window.openai.widgetState.privateContent.studio.boards.length)).toBe(6);await healthy(next);
});


test('studio: photographed banquet reconstruction changes space while table-only keeps it',async({page},info)=>{
  const f=await frameOf(page);await f.locator('#lp-tab-decor').click();
  const initial=await f.evaluate(()=>window.openai.widgetState.modelContent.layout);
  await f.locator('[data-photo-look="greeneryBanquet"][data-part="tables"]').click();await healthy(f);
  expect(await f.evaluate(()=>window.openai.widgetState.modelContent.layout)).toBe(initial);
  await f.locator('[data-photo-look="greeneryBanquet"][data-part="layout"]').click();await healthy(f);
  const config=await f.evaluate(()=>window.openai.widgetState.modelContent);expect(config.layout).toBe('joined');expect(config.entryDisplay).toBe('both');expect(config.ceilingDecor).toBe('greenery');
  const names=await f.evaluate(()=>{const out=[];window.__renderAudit.scene.traverse(o=>{if(o.name)out.push(o.name);});return out;});
  expect(names).toContain('Framed mirror seating chart');expect(names).toContain('Welcome photo and card table');
  await capture(f,info,'photo-inspired-banquet');
  await f.locator('#lp-tab-save').click();
  const [layout]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),f.locator('#lp-save').click()]);
  const json=JSON.parse(readFileSync(await layout.path(),'utf8'));expect(json.model.layout).toBe('joined');
  await f.locator('#lp-tab-rentals').click();
  const [csv]=await Promise.all([page.waitForEvent('download',{timeout:30_000}),f.locator('#lp-rental-export').click()]);expect(csv.suggestedFilename()).toBe('wedding-rental-shortlist.csv');
});


test('studio: recovers a prior-release browser save without discarding its legacy entry',async({page})=>{
  await page.addInitScript(()=>{if(window.top!==window)return;const canonical='codex:visualization-widget-state-v2:'+JSON.stringify([location.pathname,'']);localStorage.removeItem(canonical);const old='codex:visualization-widget-state-v2:'+JSON.stringify([location.pathname,'?v=previous-release']);localStorage.setItem(old,JSON.stringify({modelContent:{schema:'venue-pavilion-v9',patioTables:3,targetGuests:88}}));});
  await page.goto('/?v=migration-check');const f=await frameOf(page);await expect(f.locator('#lp-loading')).toBeHidden();await healthy(f);
  expect(await f.evaluate(()=>window.openai.widgetState.modelContent.patioTables)).toBe(3);expect(await f.evaluate(()=>window.openai.widgetState.modelContent.targetGuests)).toBe(88);
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('?v=previous-release')))).toBe(true);
});
