// Round 11 review shots: node shots11.js [out-dir] [filter]. Each state at 390 and 360 (dpr 2), joined into one image per
// state as build/r11/<out>/<name>.png (390 left, 360 right), then contact sheets sheet1.png... (six states each).
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const { execSync } = require('child_process');
const D = __dirname, OUT = D + '/build/r11/' + (process.argv[2] || 'p1'), ONLY = process.argv[3];
require('fs').mkdirSync(OUT, { recursive: true });
const cafe = n => `P.places.findIndex(x=>x[0]===${JSON.stringify(n)})`;
const typed = q => async p => { await p.locator('#q').fill(q); await p.waitForTimeout(900); await p.evaluate(() => document.querySelector('#q').blur()); await p.waitForTimeout(200); };
const tap = (sel, ms = 800) => async p => { await p.locator(sel).first().tap(); await p.waitForTimeout(ms); };
const seq = (...fs) => async p => { for (const f of fs) await f(p); };
const ev = f => p => p.evaluate(f);
const wait = ms => p => p.waitForTimeout(ms);
const favs = q => ['?state=you' + q, seq(ev(() => { S.fav = new Set([norm('Beef Brisket Noodle Bowl'), norm('Golden BBQ Chicken Thigh')]); renderYou(); }), tap('#you [data-p=favs]', 900))];
const commonwealth = (q, ...more) => [q, seq(ev(`openHall('C',true,null,{cafe:${cafe('The Commonwealth Restaurant')}})`), wait(300), ...more)];
const STATES = [
  // 1. packaged and saved foods
  ['s1-clif', '?state=search', typed('clif')],
  ['s1-clif-end', '?state=search', seq(typed('clif'), ev(() => { document.querySelector('#search').scrollTop = 99999; }))],
  ['s1-pack-sheet', '?state=search', seq(typed('clif'), tap('#sres .row[data-food^="p"] .n'))],
  ['s1-saved-sheet', '?state=search', seq(typed('chobani'), tap('#sres .row[data-food] .n'))],
  ['s1-edit', '?state=search', seq(typed('chobani'), tap('#sres .row[data-food] .n'), tap('#isbody [data-act=fedit]', 700))],
  ['s1-deleted', '?state=search', seq(typed('chobani'), tap('#sres .row[data-food] .n'), tap('#isbody [data-act=fedit]', 500), tap('#isbody [data-act=fdelete]', 1000))],
  ['s1-you', '?state=you', ev(() => { const r = document.querySelector('#you [data-p=foods]'); document.querySelector('#you').scrollTop = r.offsetTop - 300; })],
  ['s1-yourfoods', '?state=you', tap('#you [data-p=foods]', 900)],
  ['s1-added', '?state=search', seq(typed('clif'), tap('#sres .row[data-food^="p"] .add', 900))],
  ['s1-plate', '?state=search', seq(typed('clif'), tap('#sres .row[data-food^="p"] .add', 900), ev(() => { if (plateOpen()) psheet.to('mid'); }), wait(900))],
  ['s1-notrack', '?state=search', seq(ev(() => setTrack(false)), typed('clif'))],
  ['s1-custom', '?state=search', seq(typed('overnight oats'), tap('#sres [data-act=custom]', 800))],
  ['s1-packfail', '?state=search&pack=fail', typed('clif')],
  // Search UMass Dining
  ['l-idle', '?state=search', seq(typed('laksa'))],
  ['l-loading', '?state=search', seq(typed('laksa'), tap('#sres [data-act=lookup]', 700))],
  ['l-found', '?state=search', seq(typed('laksa'), tap('#sres [data-act=lookup]', 1900))],
  ['l-found-sheet', '?state=search', seq(typed('laksa'), tap('#sres [data-act=lookup]', 1900), tap('#sres .row[data-food] .n'))],
  ['l-none', '?state=search&lookup=none', seq(typed('laksa'), tap('#sres [data-act=lookup]', 1900))],
  ['l-fail', '?state=search&lookup=offline', seq(typed('laksa'), tap('#sres [data-act=lookup]', 1900))],
  ['l-limited', '?state=search&lookup=limited', seq(typed('laksa'), tap('#sres [data-act=lookup]', 1900))],
  // 2. favourite alerts
  ['a-off', ...favs('')],
  ['a-os', ...favs('')],
  ['a-allowed', ...favs('')],
  ['a-denied', ...favs('&alerts=deny')],
  ['a-bgoff-ios', ...favs('&alerts=bgoff&os=ios')],
  ['a-bgoff-android', ...favs('&alerts=bgoff')],
  ['a-revoked', ...favs('&alerts=revoked')],
  ['a-note', '?notify=1'],
  ['a-landed', '?notify=1', tap('.osnote', 1500)],
  // 3. café PDF menus
  ['p-cafe', ...commonwealth('')],
  ['p-rows', ...commonwealth('', ev(() => { const sc = document.querySelector('#mscroll'); sc.scrollTop = 300; paint(1, 300); }))],
  ['p-loading', ...commonwealth('', tap('#mlist [data-pdf]', 250))],
  ['p-lunch', ...commonwealth('', tap('#mlist [data-pdf]', 1400))],
  ['p-lunch-2', ...commonwealth('', tap('#mlist [data-pdf]', 1400), ev(() => { NAV.at(-1).el.scrollTop = 99999; }))],
  ['p-dessert', ...commonwealth('', tap('#mlist [data-pdf="3"]', 1400))],
  ['p-offline-rows', ...commonwealth('?net=offline&saved=pdf:Lunch', ev(() => { const sc = document.querySelector('#mscroll'); sc.scrollTop = 300; paint(1, 300); }))],
  ['p-offline-page', ...commonwealth('?net=offline', tap('#mlist [data-pdf]', 900))],
  ['p-fail', ...commonwealth('?net=fail', tap('#mlist [data-pdf]', 900))],
  // 4. offline search
  ['o-idle', '?state=search&net=offline'],
  ['o-bbq', '?state=search&net=offline', typed('bbq')],
  ['o-clif', '?state=search&net=offline', typed('clif')],
  ['o-saved', '?state=search&net=offline&saved=Green%20Fields', typed('caesar')],
  ['o-cafe', '?net=offline', ev(`openHall('C',true,null,{cafe:${cafe('Green Fields')}})`)],
  ['f-idle', '?state=search&net=fail'],
  ['f-clif', '?state=search&net=fail', typed('clif')],
  // 5. bowls
  ['b-salad', '?state=menu&hall=B', seq(tap('#mtabs .mts button[data-meal=dinner]', 700), ev(() => { const r = document.querySelector('#mlist .row.syn'); const sc = document.querySelector('#mscroll'); sc.scrollTop = r.offsetTop - 260; paint(1, sc.scrollTop); }))],
  ['b-salad-sheet', '?state=menu&hall=B', seq(tap('#mtabs .mts button[data-meal=dinner]', 700), tap('#mlist .row.syn'))],
  ['b-deli', '?state=menu&hall=F', ev(() => { const r = document.querySelector('#mlist .row.syn'); const sc = document.querySelector('#mscroll'); sc.scrollTop = r.offsetTop - 260; paint(1, sc.scrollTop); })],
  ['b-pho', '?state=menu&hall=H', ev(() => { const r = document.querySelector('#mlist .row.syn'); const sc = document.querySelector('#mscroll'); sc.scrollTop = r.offsetTop - 260; paint(1, sc.scrollTop); })],
  ['b-pho-sheet', '?state=menu&hall=H', seq(tap('#mlist .row.syn'), ...['Chicken Pho Broth', 'Pho Noodles', 'Chicken for Pho'].map(n => async p => { await p.locator('#isbody .brow', { hasText: n }).locator('.add').tap(); await p.waitForTimeout(300); }))],
  ['b-pho-none', '?state=menu&hall=H', tap('#mlist .row.syn')],
  ['b-pho-plate', '?state=menu&hall=H', seq(tap('#mlist .row.syn'), ...['Green Curry Pho Broth', 'Pho Noodles', 'Chicken for Pho'].map(n => async p => { await p.locator('#isbody .brow', { hasText: n }).locator('.add').tap(); await p.waitForTimeout(300); }), tap('#bfoot [data-act=badd]', 1100), ev(() => { if (plateOpen()) psheet.to('mid'); }), wait(900))],
  ['b-whitmore', '', seq(ev(`openHall('C',true,null,{cafe:${cafe('Whitmore Café')}})`), wait(300), ev(() => { const r = document.querySelector('#mlist .row.syn'); const sc = document.querySelector('#mscroll'); sc.scrollTop = r.offsetTop - 260; paint(1, sc.scrollTop); }), tap('#mlist .row.syn'), ...['Chicken Pho w/Vegetable Broth', 'Hard Boiled Eggs'].map(n => async p => { await p.locator('#isbody .brow', { hasText: n }).locator('.add').tap(); await p.waitForTimeout(300); }), ev(() => isheet.to('top')), wait(600))],
  ['b-starginger', '', seq(ev(`openHall('C',true,null,{cafe:${cafe('Star Ginger')}})`), wait(300), tap('#mlist .row.syn'))],
  ['o-pinned', '?state=search&net=offline', seq(ev(() => { S.pins = ['Green Fields', 'The Commonwealth Restaurant']; renderSearch(); }), typed('caesar'))],
  ['p-pinned-offline', '?net=offline', seq(ev(() => { S.pins = ['The Commonwealth Restaurant']; }), ev(`openHall('C',true,null,{cafe:${cafe('The Commonwealth Restaurant')}})`), wait(300))],
  ['p-zoom', ...commonwealth('', tap('#mlist [data-pdf]', 1400), async p => { await p.touchscreen.tap(120, 300); await p.waitForTimeout(90); await p.touchscreen.tap(120, 300); await p.waitForTimeout(500); })],
  ['p-zoom-side', ...commonwealth('', tap('#mlist [data-pdf]', 1400), async p => { await p.touchscreen.tap(120, 300); await p.waitForTimeout(90); await p.touchscreen.tap(120, 300); await p.waitForTimeout(500); }, ev(() => { const el = NAV.at(-1).el; el.querySelector('.pbody').scrollLeft += 300; el.scrollTop += 400; }))],
  ['b-harvest', '', seq(ev(`openHall('C',true,null,{cafe:${cafe('Harvest Market')}})`), wait(300), ev(() => { const r = [...document.querySelectorAll('#mlist .sth')].find(h => /Salad Bar/.test(h.textContent)); const sc = document.querySelector('#mscroll'); sc.scrollTop = r.offsetTop - 200; paint(1, sc.scrollTop); }))],
];
// OS-sheet states: the tap that raises it, and the answer
const OSFIX = { 'a-os': 'ask', 'a-allowed': 'allow', 'a-denied': 'allow', 'a-bgoff-ios': 'allow', 'a-bgoff-android': 'allow' };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const done = [];
  try {
    for (const [name, q, fn] of STATES) {
      if (ONLY && !name.match(ONLY)) continue;
      const files = [];
      for (const w of [390, 360]) {
        const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
        await ctx.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} });
        const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto('file://' + D + '/index.html' + q); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
        if (fn) await fn(p);
        if (OSFIX[name]) { await p.locator('.page[data-p=favs] [data-act=alerts]').tap(); await p.waitForTimeout(400); if (OSFIX[name] === 'allow') { await p.locator('.ossheet [data-os="1"]').tap(); await p.waitForTimeout(400); } }
        await p.waitForTimeout(300);
        const f = `${OUT}/${name}-${w}.png`; await p.screenshot({ path: f }); files.push(f);
        if (errs.length) console.log(name, w, errs);
        await ctx.close();
      }
      execSync(`python3 -c "
import sys
from PIL import Image
ims=[Image.open(f) for f in sys.argv[2:]]; W=sum(i.width for i in ims)+20; o=Image.new('RGB',(W,max(i.height for i in ims)),(120,120,120)); x=0
for i in ims: o.paste(i,(x,0)); x+=i.width+20
o.save(sys.argv[1])" ${OUT}/${name}.png ${files.join(' ')}`);
      done.push(name);
    }
  } finally { await b.close(); }
  // contact sheets: six states per sheet (two rows of three), each 390 | 360 at half size, titled
  if (!ONLY) execSync(`python3 -c "
import sys
from PIL import Image, ImageDraw, ImageFont
out, names = sys.argv[1], sys.argv[2:]
F = ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf', 26)
for s in range(0, len(names), 6):
    ims = [(n, Image.open(out + '/' + n + '.png')) for n in names[s:s+6]]
    ims = [(n, i.resize((i.width // 2, i.height // 2))) for n, i in ims]
    cw = max(i.width for _, i in ims); ch = max(i.height for _, i in ims) + 40
    sheet = Image.new('RGB', (cw * 3 + 40, ch * 2 + 20), (60, 60, 60)); d = ImageDraw.Draw(sheet)
    for k, (n, i) in enumerate(ims):
        x, y = (k % 3) * (cw + 20), (k // 3) * (ch + 20); d.text((x + 6, y + 6), n, fill=(255, 255, 255), font=F); sheet.paste(i, (x, y + 40))
    sheet.save(out + '/sheet%d.png' % (s // 6 + 1))
" ${OUT} ${done.join(' ')}`);
})();
