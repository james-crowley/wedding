import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { parse } from 'yaml';
import { build, projectRoot, escapeAttribute } from '../../scripts/build.mjs';
import { deploymentPlan } from '../../scripts/deploy-pages.mjs';
import { SHARDS } from '../../scripts/ci-plan.mjs';

describe('Site and deployment invariants', () => {
test('portable build is deterministic, bundled and checksummed', async () => {
  const temp = await mkdtemp(join(projectRoot, '.build-check-'));
  try {
    const first = await build({ outDir: join(temp, 'first'), commit: 'a'.repeat(40) });
    const second = await build({ outDir: join(temp, 'second'), commit: 'a'.repeat(40) });
    const html = await readFile(join(first.outDir, 'index.html'), 'utf8');
    assert.deepEqual(first.manifest, second.manifest);
    assert.equal(first.manifest.htmlSha256, createHash('sha256').update(html).digest('hex'));
    assert.ok(html.startsWith('<!doctype html>'));
    assert.match(html, /data:font\/woff2;base64,/);
    assert.match(html, /SIL OPEN FONT LICENSE/);
    assert.match(html, /allow-scripts allow-downloads/);
    assert.match(html, /Lakeside Estate/);
    assert.doesNotMatch(html, /__VENUE_MODEL__|__THREE_BUNDLE__|__FRAME_HTML__|\/(?:Users|home)\/[^/]+\//);
    assert.ok((await stat(join(first.outDir, 'licenses/THREE-LICENSE.txt'))).size > 100);
    await stat(join(first.outDir, '.nojekyll'));
    for (const name of ['raleway-latin', 'allura-wordmark']) {
      await stat(join(first.outDir, 'licenses', name + '-OFL.txt'));
      const font = await readFile(join(projectRoot, 'vendor/fonts', name + '.woff2'));
      assert.equal(font.subarray(0, 4).toString(), 'wOF2');
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('attribute escaping protects the embedded document', () => assert.equal(escapeAttribute('<&">'), '&lt;&amp;&quot;&gt;'));

test('public model keeps private details out and only links reviewed public design references', async () => {
  const source = await readFile(join(projectRoot, 'src/model.html'), 'utf8');
  assert.match(source, /<h2>Lakeside Estate<\/h2>/);
  assert.match(source, /schema:'venue-pavilion-v9'/);
  assert.doesNotMatch(source, /mailto:|tel:|photos\.app\.goo\.gl|maps\.google|google\.com\/maps/i);
  const allowed=new Set(['https://www.instagram.com/p/DaDmZZuDDGm/','https://www.instagram.com/p/DX5Ex2xHPo4/','https://www.instagram.com/p/DW2F0vlEsh9/']);
  for(const [url]of source.matchAll(/https?:[^'"<>\s]+/g))assert.ok(url.startsWith('https://cdn.jsdelivr.net/npm/three@')||url==='http://www.w3.org/2000/svg'||allowed.has(url),'Unexpected external reference: '+url);
  assert.doesNotMatch(source, /\/(?:Users|home)\/[^/]+\//);
});

test('model scripts parse and literal control IDs exist exactly once', async () => {
  const source = await readFile(join(projectRoot, 'src/model.html'), 'utf8');
  for (const [, script] of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script);
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing control: ${id}`);
});

test('CircleCI only deploys tested main builds, in a serial group', async () => {
  const config = parse(await readFile(join(projectRoot, '.circleci/config.yml'), 'utf8'));
  const jobs = config.workflows['build-test-publish'].jobs;
  const deploy = jobs.find(j => j['publish-pages'])['publish-pages'];
  assert.deepEqual(deploy.requires, ['verify-browser-tests']);
  assert.deepEqual(jobs.find(j => j['verify-browser-tests'])['verify-browser-tests'].requires, ['browser-tests']);
  assert.deepEqual(jobs.find(j => j['browser-tests'])['browser-tests'].requires, ['build-and-unit']);
  assert.equal(config.jobs['browser-tests'].parallelism, SHARDS);
  for (const job of ['build-and-unit', 'browser-tests', 'verify-browser-tests']) assert.equal(jobs.find(j => j[job])[job].filters.branches.ignore, 'gh-pages');
  assert.equal(deploy.filters.branches.only, 'main');
  assert.equal(deploy.context, 'wedding-pages');
  assert.ok(deploy['serial-group']);
  const publisher = config.jobs['publish-pages'];
  assert.deepEqual(publisher.steps.find(step => step.add_ssh_keys).add_ssh_keys.fingerprints, [publisher.environment.GH_PAGES_SSH_FINGERPRINT]);
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  assert.ok(config.executors.browser.docker[0].image.includes(`v${pkg.devDependencies['@playwright/test']}-`));
  const browserConfig = await readFile(join(projectRoot, 'playwright.config.mjs'), 'utf8');
  assert.match(browserConfig, /outputDir: '\.\/test-results\/browser-artifacts'/);
});

test('publication refuses PRs, unverified artifacts and missing credentials', () => {
  const sha = 'a'.repeat(40), manifest = { project: 'wedding-planner', commit: sha };
  const env = { CIRCLE_BRANCH: 'main', CIRCLE_SHA1: sha, GITHUB_REPOSITORY: 'example/venue', GH_PAGES_SSH_FINGERPRINT: 'ab:'.repeat(15) + 'ab', SSH_AUTH_SOCK: '/tmp/test-agent' };
  assert.equal(deploymentPlan(env, manifest).branch, 'gh-pages');
  assert.ok(deploymentPlan({ ...env, CIRCLE_BRANCH: 'feature' }, manifest).skip);
  assert.ok(deploymentPlan({ ...env, CIRCLE_PULL_REQUEST: 'https://example.test/pr/1' }, manifest).skip);
  assert.throws(() => deploymentPlan(env, { ...manifest, commit: 'b'.repeat(40) }), /tested source/);
  assert.throws(() => deploymentPlan({ ...env, SSH_AUTH_SOCK: '' }, manifest), /SSH key/);
  assert.throws(() => deploymentPlan({ ...env, GH_PAGES_SSH_FINGERPRINT: '../key' }, manifest), /SSH key/);
  assert.throws(() => deploymentPlan({ ...env, GITHUB_REPOSITORY: '../venue' }, manifest), /owner\/repository/);
});
});
