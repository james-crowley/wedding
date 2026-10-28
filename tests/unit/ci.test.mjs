import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { projectRoot } from '../../scripts/build.mjs';
import { SHARDS, classifyChanges, changedFiles } from '../../scripts/ci-plan.mjs';
import { specs, verifyResults, verifyProof, selectShardReceipts } from '../../scripts/ci-browser.mjs';

const collect = shard => {
  const args = [join(projectRoot, 'node_modules/playwright/cli.js'), 'test', '--list', '--reporter=json', ...shard ? [`--shard=${shard}/${SHARDS}`] : []];
  const r = spawnSync(process.execPath, args, { cwd: projectRoot, encoding: 'utf8' });assert.equal(r.status, 0, r.stderr);
  return specs(JSON.parse(r.stdout));
};
test('four native shards partition every browser test exactly once', () => {
  const all = collect(), ids = all.map(s => s.id).sort(), shards = Array.from({ length: SHARDS }, (_, i) => collect(i + 1));
  assert.ok(all.length > SHARDS);assert.ok(shards.every(tests => tests.length > 0));
  const split = shards.flatMap(tests => tests.map(s => s.id));assert.equal(new Set(split).size, ids.length);assert.deepEqual(split.sort(), ids);
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
const expected = [{ id:'one', projects:[''] },{ id:'two', projects:[''] }];
const passing = id => ({ id, title:id, tests:[{ projectId:'', expectedStatus:'passed', status:'expected', results:[{status:'passed'}] }] });
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
});

test('rerun reports use unique attempts and select one matching artifact per shard', () => {
  const manifest={commit:'a'.repeat(40),htmlSha256:'b'.repeat(64)};
  const candidate=(index,completedAt=1,change={})=>({directory:`shard-${index}-${completedAt}`,receipt:{...manifest,index,total:SHARDS,completedAt,...change}});
  const candidates=Array.from({length:SHARDS},(_,i)=>candidate(i));
  candidates.push(candidate(0,2),candidate(1,3,{htmlSha256:'wrong'}));
  const selected=selectShardReceipts(candidates,manifest);assert.equal(selected.length,SHARDS);assert.equal(selected[0].receipt.completedAt,2);assert.equal(selected[1].receipt.completedAt,1);
  assert.throws(()=>selectShardReceipts(candidates.filter(c=>c.receipt.index!==2),manifest),/Missing matching receipt/);
});
