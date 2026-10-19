import { test, expect } from '@playwright/test';

const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
const commit = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
for (const platform of ['x', 'linkedin', 'devnull']) test(`${platform}: equal icon spacing and stable eyes/emoji slot with existing reactions`, async ({ page }) => {
  const domain = { x: 'x.com', linkedin: 'www.linkedin.com', devnull: 'dev-null.sh' }[platform];
  const article = { x: 'data-testid="tweet"', linkedin: 'data-urn="urn:li:activity:123456789"', devnull: `data-commit="${commit}"` }[platform];
  const anchor = { x: 'data-testid="like"', linkedin: 'class="react-button__trigger"', devnull: 'data-test="star-commit-button"' }[platform];
  const row = platform === 'x' ? 'role="group"' : '';
  await page.route(`https://${domain}/**`, route => route.request().headers()['x-inertia']
    ? route.fulfill({ json: { props: { auth: { user: { username: 'octocat' } } } } })
    : route.fulfill({ contentType: 'text/html', body: `<meta charset="utf-8"><style>
      :root{--primary:hotpink;--accent:lime;--popover:orange;--foreground:purple;--border:red;--muted-foreground:brown}
      body{margin:24px;font:14px system-ui}article{max-width:900px;margin:auto}.actions{display:flex;gap:17px;align-items:center}
      button,a{display:inline-flex;align-items:center;gap:4px;padding:5px;border:0;background:none}svg{width:20px;height:20px;flex:none}
      </style><article ${article}><a href="/someone/status/123456789"><time>Today</time></a><p>Consistent reactions</p><div ${row} class="actions social-details-social-actions">
      <span data-slot="tooltip-trigger"><button ${anchor}>${svg}<span>2222</span></button></span><span><button data-testid="reply">${svg}<span>2</span></button></span>
      <span><button>${svg}<span>Reply</span></button></span><span><button>${svg}</button><button>${svg}</button></span></div></article>` }));
  await page.addInitScript(() => {
    const users = { 99: { login: 'friend', emoji: '🔥' } };
    window.chrome = { runtime: { sendMessage: async m => {
      if (m.type === 'react') {
        if (m.event.emoji) users[42] = { login: 'octocat', emoji: m.event.emoji }; else delete users[42];
      }
      return { ok: true, value: m.type === 'status' ? { connected: true, actor: { id: 42, login: 'octocat' } }
        : m.type === 'react' ? { actor: { id: 42, login: 'octocat' }, document: { users: { ...users } } } : { users: { ...users } } };
    } } };
  });
  await page.goto(`https://${domain}/`);
  await page.addScriptTag({ path: 'dist/content.js' });
  const eyes = page.locator('article .trigger');
  const metrics = () => page.locator('[data-reacji-actions-row]').evaluate(row => {
    const host = row.querySelector('reacji-to-reactions');
    const icons = [...row.querySelectorAll('svg')];
    icons.splice(1, 0, host.shadowRoot.querySelector('.reaction-slot'));
    return icons.map(el => { const b = el.getBoundingClientRect(); // Ignore browser layout rounding below a tenth of a CSS pixel.
      return { x: Math.round((b.x + b.width / 2) * 10) / 10, y: Math.round((b.y + b.height / 2) * 10) / 10 }; });
  });
  for (const width of [1280, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(eyes).toBeVisible();
    await expect.poll(async () => { const centers = await metrics(); const gaps = centers.slice(1).map((v, i) => v.x - centers[i].x); return Math.max(...gaps) - Math.min(...gaps); }).toBeLessThan(1);
    const before = await metrics(), box = await eyes.boundingBox();
    for (const [emoji, name] of [['💙', 'blue heart'], ['🔥', 'fire']]) {
      await eyes.click();
      await expect(page.locator('.panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(page.getByRole('button', { name: 'Public', exact: true })).toHaveCSS('background-color', 'rgb(59, 111, 224)');
      await page.getByRole('searchbox').fill(emoji);
      await page.getByRole('button', { name, exact: true }).click();
      const selected = page.locator('article .chip[aria-pressed=true]');
      await expect(selected).toBeVisible();
      await expect(eyes).toBeHidden();
      await expect.poll(() => selected.boundingBox()).toEqual(box);
      expect(await metrics()).toEqual(before);
      await selected.click();
      await expect(eyes).toBeVisible();
      expect(await eyes.boundingBox()).toEqual(box);
      expect(await metrics()).toEqual(before);
    }
  }
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await eyes.click();
  await expect(page.locator('.panel')).toHaveCSS('background-color', 'rgb(31, 31, 34)');
  await expect(page.locator('.visibility')).toHaveCSS('border-top-color', 'rgb(57, 57, 62)');
  await page.screenshot({ path: `artifacts/${platform}-consistent-style.png`, animations: 'disabled' });
});
