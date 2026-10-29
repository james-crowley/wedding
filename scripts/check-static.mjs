import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './build.mjs';

// Wait for every process, including after a failure: never leave checks running
// behind the browser job or hide a failed build behind a successful unit run.
export async function runConcurrent(commands, options = {}) {
  const children = new Set();
  const forward = signal => { for (const child of children) child.kill(signal); };
  const interrupt = () => forward('SIGINT'), terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt);process.on('SIGTERM', terminate);
  try {
    const results = await Promise.allSettled(commands.map(({ name, command, args = [] }) => new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
      children.add(child);
      child.once('error', error => { children.delete(child);reject(new Error(`${name}: ${error.message}`)); });
      child.once('close', (code, signal) => {
        children.delete(child);
        if (code === 0) resolve();else reject(new Error(`${name} failed (${signal || code})`));
      });
    })));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, errors.map(error => error.message).join('\n'));
  } finally {
    process.removeListener('SIGINT', interrupt);process.removeListener('SIGTERM', terminate);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--inventory')) throw new Error('Use check-static.mjs [--inventory]');
  // Unit JUnit output must not rely on the production build creating this path.
  await mkdir(join(projectRoot, 'test-results'), { recursive: true });
  await runConcurrent([
    { name: 'Production build', command: 'npm', args: ['run', 'build'] },
    { name: 'Unit tests', command: 'npm', args: ['run', 'test:unit'] },
    ...args.includes('--inventory') ? [{ name: 'Browser inventory', command: process.execPath, args: ['scripts/ci-browser.mjs', 'list'] },...process.env.CI?[{name:'Firefox software graphics preflight',command:'xvfb-run',args:['-a',process.execPath,'scripts/check-browser-graphics.mjs']}]:[]] : []
  ]);
}
