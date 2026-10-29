import {test,expect} from '@playwright/test';
import {installRenderAudit,renderHealth} from './render-audit.mjs';
test('graphics context loss restores the saved design in lighter mode',async({page},info)=>{
  await page.addInitScript(installRenderAudit);await page.goto('/');const f=page.frames().find(f=>f.parentFrame()===page.mainFrame());await expect(f.locator('#lp-loading')).toBeHidden({timeout:45_000});
  await f.locator('#lp-reset-camera').click();
  const design=await f.evaluate(()=>window.openai.widgetState.modelContent.design);
  await f.evaluate(()=>{const extension=window.__renderAudit.renderer.getContext().getExtension('WEBGL_lose_context');if(!extension)throw new Error('Context-loss simulation unavailable');extension.loseContext();});
  await expect(f.locator('#lp-recovery')).toBeVisible();await page.screenshot({path:info.outputPath('graphics-recovery.png')});
  await f.locator('#lp-restore-render').click();await expect(f.locator('#lp-recovery')).toBeHidden({timeout:30_000});
  const h=await f.evaluate(renderHealth);expect(h.errors).toEqual([]);expect(h.lost).toBe(false);expect(h.colors).toBeGreaterThan(3);
  expect(await f.evaluate(()=>window.openai.widgetState.modelContent.design)).toEqual(design);
  expect(await f.evaluate(()=>window.openai.widgetState.privateContent.navigation.quality)).toBe('mobile');
});
