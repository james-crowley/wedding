import { readFile, writeFile, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { projectRoot } from './build.mjs';
import { readPlan, SHARDS } from './ci-plan.mjs';

export function specs(report) {
  return (report.suites || []).flatMap(suite => [...(suite.specs || []), ...specs(suite)]);
}
export function verifyResults(report, expected) {
  if (report.errors?.length) throw new Error('Browser runner reported errors');
  const actual = specs(report), wanted = new Set(expected.map(test => test.id)), expectedById = new Map(expected.map(test => [test.id, test]));
  if (!wanted.size || wanted.size !== expected.length) throw new Error('Expected test inventory must be nonempty and unique');
  const seen = new Set();
  for (const spec of actual) {
    if (!wanted.has(spec.id) || seen.has(spec.id)) throw new Error('Unexpected or duplicate test in merged report');
    seen.add(spec.id);
    const projects = spec.tests?.map(test => test.projectId || '').sort();
    if (JSON.stringify(projects) !== JSON.stringify([...expectedById.get(spec.id).projects].sort())) throw new Error('Incomplete project coverage');
    if (!spec.tests?.length || spec.tests.some(test => test.expectedStatus !== 'passed' || !['expected', 'flaky'].includes(test.status) || test.results?.at(-1)?.status !== 'passed')) throw new Error(`Browser test did not pass: ${spec.title}`);
  }
  if (seen.size !== wanted.size) throw new Error(`Incomplete browser coverage: ${seen.size}/${wanted.size} tests`);
  return seen.size;
}
export function selectShardReceipts(candidates, manifest, total = SHARDS) {
  return Array.from({ length: total }, (_, index) => {
    const matching = candidates.filter(c => c.receipt.index === index && c.receipt.total === total && c.receipt.commit === manifest.commit && c.receipt.htmlSha256 === manifest.htmlSha256);
    matching.sort((a,b) => b.receipt.completedAt - a.receipt.completedAt || a.directory.localeCompare(b.directory));
    if (!matching.length) throw new Error(`Missing matching receipt for shard ${index + 1}`);
    return matching[0];
  });
}
export function verifyProof(manifest, proof) {
  if (!proof || proof.status !== 'passed' || proof.commit !== manifest.commit || proof.htmlSha256 !== manifest.htmlSha256 || proof.shards !== SHARDS || !Number.isInteger(proof.testCount) || proof.testCount < 1 || proof.passedCount !== proof.testCount) throw new Error('A complete browser validation receipt for this exact artifact is required');
}
const cli = join(projectRoot, 'node_modules/playwright/cli.js');
function playwright(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: projectRoot, encoding: 'utf8', stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', env: { ...process.env, ...options.env }, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Playwright ${args[0]} failed (${result.status ?? result.error?.message})`);
  return options.capture ? JSON.parse(result.stdout) : null;
}
async function inventory() {
  const plan = await readPlan();
  const expected = plan.mode === 'docs' ? [] : specs(playwright(['test', '--list', '--reporter=json'], { capture: true })).map(({ id, title, tests }) => ({ id, title, projects: tests.map(test => test.projectId || '') }));
  if (plan.mode === 'full' && !expected.length) throw new Error('No browser tests were collected');
  await writeFile(join(projectRoot, '.ci/expected-tests.json'), JSON.stringify(expected, null, 2) + '\n');
  console.log(`Collected ${expected.length} required browser tests.`);
}
async function runShard() {
  const plan = await readPlan(), index = Number(process.env.CIRCLE_NODE_INDEX), total = Number(process.env.CIRCLE_NODE_TOTAL);
  if (plan.mode !== 'full' || !Number.isInteger(index) || index < 0 || index >= total || total !== plan.shards) throw new Error('Invalid browser shard assignment');
  // Re-runs inherit additive CircleCI workspaces. Persist only this attempt,
  // with a unique path, so parallel containers never write the same filename.
  if (process.env.CIRCLECI) await rm(join(projectRoot, 'ci-shards'), { recursive: true, force: true });
  const directory = join(projectRoot, 'ci-shards', `${index}-${randomUUID()}`);await mkdir(directory, { recursive: true });
  playwright(['test', `--shard=${index + 1}/${total}`], { env: { CI_SHARD_REPORT_DIR: join(directory, 'blob') } });
  const manifest = JSON.parse(await readFile(join(projectRoot, 'dist/build-info.json'), 'utf8'));
  if (manifest.commit !== plan.commit) throw new Error('Shard tested the wrong build');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ commit: plan.commit, htmlSha256: manifest.htmlSha256, index, total, completedAt: Date.now() }) + '\n');
}
async function merge() {
  const plan = await readPlan();
  const directory = join(projectRoot, '.ci/blobs');await rm(directory, { recursive: true, force: true });await mkdir(directory, { recursive: true });
  const manifest = JSON.parse(await readFile(join(projectRoot, 'dist/build-info.json'), 'utf8'));
  if (manifest.commit !== plan.commit) throw new Error('Merge job has the wrong build');
  const candidates = [];
  for (const entry of await readdir(join(projectRoot, 'ci-shards'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(projectRoot, 'ci-shards', entry.name);
    try { candidates.push({ directory, receipt: JSON.parse(await readFile(join(directory, 'result.json'), 'utf8')) }); } catch { /* Incomplete attempts have no successful receipt. */ }
  }
  for (const { directory: shard, receipt } of selectShardReceipts(candidates, manifest, plan.shards)) {
    const blobs = (await readdir(join(shard, 'blob'))).filter(name => name.endsWith('.zip'));
    if (blobs.length !== 1) throw new Error('Each shard must provide exactly one blob report');
    await copyFile(join(shard, 'blob', blobs[0]), join(directory, `${receipt.index}-${blobs[0]}`));
  }
  playwright(['merge-reports', '--config=playwright.merge.config.mjs', directory]);
  const report = JSON.parse(await readFile(join(projectRoot, '.ci/browser-results.json'), 'utf8'));
  const expected = JSON.parse(await readFile(join(projectRoot, '.ci/expected-tests.json'), 'utf8'));
  const passedCount = verifyResults(report, expected);
  const proof = { status: 'passed', commit: plan.commit, htmlSha256: manifest.htmlSha256, shards: plan.shards, testCount: expected.length, passedCount, inventorySha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex') };
  await writeFile(join(projectRoot, '.ci/browser-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(`Verified all ${passedCount} browser tests across ${plan.shards} shards.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const commands = { list: inventory, run: runShard, merge };
  const command = commands[process.argv[2]];if (!command) throw new Error('Use list, run or merge');await command();
}
