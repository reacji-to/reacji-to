import { execFileSync } from 'node:child_process';
import { rm, mkdir, copyFile } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await copyFile('LICENSE', 'dist/LICENSE');
await rm('artifacts/dev-null-reactions.zip', { force: true });
execFileSync('zip', ['-qr', '../artifacts/dev-null-reactions.zip', '.'], { cwd: 'dist' });
console.log('Packaged artifacts/dev-null-reactions.zip');
