import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot} from '../../scripts/build.mjs';
import {browserInventory,reportTimings,reportedCases} from '../../scripts/browser-shards.mjs';
import {verifyResults} from '../../scripts/ci-browser.mjs';

test('real Playwright blob merge retains every browser project with a shared test title',async()=>{
  const directory=await mkdtemp(join(projectRoot,'.build-check-report-'));
  await mkdir(join(projectRoot,'test-results'),{recursive:true});const sentinel=join(projectRoot,'test-results','report-isolation-'+process.pid+'.txt');await writeFile(sentinel,'preserve');
  const cli=join(projectRoot,'node_modules/playwright/cli.js');
  const run=(args,env={})=>{const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8',env:{...process.env,...env},maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return result.stdout;};
  try{
    await mkdir(join(directory,'tests'));await mkdir(join(directory,'blobs'));
    await writeFile(join(directory,'tests/shared.spec.mjs'),"import {test,expect} from '@playwright/test';test('shared title',()=>expect(2+2).toBe(4));\n");
    const config=join(directory,'config.mjs'),merged=join(directory,'merged.json');
    await writeFile(config,`export default {testDir:'./tests',outputDir:${JSON.stringify(join(directory,'run-results'))},workers:1,projects:[{name:'chromium'},{name:'firefox'},{name:'webkit'}],reporter:[['blob',{outputFile:process.env.TEST_BLOB_FILE}]]};\n`);
    const expected=browserInventory(JSON.parse(run(['test','--config',config,'--list','--reporter=json'])));assert.equal(expected.length,3);
    for(const project of ['chromium','firefox','webkit'])run(['test','--config',config,'--project',project],{TEST_BLOB_FILE:join(directory,'blobs',project+'.zip')});
    const mergeConfig=join(directory,'merge.mjs');await writeFile(mergeConfig,`export default {testDir:'./tests',reporter:[['json',{outputFile:${JSON.stringify(merged)}}]]};\n`);
    run(['merge-reports','--config',mergeConfig,join(directory,'blobs')]);
    const report=JSON.parse(await readFile(merged,'utf8'));assert.deepEqual(reportedCases(report).map(row=>row.selector).sort(),expected.map(row=>row.selector).sort());
    assert.equal(verifyResults(report,expected),3);
    const times=reportTimings(report);assert.ok(Object.keys(times).every(key=>key.startsWith('[')));
    const incomplete=structuredClone(report),spec=incomplete.suites[0].specs[0];spec.tests.pop();assert.throws(()=>verifyResults(incomplete,expected),/Incomplete/);
    const duplicate=structuredClone(report);duplicate.suites[0].specs[0].tests.push(duplicate.suites[0].specs[0].tests[0]);assert.throws(()=>verifyResults(duplicate,expected),/duplicate/);
    const renamed=structuredClone(report);renamed.suites[0].specs[0].tests[0].projectName='unknown-browser';assert.throws(()=>verifyResults(renamed,expected),/Unexpected/);
    const wrongId=structuredClone(report);wrongId.suites[0].specs[0].id='unknown-test-id';assert.throws(()=>verifyResults(wrongId,expected),/Unexpected/);
    assert.equal(await readFile(sentinel,'utf8'),'preserve','Nested Playwright checks must preserve the outer JUnit and browser artifacts');
  }finally{await rm(sentinel,{force:true});await rm(directory,{recursive:true,force:true});}
});
