import { spawnSync } from 'node:child_process';
import { projectRoot } from './build.mjs';
import { docsOnly } from './ci-plan.mjs';
const git = args => {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot inspect local changes');return result.stdout.split('\0').filter(Boolean);
};
// Served HTML is not imported by the test files, so Playwright --only-changed
// cannot safely infer whether these browser tests are affected.
const files = [...new Set([...git(['diff', '--name-only', '--no-renames', '-z', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])])];
const quick = docsOnly(files) || files.every(file => /^tests\/unit\//.test(file));
console.log(quick ? 'Documentation/unit-only changes: build and unit checks.' : 'Runtime/test/CI changes: full browser suite.');
for (const script of ['build', 'test:unit', ...quick ? [] : ['test:browser']]) {
  const result = spawnSync('npm', ['run', script], { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
