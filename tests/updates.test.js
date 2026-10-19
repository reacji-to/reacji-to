import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker, isNewerVersion, RELEASES_URL } from '../src/updates.js';

function storage(initial = {}) {
  const data = structuredClone(initial);
  return { data, async get(key) { return { [key]: data[key] }; }, async set(value) { Object.assign(data, value); } };
}
const release = (tag_name = 'v0.3.10', extra = {}) => new Response(JSON.stringify({ tag_name, draft: false, prerelease: false, ...extra }));

test('compares Chrome version components numerically, including fourth components', () => {
  assert.equal(isNewerVersion('0.3.10', '0.3.9'), true);
  assert.equal(isNewerVersion('1.0', '0.99.99'), true);
  assert.equal(isNewerVersion('0.3.1.1', '0.3.1'), true);
  for (const [a,b] of [['0.3.1','0.3.1.0'],['0.3.0','0.3.1'],['0.4.0-beta','0.3.1'],['65536','0'],['not-a-version','0']]) assert.equal(isNewerVersion(a,b), false);
});

test('checks only the official endpoint without credentials and caches across worker restarts', async () => {
  const store = storage(); let calls = 0, time = 1000000;
  const fetchImpl = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/reacji-to/reacji-to/releases/latest');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, undefined);
    return release('v0.3.10', { html_url: 'https://evil.example/download' });
  };
  const checker = createUpdateChecker({ storage:store, currentVersion:'0.3.1', fetchImpl, now:()=>time });
  const result = await checker.check();
  assert.equal(result.available, true); assert.equal(result.releasesUrl, RELEASES_URL);
  await checker.check(); await checker.check({force:true}); assert.equal(calls, 1);
  time += 60001;
  await checker.check({force:true}); assert.equal(calls, 2);
  const restarted = createUpdateChecker({ storage:store, currentVersion:'0.3.10', fetchImpl, now:()=>time });
  assert.equal((await restarted.check()).available, false); assert.equal(calls, 2);
  time += 12 * 60 * 60 * 1000;
  await restarted.check(); assert.equal(calls, 3);
});

test('coalesces simultaneous checks', async () => {
  let finish, calls=0;
  const checker=createUpdateChecker({storage:storage(),currentVersion:'0.3.1',fetchImpl:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const a=checker.check(), b=checker.check({force:true});
  await new Promise(resolve=>setImmediate(resolve)); finish(release());
  assert.deepEqual(await a,await b); assert.equal(calls,1);
});

test('rejects drafts, prereleases, malformed versions and HTTP failures without claiming up to date', async () => {
  for (const response of [release('v0.4.0',{draft:true}),release('v0.4.0',{prerelease:true}),release('v0.4.0-beta'),new Response('',{status:429})]) {
    const result=await createUpdateChecker({storage:storage(),currentVersion:'0.3.1',fetchImpl:async()=>response}).check();
    assert.equal(result.available,false); assert.equal(result.latestVersion,null); assert.match(result.error,/Could not check/);
  }
});

test('preserves a known update on network failure and retries after the error backoff', async () => {
  const store=storage({releaseUpdate:{latestVersion:'0.4.0',checkedAt:1,lastSuccessAt:1}});
  let time=50000000,calls=0;
  const checker=createUpdateChecker({storage:store,currentVersion:'0.3.1',now:()=>time,fetchImpl:async()=>{calls++;throw new Error('offline');}});
  const result=await checker.check(); assert.equal(result.available,true);assert.match(result.error,/Could not check/);
  await checker.check();assert.equal(calls,1);
  time+=3600001; await checker.check();assert.equal(calls,2);
});
