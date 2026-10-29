import {test,expect} from '@playwright/test';
import {decodeDesign,encodeDesign} from '../../src/sharing.mjs';
import {installRenderAudit,renderHealth} from './render-audit.mjs';
test.use({video:{mode:'on',size:{width:960,height:720}}});
async function frameOf(page){await page.frameLocator('#codex-visualization').locator('#lp-canvas').waitFor({state:'attached',timeout:60_000});const f=page.frames().find(f=>f.parentFrame()===page.mainFrame());await f.locator('#lp-loading').waitFor({state:'hidden',timeout:60_000});return f;}
async function healthy(f){const h=await f.evaluate(renderHealth);expect(h.errors).toEqual([]);expect(h.lost).toBe(false);expect(h.colors).toBeGreaterThan(3);}
const state=f=>f.evaluate(()=>window.openai.widgetState);
const snapshot=s=>({model:s.modelContent,camera:s.privateContent.orbit,view:s.privateContent.view,walk:s.privateContent.walk,seat:s.privateContent.seat,tour:s.privateContent.tour,event:s.privateContent.studio.event});
async function share(f){await f.locator('#lp-share-create').click();await expect(f.locator('#lp-share-status')).toContainText(/Link (copied|ready)/);const url=await f.locator('#lp-share-url').inputValue();expect(url).toContain('/#design=1.');return url;}
async function change(f,id,value){await f.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);await healthy(f);}
test.beforeEach(async({page})=>{
  await page.addInitScript(installRenderAudit,{fullResolution:true});
  // Deterministic browser capability doubles, only in this app's outer host.
  await page.addInitScript(()=>{if(top!==window)return;Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedDesign=text;}}});Object.defineProperty(navigator,'share',{value:async data=>{window.__sharedDesign=data;}});});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('/');await healthy(await frameOf(page));
});
test('sharing: complete design, recipient edits and personal workspace stay independent',async({page},info)=>{
  test.setTimeout(6*60_000);let f=await frameOf(page);
  await f.locator('#lp-tab-decor').click();await f.locator('[data-look="florist"]').click();await change(f,'lp-layout','joined');await change(f,'lp-patio-tables','6');
  await f.locator('#lp-tab-rentals').click();await f.locator('#lp-place-setting').click();await healthy(f);
  const before=snapshot(await state(f)),url=await share(f);expect(url.length).toBeLessThan(8000);expect(await decodeDesign(new URL(url).hash.slice(8))).toEqual(before);
  await expect(f.locator('#lp-share-copy')).toBeEnabled();await f.locator('#lp-share-copy').click();expect(await page.evaluate(()=>window.__copiedDesign)).toBe(url);
  await page.screenshot({path:info.outputPath('share-design.png'),fullPage:true});
  const personal={modelContent:{schema:'venue-pavilion-v9',targetGuests:72,patioTables:2}};
  const personalKey=await page.evaluate(personal=>{localStorage.clear();const key='codex:visualization-widget-state-v2:'+JSON.stringify([location.pathname,'']);localStorage.setItem(key,JSON.stringify(personal));return key;},personal);
  await page.goto(url);f=await frameOf(page);await healthy(f);await expect(f.locator('#lp-shared-banner')).toBeVisible();
  expect(snapshot(await state(f))).toEqual(before);expect((await state(f)).privateContent.studio.boards).toEqual([]);
  await change(f,'lp-guests','80');await expect(f.locator('#lp-save-status')).toHaveText('Saved on this device');const edited=(await state(f)).modelContent;
  expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),personalKey))).toEqual(personal);
  const editedURL=await share(f);expect(editedURL).not.toBe(url);expect((await decodeDesign(new URL(editedURL).hash.slice(8))).model).toEqual(edited);
  await page.reload();f=await frameOf(page);await expect(f.locator('#lp-shared-note')).toContainText('local edits');expect((await state(f)).modelContent).toEqual(edited);
  await Promise.all([page.waitForEvent('load'),f.locator('#lp-share-original').click()]);f=await frameOf(page);expect((await state(f)).modelContent).toEqual(before.model);await healthy(f);
  await Promise.all([page.waitForEvent('load'),f.locator('#lp-share-personal').click()]);await expect(page).not.toHaveURL(/#design=/);f=await frameOf(page);expect((await state(f)).modelContent.targetGuests).toBe(72);expect((await state(f)).modelContent.patioTables).toBe(2);await expect(f.locator('#lp-shared-banner')).toBeHidden();await healthy(f);
  await page.goto(editedURL);f=await frameOf(page);expect((await state(f)).modelContent).toEqual(edited);await healthy(f);
  await info.attach('shared-design.json',{body:JSON.stringify({characters:url.length,snapshot:before},null,2),contentType:'application/json'});
});
test('sharing: saved versions, stale link guidance and device share fallback',async({page},info)=>{
  test.setTimeout(5*60_000);const f=await frameOf(page);await f.locator('#lp-tab-save').click();await f.locator('#lp-design-name').fill('Olive and ivory');await f.locator('#lp-design-save').click();const saved=snapshot(await state(f));
  await change(f,'lp-guests','64');const current=(await state(f)).modelContent;await f.locator('#lp-tab-save').click();await f.locator('[data-board-action="share"]').click();await expect(f.locator('#lp-share-status')).toContainText('Olive and ivory');const url=await f.locator('#lp-share-url').inputValue();expect(await decodeDesign(new URL(url).hash.slice(8))).toEqual(saved);expect((await state(f)).modelContent).toEqual(current);
  await f.locator('#lp-share-native').click();expect(await page.evaluate(()=>window.__sharedDesign)).toEqual({title:'Wedding design',url});
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Clipboard unavailable');};navigator.share=async()=>{throw new DOMException('Canceled','AbortError');};});
  await f.locator('#lp-share-native').click();await f.locator('#lp-share-copy').click();await expect(f.locator('#lp-share-status')).toContainText('Select and copy');await expect(f.locator('#lp-share-url')).toBeFocused();
  await share(f);await change(f,'lp-guests','88');await expect(f.locator('#lp-share-status')).toContainText('design has changed');await healthy(f);
  await info.attach('shared-saved-version.json',{body:JSON.stringify(await decodeDesign(new URL(url).hash.slice(8))),contentType:'application/json'});
});
test('sharing: invalid links recover safely and a new fragment opens the new design',async({page})=>{
  test.setTimeout(5*60_000);let f=await frameOf(page);await change(f,'lp-guests','80');await expect(f.locator('#lp-save-status')).toHaveText('Saved on this device');
  await page.goto('/#design=1.g.broken');await expect(page.locator('#share-host-notice')).toContainText('Could not open');f=await frameOf(page);expect((await state(f)).modelContent.targetGuests).toBe(80);await healthy(f);
  const token=await encodeDesign({model:{schema:'venue-pavilion-v9',targetGuests:64}});
  await Promise.all([page.waitForEvent('load'),page.evaluate(token=>{location.hash='design='+token;},token)]);f=await frameOf(page);await expect(f.locator('#lp-shared-banner')).toBeVisible();expect((await state(f)).modelContent.targetGuests).toBe(64);await healthy(f);
});
