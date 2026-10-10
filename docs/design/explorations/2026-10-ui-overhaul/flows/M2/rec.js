// Frame recorder: plays each interaction with app time slowed K x (performance.now / rAF / setTimeout scaled in-page,
// CSS + WAAPI slowed through CDP Animation.setPlaybackRate), screenshots continuously, and writes
// build/rec/<ver>/<name>/NN.png + times.json (app-time ms). sheet.py turns them into strips.
// usage: node rec.js <M1|M2> [name ...]
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const VER = process.argv[2] || 'M2', ONLY = process.argv.slice(3);
const SRC = path.join(__dirname, '..', VER, 'index.html'), OUT = path.join(__dirname, 'build', 'rec', VER);
const K = 8;
const SLOW = `(()=>{const k=${K};const pn=performance.now.bind(performance);const t0=pn();performance.now=()=>t0+(pn()-t0)/k;
const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(()=>cb(performance.now()));
const st=setTimeout.bind(window);window.setTimeout=(f,d,...a)=>st(f,(d||0)*k,...a);})();`;

const mRow = (p, n) => p.locator('#mlist .row', { has: p.locator('.n', { hasText: new RegExp('^' + n) }) });
const sRow = (p, n) => p.locator('#sres .row', { has: p.locator('.n', { hasText: new RegExp('^' + n) }) });
const fast = async (p, f) => { await rate(p, 1); await f(); await p.waitForTimeout(150 * K); };
let cdp; const rate = (p, r) => cdp.send('Animation.setPlaybackRate', { playbackRate: r });

// each: url query, setup (untimed), act (recorded), dur = app ms recorded after act starts
const I = [
  { name: 'add', q: 'state=menu', act: p => mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(), dur: 900 },
  { name: 'add2', q: 'state=menu', setup: p => mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(), act: p => mRow(p, 'Green Chile Posole').locator('.add').tap(), dur: 800 },
  { name: 'qty', q: 'state=menu', setup: p => mRow(p, 'Green Chile Posole').locator('.add').tap(), act: p => mRow(p, 'Green Chile Posole').locator('.inc').tap(), dur: 600 },
  { name: 'remove', q: 'state=menu', setup: async p => { await mRow(p, 'Green Chile Posole').locator('.add').tap(); await mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(); await p.waitForTimeout(400); await mRow(p, 'Green Chile Posole').locator('.dec').tap(); }, act: p => mRow(p, 'Green Chile Posole').locator('.dec').tap(), dur: 700 },
  { name: 'sheet', q: 'state=menu', setup: async p => { await mRow(p, 'Green Chile Posole').locator('.add').tap(); await mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(); }, act: p => p.locator('#bar .txt').tap(), dur: 900 },
  { name: 'sheetdrag', q: 'state=menu', setup: async p => { await mRow(p, 'Green Chile Posole').locator('.add').tap(); await mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(); },
    act: async (p, mark, touch) => { const b = await p.locator('#bar').boundingBox(); const pts = []; for (let i = 0; i <= 10; i++) pts.push([200, b.y + 30 - i * 30]); await touch(pts, 20 * K); }, dur: 1100 },
  { name: 'log', q: 'state=menu', setup: async p => { await mRow(p, 'Green Chile Posole').locator('.add').tap(); await mRow(p, 'Local Roasted Sweet Potatoes').locator('.add').tap(); }, act: p => p.locator('#bar [data-act=barlog]').tap(), dur: 1300 },
  { name: 'undo', q: 'state=menu', setup: async p => { await mRow(p, 'Green Chile Posole').locator('.add').tap(); await p.locator('#bar [data-act=barlog]').tap(); await p.waitForTimeout(1200); }, act: p => p.locator('#bar [data-act=undo]').tap(), dur: 1300 },
  { name: 'mealtab', q: 'state=menu', act: p => p.locator('#mtabs button[data-meal=dinner]').tap(), dur: 600 },
  { name: 'station', q: 'state=menu', act: async (p, mark) => { await p.locator('#mswitch .swbtn, [data-act=stations]').first().tap(); await mark(450); await p.locator('[data-jump]', { hasText: 'Noodle Bowl' }).first().tap(); }, dur: 1500 },
  { name: 'dragback', q: 'state=menu', act: async (p, mark, touch) => { const pts = []; for (let i = 0; i <= 16; i++) pts.push([200, 420 + i * 19]); await touch(pts, 25 * K); }, dur: 1500 },
  { name: 'dragcancel', q: 'state=menu', act: async (p, mark, touch) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([200, 420 + i * 7]); await touch(pts, 25 * K); }, dur: 1100 },
  { name: 'edgecollapsed', q: 'state=collapsed', act: async (p, mark, touch) => { const pts = []; for (let i = 0; i <= 16; i++) pts.push([4 + i * 19, 500]); await touch(pts, 25 * K); }, dur: 1500 },
  { name: 'edgeswipe', q: 'state=menu', act: async (p, mark, touch) => { const pts = []; for (let i = 0; i <= 16; i++) pts.push([4 + i * 19, 500]); await touch(pts, 25 * K); }, dur: 1500 },
  { name: 'hallresult', q: 'state=search', setup: async p => { await p.keyboard.type('worcester'); await p.waitForTimeout(300 * K); }, act: p => p.locator('#sres .prow2[data-act=hall]').first().tap(), dur: 800 },
  { name: 'placeopen', q: 'state=search', setup: async p => { await p.keyboard.type('wasabi'); await p.waitForTimeout(300 * K); }, act: p => p.locator('#sres .prow2[data-p=place]').first().tap(), dur: 700 },
  { name: 'serving', q: 'state=search', setup: async p => { await p.keyboard.type('korean bbq'); await p.waitForTimeout(300 * K); await sRow(p, 'Korean BBQ Chicken').locator('.n').tap(); }, act: p => p.locator('#isheet .hchip', { hasText: 'Berkshire' }).tap(), dur: 1800 },
  { name: 'pinopen', q: 'pins=2', act: p => p.locator('#pins .pcard').first().tap(), dur: 700 },
  { name: 'detail', q: 'state=menu', act: p => mRow(p, 'Green Chile Posole').locator('.n').tap(), dur: 900 },
  { name: 'detailadd', q: 'state=menu', setup: p => mRow(p, 'Green Chile Posole').locator('.n').tap(), act: p => p.locator('#isheet [data-act=dadd]').tap(), dur: 1100 },
  { name: 'ingredients', q: 'state=label', setup: p => p.evaluate(() => { const b = document.querySelector('#isbody'); b.scrollTop = b.scrollHeight; }), act: p => p.locator('#isheet [data-act=ing]').tap(), dur: 600 },
  { name: 'tabs', q: '', act: async (p, mark) => { await p.locator('.tbar button[data-tab=you]').tap(); await mark(500); await p.locator('.tbar button[data-tab=halls]').tap(); }, dur: 1000 },
  { name: 'typing', q: 'state=search', act: async p => { for (const c of 'bbq') { await p.keyboard.type(c); await p.waitForTimeout(140 * K); } }, dur: 900 },
  { name: 'lens', q: 'state=search', setup: p => p.evaluate(() => document.querySelector('#q').blur()), act: p => p.locator('[data-lens=protein]').tap(), dur: 600 },
  { name: 'events', q: 'state=search', setup: p => p.evaluate(() => document.querySelector('#q').blur()),
    act: async (p, mark, touch) => { const b = await p.locator('#evc').boundingBox(); if (b) await touch([[300, b.y + 60], [250, b.y + 61], [200, b.y + 62], [150, b.y + 62], [120, b.y + 62]]); await mark(700); await p.locator('#evc .evcard').nth(1).tap(); }, dur: 1500 },
  { name: 'eventopen', q: 'state=search', setup: p => p.evaluate(() => document.querySelector('#q').blur()), act: p => p.locator('#evc .evcard').first().tap(), dur: 800 },
  { name: 'cafe', q: 'state=cafes', act: p => p.locator('.page .lrow', { hasText: 'Wasabi' }).tap(), dur: 700 },
  { name: 'busy', q: '', act: p => p.evaluate(() => renderHalls()), dur: 700 },
  { name: 'open', q: '', act: p => p.locator('.band[data-h=W]').tap(), dur: 800 },
  { name: 'close', q: 'state=menu', act: p => p.locator('#mctl [data-act=back]').tap(), dur: 800 },
  { name: 'collapse', q: 'state=menu', act: async (p, mark, touch) => { const pts = []; for (let i = 0; i <= 24; i++) pts.push([200, 640 - i * 14]); await touch(pts, 70 * K / 4); }, dur: 1100 },
  { name: 'closecollapsed', q: 'state=collapsed', act: p => p.locator('#mctl [data-act=back]').tap(), dur: 1200 },
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--disable-features=OverscrollHistoryNavigation'] });   // an edge swipe must not navigate the test page back
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(SLOW);
  const p = await ctx.newPage(); cdp = await ctx.newCDPSession(p); await cdp.send('Animation.enable');
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const touch = async (pts, hold = 16) => {
    const T = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', pts[0]); for (const q of pts.slice(1)) { await T('touchMove', q); await p.waitForTimeout(hold); } await T('touchEnd', pts.at(-1));
  };
  for (const it of I) {
    if (ONLY.length && !ONLY.includes(it.name)) continue;
    const dir = path.join(OUT, it.name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await rate(p, 1);
    await p.goto('file://' + SRC + (it.q ? '?' + it.q : '')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(900 * K);
    if (it.setup) { await it.setup(p); await p.waitForTimeout(1000 * K); }
    await rate(p, 1 / K);
    const frames = []; let rec = true, t0 = Date.now(), marks = [];
    const now = () => p.evaluate(() => [performance.now(), window.__in0, window.__dbg && __dbg()]);
    await p.evaluate(() => { window.__in0 = null; for (const t of ['pointerdown', 'keydown']) addEventListener(t, () => { if (window.__in0 == null) window.__in0 = performance.now(); }, { capture: true }); });
    const loop = (async () => { let i = 0; while (rec) { const a = await now(); const f = path.join(dir, String(i).padStart(3, '0') + '.png'); await p.screenshot({ path: f }); const b2 = await now(); frames.push([f, (a[0] + b2[0]) / 2, b2[2]]); i++; } })();
    await p.waitForTimeout(60 * K);
    const ta0 = (await now())[0];
    const mark = async ms => { await p.waitForTimeout(ms * K); marks.push((await now())[0]); };
    try { await it.act(p, mark, touch); } catch (e) { console.log(VER, it.name, 'act failed:', e.message.split('\n')[0]); }
    const ta = (await now())[1] ?? ta0; while ((await now())[0] < ta + it.dur) await p.waitForTimeout(30);
    rec = false; await loop;
    fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify({ act: ta, marks: marks.map(m => m - ta), frames: frames.map(([f, t, d]) => [path.basename(f), +(t - ta).toFixed(1), d]) }));
    console.log(VER, it.name, frames.length, 'frames');
  }
  if (errs.length) console.log('page errors:', errs);
  await b.close();
})();
