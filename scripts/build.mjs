import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const escapeAttribute = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function replaceOnce(text, marker, replacement) {
  if (text.split(marker).length !== 2) throw new Error(`Expected one ${marker} marker`);
  return text.replace(marker, () => replacement);
}

export async function build({ outDir = join(projectRoot, 'dist'), commit = process.env.CIRCLE_SHA1 || null } = {}) {
  // Only the project-owned output directory may be replaced by this build.
  outDir = resolve(outDir);
  if (outDir === projectRoot || !outDir.startsWith(projectRoot + '/')) throw new Error('Output must be a child of the project directory');
  const inputs = ['src/model.html', 'src/frame-template.html', 'src/index-template.html', 'vendor/three-0.160.1.min.js'];
  const values = await Promise.all(inputs.map(path => readFile(join(projectRoot, path), 'utf8')));
  const [model, frameTemplate, indexTemplate, three] = values;
  let frame = replaceOnce(frameTemplate, '__VENUE_MODEL__', model);
  frame = replaceOnce(frame, '__THREE_BUNDLE__', three.replaceAll('</script', '<\\/script'));
  const html = replaceOnce(indexTemplate, '__FRAME_HTML__', escapeAttribute(frame));
  if (/\/(?:Users|home)\/[^/]+\/|file:\/\/|localhost:\d+/.test(html)) throw new Error('The published HTML contains a machine-specific path');
  if (/<script\b[^>]*\bsrc\s*=/i.test(frame) || /<link\b[^>]*\bhref\s*=\s*["']https?:/i.test(frame)) throw new Error('Runtime resources must be bundled, not loaded from a CDN');
  const sourceHash = createHash('sha256');
  inputs.forEach((path, i) => sourceHash.update(path + '\0').update(values[i]));
  const manifest = { project: 'wedding-planner', schema: 1, commit, sourceSha256: sourceHash.digest('hex'), htmlSha256: createHash('sha256').update(html).digest('hex') };
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'licenses'), { recursive: true });
  await mkdir(join(projectRoot, 'test-results'), { recursive: true });
  await writeFile(join(outDir, 'index.html'), html);
  await writeFile(join(outDir, '.nojekyll'), '');
  await writeFile(join(outDir, 'build-info.json'), JSON.stringify(manifest, null, 2) + '\n');
  await copyFile(join(projectRoot, 'vendor/THREE-LICENSE.txt'), join(outDir, 'licenses/THREE-LICENSE.txt'));
  return { outDir, manifest, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build();
  console.log(`Built dist/index.html (${result.bytes.toLocaleString()} bytes); no backend or external runtime assets required.`);
}
