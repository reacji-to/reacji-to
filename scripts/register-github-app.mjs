// One-time local registration helper, not the production reaction service.
// GitHub sends its one-use manifest code to loopback; secrets never enter the page or logs.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const port = 8767;
const state = randomBytes(32).toString('hex');
const resultPath = '.wrangler/reacji-to-app.json';
const esc = v => String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const manifest = { name: 'reacji-to', url: 'https://reacji.to', description: 'Public and private emoji reactions for dev-null, X, and LinkedIn. Every change is a Git commit.',
  redirect_url: `http://127.0.0.1:${port}/callback`, public: true, hook_attributes: { url: 'https://reacji.to/webhook', active: false },
  default_permissions: { contents: 'write' }, default_events: [], request_oauth_on_install: false };
const logo = `<img alt="" src="data:image/png;base64,${(await readFile('public/logo.png')).toString('base64')}">`;
const shell = body => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>reacji-to · GitHub setup</title><style>body{font:16px/1.6 system-ui;background:#f6f7f8;color:#17230f;max-width:640px;margin:64px auto;padding:0 24px}header{display:flex;align-items:center;gap:12px;font-size:24px;font-weight:650}header img{width:48px;height:48px}h1{font-size:30px;line-height:1.2;letter-spacing:-.025em;margin-top:36px}p{max-width:60ch}button,a{color:inherit}button{font:600 16px system-ui;padding:12px 18px;background:#d9f66f;border:0;border-radius:6px;cursor:pointer}:focus-visible{outline:2px solid #335d10;outline-offset:4px}code{overflow-wrap:anywhere}small{color:#535b65}::selection{background:#d9f66f}</style><header>${logo}reacji-to</header>${body}</html>`;
let pending = false, complete = false;
const server = createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'");
  const reply = (status,body) => { res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(shell(body)); };
  if (req.headers.host !== `127.0.0.1:${port}` || req.method !== 'GET') return reply(403,'<h1>Request refused.</h1>');
  const url = new URL(req.url,`http://127.0.0.1:${port}`);
  if (url.pathname === '/') return reply(200, `<h1>Create the organization’s GitHub App</h1><p>Owner: <strong>reacji-to</strong><br>Name: <strong>reacji-to</strong><br>Homepage: <strong>reacji.to</strong></p><p>The app requests <strong>Contents: read and write</strong> and GitHub’s mandatory Metadata read. No Issues permission. It gets repository access only when installed; select only <code>reacji-to/reacji-to</code>.</p><form action="https://github.com/organizations/reacji-to/settings/apps/new?state=${state}" method="post"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}"><button type="submit">Review and create on GitHub →</button></form><p><small>GitHub will return here after you create the app. The registration key is saved locally in an ignored file for uploading as a Cloudflare secret. It is never displayed. This temporary helper is separate from the cloud-hosted reaction service.</small></p>`);
  if (url.pathname !== '/callback') return reply(404,'<h1>Not found.</h1>');
  if (complete || pending || url.searchParams.get('state') !== state || !/^[a-zA-Z0-9]{20,200}$/.test(url.searchParams.get('code') || '')) return reply(400,'<h1>Registration callback refused.</h1><p>Return to the setup page to start again.</p>');
  pending = true;
  try {
    const response = await fetch(`https://api.github.com/app-manifests/${url.searchParams.get('code')}/conversions`,{method:'POST',headers:{Accept:'application/vnd.github+json','User-Agent':'reacji-to-setup','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000),redirect:'error'});
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const data = await response.json();
    if (!Number.isSafeInteger(data.id) || data.slug !== 'reacji-to' || data.owner?.login !== 'reacji-to' || !data.pem?.includes('PRIVATE KEY') || !data.client_id) throw new Error('Unexpected app registration');
    await mkdir('.wrangler',{recursive:true,mode:0o700});
    await writeFile(resultPath,JSON.stringify({id:data.id,client_id:data.client_id,slug:data.slug,owner:data.owner.login,pem:data.pem}),{mode:0o600,flag:'wx'});
    complete = true;
    console.log(`Registered reacji-to app ${data.id}; credentials saved to ignored local storage.`);
    reply(200,'<h1>GitHub App created.</h1><p>The registration key was saved securely. Return to the chat and say <strong>app created</strong>.</p><p>Next, enable <strong>Device flow</strong> in the app’s General settings and install it on <strong>only reacji-to/reacji-to</strong>.</p><p><a href="https://github.com/organizations/reacji-to/settings/apps/reacji-to">Open app settings →</a></p>');
  } catch (error) { console.error('App registration did not complete; inspect GitHub settings before retrying.');reply(502,'<h1>Registration needs attention.</h1><p>Return to the chat. Do not create another app yet.</p>'); }
  finally { pending = false; }
});
server.listen(port,'127.0.0.1',()=>console.log(`Registration helper ready at http://127.0.0.1:${port}`));
server.requestTimeout=30000;server.headersTimeout=10000;
