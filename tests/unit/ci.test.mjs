import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { projectRoot } from '../../scripts/build.mjs';
import { SHARDS, classifyChanges, changedFiles } from '../../scripts/ci-plan.mjs';
import { specs, verifyResults, verifyProof, selectShardReceipts } from '../../scripts/ci-browser.mjs';
import {browserInventory,balancedBrowserShards,verifyShardSelection} from '../../scripts/browser-shards.mjs';
import { runConcurrent } from '../../scripts/check-static.mjs';

describe('CI selection and shard integrity', () => {
const collect = args => {
  const result=spawnSync(process.execPath,[join(projectRoot,'node_modules/playwright/cli.js'),'test','--list','--reporter=json',...(args||[])],{cwd:projectRoot,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
test('balanced test lists partition every browser case exactly once in the actual runner',async()=>{
  const all=browserInventory(collect()),shards=balancedBrowserShards(all,SHARDS),directory=await mkdtemp(join(tmpdir(),'wedding-shards-'));
  try{
    const selected=[];
    for(let index=0;index<SHARDS;index++){
      const list=join(directory,index+'.txt');await writeFile(list,shards[index].tests.map(test=>test.selector).join('\n')+'\n');
      const actual=specs(collect(['--test-list',list]));verifyShardSelection(actual,shards[index].tests);selected.push(...actual.map(test=>test.id));
    }
    assert.equal(new Set(selected).size,all.length);assert.deepEqual(selected.sort(),all.map(test=>test.id).sort());
    const weights=shards.map(s=>s.weight);assert.ok(Math.max(...weights)/Math.min(...weights)<1.1);
    const batches=shards.map(s=>s.tests.filter(test=>test.title.startsWith('rental preview matrix')).length);assert.ok(batches.every(n=>n>=3&&n<=6),'Heavy catalog batches must reach every worker');
    assert.deepEqual(balancedBrowserShards(all,SHARDS),shards,'Assignments must be deterministic');
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('shard selection fails closed for missing, duplicate or unexpected tests',()=>{
  const tests=[{id:'a'},{id:'b'}];assert.throws(()=>verifyShardSelection([{id:'a'}],tests),/exactly match/);
  assert.throws(()=>verifyShardSelection([{id:'a'},{id:'a'}],tests),/exactly match/);assert.throws(()=>verifyShardSelection([{id:'a'},{id:'c'}],tests),/exactly match/);
  assert.throws(()=>balancedBrowserShards([{id:'a',weight:0,selector:'x'}],2),/weight/);
});
test('documentation-only fast path is strict and fails closed without a baseline', () => {
  const classify = (files, baselineVerified = true, branch = 'main') => classifyChanges({ files, baselineVerified, branch });
  assert.equal(classify(['README.md', 'docs/layout.md']).mode, 'docs');assert.equal(classify([]).publish, false);
  for (const file of ['src/model.html', 'scripts/build.mjs', 'tests/unit/site.test.mjs', '.circleci/config.yml', 'package-lock.json', 'vendor/fonts/raleway-latin.woff2', '.gitignore', 'new-file']) {
    assert.deepEqual([classify([file]).mode, classify([file]).publish], ['full', true]);
  }
  assert.equal(classify(['README.md'], false).mode, 'full');assert.equal(classify(['src/model.html'], true, 'feature').publish, false);
});
test('comparison includes application changes earlier in a multi-commit push', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wedding-ci-plan-'));
  const git = args => { const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim(); };
  try {
    git(['init','--quiet']);git(['config','user.name','CI test']);git(['config','user.email','ci@example.invalid']);
    await writeFile(join(dir,'README.md'),'initial');git(['add','.']);git(['commit','-qm','published']);const published=git(['rev-parse','HEAD']);
    await writeFile(join(dir,'app.html'),'runtime');git(['add','.']);git(['commit','-qm','application']);
    await writeFile(join(dir,'README.md'),'documentation');git(['add','.']);git(['commit','-qm','docs']);
    const files=changedFiles(published,dir);assert.ok(files.includes('app.html'));assert.equal(classifyChanges({files,baselineVerified:true,branch:'main'}).mode,'full');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
const expected = [{ id:'one', selector:'sample.spec.mjs › one', projects:[''] },{ id:'two', selector:'sample.spec.mjs › two', projects:[''] }];
const passing = id => ({ id, file:'sample.spec.mjs', title:id, tests:[{ projectId:'', expectedStatus:'passed', status:'expected', results:[{status:'passed'}] }] });
const report = entries => ({ suites:[{specs:entries}], errors:[] });
test('merged validation rejects missing, duplicate, skipped, failed and partial-project results', () => {
  assert.equal(verifyResults(report(expected.map(t=>passing(t.id))), expected),2);
  assert.throws(()=>verifyResults(report([passing('one')]),expected),/Incomplete/);
  assert.throws(()=>verifyResults(report([passing('one'),passing('one')]),expected),/duplicate/);
  assert.throws(()=>verifyResults(report([passing('one'),passing('extra')]),expected),/Unexpected/);
  for (const status of ['skipped','failed','timedOut','interrupted']) {
    const bad=passing('two');bad.tests[0].results[0].status=status;
    assert.throws(()=>verifyResults(report([passing('one'),bad]),expected),/did not pass/);
  }
  assert.throws(()=>verifyResults(report([passing('one'),passing('two')]),[{id:'one',projects:['','firefox']},expected[1]]),/project coverage/);
  assert.throws(()=>verifyResults({...report(expected.map(t=>passing(t.id))),errors:[{message:'runner crashed'}]},expected),/runner/);
  assert.throws(()=>verifyResults(report([]),[]),/nonempty/);
  const flaky=passing('two');flaky.tests[0].status='flaky';flaky.tests[0].results=[{status:'failed'},{status:'passed'}];
  assert.throws(()=>verifyResults(report([passing('one'),flaky]),expected),/consistently/);
});
test('browser proof is bound to the current commit and built HTML', () => {
  const manifest={commit:'a'.repeat(40),htmlSha256:'b'.repeat(64)};
  const proof={status:'passed',...manifest,shards:SHARDS,testCount:13,passedCount:13};
  verifyProof(manifest,proof);
  for (const change of [{commit:'c'.repeat(40)},{htmlSha256:'d'.repeat(64)},{passedCount:12},{testCount:0},{shards:1},{status:'skipped'}]) assert.throws(()=>verifyProof(manifest,{...proof,...change}),/complete browser/);
  assert.throws(()=>verifyProof(manifest,null),/receipt/);
});
test('npm cache, single installation and test-gated artifacts are wired together', async () => {
  const c=parse(await readFile(join(projectRoot,'.circleci/config.yml'),'utf8')),build=c.jobs['build-and-unit'];
  assert.ok(build.steps.some(s=>s.restore_cache));assert.ok(build.steps.some(s=>s.save_cache?.paths.includes('~/.npm')));
  assert.match(build.steps.find(s=>s.restore_cache).restore_cache.keys[0],/checksum "package-lock.json"/);
  assert.ok(build.steps.find(s=>s.persist_to_workspace).persist_to_workspace.paths.includes('node_modules'));
  for (const name of ['browser-tests','verify-browser-tests','publish-pages']) assert.ok(!JSON.stringify(c.jobs[name]).includes('npm ci'));
  const publisher=c.jobs['publish-pages'];assert.ok(publisher.steps.findIndex(s=>s.run?.command.includes('halt-if-docs'))<publisher.steps.findIndex(s=>s.add_ssh_keys));
  assert.deepEqual(c.jobs['verify-browser-tests'].steps.find(s=>s.persist_to_workspace).persist_to_workspace.paths,['.ci/browser-proof.json']);
  assert.match(await readFile(join(projectRoot,'scripts/deploy-pages.mjs'),'utf8'),/verifyProof\(manifest, proof\)/);
  const checks=build.steps.find(s=>s.run?.command.includes('check:static'));
  assert.equal(checks.run.command,'npm run check:static -- --inventory');
  assert.ok(build.steps.indexOf(checks)<build.steps.findIndex(s=>s.persist_to_workspace));
});

test('independent checks overlap without waiting for a production build', async () => {
  const dir=await mkdtemp(join(tmpdir(),'wedding-parallel-'));
  try {
    const code="const fs=require('node:fs');fs.writeFileSync(process.argv[1],'ready');const deadline=Date.now()+5000;const timer=setInterval(()=>{if(fs.existsSync(process.argv[2]))clearInterval(timer);else if(Date.now()>deadline)process.exit(1);},10);";
    await runConcurrent([0,1].map(i=>({name:`check ${i}`,command:process.execPath,args:['-e',code,join(dir,String(i)),join(dir,String(1-i))]})),{stdio:'ignore'});
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('parallel checks propagate failures and wait for the other processes', async () => {
  const dir=await mkdtemp(join(tmpdir(),'wedding-parallel-failure-')),marker=join(dir,'finished');
  try {
    await assert.rejects(runConcurrent([
      {name:'Broken build',command:process.execPath,args:['-e','process.exit(7)']},
      {name:'Other check',command:process.execPath,args:['-e',"setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'done'),30)",marker]}
    ],{stdio:'ignore'}),/Broken build failed \(7\)/);
    assert.equal(await readFile(marker,'utf8'),'done');
    await assert.rejects(runConcurrent([{name:'Missing executable',command:join(dir,'missing')}],{stdio:'ignore'}),/Missing executable/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('rerun reports use unique attempts and select one matching artifact per shard', () => {
  const manifest={commit:'a'.repeat(40),htmlSha256:'b'.repeat(64)};
  const candidate=(index,completedAt=1,change={})=>({directory:`shard-${index}-${completedAt}`,receipt:{...manifest,index,total:SHARDS,completedAt,...change}});
  const candidates=Array.from({length:SHARDS},(_,i)=>candidate(i));
  candidates.push(candidate(0,2),candidate(1,3,{htmlSha256:'wrong'}));
  const selected=selectShardReceipts(candidates,manifest);assert.equal(selected.length,SHARDS);assert.equal(selected[0].receipt.completedAt,2);assert.equal(selected[1].receipt.completedAt,1);
  assert.throws(()=>selectShardReceipts(candidates.filter(c=>c.receipt.index!==2),manifest),/Missing matching receipt/);
});
test('unit JUnit suites use the structure required by CircleCI', () => {
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--input-type=module','--test-reporter=junit','-'],{env,input:"import {describe,it} from 'node:test';describe('sample',()=>it('passes',()=>{}));",encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/<testsuites>\s*<testsuite\b/);assert.doesNotMatch(result.stdout,/<testsuites>\s*<testcase\b/);
});

});
