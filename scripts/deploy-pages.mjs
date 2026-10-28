import { readFile, mkdir, mkdtemp, readdir, rm, cp, stat } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { projectRoot } from './build.mjs';
import { verifyProof } from './ci-browser.mjs';

export function deploymentPlan(env, manifest) {
  if (env.CIRCLE_BRANCH !== 'main') return { skip: 'Only main publishes.' };
  if (env.CIRCLE_PULL_REQUEST || env.CIRCLE_PULL_REQUESTS) return { skip: 'Pull requests do not publish.' };
  if (!/^[0-9a-f]{40,64}$/i.test(env.CIRCLE_SHA1 || '')) throw new Error('A CircleCI source commit is required');
  if (manifest.project !== 'wedding-planner' || manifest.commit !== env.CIRCLE_SHA1) throw new Error('The artifact does not match the tested source commit');
  const repository = env.GITHUB_REPOSITORY || `${env.CIRCLE_PROJECT_USERNAME || ''}/${env.CIRCLE_PROJECT_REPONAME || ''}`;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(s => ['.', '..'].includes(s))) throw new Error('Set GITHUB_REPOSITORY to owner/repository in the deploy context');
  if (!/^(?:[a-f0-9]{2}:){15}[a-f0-9]{2}$/i.test(env.GH_PAGES_SSH_FINGERPRINT || '') || !env.SSH_AUTH_SOCK) throw new Error('The publisher needs its repository-scoped SSH key and agent');
  return { repository, commit: env.CIRCLE_SHA1, branch: 'gh-pages', fingerprint: env.GH_PAGES_SSH_FINGERPRINT };
}

async function publish() {
  const dist = join(projectRoot, 'dist');
  const manifest = JSON.parse(await readFile(join(dist, 'build-info.json'), 'utf8'));
  const plan = deploymentPlan(process.env, manifest);
  if (plan.skip) { console.log(plan.skip); return; }
  const proof = JSON.parse(await readFile(join(projectRoot, '.ci/browser-proof.json'), 'utf8'));
  verifyProof(manifest, proof);
  const html = await readFile(join(dist, 'index.html'));
  if (createHash('sha256').update(html).digest('hex') !== manifest.htmlSha256) throw new Error('Built HTML checksum does not match its manifest');
  const allowed = new Set(['index.html', '.nojekyll', 'build-info.json', 'licenses']);
  for (const entry of await readdir(dist)) if (!allowed.has(entry)) throw new Error(`Unexpected publish file: ${entry}`);
  const temp = await mkdtemp(join(tmpdir(), 'wedding-pages-'));
  try {
    const key = join(homedir(), '.ssh', `id_rsa_${plan.fingerprint.replaceAll(':', '')}`);
    await stat(key);
    const directory = join(temp, 'checkout');
    await mkdir(directory);
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: `ssh -i ${quote(key)} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes` };
    const git = (args, capture = false) => {
      const result = spawnSync('git', ['-c', 'credential.helper=', ...args], { cwd: directory, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
      if (result.status !== 0) throw new Error(`Git ${args[0]} failed${capture ? ': ' + (result.stderr || '').trim() : ''}`);
      return (result.stdout || '').trim();
    };
    git(['init', '--quiet']);
    git(['remote', 'add', 'origin', `git@github.com:${plan.repository}.git`]);
    const latestMain = () => git(['ls-remote', 'origin', 'refs/heads/main'], true).split(/\s/)[0];
    if (latestMain() !== plan.commit) { console.log('A newer main commit exists; this deployment is skipped.'); return; }
    const existing = git(['ls-remote', '--heads', 'origin', 'refs/heads/gh-pages'], true);
    if (existing) {
      git(['fetch', '--depth=1', 'origin', 'gh-pages']);
      git(['checkout', '-B', 'gh-pages', 'FETCH_HEAD']);
      let previous;
      try { previous = JSON.parse(await readFile(join(directory, 'build-info.json'), 'utf8')); } catch { /* Guard below. */ }
      if (previous?.project !== 'wedding-planner') throw new Error('Existing gh-pages branch is not owned by this site; choose a dedicated repository or migrate it explicitly');
    } else git(['checkout', '--orphan', 'gh-pages']);
    for (const entry of await readdir(directory)) if (entry !== '.git') await rm(join(directory, entry), { recursive: true, force: true });
    await cp(dist, directory, { recursive: true });
    git(['config', 'user.name', 'Wedding CircleCI']);
    git(['config', 'user.email', 'circleci@users.noreply.github.com']);
    git(['add', '--all']);
    if (!git(['diff', '--cached', '--name-only'], true)) { console.log('The published build is already current.'); return; }
    git(['commit', '-m', `Publish venue site from ${plan.commit}`]);
    if (latestMain() !== plan.commit) { console.log('Main advanced during deployment; this deployment is skipped.'); return; }
    // Fast-forward only: keep hosting history and fail safely if another publisher changed the branch.
    git(['push', 'origin', 'HEAD:refs/heads/gh-pages']);
    console.log(`Published the tested build to ${plan.repository}:gh-pages. GitHub Pages completes the hosting deployment.`);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await publish();
