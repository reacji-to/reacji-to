import { execFileSync } from 'node:child_process';
import { rm, mkdir, copyFile } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await copyFile('LICENSE', 'dist/LICENSE');
await rm('artifacts/reacji-to.zip', { force: true });
execFileSync('zip', ['-qr', '../artifacts/reacji-to.zip', '.'], { cwd: 'dist' });
console.log('Packaged artifacts/reacji-to.zip');
