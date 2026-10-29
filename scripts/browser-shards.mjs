import { controls } from './ui-controls.mjs';

export function browserInventory(report) {
  const items=[];
  function visit(suite,parents=[],top=false){
    const nested=top?[]:[...parents,suite.title].filter(Boolean);
    for(const spec of suite.specs||[]){
      const file=spec.file.replaceAll('\\','/');
      const selector=[file,...nested,spec.title].join(' › ');
      if(/[\r\n]/.test(selector)||file.startsWith('/')||file.split('/').includes('..'))throw new Error('Unsupported browser test selector');
      items.push({id:spec.id,title:spec.title,selector,projects:spec.tests.map(test=>test.projectId||''),weight:browserWeight(spec.title)});
    }
    for(const child of suite.suites||[])visit(child,nested);
  }
  for(const suite of report.suites||[])visit(suite,[],true);return items;
}
export function browserWeight(title){
  const batch=title.match(/^rental preview matrix (\d+)–(\d+):/);if(batch)return 4+(Number(batch[2])-Number(batch[1])+1)*1.5;
  const audit=title.match(/^option audit: (.+) \(/);
  if(audit){const control=controls.find(c=>c.selector===audit[1]);return 4+Math.max(1,control?.values.length||20)*1.5;}
  if(title.startsWith('every palette swatch'))return 24;
  if(title.includes('rapid themes'))return 36;
  if(title.includes('every dressing'))return 18;
  if(title.includes('every arrangement'))return 15;
  if(title.includes('every candle style'))return 18;
  return 18;
}
export function balancedBrowserShards(inventory,total){
  if(!Number.isInteger(total)||total<1||!inventory.length||new Set(inventory.map(t=>t.id)).size!==inventory.length)throw new Error('Invalid browser shard inventory');
  const shards=Array.from({length:total},()=>({weight:0,tests:[]}));
  for(const test of [...inventory].sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id))){
    if(!Number.isFinite(test.weight)||test.weight<=0||!test.selector)throw new Error('Invalid browser test weight/selector');
    let index=0;for(let i=1;i<total;i++)if(shards[i].weight<shards[index].weight)index=i;
    shards[index].tests.push(test);shards[index].weight+=test.weight;
  }
  return shards;
}
export function verifyShardSelection(actual,assigned){
  const ids=actual.map(t=>t.id).sort(),wanted=assigned.map(t=>t.id).sort();
  if(!ids.length||new Set(ids).size!==ids.length||JSON.stringify(ids)!==JSON.stringify(wanted))throw new Error('Browser test list does not exactly match its assigned shard');
}
