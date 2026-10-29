import {PNG} from 'pngjs';
import gifenc from 'gifenc';
import {readFile,writeFile} from 'node:fs/promises';
const {GIFEncoder,quantize,applyPalette}=gifenc;
// Small, deterministic GIFs from actual browser screenshots, no system codec or
// uploaded media required. PNGs and full test videos remain separate artifacts.
export async function makePreviewGif(paths,destination){
  if(!paths.length)throw new Error('A preview GIF needs browser frames');
  const gif=GIFEncoder();let size;
  for(const path of paths){const image=PNG.sync.read(await readFile(path));
    const width=Math.min(640,image.width),height=Math.round(image.height*width/image.width),rgba=new Uint8Array(width*height*4);
    if(size&&size!==width+'x'+height)throw new Error('GIF frames must have matching dimensions');size=width+'x'+height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=(Math.floor(y*image.height/height)*image.width+Math.floor(x*image.width/width))*4,dst=(y*width+x)*4;rgba.set(image.data.subarray(src,src+4),dst);}
    const palette=quantize(rgba,128),index=applyPalette(rgba,palette);gif.writeFrame(index,width,height,{palette,delay:1100,repeat:0});
  }
  gif.finish();await writeFile(destination,gif.bytes());return destination;
}
