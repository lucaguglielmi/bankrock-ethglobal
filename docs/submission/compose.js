const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const S = __dirname;
const A = (f) => 'file://' + path.join(S, 'assets', f);
const P = (f) => 'file://' + path.join(S, 'shots', f + '.png');

const css = `
@font-face { font-family: 'Inter'; src: url('${A('234d9015b631dab9-s.p.33gca1im1ku45.woff2')}') format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #fff; font-family: 'Inter', system-ui, sans-serif; color: #0a0a0a; }
.page { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
.logo { height: 56px; }
.eyebrow { font-size: 22px; letter-spacing: .22em; text-transform: uppercase; color: #2855E8; font-weight: 600; }
h1 { font-weight: 800; letter-spacing: -0.045em; line-height: 0.98; }
.sub { color: #52525b; line-height: 1.35; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; }
.chip { border: 1.5px solid #e4e4e7; border-radius: 999px; padding: 10px 18px; font-size: 20px; font-weight: 500; color: #3f3f46; background: #fff; }
.phone { position: absolute; width: 440px; border-radius: 58px; border: 12px solid #0a0a0a; background: #0a0a0a; box-shadow: 0 40px 80px -20px rgba(0,0,0,.35), 0 12px 24px -8px rgba(0,0,0,.2); overflow: hidden; }
.phone img { display: block; width: 100%; height: auto; }
.bg { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 30% 20%, #fff 0%, #f4f4f5 60%, #ececee 100%); }
`;

function cover() {
  return `<style>${css}</style><div class="page">
  <div style="position:absolute; left:0; top:0; width:1040px; height:1080px; overflow:hidden;">
    <img src="${A('rock3.jpg')}" style="width:100%; height:100%; object-fit:cover; object-position:50% 50%;">
  </div>
  <div style="position:absolute; left:1040px; top:0; width:880px; height:1080px; background:#fff; padding:88px 80px 0 88px; display:flex; flex-direction:column;">
    <img class="logo" src="${A('logo.svg')}" style="height:64px; width:auto; align-self:flex-start;">
    <div class="eyebrow" style="margin-top:96px;">ETHOnline 2026</div>
    <h1 style="font-size:104px; margin-top:22px;">Liquidity<br>you can hold.</h1>
    <div class="sub" style="font-size:31px; margin-top:34px; max-width:660px;">A handmade rock with an NFC chip that owns and trades self-custodial liquidity. Tap it, fund it, gift it.</div>
    <div class="chips" style="margin-top:44px;">
      <span class="chip">1inch Aqua</span><span class="chip">Privy</span><span class="chip">Safe + ERC-4337</span><span class="chip">NTAG 424 DNA</span><span class="chip">Ethereum Sepolia</span>
    </div>
  </div>
</div>`;
}

function slide({ eyebrow, title, sub, left, right, chips = [] }) {
  return `<style>${css}</style><div class="page"><div class="bg"></div>
  <div style="position:absolute; left:96px; top:88px; width:720px;">
    <img class="logo" src="${A('logo.svg')}" style="height:52px; width:auto;">
    <div class="eyebrow" style="margin-top:110px;">${eyebrow}</div>
    <h1 style="font-size:88px; margin-top:20px;">${title}</h1>
    <div class="sub" style="font-size:28px; margin-top:30px;">${sub}</div>
    <div class="chips" style="margin-top:40px;">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
  </div>
  <div class="phone" style="left:900px; top:96px;"><img src="${P(left)}"></div>
  <div class="phone" style="left:1400px; top:180px;"><img src="${P(right)}"></div>
</div>`;
}


function photoSlide({ eyebrow, title, sub, big, small, chips = [] }) {
  return `<style>${css}</style><div class="page"><div class="bg"></div>
  <div style="position:absolute; left:96px; top:88px; width:720px;">
    <img class="logo" src="${A('logo.svg')}" style="height:52px; width:auto;">
    <div class="eyebrow" style="margin-top:110px;">${eyebrow}</div>
    <h1 style="font-size:88px; margin-top:20px;">${title}</h1>
    <div class="sub" style="font-size:28px; margin-top:30px;">${sub}</div>
    <div class="chips" style="margin-top:40px;">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
  </div>
  <div style="position:absolute; left:880px; top:110px; width:560px; height:747px; border-radius:36px; overflow:hidden; box-shadow:0 40px 80px -20px rgba(0,0,0,.35), 0 12px 24px -8px rgba(0,0,0,.2);"><img src="${A(big)}" style="width:100%; height:100%; object-fit:cover;"></div>
  <div style="position:absolute; left:1370px; top:330px; width:500px; height:667px; border-radius:36px; overflow:hidden; box-shadow:0 40px 80px -20px rgba(0,0,0,.4), 0 12px 24px -8px rgba(0,0,0,.25); border:6px solid #fff;"><img src="${A(small)}" style="width:100%; height:100%; object-fit:cover;"></div>
</div>`;
}


// A phone-sized mock of an AI chat client with the Bank Rock MCP server connected. Every figure in
// the assistant's answers is rock #3's real state on Sepolia at capture time (5 USDC, 0.005 WETH,
// awake, no stream shipped), read through the same tools the server exposes.
function chatHtml() {
  return `<style>
@font-face { font-family: 'Inter'; src: url('${A('234d9015b631dab9-s.p.33gca1im1ku45.woff2')}') format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 390px; height: 844px; overflow: hidden; background: #fff; font-family: 'Inter', system-ui, sans-serif; color: #0d0d0d; -webkit-font-smoothing: antialiased; }
.top { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; }
.top .title { font-weight: 600; font-size: 17px; display: flex; align-items: center; gap: 4px; }
.top .title span { color: #8e8ea0; font-weight: 500; }
.ico { width: 24px; height: 24px; stroke: #0d0d0d; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.conn { display: flex; justify-content: center; margin-top: 2px; }
.conn div { font-size: 12px; color: #5d5d6b; background: #f1f1f3; border-radius: 999px; padding: 5px 12px; display: flex; align-items: center; gap: 7px; }
.conn i { width: 7px; height: 7px; border-radius: 50%; background: #19c37d; display: inline-block; }
.msgs { padding: 14px 16px 0; display: flex; flex-direction: column; gap: 16px; }
.user { align-self: flex-end; max-width: 82%; background: #f4f4f4; border-radius: 20px; padding: 10px 16px; font-size: 16px; line-height: 1.45; }
.asst { font-size: 16px; line-height: 1.5; }
.asst p + p { margin-top: 10px; }
.asst ul { margin: 8px 0 0 22px; }
.asst li { margin: 2px 0; }
.asst b { font-weight: 600; }
.tools { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.tool { display: inline-flex; align-self: flex-start; align-items: center; gap: 8px; font-size: 13px; color: #5d5d6b; border: 1px solid #e6e6ea; border-radius: 999px; padding: 5px 11px 5px 9px; }
.tool svg { width: 15px; height: 15px; stroke: #19c37d; fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.tool code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; color: #0d0d0d; }
.composer { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 12px 26px; background: linear-gradient(#fff0, #fff 30%); }
.box { border: 1px solid #e3e3e8; border-radius: 26px; height: 52px; display: flex; align-items: center; padding: 0 10px 0 14px; gap: 10px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.box .ph { flex: 1; color: #8e8ea0; font-size: 16px; }
.box .plus { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
.box .mic { width: 34px; height: 34px; border-radius: 50%; background: #0d0d0d; display: grid; place-items: center; }
.box .mic svg { stroke: #fff; }
.home { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 134px; height: 5px; border-radius: 3px; background: #0d0d0d; }
</style>
<div class="top">
  <svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  <div class="title">ChatGPT <span>›</span></div>
  <svg class="ico" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
</div>
<div class="conn"><div><i></i>Bank Rock MCP connected</div></div>
<div class="msgs">
  <div class="user">I just tapped my rock, it's #3. What's in it?</div>
  <div class="asst">
    <div class="tools">
      <div class="tool"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>Used <code>get_rock_status</code> · bankrock</div>
      <div class="tool"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>Used <code>get_strategy_fees</code> · bankrock</div>
    </div>
    <p>Rock #3 is <b>awake</b> and owned by <b>0xFcf8…CC41</b>. Its own account (a Safe at 0x7450…537E) holds:</p>
    <ul><li><b>5 USDC</b></li><li><b>0.005 WETH</b></li></ul>
    <p>It isn't trading yet: no liquidity stream has been shipped, so fees earned are <b>0</b>. Everything above was read from Ethereum Sepolia just now, nothing is estimated.</p>
  </div>
  <div class="user">Can you start it earning for me?</div>
  <div class="asst">
    <p>No. I can only read this rock. The Bank Rock server is read-only by design, so I can't sign or move funds. Open the rock's page and tap <b>Start earning</b>; you sign once with your Privy wallet and gas is sponsored.</p>
  </div>
</div>
<div class="composer"><div class="box">
  <div class="plus"><svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>
  <div class="ph">Message</div>
  <div class="mic"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></div>
</div></div>
<div class="home"></div>`;
}

const pages = {
  'cover-1920x1080': cover(),
  'slide-1-tap': slide({ eyebrow: 'Tap the rock', title: 'A rock with its own account.', sub: 'Tap it with a phone. Anyone can see what it holds, which streams it runs and who owned it. Sign in with Privy, no seed phrase.', left: 'h-phone-reduced', right: 'p02-rock3-liquidity', chips: ['Privy embedded wallet', 'Safe smart account', 'Gas sponsored'] }),
  'slide-2-onchain': slide({ eyebrow: 'Provenance', title: 'Every tap, gift and trade is on chain.', sub: 'Awakened, gifted, claimed by a physical tap, retired. Read back from Sepolia Etherscan. The registry holds no tokens, ever.', left: 'r1-provenance-2', right: 'p05-rock3-contracts', chips: ['BankRockRegistry', '1inch Aqua', 'Ethereum Sepolia'] }),
  'slide-3-agent': slide({ eyebrow: 'MCP server', title: 'Ask your rock anything.', sub: 'Connect ChatGPT, Claude or Cursor to a rock. The agent reads live chain state and never invents a number. Read-only by design.', left: 'p11-mcp', right: 'chat-mock', chips: ['Model Context Protocol', 'Read-only tools', 'Self-custody first'] }),
  'slide-4-object': photoSlide({ eyebrow: 'The physical object', title: 'Handmade, forged in Florence.', sub: 'Real river pebbles, each with a resin-set NTAG 424 DNA tag. The tag proves the object. It never holds a key.', big: 'photo_rock_family.jpg', small: 'photo_nfc_tag_on_finger.jpg', chips: ['NTAG 424 DNA', 'Signed URL on every tap', 'Copy-proof'] }),
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  { const f = path.join(S, 'chat-mock.html'); fs.writeFileSync(f, chatHtml());
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const pp = await pc.newPage(); await pp.goto('file://' + f); await pp.evaluate(() => document.fonts.ready); await pp.waitForTimeout(300);
    await pp.screenshot({ path: path.join(S, 'shots', 'chat-mock.png') }); console.log('saved chat-mock'); await pc.close(); }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, html] of Object.entries(pages)) {
    const f = path.join(S, name + '.html'); fs.writeFileSync(f, html);
    await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(S, 'out', name + '.png') }); console.log('saved', name);
  }
  await browser.close();
})();
