const { chromium } = require('playwright');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HIDE = `header { display: none !important; } main section:first-of-type div[class*="tracking-"] { display: none !important; }`;
const BRIGHT = `main section:first-of-type > div:first-child { mix-blend-mode: normal !important; opacity: 1 !important; }`;
const SHIM = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance), realSetInterval = window.setInterval.bind(window);
  let manual = false, queue = [], fakeNow = 0, base = 0; window.__forms = [];
  window.setInterval = (cb, ms, ...rest) => { if (ms === 4500) { window.__forms.push(cb); return 424242; } return realSetInterval(cb, ms, ...rest); };
  window.requestAnimationFrame = (cb) => { if (!manual) return realRaf(cb); queue.push(cb); return queue.length; };
  performance.now = () => manual ? base + fakeNow : realNow();
  window.__manual = () => { base = realNow(); fakeNow = 0; manual = true; };
  window.__nextForm = () => { for (const cb of window.__forms) cb(); return window.__forms.length; };
  window.__tick = (n) => { for (let i = 0; i < n; i++) { fakeNow += 16.667; const q = queue; queue = []; for (const cb of q) { try { cb(base + fakeNow); } catch (e) {} } } return queue.length; };
})();`;
(async () => {
  const dpr = Number(process.argv[2] || 1), form = Number(process.argv[3] || 1), tag = process.argv[4] || 'form', frames = Number(process.argv[5] || 8), spacing = Number(process.argv[6] || 45), offset = Number(process.argv[7] || 0);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' },
    args: ['--ssl-version-max=tls1.2', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'light' });
  await ctx.addInitScript(SHIM);
  const p = await ctx.newPage();
  await p.goto('https://bank-rock.com/', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('warn', e.message.split('\n')[0]));
  await p.waitForSelector('canvas', { timeout: 60000 });
  await sleep(3000);
  await p.addStyleTag({ content: HIDE + BRIGHT });
  await p.evaluate(() => { for (const el of document.querySelectorAll('a, button')) { const t = el.textContent.trim(); if (t.startsWith('Get your Rock') || t === 'See how it works') el.style.visibility = 'hidden'; } });
  await p.mouse.move(10, 1000);
  await p.evaluate(() => window.__manual());
  const tick = async (n) => { for (let i = 0; i < n; i += 5) await p.evaluate((k) => window.__tick(k), Math.min(5, n - i)); };
  const captured = await p.evaluate(() => window.__forms.length); console.log('form intervals captured', captured);
  for (let i = 0; i < form; i++) await p.evaluate(() => window.__nextForm());
  await tick(130 + offset);
  for (let f = 0; f < frames; f++) {
    await p.screenshot({ path: path.join(__dirname, 'shots', `hero-${tag}${form}-${String(f).padStart(2,'0')}.png`), timeout: 150000 }); console.log('saved', f);
    await tick(spacing);
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
