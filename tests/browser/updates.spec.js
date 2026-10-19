import { test, expect, chromium } from '@playwright/test';
import { build } from 'esbuild';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('real extension shows update badge and download notice, handles offline checks, and clears stale updates', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'reacji-updates-'));
  const extension=path.join(root,'extension');
  await cp('dist',extension,{recursive:true});
  const { version } = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  const newerVersion = `${Number(version.split('.')[0]) + 1}.0.0`;
  await build({entryPoints:['src/background.js'],bundle:true,outfile:path.join(extension,'background.js'),format:'esm',target:'chrome120',plugins:[{
    name:'mock-public-releases',setup(builder){
      builder.onLoad({filter:/src\/updates\.js$/},async args=>({loader:'js',contents:(await readFile(args.path,'utf8')).replace('fetchImpl = fetch',`fetchImpl = async (url, init) => {
        (globalThis.updateRequests ||= []).push({url, credentials:init.credentials, headers:init.headers});
        if (globalThis.updateOffline) throw new Error('offline fixture');
        return new Response(JSON.stringify({tag_name:globalThis.updateTag || 'v${newerVersion}',draft:false,prerelease:false}));
      }`)}));
    },
  }]});
  const context=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const page=await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await expect(page.locator('#update-heading')).toHaveText(`Update available · ${newerVersion}`);
    await expect(page.locator('#update-available')).toBeVisible();
    await expect(page.locator('#update-download')).toHaveAttribute('href','https://github.com/reacji-to/reacji-to/releases/latest');
    expect(await worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('↑');
    expect(await worker.evaluate(()=>chrome.action.getTitle({}))).toContain(`Update available (${newerVersion})`);
    const requests=await worker.evaluate(()=>globalThis.updateRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0].credentials).toBe('omit');
    expect(requests[0].headers.Authorization).toBeUndefined();
    await page.screenshot({path:'artifacts/update-available.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await worker.evaluate(async()=>{
      globalThis.updateOffline=true;
      const {releaseUpdate}=await chrome.storage.local.get('releaseUpdate');
      await chrome.storage.local.set({releaseUpdate:{...releaseUpdate,checkedAt:1}});
    });
    await page.getByRole('button',{name:'Check for updates',exact:true}).click();
    await expect(page.locator('#update-status')).toContainText('Could not check');
    await expect(page.locator('#update-available')).toBeVisible();
    expect(await worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('↑');
    await worker.evaluate(async()=>{
      globalThis.updateOffline=false;globalThis.updateTag=`v${chrome.runtime.getManifest().version}`;
      await chrome.storage.local.remove('releaseUpdate');
    });
    await page.getByRole('button',{name:'Check for updates',exact:true}).click();
    await expect(page.locator('#update-status')).toHaveText('You’re up to date.');
    await expect(page.locator('#update-available')).toBeHidden();
    expect(await worker.evaluate(()=>chrome.action.getBadgeText({}))).toBe('');
  } finally {await context.close();await rm(root,{recursive:true,force:true});}
});
