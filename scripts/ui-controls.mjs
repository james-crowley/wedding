import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './build.mjs';

const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
export function controlInventory(source=readFileSync(join(projectRoot,'src/model.html'),'utf8')) {
  const controls=[];
  for(const match of source.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>|<input\b([^>]*)>/g)) {
    const a=attributes(match[1]||match[3]);
    const selector=a.id?'#'+a.id:a['data-design']?`[data-design="${a['data-design']}"]`:null;
    if(!selector)throw new Error('Unidentified UI control requires an audit selector');
    const type=match[1]!==undefined?'select':a.type||'text';
    const values=type==='select'?[...match[2].matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(m=>m[1]):type==='checkbox'?[false,true,false]:type==='color'?['#000000','#ffffff','#642c38']:type==='number'?[a.min,a.max,'',String(Number(a.min)-100),String(Number(a.max)+100)].filter(v=>v!==undefined):[];
    controls.push({selector,type,values,min:a.min,max:a.max,design:a['data-design']||null});
  }
  if(new Set(controls.map(c=>c.selector)).size!==controls.length)throw new Error('Duplicate audit selector');
  return controls;
}

export const controls=controlInventory();
