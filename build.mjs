import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('skill/scripts', { recursive: true });
await mkdir('skill/viewer', { recursive: true });

await build({
  entryPoints: ['src/cli/main.ts'],
  outfile: 'skill/scripts/unfold.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
});

const viewer = await build({
  entryPoints: ['src/viewer/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
});

const template = await readFile('src/viewer/index.html', 'utf8');
const script = viewer.outputFiles[0].text.replaceAll('</script', '<\\/script');
await writeFile('skill/viewer/index.html', template.replace('/*__BUNDLE__*/', () => script));

console.log('built skill/scripts/unfold.mjs, skill/viewer/index.html');
