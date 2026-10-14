// Round 12 review shots: node shots12.js [out-dir] [filter]. Each state at 390 and 360 (dpr 2), joined into one image per
// state as build/r12/<out>/<name>.png (390 left, 360 right), then contact sheets sheet1.png... (six states each).
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const { execSync } = require('child_process');
const D = __dirname, OUT = D + '/build/r12/' + (process.argv[2] || 'p1'), ONLY = process.argv[3];
require('fs').mkdirSync(OUT, { recursive: true });
const cafe = n => `P.places.findIndex(x=>x[0]===${JSON.stringify(n)})`;
const typed = q => async p => { await p.locator('#q').fill(q); await p.waitForTimeout(900); await p.evaluate(() => document.querySelector('#q').blur()); await p.waitForTimeout(200); };
const tap = (sel, ms = 800) => async p => { await p.locator(sel).first().tap(); await p.waitForTimeout(ms); };
const seq = (...fs) => async p => { for (const f of fs) await f(p); };
const ev = f => p => p.evaluate(f);
const wait = ms => p => p.waitForTimeout(ms);
const open = n => ev(`openHall('C',true,null,{cafe:${cafe(n)}})`);
const station = st => seq(ev(`jump([...document.querySelectorAll('#mlist .sth')].find(h=>h.textContent===${JSON.stringify(st)}).dataset.st)`), wait(900));
const openRow = (n, ms = 900) => async p => { await p.locator('#mlist .row:not(.syn), #sres .row', { has: p.locator('.n', { hasText: new RegExp('^' + n + '★?$') }) }).first().locator('.tx').tap(); await p.waitForTimeout(ms); };
const chip = t => async p => { await p.locator('#isbody .vpick [role=radio]', { hasText: t }).first().tap(); await p.waitForTimeout(600); };
const addin = n => ev(`[...document.querySelectorAll('#isbody .brow')].find(r=>r.querySelector('.n').textContent===${JSON.stringify(n)}).querySelector('.add').click()`);
const plate = seq(ev(() => { if (plateOpen()) psheet.to('mid'); }), wait(900));
const twoItems = seq(open('Worcester Café'), wait(400), station('Beverages'), wait(300), openRow('Cappuccino'), chip('20 oz'), tap('#bfoot [data-act=badd]', 1000),
  openRow('Boba'), chip('Oat'), tap('#bfoot [data-act=badd]', 1000));
const STATES = [
  // a size family (Worcester Café: every drink there builds with its add-ons)
  ['z-wcafe', '', seq(open('Worcester Café'), wait(400), station('Beverages'))],
  ['z-wcafe-more', '', seq(open('Worcester Café'), wait(400), station('Beverages'), ev(() => { const sc = document.querySelector('#mscroll'); sc.scrollTop += 420; paint(1, sc.scrollTop); }))],
  ['z-cap', '', seq(open('Worcester Café'), wait(400), station('Beverages'), openRow('Cappuccino'))],
  ['z-cap-20', '', seq(open('Worcester Café'), wait(400), station('Beverages'), openRow('Cappuccino'), addin('PACIFIC Almond Milk'), wait(300), chip('20 oz'))],
  ['z-cap-top', '', seq(open('Worcester Café'), wait(400), station('Beverages'), openRow('Cappuccino'), chip('20 oz'), ev(() => isheet.to('top')), wait(700), ev(() => { const b = document.querySelector('#isbody'); b.scrollTop = 560; }), wait(400))],
  ['z-courtside', '', seq(open('Courtside Café'), wait(500))],
  // the boba family (Procrastination Station: a plain sheet)
  ['m-proc', '', seq(open('Procrastination Station'), wait(500))],
  ['m-boba', '', seq(open('Procrastination Station'), wait(500), openRow('Boba'))],
  ['m-boba-oat', '', seq(open('Procrastination Station'), wait(500), openRow('Boba'), chip('Oat'))],
  ['m-boba-label', '', seq(open('Procrastination Station'), wait(500), openRow('Boba'), chip('Oat'), ev(() => isheet.to('top')), wait(700), ev(() => { document.querySelector('#isbody').scrollTop = 420; }), wait(400))],
  ['m-boba-off', '', seq(ev(() => setTrack(false)), open('Procrastination Station'), wait(500), openRow('Boba'), chip('Soy'))],
  // the pho's broth: the same picker
  ['b-pho-none', '?state=menu&hall=H', tap('#mlist .row.syn:has-text("Noodle Bowl")')],
  ['b-pho-picked', '?state=menu&hall=H', seq(tap('#mlist .row.syn:has-text("Noodle Bowl")'), chip('Green Curry Pho Broth'), addin('Pho Noodles'), addin('Chicken for Pho'), wait(300))],
  ['b-whitmore', '', seq(open('Whitmore Café'), wait(500), tap('#mlist .row.syn:has-text("Noodle Bowl")'))],
  ['b-whitmore-picked', '', seq(open('Whitmore Café'), wait(500), tap('#mlist .row.syn:has-text("Noodle Bowl")'), async p => { await p.locator('#isbody .vpick [role=radio]').nth(1).tap(); await p.waitForTimeout(600); })],
  ['b-starginger', '', seq(open('Star Ginger'), wait(500), tap('#mlist .row.syn:has-text("Noodle Bowl")'))],
  // on the plate and in history
  ['p-plate', '', seq(twoItems, plate)],
  ['p-update', '', seq(twoItems, plate, tap('#psbody .prow .n:has-text("Boba")', 900))],
  ['p-row-added', '', seq(open('Worcester Café'), wait(400), station('Beverages'), tap('#mlist .row:has(.n:text-is("Cappuccino")) .add', 700))],
  ['p-logged', '', seq(twoItems, ev(() => logPlate(S.plates[0])), wait(500), ev(() => { setTab('you'); }), wait(500), ev(() => openMeal(S.log.at(-1).id)), wait(900))],
  // Search, favourites
  ['s-boba', '?state=search', typed('boba')],
  ['s-oat', '?state=search', typed('oat')],
  ['s-latte', '?state=search', typed('20 oz latte')],
  ['s-oatmeal', '?state=search', typed('oatmeal')],
  ['s-chowder', '?state=search', typed('chowder')],
  ['s-favs', '?state=you', seq(ev(() => { S.fav = new Set(['f:boba', 'f:cappuccino']); save(); renderYou(); }), tap('#you [data-p=favs]', 900))],
];
const OSFIX = {};
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
