import { build } from 'esbuild';
import { mkdir, rm, copyFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/content.js', 'src/options.js'], bundle: true, outdir: 'dist', format: 'iife', target: 'chrome120', loader: { '.css': 'text' } });
await build({ entryPoints: ['src/background.js'], bundle: true, outdir: 'dist', format: 'esm', target: 'chrome120' });
for (const file of ['options.html', 'options.css']) await copyFile(`src/${file}`, `dist/${file}`);
await copyFile('manifest.json', 'dist/manifest.json');
console.log('Built extension in dist/');
