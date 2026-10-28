import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './build.mjs';

export const SHARDS = 8;
export function docsOnly(files) {
  return files.every(file => file === 'README.md' || /^docs\/.+\.md$/.test(file));
}
export function classifyChanges({ files, baselineVerified, branch }) {
  const mode = baselineVerified && docsOnly(files) ? 'docs' : 'full';
  return { mode, publish: branch === 'main' && mode === 'full', reason: !baselineVerified ? 'No verified comparison baseline; run all checks.' : mode === 'docs' ? 'Only documentation differs from the comparison baseline.' : 'Application, tests, dependencies or CI inputs changed.' };
}
export async function readPlan() {
  const plan = JSON.parse(await readFile(join(projectRoot, '.ci/plan.json'), 'utf8'));
  if (!['full', 'docs'].includes(plan.mode) || plan.shards !== SHARDS || !/^[a-f0-9]{40}$/.test(plan.commit)) throw new Error('Invalid CI plan');
  if (process.env.CIRCLE_SHA1 && plan.commit !== process.env.CIRCLE_SHA1) throw new Error('CI plan belongs to another commit');
  return plan;
}
function git(args, cwd = projectRoot) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Git ${args[0]} could not establish the comparison baseline`);
  return result.stdout;
}
export function changedFiles(base, cwd = projectRoot) {
  // NUL separation preserves whitespace in names; include both sides of renames.
  return git(['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'], cwd).split('\0').filter(Boolean);
}
async function prepare() {
  const commit = git(['rev-parse', 'HEAD']).trim(), branch = process.env.CIRCLE_BRANCH || git(['branch', '--show-current']).trim();
  if (process.env.CIRCLE_SHA1 && commit !== process.env.CIRCLE_SHA1) throw new Error('Checkout does not match the pipeline commit');
  let baseline = null, baselineVerified = false, files = [];
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') git(['fetch', '--no-tags', '--unshallow', 'origin']);
    if (branch === 'main') {
      // Compare all changes since the published source, not HEAD^: a push may
      // contain several commits, or an earlier application build may have failed.
      git(['fetch', '--no-tags', 'origin', 'refs/heads/gh-pages:refs/remotes/origin/gh-pages']);
      const published = JSON.parse(git(['show', 'origin/gh-pages:build-info.json']));
      if (published.project !== 'wedding-planner' || !/^[a-f0-9]{40}$/.test(published.commit)) throw new Error('Unknown published build');
      baseline = published.commit;
      git(['merge-base', '--is-ancestor', baseline, 'HEAD']);
    } else {
      git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
      baseline = git(['merge-base', 'HEAD', 'origin/main']).trim();
    }
    files = changedFiles(baseline);baselineVerified = true;
  } catch { /* Missing history/network/manifest must fail closed to the full suite. */ }
  const plan = { ...classifyChanges({ files, baselineVerified, branch }), commit, branch, baseline, files, shards: SHARDS };
  await mkdir(join(projectRoot, '.ci'), { recursive: true });
  await writeFile(join(projectRoot, '.ci/plan.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log(`${plan.mode}: ${plan.reason}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'prepare') await prepare();
  else if (process.argv[2] === 'halt-if-docs') {
    if ((await readPlan()).mode === 'docs') {
      console.log('Documentation-only change: browser testing and publication are unnecessary.');
      const result = spawnSync('circleci-agent', ['step', 'halt'], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error('Unable to halt documentation-only job');
    }
  } else throw new Error('Use prepare or halt-if-docs');
}
