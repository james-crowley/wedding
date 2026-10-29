import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

test('public research ledger has attributed sources, bounded claims and reproducible report',async()=>{
  const root=new URL('../../',import.meta.url),ledger=JSON.parse(await readFile(new URL('data/venue-research.json',root),'utf8'));
  const sources=new Set(ledger.sources.map(s=>s.id));assert.equal(sources.size,ledger.sources.length);
  for(const s of ledger.sources){const url=new URL(s.url);assert.equal(url.hostname,'www.instagram.com');assert.ok(s.observed);}
  for(const f of ledger.findings){assert.ok(['modeled','partial','open'].includes(f.status));assert.ok(f.currentModel);for(const id of f.sources)assert.ok(sources.has(id),'Missing photo source '+id);}
  const before=await readFile(new URL('src/research.html',root),'utf8');
  execFileSync(process.execPath,['scripts/research-report.mjs','--check'],{cwd:root});
  assert.equal(await readFile(new URL('src/research.html',root),'utf8'),before,'Regenerate the report after changing its ledger');
  assert.doesNotMatch(before,/photos\.app\.goo\.gl|mailto:|tel:|\/Users\//);
  assert.match(before,/photo crop without a dance floor/i);assert.match(before,/exact room dimensions/i);
});
