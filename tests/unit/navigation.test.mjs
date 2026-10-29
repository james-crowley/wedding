import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {housePlan,houseWalkSurface,houseFloorPanels} from '../../src/planning.mjs';
const planning={houseWalkSurface};

const source=readFileSync(new URL('../../src/model.html',import.meta.url),'utf8');
describe('Production walking surfaces',()=>{
  for(const rise of [1.5,3.5,20])it(`stairs connect to the upper floors and back at house rise ${rise}`,()=>{
    const context=vm.createContext({planning,config:{houseRise:rise,lakeDrop:7.5}});
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

describe('Owner-corrected house circulation',()=>{
  for(const rise of [1.5,3.5,20])it(`all three floors, cross-house catwalk and return at rise ${rise}`,()=>{
    const context=vm.createContext({planning,config:{houseRise:rise,lakeDrop:7.5}});vm.runInContext(source.slice(source.indexOf('    function gradeHeight('),source.indexOf('    function ribbon(')),context);const h=context.walkingHeight,p=housePlan(),stair=p.stair;
    let surface=rise+p.levels[0];const move=(x,z)=>{const next=h(x,z,surface);assert.ok(Math.abs(next-surface)<.8,`Continuous support at ${x},${z}: ${surface} to ${next}`);surface=next;};
    const flight=(ascending,level)=>{
      const first=ascending?stair.outerX:stair.innerX,last=ascending?stair.innerX:stair.outerX;
      for(let z=stair.startZ;z>=stair.turnZ-.6;z-=.1)move(first,z);
      const delta=last>first?.1:-.1;for(let x=first;delta>0?x<=last:x>=last;x+=delta)move(x,stair.turnZ-.6);
      for(let z=stair.turnZ-.6;z<=stair.startZ+.001;z+=.1)move(last,z);move(last,stair.startZ+.5);
      assert.ok(Math.abs(surface-(rise+p.levels[level]))<1e-8);
    };
    flight(true,1);for(let x=stair.innerX;x>=stair.outerX;x-=.1)move(x,stair.startZ+.5);flight(true,2);
    for(let x=stair.innerX;x<=20;x+=.1)move(x,-92.5);assert.ok(Math.abs(surface-(rise+p.levels[2]))<1e-8);
    for(const room of p.rooms){assert.equal(h(room.x,room.z,rise+p.levels[2]),rise+p.levels[2]);for(let z=-91.5;z<room.z;z+=.1)assert.equal(h(room.x,z,rise+p.levels[2]),rise+p.levels[2]);}
    for(let x=20;x>=stair.innerX;x-=.1)move(x,-92.5);flight(false,1);flight(false,0);
    assert.equal(h(10,-84,rise+p.levels[1]),rise+p.levels[1]);assert.equal(h(stair.outerX,-97,rise+p.levels[0]),rise+p.levels[0],'A guest underneath cannot jump onto a stair');
  });
  it('gravel grade connects up the stone entry steps onto the main floor',()=>{
    const rise=3.5,context=vm.createContext({planning,config:{houseRise:rise,lakeDrop:7.5}});vm.runInContext(source.slice(source.indexOf('    function gradeHeight('),source.indexOf('    function ribbon(')),context);let surface=rise+5.18;
    for(let z=-109.65;z<=-102.75;z+=.1){const next=context.walkingHeight(-12,z,surface);assert.ok(Math.abs(next-surface)<.8);surface=next;}assert.ok(Math.abs(surface-(rise+8.16))<1e-8);
  });
  it('the main floor has a real stairwell opening with matching walking support',()=>{
    const s=housePlan().stair.shaft,panels=houseFloorPanels();for(const p of panels){assert.ok(p.w>0&&p.d>0);assert.ok(!(p.x-p.w/2<s.x1&&p.x+p.w/2>s.x0&&p.z-p.d/2<s.z1&&p.z+p.d/2>s.z0),'Floor panels do not cover the stair shaft');}
    const area=panels.reduce((n,p)=>n+p.w*p.d,0);assert.ok(Math.abs(area-(43.5*25.5-(s.x1-s.x0)*(s.z1-s.z0)))<1e-8);
    assert.equal(houseWalkSurface(0,-93.5,18.41),18.41);assert.equal(houseWalkSurface(0,-84,18.41),8.16,'The old front-to-back walkway is no longer a floor');
  });
});

it('terrain subtraction clears the basement without a floating ground patch outside',()=>{
  class Attribute{constructor(array,size){this.array=array;this.itemSize=size;this.count=array.length/size;}getX(i){return this.array[i*this.itemSize];}getY(i){return this.array[i*this.itemSize+1];}getZ(i){return this.array[i*this.itemSize+2];}}
  class Geometry{attributes={};setAttribute(k,v){this.attributes[k]=v;}computeVertexNormals(){}}
  const context=vm.createContext({T:{BufferGeometry:Geometry,Float32BufferAttribute:Attribute}});vm.runInContext(source.slice(source.indexOf('    function houseTerrainCutout('),source.indexOf('    function surroundings(')),context);
  const g=context.houseTerrainCutout({attributes:{position:new Attribute([-50,0,-120,50,0,-120,-50,0,-50,50,0,-50],3),uv:new Attribute([0,0,1,0,0,1,1,1],2)},index:new Attribute([0,2,1,1,2,3],1)}),a=g.attributes.position.array;
  let area=0;for(let i=0;i<a.length;i+=9){const x=(a[i]+a[i+3]+a[i+6])/3,z=(a[i+2]+a[i+5]+a[i+8])/3;assert.ok(!(x>-22.13&&x<22.13&&z>-103.13&&z< -76.87),'No triangle remains in the house');area+=Math.abs((a[i+3]-a[i])*(a[i+8]-a[i+2])-(a[i+6]-a[i])*(a[i+5]-a[i+2]))/2;}
  assert.ok(Math.abs(area-(7000-44.26*26.26))<1e-7);assert.ok(a.every(Number.isFinite));
});
