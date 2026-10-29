// Shared planning geometry: the renderer, summaries and exports use the same counts.
// Dimensions here are editable/model estimates, not venue or life-safety approval.
export function rehearsalPlan(model){
  const requested=Math.max(12,Math.min(40,Math.round(Number(model.rehearsalSeats)||35)));
  const style=model.rehearsalLayout||'banquet',tables=[],seats=[];
  const capacity=style==='cafe'?24:style==='farmhouse'?32:36;
  const shown=Math.min(requested,capacity);
  if(style==='banquet'){
    for(const cx of [-13,13])for(let i=0;i<3;i++)tables.push({x:cx-6+i*6,z:-70.5,length:6,width:2.5,round:false});
    let remaining=shown;for(let row=0;row<2;row++){const count=Math.ceil(remaining/(2-row));remaining-=count;for(const side of [-1,1]){const n=side===-1?Math.ceil(count/2):Math.floor(count/2);for(let i=0;i<n;i++)seats.push({x:(row?-1:1)*-13-9+(i+.5)*18/n,z:-70.5+side*2.35,side,r:side>0?0:Math.PI});}}
  }else{
    let remaining=shown;for(const [index,x]of (style==='cafe'?[-18,-8,8,18]:[-17,-7,7,17]).entries()){
      const count=Math.ceil(remaining/(4-index));remaining-=count;
      tables.push({x,z:-70.5,length:style==='cafe'?4:8,width:style==='cafe'?4:3,round:style==='cafe'});
      for(let i=0;i<count;i++){
        if(style==='cafe'){const a=i/count*Math.PI*2;seats.push({x:x+Math.sin(a)*3.1,z:-70.5+Math.cos(a)*3.1,r:a,side:Math.cos(a)>0?1:-1});}
        else {const side=i<Math.ceil(count/2)?-1:1,n=side<0?Math.ceil(count/2):Math.floor(count/2),j=side<0?i:i-Math.ceil(count/2);seats.push({x:x-4+(j+.5)*8/n,z:-70.5+side*2.6,r:side>0?0:Math.PI,side});}
      }
    }
  }
  return {requested,shown,capacity,missing:requested-shown,tables,seats,aisle:style==='farmhouse'?6:8,style};
}
export function patioPlan(model){
  const fire={id:'fire',x:10.5,z:-68.8,w:3.6,d:8.4},services=[];
  if(model.patioGrazing)services.push({id:'grazing',x:-10,z:-75,w:8,d:2.5});
  if(model.patioGuestbook)services.push({id:'guestbook',x:-22,z:-60.8,w:4,d:2});
  if(model.patioWelcome)services.push({id:'welcome',x:22,z:-60.8,w:5,d:2.2});
  if(model.patioBar)services.push({id:'bar',x:20,z:-75,w:6,d:2.5});
  const reserved=[fire,...services],tables=[],requested=Math.max(0,Math.min(6,Math.round(Number(model.patioTables)||0)));
  for(const [x,z]of [[-20,-69.8],[-10,-69.8],[20,-69.8],[-12,-60.8],[12,-60.8],[-22,-65.7],[-22,-60.8],[22,-60.8]]){
    if(tables.length>=requested)break;
    const t={x,z,w:2.7,d:2.7};if([...reserved,...tables].some(o=>Math.abs(x-o.x)<(t.w+o.w)/2+.65&&Math.abs(z-o.z)<(t.d+o.d)/2+.65))continue;tables.push(t);
  }
  return {fire,services,tables,requested,shown:tables.length,missing:requested-tables.length,centerRoute:10};
}
export function planningFacts(model){
  const r=rehearsalPlan(model),p=patioPlan(model),tables=12-(model.disabledTables||[]).length;
  return [['Reception guests',String(model.targetGuests)],['Reception seats',String(tables*8)+' + couple'],['Reception tables',String(tables)+' · '+model.layout],['Dance floor',model.danceVisible===false?'No rented floor':model.danceWidth+' × '+model.danceDepth+' ft · '+model.dancePattern],['Napkin color',model.design.napkinColor],['Flowers',[model.design.flowerA,model.design.flowerB,model.design.flowerC].join(' / ')],['Rehearsal seats',r.shown+' / '+r.requested+' requested'],['Rehearsal layout',r.style+' · '+r.tables.length+' tables'],['Patio cocktail tables',String(model.patioEnabled?p.shown:0)],['Patio service stations',model.patioEnabled?p.services.map(s=>s.id).join(', ')||'None':'Hidden']];
}
export function cleanDesignName(value){return String(value||'').replace(/[\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,56);}
