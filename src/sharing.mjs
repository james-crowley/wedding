// Portable, versioned design links. This module is bundled into the host page;
// it never needs a server, a third-party shortener or access to the model frame.
export const SHARE_LIMITS=Object.freeze({json:128*1024,token:32000});
const ownObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function shareSnapshot(raw){
  if(!ownObject(raw)||!ownObject(raw.model)||!/^venue-pavilion-v[1-9]$|^lakeside-pavilion-v[1-9]$/.test(raw.model.schema))throw new Error('This is not a supported wedding design.');
  const snapshot={};for(const key of ['model','camera','view','walk','seat','tour','event'])if(Object.hasOwn(raw,key))snapshot[key]=raw[key];
  const json=JSON.stringify(snapshot,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw new Error('The design contains an unsupported property.');if(typeof value==='number'&&!Number.isFinite(value))throw new Error('The design contains an invalid number.');return value;});
  if(new TextEncoder().encode(json).length>SHARE_LIMITS.json)throw new Error('This design is too large for a link. Download the layout JSON instead.');
  const clean=JSON.parse(json);let nodes=0;const visit=(value,depth)=>{if(depth>32||++nodes>24000)throw new Error('The design is too complex for a link.');if(value&&typeof value==='object')for(const child of Object.values(value))visit(child,depth+1);};visit(clean,0);return clean;
}
async function boundedBytes(stream,limit){
  const reader=stream.getReader(),chunks=[];let length=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new Error('This design link exceeds the supported size.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const result=new Uint8Array(length);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
}
function base64url(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unbase64url(text){if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw new Error('The design link is incomplete.');let raw;try{raw=atob(text.replaceAll('-','+').replaceAll('_','/'));}catch{throw new Error('The design link is incomplete.');}return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export async function encodeDesign(snapshot,{compress=true}={}){
  const bytes=new TextEncoder().encode(JSON.stringify({v:1,snapshot:shareSnapshot(snapshot)}));if(bytes.length>SHARE_LIMITS.json)throw new Error('This design is too large for a share link. Download the layout JSON instead.');let mode='j',body=bytes;
  if(compress&&typeof CompressionStream==='function')try{const zipped=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),SHARE_LIMITS.json);if(zipped.length<bytes.length){body=zipped;mode='g';}}catch{/* Plain JSON is interoperable when compression is unavailable. */}
  const token='1.'+mode+'.'+base64url(body);if(token.length>SHARE_LIMITS.token)throw new Error('This design is too large for a share link. Download the layout JSON instead.');return token;
}
export async function decodeDesign(token){
  if(typeof token!=='string'||token.length>SHARE_LIMITS.token)throw new Error('This design link is too large.');
  const match=/^1\.([gj])\.([A-Za-z0-9_-]+)$/.exec(token);if(!match)throw new Error('This design link is incomplete or uses an unsupported version.');let bytes=unbase64url(match[2]);
  if(match[1]==='g'){
    if(typeof DecompressionStream!=='function')throw new Error('Open this compressed design link in a current browser.');
    try{bytes=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),SHARE_LIMITS.json);}catch{throw new Error('This design link is damaged or exceeds the supported size.');}
  }
  if(bytes.length>SHARE_LIMITS.json)throw new Error('This design link is too large.');let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('This design link is damaged.');}
  if(!ownObject(data)||data.v!==1)throw new Error('This design link uses an unsupported version.');return shareSnapshot(data.snapshot);
}
export function snapshotState(snapshot){const s=shareSnapshot(snapshot);return {modelContent:s.model,privateContent:{orbit:s.camera,view:s.view,walk:s.walk,seat:s.seat,tour:s.tour,studio:{event:s.event||'reception',boards:[],compare:[],trash:null}}};}
export function designLink(base,token){const url=new URL(base);if(!['https:','http:'].includes(url.protocol))throw new Error('Open the published website to create a shareable link.');url.search='';url.hash='design='+token;return url.href;}
export function designToken(hash){if(!hash?.startsWith('#design='))return null;const raw=hash.slice(8);try{return decodeURIComponent(raw);}catch{throw new Error('This design link is incomplete.');}}
export async function sharedStorageKey(baseKey,token){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return baseKey+':shared:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
