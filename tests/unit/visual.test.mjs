import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {makePreviewGif} from '../../scripts/visual-artifacts.mjs';
import {timedInventory,reportTimings} from '../../scripts/browser-shards.mjs';
test('historical timings change balance weights without changing test coverage',()=>{
  const cases=[{id:'a',weight:4,selector:'a'},{id:'b',weight:8,selector:'b'}];
  assert.deepEqual(timedInventory(cases,{a:20,b:NaN,c:10}),[{id:'a',weight:20,selector:'a'},cases[1]]);
  assert.equal(timedInventory(cases,{a:Infinity})[0].weight,4);assert.equal(timedInventory(cases,{a:99999})[0].weight,900);
  assert.deepEqual(reportTimings({suites:[{specs:[{id:'a',tests:[{results:[{duration:1200},{duration:800}]}]}]}]}),{a:2});
});
test('visual artifact encoder produces an animated GIF from PNG screenshots',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wedding-gif-'));
  try{const paths=[];for(const value of [60,180]){const png=new PNG({width:16,height:12});png.data.fill(value);for(let i=3;i<png.data.length;i+=4)png.data[i]=255;const path=join(dir,value+'.png');await writeFile(path,PNG.sync.write(png));paths.push(path);}
    const dest=join(dir,'preview.gif');await makePreviewGif(paths,dest);const data=await readFile(dest);assert.equal(data.subarray(0,6).toString(),'GIF89a');assert.ok(data.length>100);await assert.rejects(makePreviewGif([],dest),/needs browser frames/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
