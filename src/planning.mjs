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

// Non-overlapping rectangles tessellate the solid wall around door/window holes.
// Openings use wall-local centers; clipping also handles holes at a wall edge.
export function wallPanels(width,height,openings=[]){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return [];
  const holes=openings.filter(o=>[o.x,o.y,o.w,o.h].every(Number.isFinite)&&o.w>0&&o.h>0).map(o=>({left:Math.max(-width/2,o.x-o.w/2),right:Math.min(width/2,o.x+o.w/2),bottom:Math.max(0,o.y-o.h/2),top:Math.min(height,o.y+o.h/2)})).filter(o=>o.left<o.right&&o.bottom<o.top);
  const xs=[...new Set([-width/2,width/2,...holes.flatMap(o=>[o.left,o.right])])].sort((a,b)=>a-b),ys=[...new Set([0,height,...holes.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b),panels=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const x=(xs[i-1]+xs[i])/2,y=(ys[j-1]+ys[j])/2;
    if(!holes.some(o=>x>o.left&&x<o.right&&y>o.bottom&&y<o.top))panels.push({x,y,w:xs[i]-xs[i-1],h:ys[j]-ys[j-1]});
  }return panels;
}

// Right/left use a person inside the house facing the lake (+Z). Their right
// is -X. Locations follow the owner's orientation correction; sizes are estimates.
const HOUSE_PLAN={levels:[.055,8.16,18.41],stair:{outerX:-19.35,innerX:-15.95,width:3.1,startZ:-93.5,turnZ:-100.25,shaft:{x0:-21,x1:-14.3,z0:-102.75,z1:-93.5}},bridge:{x0:-20.5,x1:20.5,z:-93.5,depth:4},rooms:[{id:'bridal',x:-12,z:-84.2,w:17,d:12},{id:'guest',x:13,z:-83.7,w:17,d:11}]};
export function housePlan(){return HOUSE_PLAN;}
export function houseFloorPanels(){
  const s=HOUSE_PLAN.stair.shaft;
  return [{x:(-21.75+s.x0)/2,z:-90,w:s.x0+21.75,d:25.5},{x:(s.x1+21.75)/2,z:-90,w:21.75-s.x1,d:25.5},{x:(s.x0+s.x1)/2,z:(s.z1-77.25)/2,w:s.x1-s.x0,d:-77.25-s.z1}];
}
export function houseWalkSurface(x,z,previous=-100){
  if(Math.abs(x)>21.75||z< -102.75||z> -77.25)return null;
  const p=HOUSE_PLAN,s=p.stair,b=p.bridge,inside=(x0,x1,z0,z1)=>x>=x0-.001&&x<=x1+.001&&z>=z0-.001&&z<=z1+.001;
  const candidates=[p.levels[0]],stairs=[];
  if(!inside(s.shaft.x0,s.shaft.x1,s.shaft.z0,s.shaft.z1-.001))candidates.push(p.levels[1]);
  const bridge=inside(s.shaft.x1,b.x1,b.z-b.depth/2,b.z+b.depth/2)||inside(b.x0,s.shaft.x1,b.z,b.z+b.depth/2);
  const rooms=p.rooms.some(r=>inside(r.x-r.w/2,r.x+r.w/2,r.z-r.d/2,r.z+r.d/2)||inside(r.x-1.7,r.x+1.7,b.z+b.depth/2,r.z-r.d/2));
  if(bridge||rooms)candidates.push(p.levels[2]);
  for(let level=0;level<2;level++){
    const bottom=p.levels[level],top=p.levels[level+1],mid=(bottom+top)/2;
    if(inside(s.outerX-s.width/2,s.outerX+s.width/2,s.turnZ,s.startZ))stairs.push(bottom+(mid-bottom)*(s.startZ-z)/(s.startZ-s.turnZ));
    if(inside(s.innerX-s.width/2,s.innerX+s.width/2,s.turnZ,s.startZ))stairs.push(mid+(top-mid)*(z-s.turnZ)/(s.startZ-s.turnZ));
    if(inside(s.shaft.x0,s.shaft.x1,s.turnZ-2.5,s.turnZ))stairs.push(mid);
  }
  const stair=stairs.filter(y=>Math.abs(y-previous)<=1.15).sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous));if(stair.length)return stair[0];
  const near=candidates.filter(y=>Math.abs(y-previous)<=1.15).sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous));
  return near[0]??Math.max(...candidates.filter(y=>y<=previous+.8),p.levels[0]);
}

// Older builds could enable houseCutaway as a side effect of a camera preset.
// Migrate that legacy state once; subsequent explicit cutaway choices persist.
export function houseDisplayState(raw={}){
  return {houseDisplayVersion:1,houseCutaway:raw.houseDisplayVersion===1&&raw.houseCutaway===true};
}
export function porchEnvelope(){
  const half=24.6,houseHalf=22,back=-77,front=-64.7,bottom=8.1,top=17.15,doorZ=-70,doorWidth=3.8,doorTop=15.75;
  const panels=[],add=(id,x,z,w,d,y0=bottom,y1=top)=>panels.push({id,x,z,w,d,y:(y0+y1)/2,h:y1-y0});
  add('front',0,front,half*2,.035);
  add('far side',half,(back+front)/2,.035,front-back);
  add('stair side rear',-half,(back+doorZ-doorWidth/2)/2,.035,doorZ-doorWidth/2-back);
  add('stair side front',-half,(doorZ+doorWidth/2+front)/2,.035,front-doorZ-doorWidth/2);
  add('screen door header',-half,doorZ,.035,doorWidth,doorTop,top);
  for(const side of [-1,1])add(side<0?'stair-side return':'far-side return',side*(houseHalf+half)/2,back,half-houseHalf,.035);
  return {half,houseHalf,back,front,bottom,top,doorZ,doorWidth,doorTop,panels};
}
