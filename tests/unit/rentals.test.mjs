import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRentalLibrary,RENTAL_CATEGORIES,RENTAL_SLOTS } from '../../src/rentals.mjs';
import { controls } from '../../scripts/ui-controls.mjs';
const data=JSON.parse(readFileSync(new URL('../../data/rental-catalog.json',import.meta.url),'utf8'));
const library=createRentalLibrary(data),source=readFileSync(new URL('../../src/model.html',import.meta.url),'utf8');
const designFields=controls.filter(c=>c.design).map(c=>({dataset:{design:c.design},type:c.type,tagName:c.type==='select'?'SELECT':'INPUT',min:c.min,max:c.max,options:c.values.map(value=>({value}))}));
function productionModel(){
  const context=vm.createContext({designFields,rentalLibrary:library});
  const defaults=source.slice(source.indexOf('    const PLAN_DEFAULTS='),source.indexOf('    const COLOR_SWATCHES='));
  const numbers=source.slice(source.indexOf('    function n('),source.indexOf('    function organizeControls('));
  const normalizeDesign=source.slice(source.indexOf('    function normalizePlan('),source.indexOf('    function applyLook('));
  const normalize=source.slice(source.indexOf('    function normalize(raw)'),source.indexOf('    function normalizeOrbit('));
  vm.runInContext(defaults+numbers+normalizeDesign+normalize,context);
  return context;
}

describe('Reviewed rental catalog and supplier provenance',()=>{
  it('has source links, stable IDs, reviewed status and unit prices for both catalogs',()=>{
    assert.equal(data.coverage.listingCount,1485);assert.equal(data.items.length,data.coverage.choiceCount);
    assert.equal(new Set(data.items.map(i=>i.id)).size,data.items.length);
    assert.equal(new Set(data.items.map(i=>i.url)).size,data.coverage.listingCount);
    for(const item of data.items){
      assert.ok(item.name.trim());assert.ok(item.family.trim());assert.ok(RENTAL_CATEGORIES[item.category]);
      assert.equal(new URL(item.url).hostname,item.vendor==='classic'?'classicpartyrentalsva.com':'www.partyperfect.com');
      assert.ok(['detail-reviewed','listing-only'].includes(item.review));
      assert.ok(item.price===null||Number.isFinite(item.price)&&item.price>0);
      assert.ok(item.unit);assert.ok(item.note);
      if(item.preview){assert.ok(RENTAL_SLOTS[item.preview.slot]);assert.equal(item.review,'detail-reviewed');}
    }
    assert.equal(data.coverage.listingStatus['listing-only'],data.coverage.unavailableDetails.length);
  });
  it('every preview recipe survives the production model normalizer and retains its supplier match',()=>{
    const context=productionModel(),base=context.normalize({schema:'venue-pavilion-v9'}),counts={};
    for(const item of data.items.filter(i=>i.preview)){
      const proposed=library.apply(base,item.id),normalized=context.normalize(proposed);
      assert.equal(normalized.rentals.applied[item.preview.slot],item.id,`Normalizer lost ${item.name}`);
      assert.ok(library.matches(normalized,item),`Recipe not represented: ${item.name}`);
      assert.equal(base.rentals.shortlist.length,0,'Applying must not mutate the old layout');
      counts[item.preview.slot]=(counts[item.preview.slot]||0)+1;
    }
    for(const slot of ['cloth','runner','napkin','charger','china','flatware','glass','chair','table','sofa','bar','dance','tent','candle','arbor'])assert.ok(counts[slot]>0,`Missing ${slot}`);
  });
  it('edits remove mismatched supplier labels while preserving saved quote alternatives',()=>{
    const context=productionModel();let model=context.normalize({schema:'venue-pavilion-v9'});
    const cloth=data.items.find(i=>i.preview?.slot==='cloth'),napkin=data.items.find(i=>i.preview?.slot==='napkin');
    model=library.apply(library.apply(model,cloth.id),napkin.id);model.design.napkinColor='#010203';
    const state=library.cleanState(model.rentals,model);
    assert.equal(state.applied.cloth,cloth.id);assert.equal(state.applied.napkin,undefined);assert.ok(state.shortlist.includes(napkin.id));
    const legacy=context.normalize({schema:'venue-pavilion-v8',design:{clothColor:'#829db5',metalFinish:'silver'}});assert.equal(legacy.design.clothColor,'#829db5');assert.equal(legacy.design.chargerColor,'#c6cbd0');assert.equal(legacy.design.chargerRimColor,'#c6cbd0');assert.deepEqual(Object.keys(legacy.rentals.applied),[]);
  });
  it('rejects foreign or tampered product references and bounds/deduplicates saved state',()=>{
    const context=productionModel(),base=context.normalize({schema:'venue-pavilion-v9'});
    const state=library.cleanState({applied:{cloth:'javascript:alert(1)',__proto__:{url:'https://example.test'}},shortlist:[null,{},'unknown',...data.items.map(i=>i.id),data.items[0].id]},base);
    assert.deepEqual(state.applied,{});assert.equal(state.shortlist.length,60);assert.equal(new Set(state.shortlist).size,60);
    assert.ok(Buffer.byteLength(JSON.stringify({...base,rentals:state}))<16*1024);
  });
  it('distinguishes full-floor prices from panel prices and uses published sofa dimensions',()=>{
    const panel=data.items.find(i=>i.vendor==='classic'&&i.name==='Black & White Dance Floor, 4×4 Panel');
    const floor=data.items.find(i=>i.vendor==='party'&&i.name.endsWith("12'X12' Black/White Dance Floor"));
    assert.equal(panel.price,33.75);assert.equal(panel.unit,'panel');assert.equal(panel.preview.plan.danceWidth,undefined);
    assert.equal(floor.price,396);assert.equal(floor.unit,'listed floor');assert.equal(floor.preview.plan.danceWidth,12);assert.equal(floor.preview.plan.danceDepth,12);
    const sofa=data.items.find(i=>i.name==='ASSIL SOFA – BLUE FAUX LEATHER');assert.equal(sofa.preview.design.sofaLength,5.9167);assert.equal(sofa.preview.design.sofaDepth,2.625);assert.equal(sofa.preview.design.sofaHeight,2.3583);
    const glass=data.items.find(i=>i.name==='10 Oz Mondial Wine Glass');assert.equal(glass.preview.design.glassware,'clear');assert.equal(glass.preview.design.glassColor,'#e4ece8');
    const flute=data.items.find(i=>i.name==='6.5 Oz Mondial Champagne Flute');assert.equal(flute.preview.design.glassColor,'#e4ece8');
    const silver=data.items.find(i=>i.family==='Votives – Gold & Silver Mercury Glass'&&i.name.endsWith('Silver'));assert.equal(silver.preview.design.metalFinish,'silver');
  });
  it('filters both vendors/categories/search, references and saved products without changing the model',()=>{
    for(const category of Object.keys(RENTAL_CATEGORIES)){
      assert.ok(library.filter({category}).length>0,category);
      for(const vendor of ['classic','party'])assert.ok(library.filter({category,vendor}).every(i=>i.vendor===vendor&&i.category===category));
    }
    assert.ok(library.filter({search:'olive',mode:'preview'}).length>0);assert.equal(library.filter({search:'<script>missing</script>'}).length,0);
    const state={shortlist:[data.items[0].id]};assert.equal(library.filter({mode:'saved'},state).length,1);
    assert.ok(library.filter({mode:'preview'}).every(i=>i.preview));
  });
  it('exports attributed selections and quote-only references, with safe CSV quoting',()=>{
    const context=productionModel();let model=context.normalize({schema:'venue-pavilion-v9'});const preview=data.items.find(i=>i.preview),reference=data.items.find(i=>!i.preview);
    model=library.apply(model,preview.id);model.rentals.shortlist.push(reference.id);const csv=library.csv(model);
    assert.ok(csv.includes(data.vendors[preview.vendor].name));assert.ok(csv.includes(preview.url));assert.ok(csv.includes(reference.url));assert.ok(csv.includes('Saved for quote only'));assert.ok(csv.includes(data.reviewedAt));
    const hostile={...data,items:[{...preview,id:'unsafe',name:'=HYPERLINK("bad")'}]};const safe=createRentalLibrary(hostile);assert.ok(safe.csv({...model,rentals:{applied:{},shortlist:['unsafe']}}).includes("\"'=HYPERLINK(\"\"bad\"\")\""));
  });
});
