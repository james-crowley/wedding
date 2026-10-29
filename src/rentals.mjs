// Supplier facts are bundled at build time. All appearance recipes are our
// schematic interpretations, not manufacturer models or a live availability feed.
export const RENTAL_CATEGORIES = {
  linens:'Tablecloths',napkins:'Napkins',runners:'Table runners',chargers:'Chargers',
  china:'China',flatware:'Flatware',glassware:'Glassware',chairs:'Chairs',tables:'Tables',
  lounge:'Lounge furniture',bars:'Bars',dance:'Dance floors',tents:'Tents',
  accessories:'Vases, candles & accessories',lighting:'Lighting',catering:'Catering & service',other:'Other rentals'
};
export const RENTAL_SLOTS = {
  cloth:'Dining tablecloths',napkin:'Dining napkins',runner:'Dining runners',charger:'Dining chargers',
  china:'Dinner plates',flatware:'Flatware pattern',glass:'Dining glassware',chair:'Pavilion dining chairs',
  table:'Guest tables',sofa:'Four lounge sofas',bar:'Bar',dance:'Dance floor finish',tent:'Catering tent',
  vase:'Table vases',candle:'Table candle holders',arbor:'Ceremony arbor',lighting:'Pavilion lights'
};
export function createRentalLibrary(data) {
  const items=data.items,byId=new Map(items.map(item=>[item.id,item]));
  const get=id=>byId.get(id);
  const matches=(model,item)=>Boolean(item?.preview)&&
    Object.entries(item.preview.design||{}).every(([k,v])=>model.design?.[k]===v)&&
    Object.entries(item.preview.plan||{}).every(([k,v])=>model[k]===v);
  function cleanState(raw,model) {
    const applied={};
    for(const slot of Object.keys(RENTAL_SLOTS)){
      const item=get(raw?.applied?.[slot]);
      if(item?.preview?.slot===slot&&matches(model,item))applied[slot]=item.id;
    }
    const shortlist=Array.isArray(raw?.shortlist)?[...new Set(raw.shortlist.filter(id=>get(id)))].slice(0,60):[];
    return {applied,shortlist};
  }
  function apply(model,id) {
    const item=get(id);if(!item?.preview)return model;
    const recipe=item.preview;
    const next={...model,...recipe.plan,design:{...model.design,...recipe.design,look:'custom'}};
    const state=cleanState(model.rentals,next);
    state.applied[recipe.slot]=id;
    if(!state.shortlist.includes(id)&&state.shortlist.length<60)state.shortlist.push(id);
    next.rentals=state;return next;
  }
  function filter({vendor='all',category='all',mode='all',search=''}={},state={}) {
    const tokens=String(search).toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(item=>(vendor==='all'||item.vendor===vendor)&&
      (category==='all'||item.category===category)&&
      (mode!=='preview'||item.preview)&&(mode!=='saved'||state.shortlist?.includes(item.id))&&
      tokens.every(token=>(item.id+' '+item.name+' '+item.family+' '+(RENTAL_CATEGORIES[item.category]||'')+' '+data.vendors[item.vendor].name).toLowerCase().includes(token)));
  }
  const price=item=>Number.isFinite(item.price)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.price)+(item.unit?' / '+item.unit:''):'Ask vendor for pricing';
  function csv(model) {
    const state=cleanState(model.rentals,model),ids=[...new Set([...Object.values(state.applied),...state.shortlist])];
    const cell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';
    const rows=[['Vendor','Category','Product / option','Published unit price (USD)','Unit / basis','Use in model','Product URL','Reviewed','Notes']];
    for(const id of ids){const item=get(id),slot=Object.keys(state.applied).find(s=>state.applied[s]===id);
      rows.push([data.vendors[item.vendor].name,RENTAL_CATEGORIES[item.category],item.name,item.price??'',item.unit||'Ask vendor',slot?RENTAL_SLOTS[slot]:'Saved for quote only',item.url,data.reviewedAt,item.note||'']);
    }
    return rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  return {data,items,get,matches,cleanState,apply,filter,price,csv,categories:RENTAL_CATEGORIES,slots:RENTAL_SLOTS};
}
