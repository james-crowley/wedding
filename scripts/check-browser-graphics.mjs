import {firefox} from '@playwright/test';
import {firefoxLaunch} from './browser-settings.mjs';
const browser=await firefox.launch(firefoxLaunch);
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
  await page.setContent('<!doctype html><canvas width="4" height="4"></canvas>');
  const result=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true})||canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)return{supported:false};
    gl.clearColor(.25,.5,.75,1);gl.clear(gl.COLOR_BUFFER_BIT);const rgba=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    return {supported:true,version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),pixel:[...rgba],error:gl.getError()};
  });
  console.log('Firefox graphics preflight:',JSON.stringify(result));
  if(!result.supported||result.error!==0||result.pixel.some((v,i)=>Math.abs(v-[64,128,191,255][i])>2))throw new Error('Firefox must create and draw a real WebGL context before the full test matrix');
}finally{await browser.close();}
