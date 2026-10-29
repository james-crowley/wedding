import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { controls,controlInventory } from '../../scripts/ui-controls.mjs';

describe('UI option coverage inventory',()=>{
  it('covers every form control, including each declared choice and numeric boundaries',()=>{
    assert.ok(controls.length>=108);
    assert.deepEqual(controls.filter(c=>c.type==='file').map(c=>c.selector),['#lp-load'],'New file inputs require a dedicated import workflow');
    for(const c of controls){
      assert.ok(['select','checkbox','number','color','file','search','text'].includes(c.type),`New control type needs audit support: ${c.type}`);
      if(c.type==='number'){assert.ok(Number.isFinite(Number(c.min)));assert.ok(Number.isFinite(Number(c.max)));assert.ok(c.values.includes(''));assert.ok(c.values.includes(c.min));assert.ok(c.values.includes(c.max));}
      if(c.type==='color')assert.deepEqual(c.values,['#000000','#ffffff','#642c38']);
      if(c.type==='checkbox')assert.deepEqual(c.values,[false,true,false]);
    }
  });
  it('automatically picks up new controls/options and refuses controls without stable selectors',()=>{
    const source='<select id="new-control"><option value="one">One</option><option value="two">Two</option></select><input type="number" data-design="newField" min="0" max="10">';
    assert.deepEqual(controlInventory(source)[0].values,['one','two']);assert.equal(controlInventory(source)[1].selector,'[data-design="newField"]');
    assert.throws(()=>controlInventory('<input type="number">'),/Unidentified/);
    assert.throws(()=>controlInventory('<input id="same"><input id="same">'),/Duplicate/);
  });
});
