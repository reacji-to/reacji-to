// Explicitly export the browser/server contract into the separate website repo.
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
if (!process.argv[2]) throw new Error('Usage: node scripts/export-web-core.mjs /path/to/reacji-to-web');
const destination = resolve(process.argv[2]);
await mkdir(join(destination,'shared'),{recursive:true});
await mkdir(join(destination,'public'),{recursive:true});
const hashes = {};
for (const name of ['posts.js','protocol.js','web.js','emoji.json','config.js','brand.js','slack.js','reaction-payload.js','attachments.js']) {
  const from = `src/${name}`;
  await copyFile(from,join(destination,'shared',name));
  hashes[name] = createHash('sha256').update(await readFile(from)).digest('hex');
}
for (const name of ['logo.png','icon-512.png']) await copyFile(`public/${name}`,join(destination,'public',name));
await writeFile(join(destination,'shared','ORIGIN.json'),JSON.stringify({repository:'reacji-to/reacji-to',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha256:hashes},null,2)+'\n');
console.log(`Exported shared validation and logo assets to ${destination}`);
