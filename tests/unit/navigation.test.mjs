import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../src/model.html',import.meta.url),'utf8');
describe('Production walking surfaces',()=>{
  for(const rise of [1.5,3.5,20])it(`stairs connect to the upper floors and back at house rise ${rise}`,()=>{
    const context=vm.createContext({config:{houseRise:rise,lakeDrop:7.5}});
    vm.runInContext(source.slice(source.indexOf('    function gradeHeight('),source.indexOf('    function ribbon(')),context);
    const height=context.walkingHeight;let surface=height(-34.4,-60);
    for(let z=-60;z>=-67;z-=.25)surface=height(-34.4,z,surface);
    assert.equal(surface,rise+4);surface=height(-32,-70,surface);
    for(let x=-32;x<=-24;x+=.25)surface=height(x,-70,surface);
    assert.equal(surface,rise+8.05);
    for(const x of [-24,-10,0,10,24])assert.equal(height(x,-70,surface),rise+8.05);
    assert.equal(height(0,-90,surface),rise+8.16);
    for(let x=-24;x>=-32;x-=.25)surface=height(x,-70,surface);
    assert.equal(surface,rise+4);
    for(let z=-67;z<=-60;z+=.25)surface=height(-34.4,z,surface);
    assert.equal(surface,rise);
    assert.equal(height(0,-70,rise),rise,'Walking underneath must not teleport upstairs');
    assert.equal(height(0,-70),rise,'Old saves without a support height remain ground-level');
  });
});

function keyboardHarness(){
  let now=1000,next=0;const frames=new Map(),listeners=new Map();
  const window={addEventListener:(type,fn)=>listeners.set(type,fn)};
  const context=vm.createContext({window,document:{hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn)},performance:{now:()=>now},navigation:{speed:8},activeView:'walk',walk:{x:0,z:0,y:5.5,yaw:0,pitch:0},
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
    n:(v,d,lo,hi)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):d,draw:()=>{},saveState:()=>{},selectionText:()=>{},pauseTour:()=>{},$:()=>({value:''})});
  // Run the production handlers and walkTick, not a reimplementation of sprint.
  vm.runInContext(source.slice(source.indexOf('    function moveWalker('),source.indexOf('    const tourOption='))+'\nglobalThis.stop=stopWalking;',context);
  const event=(type,key,extra={})=>listeners.get(type)({key,target:{tagName:'BODY'},preventDefault(){},...extra});
  return {context,event,advance:ms=>{now+=ms;},tick:()=>{now+=50;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(now);},frames,
    emit:type=>listeners.get(type)(),distance:()=>Math.hypot(context.walk.x,context.walk.z)};
}

describe('Production keyboard movement and sprint',()=>{
  for(const key of ['w','ArrowUp'])for(const mode of ['walk','double-tap','autorepeat','late-second-tap','shift','double-tap-and-shift'])it(`${key}: ${mode}`,()=>{
    const h=keyboardHarness();h.event('keydown',key);
    if(mode.startsWith('double-tap')){h.advance(50);h.event('keyup',key);h.advance(50);h.event('keydown',key,{shiftKey:mode.endsWith('shift')});}
    if(mode==='late-second-tap'){h.advance(50);h.event('keyup',key);h.advance(301);h.event('keydown',key);}
    if(mode==='autorepeat'){h.advance(50);h.event('keydown',key,{repeat:true});}
    if(mode==='shift')h.event('keydown','Shift');
    for(let i=0;i<10;i++)h.tick();
    const boosted=['double-tap','shift','double-tap-and-shift'].includes(mode);assert.ok(Math.abs(h.distance()-(boosted?8:4))<1e-8);
    h.event('keyup',key);const released=h.distance();h.tick();assert.equal(h.distance(),released);
  });
  for(const stop of ['Escape','blur','visibilitychange'])it(`${stop} clears walking and sprint`,()=>{
    const h=keyboardHarness();h.event('keydown','w');h.advance(40);h.event('keyup','w');h.advance(40);h.event('keydown','w');h.tick();
    if(stop==='Escape')h.event('keydown','Escape');else{if(stop==='visibilitychange')h.context.document.hidden=true;h.emit(stop);}
    assert.equal(h.frames.size,0);const stopped=h.distance();h.tick();assert.equal(h.distance(),stopped);
    h.context.document.hidden=false;h.advance(40);h.event('keydown','w');h.tick();assert.ok(Math.abs(h.distance()-stopped-.4)<1e-8,'New movement must not inherit sprint');
  });
  it('a missing keyup expires instead of walking forever',()=>{
    const h=keyboardHarness();h.event('keydown','w');h.tick();const stopped=h.distance();h.advance(1200);h.tick();assert.equal(h.distance(),stopped);assert.equal(h.frames.size,0);
  });
  it('typing in form fields does not move the camera',()=>{
    const h=keyboardHarness();h.event('keydown','w',{target:{tagName:'INPUT'}});h.tick();assert.equal(h.distance(),0);
  });
});
