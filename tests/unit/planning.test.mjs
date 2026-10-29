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
