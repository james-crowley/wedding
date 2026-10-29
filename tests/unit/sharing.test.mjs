import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {SHARE_LIMITS,shareSnapshot,encodeDesign,decodeDesign,snapshotState,designLink,designToken,sharedStorageKey} from '../../src/sharing.mjs';
const sample=()=>({model:{schema:'venue-pavilion-v9',layout:'joined',targetGuests:88,design:{flowerA:'#642c38',flowerB:'#f4eddd',flowers:'Ivory & café roses 🌸'},positions:{'table-1':{x:3,z:6}},rentals:{applied:{china:'supplier-plate'}}},camera:{theta:.7,phi:.8,distance:70},view:'seated',walk:{active:false},seat:{table:5},tour:{active:false,index:3},event:'reception'});
const raw=data=>'1.j.'+Buffer.from(JSON.stringify(data)).toString('base64url');
test('design links round trip every shared field through gzip and JSON fallbacks',async()=>{
  for(const compress of [true,false]){const snapshot=sample(),token=await encodeDesign(snapshot,{compress});assert.match(token,compress?/^1\.g\./:/^1\.j\./);assert.deepEqual(await decodeDesign(token),snapshot);}
});
test('sharing excludes unrelated histories, boards, device settings and unknown snapshot fields',()=>{
  const snapshot=sample();assert.deepEqual(shareSnapshot({...snapshot,boards:[{name:'Private version'}],history:['old'],navigation:{quality:'mobile'},secret:'private'}),snapshot);
  const state=snapshotState(snapshot);assert.deepEqual(state.modelContent,snapshot.model);assert.deepEqual(state.privateContent.studio,{event:'reception',boards:[],compare:[],trash:null});assert.equal(state.privateContent.view,'seated');assert.deepEqual(state.privateContent.orbit,snapshot.camera);assert.equal(state.privateContent.navigation,undefined);
});
test('design codec rejects unsupported schemas, versions and malformed input',async()=>{
  for(const token of ['','1.g.a','2.j.abc','1.j.%%','1.g.YWJj','1.j._w',raw({v:2,snapshot:sample()}),raw({v:1,snapshot:{model:{schema:'venue-pavilion-v99'}}})])await assert.rejects(decodeDesign(token));
  for(const model of [null,[],{schema:'other-v9'}])assert.throws(()=>shareSnapshot({model}));
  await assert.rejects(decodeDesign('1.j.'+'A'.repeat(SHARE_LIMITS.token)));
});
test('design codec rejects dangerous properties, invalid numbers and deep objects',async()=>{
  for(const property of ['__proto__','constructor','prototype']){const snapshot=sample();snapshot.model[property]=property==='__proto__'?undefined:'bad';Object.defineProperty(snapshot.model,property,{value:'bad',enumerable:true});assert.throws(()=>shareSnapshot(snapshot));await assert.rejects(decodeDesign(raw({v:1,snapshot})));}
  assert.throws(()=>shareSnapshot({model:{schema:'venue-pavilion-v9',bad:NaN}}));
  const snapshot=sample();let child=snapshot.model;for(let i=0;i<40;i++)child=child.next={};assert.throws(()=>shareSnapshot(snapshot),/complex/);
});
test('design codec limits uncompressed input and gzip expansion',async()=>{
  const snapshot=sample();snapshot.model.large='x'.repeat(SHARE_LIMITS.json);await assert.rejects(encodeDesign(snapshot),/large/);
  const bomb='1.g.'+gzipSync(Buffer.from(JSON.stringify({v:1,snapshot}))).toString('base64url');await assert.rejects(decodeDesign(bomb),/size/);
});
test('share URLs retain the project path, remove cache queries and use fragments',()=>{
  const token='1.j.abc';const url=designLink('https://example.com/wedding/?v=release#old',token);assert.equal(url,'https://example.com/wedding/#design=1.j.abc');assert.equal(designToken(new URL(url).hash),token);assert.equal(designToken('#other'),null);assert.throws(()=>designToken('#design=%xx'));for(const base of ['file:///tmp/index.html','javascript:alert(1)'])assert.throws(()=>designLink(base,token));
});
test('shared workspace keys are stable, isolated and do not expose the raw payload',async()=>{
  const key=await sharedStorageKey('personal','first');assert.equal(key,await sharedStorageKey('personal','first'));assert.notEqual(key,await sharedStorageKey('personal','second'));assert.match(key,/^personal:shared:[a-f0-9]{64}$/);assert.ok(!key.includes('first'));
});
