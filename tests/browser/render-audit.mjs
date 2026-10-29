// Installed before the bundled Three.js script. Instrument the real renderer;
// production code does not expose a test API or replace WebGL with a mock.
export function installRenderAudit({fullResolution=false}={}) {
  let three;
  const audit=window.__renderAudit={frames:0,errors:[],renderer:null,scene:null,camera:null,pending:new Set()};
  const setTimer=window.setTimeout.bind(window),clearTimer=window.clearTimeout.bind(window);
  window.setTimeout=(fn,delay,...args)=>{
    if(delay!==100||typeof fn!=='function')return setTimer(fn,delay,...args);
    const id=setTimer(()=>{try{return fn(...args);}finally{audit.pending.delete(id);}},delay);audit.pending.add(id);return id;
  };
  window.clearTimeout=id=>{audit.pending.delete(id);clearTimer(id);};
  const consoleError=console.error.bind(console);console.error=(...args)=>{audit.errors.push(args.map(a=>typeof a==='string'?a:String(a)).join(' '));consoleError(...args);};
  window.addEventListener('error',event=>audit.errors.push(event.message));
  window.addEventListener('unhandledrejection',event=>audit.errors.push(String(event.reason?.stack||event.reason)));
  Object.defineProperty(window,'THREE',{configurable:true,get:()=>three,set(value){
    three=value;let Renderer;
    Object.defineProperty(value,'WebGLRenderer',{configurable:true,get:()=>Renderer,set(Original){
      Renderer=new Proxy(Original,{construct(Target,args){
        const renderer=Reflect.construct(Target,args),render=renderer.render.bind(renderer),setSize=renderer.setSize.bind(renderer);
        renderer.setSize=(w,h)=>{const scale=fullResolution?1:Math.min(1,480/w,320/h);return setSize(Math.round(w*scale),Math.round(h*scale),false);};
        renderer.render=(scene,camera)=>{
          // Keep real geometry, shaders and shadows; reduce raster resolution for
          // the large option matrix. The original UI suite uses full resolution.
          try { scene.traverse(o=>{if(o.isLight&&o.shadow)o.shadow.mapSize.set(256,256);});render(scene,camera);audit.frames++;audit.renderer=renderer;audit.scene=scene;audit.camera=camera; }
          catch(error){audit.errors.push(String(error.stack||error));throw error;}
        };
        return renderer;
      }});
    }});
  }});
}

export async function renderHealth() {
  const audit=window.__renderAudit,deadline=performance.now()+30_000;
  while(audit?.pending?.size&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  const r=audit?.renderer;
  if(!r)return {errors:['Renderer has not rendered'],frames:0};
  const gl=r.getContext(),issues=[...audit.errors],geometries=new Set();if(audit.pending?.size)issues.push('Refresh did not settle');
  if(![...audit.camera.matrixWorld.elements,...audit.camera.projectionMatrix.elements].every(Number.isFinite))issues.push('Invalid camera matrix');
  audit.scene.updateMatrixWorld(true);
  audit.scene.traverse(o=>{
    if(!o.matrixWorld.elements.every(Number.isFinite))issues.push(`Invalid transform: ${o.name||o.type}`);
    if(o.isInstancedMesh&&!o.instanceMatrix.array.every(Number.isFinite))issues.push('Invalid instance matrix');
    const g=o.geometry;if(!g||geometries.has(g))return;geometries.add(g);
    for(const [name,attribute] of Object.entries(g.attributes))if(!attribute.array.every(Number.isFinite))issues.push(`Invalid geometry: ${g.type}.${name}`);
    if(g.boundingSphere&&!Number.isFinite(g.boundingSphere.radius))issues.push(`Invalid bounds: ${g.type}`);
  });
  const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]>>4},${pixels[i+1]>>4},${pixels[i+2]>>4}`);
  const error=gl.getError();if(error!==gl.NO_ERROR)issues.push(`WebGL error ${error}`);
  return {errors:issues,frames:audit.frames,lost:gl.isContextLost(),calls:r.info.render.calls,triangles:r.info.render.triangles,colors:colors.size,geometries:r.info.memory.geometries,textures:r.info.memory.textures,camera:audit.camera.position.toArray()};
}
