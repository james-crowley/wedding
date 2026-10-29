import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearsalPlan,patioPlan,cleanDesignName} from '../../src/planning.mjs';
for(const [style,capacity,tables]of [['banquet',36,6],['farmhouse',32,4],['cafe',24,4]])test(`rehearsal ${style}: actual seats, limits and center route`,()=>{
  for(let requested=12;requested<=40;requested++){
    const p=rehearsalPlan({rehearsalLayout:style,rehearsalSeats:requested});assert.equal(p.seats.length,Math.min(requested,capacity));assert.equal(p.shown,p.seats.length);assert.equal(p.capacity,capacity);assert.equal(p.tables.length,tables);assert.equal(p.missing,requested-p.shown);
    for(const point of [...p.tables,...p.seats]){assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));assert.ok(Math.abs(point.x)<25);assert.ok(point.z>=-74&&point.z<=-67);}
    for(const t of p.tables)assert.ok(Math.abs(t.x)-t.length/2>=p.aisle/2);
  }
});
test('patio keeps the fixed fire island and center route clear under every service combination',()=>{
  for(let mask=0;mask<16;mask++)for(let count=0;count<=6;count++){
    const p=patioPlan({patioTables:count,patioGrazing:Boolean(mask&1),patioGuestbook:Boolean(mask&2),patioWelcome:Boolean(mask&4),patioBar:Boolean(mask&8)});
    assert.equal(p.shown,p.tables.length);assert.ok(p.shown<=count);assert.equal(p.missing,count-p.shown);assert.ok(p.fire.d>p.fire.w);assert.ok(p.fire.x-p.fire.w/2>p.centerRoute/2);
    for(const t of p.tables){assert.ok(Math.abs(t.x)-t.w/2>p.centerRoute/2);for(const o of [p.fire,...p.services,...p.tables.filter(o=>o!==t)])assert.ok(Math.abs(t.x-o.x)>=(t.w+o.w)/2+.65||Math.abs(t.z-o.z)>=(t.d+o.d)/2+.65);}
  }
});
test('version names are bounded plain text',()=>{assert.equal(cleanDesignName('  ivory  \n linen  '),'ivory linen');assert.equal(cleanDesignName('x'.repeat(100)).length,56);assert.equal(cleanDesignName('\u0000'),'');});

test('house wall holes are real openings without overlapping wall panels',async()=>{
  const {wallPanels}=await import('../../src/planning.mjs');
  const holes=[{x:0,y:4,w:6,h:8},{x:-10,y:6,w:4,h:4},{x:10,y:6,w:4,h:4}];
  const panels=wallPanels(30,12,holes);assert.ok(panels.length>4);
  assert.equal(panels.reduce((area,p)=>area+p.w*p.h,0),30*12-6*8-2*4*4);
  for(const p of panels){assert.ok(p.w>0&&p.h>0);for(const o of holes)assert.ok(Math.abs(p.x-o.x)>=(p.w+o.w)/2-1e-10||Math.abs(p.y-o.y)>=(p.h+o.h)/2-1e-10);for(const q of panels.filter(q=>q!==p))assert.ok(Math.abs(p.x-q.x)>=(p.w+q.w)/2-1e-10||Math.abs(p.y-q.y)>=(p.h+q.h)/2-1e-10);}
  assert.deepEqual(wallPanels(NaN,12,holes),[]);assert.equal(wallPanels(10,10,[{x:0,y:5,w:20,h:10}]).length,0);
});

test('house exterior defaults migrate automatic legacy cutaways and retain new explicit choices',async()=>{
  const {houseDisplayState}=await import('../../src/planning.mjs');
  for(const raw of [{},{houseCutaway:true},{houseCutaway:false},{houseDisplayVersion:'1',houseCutaway:true}])assert.deepEqual(houseDisplayState(raw),{houseDisplayVersion:1,houseCutaway:false});
  assert.deepEqual(houseDisplayState({houseDisplayVersion:1,houseCutaway:true}),{houseDisplayVersion:1,houseCutaway:true});
  assert.deepEqual(houseDisplayState({houseDisplayVersion:1,houseCutaway:false}),{houseDisplayVersion:1,houseCutaway:false});
});
test('porch screen returns close both house wings and side seams without blocking the stair door',async()=>{
  const {porchEnvelope}=await import('../../src/planning.mjs'),p=porchEnvelope();
  const covers=(x,y,z)=>p.panels.some(a=>Math.abs(x-a.x)<=a.w/2+.001&&Math.abs(y-a.y)<=a.h/2+.001&&Math.abs(z-a.z)<=a.d/2+.001);
  for(const a of p.panels)assert.ok([a.w,a.d,a.h].every(n=>n>0));
  for(const side of [-1,1])for(const y of [8.2,12,17.1]){
    for(let x=p.houseHalf;x<=p.half;x+=.1)assert.ok(covers(side*x,y,p.back),'Rear wing joins facade to side screen');
    for(let z=p.back;z<=p.front;z+=.1){const door=side<0&&Math.abs(z-p.doorZ)<p.doorWidth/2-.001&&y<p.doorTop;assert.equal(covers(side*p.half,y,z),!door,'Side screens reach the back and ceiling, except the real door opening');}
  }
  for(let x=-p.half;x<=p.half;x+=.1)assert.ok(covers(x,12,p.front),'Front screen meets both side screens');
  assert.equal(covers(-p.half,12,p.doorZ),false);assert.equal(covers(-p.half,16,p.doorZ),true);
});

test('production pitched roof points both gable faces outward',async()=>{
  const {readFileSync}=await import('node:fs'),vm=await import('node:vm');const source=readFileSync(new URL('../../src/model.html',import.meta.url),'utf8');
  class Geometry{setAttribute(name,a){this[name]=a;}computeVertexNormals(){}}
  class Attribute{constructor(array){this.array=array;}}
  class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;}}
  const context=vm.createContext({T:{BufferGeometry:Geometry,Float32BufferAttribute:Attribute,Mesh},materials:{metal:{},siding:{}},beam(){}});
  vm.runInContext(source.slice(source.indexOf('    function pitchedRoof('),source.indexOf('    function houseWall(')),context);
  const root={children:[],add(m){this.children.push(m);}},opaque={};context.pitchedRoof(root,48,31,0,26,-90,7.6,{},opaque);
  const gables=root.children.slice(-2);assert.equal(gables.length,2);
  for(const [i,g]of gables.entries()){const a=g.geometry.position.array,normalX=(a[4]-a[1])*(a[8]-a[2])-(a[5]-a[2])*(a[7]-a[1]);assert.equal(Math.sign(normalX),i===0?-1:1);assert.equal(g.material,opaque);}
});
