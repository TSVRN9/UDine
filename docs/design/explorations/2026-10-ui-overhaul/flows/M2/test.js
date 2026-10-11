// Benchmark driver: Worcester lunch, Beef Brisket Noodle Bowl x1 + Golden BBQ Chicken Thigh x2 -> Log.
// Real touch input through CDP (Chromium's touch pipeline, touch-action arbitration), not synthetic events.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
// every assert call is counted, so the report can say how many checks ran
let NCHK = 0; const assert0 = require('assert');
const assert = new Proxy(assert0, { apply: (t, th, a) => { NCHK++; return t(...a); }, get: (t, k) => typeof t[k] === 'function' ? (...a) => { NCHK++; return t[k](...a); } : t[k] });
const URL = 'file://' + (process.env.SRC || __dirname + '/index.html');   // SRC: test an older build (RED=1)
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--disable-features=OverscrollHistoryNavigation'] });   // a left-edge swipe must not navigate the test page back
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const touch = async (pts, hold = 16) => {
    const T = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', pts[0]);
    for (const p of pts.slice(1)) { await T('touchMove', p); await page.waitForTimeout(hold); }
    await T('touchEnd', pts[pts.length - 1]);
    await page.waitForTimeout(700);
  };
  const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  let taps, scrolls;
  const tap = async loc => { await loc.tap(); taps++; await page.waitForTimeout(550); };
  const flick = async (y0, y1) => { await touch(line([200, y0], [200, y1], 6), 12); scrolls++; };
  const S = () => page.evaluate(() => ({ day: __dayTotal().cal, log: __S.log[__S.log.length - 1], plates: __S.plates.length }));
  const checkLogged = async label => {
    const s = await S();
    assert.equal(s.log.hall, 'W', label + ': logged at Worcester');
    const cal = s.log.items.reduce((a, i) => a + i.cal * i.qty, 0), p = s.log.items.reduce((a, i) => a + i.p * i.qty, 0);
    assert.equal(cal, 404, label + ': 404 cal (Worcester brisket is 218, not Berkshire 220)');
    assert.equal(Math.round(p * 10) / 10, 38.9, label + ': 38.9 g protein');
    assert.equal(s.day, 802, label + ': day 398 -> 802');
    await page.waitForTimeout(800);
    assert.equal((await page.locator('#dayN').textContent()).trim(), '802', label + ': bar shows Today 802');
  };
  const sRow = n => page.locator('#sres .row', { has: page.locator('.n', { hasText: new RegExp('^' + n) }) });
  const mRow = n => page.locator('#mlist .row', { has: page.locator('.n', { hasText: new RegExp('^' + n) }) });
  const visible = async loc => { const b = await loc.boundingBox(); const bar = await page.locator('#bar').boundingBox(); return b && b.y > 120 && b.y + b.height < Math.min(bar.y, 844 - 90); };
  const results = [];
  // Round 7: the navigation model. Expanding card only for hall bands and pinned cafés; push (iOS) for everything else;
  // the dish detail is a sheet over the list it came from. Every rAF frame of each transition is sampled.
  // RED=1 runs only this block, each scenario caught, against SRC=<an older build> to show which ones fail there.
  const round7 = async () => {
    const RMm = !!process.env.RM, W = 390, H = 844, TOL = .75;
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async (q, setup) => { await page.goto(URL + (q ? '?' + q : '')); await page.waitForTimeout(500); if (setup) await setup(); };
    const T = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    // ---- push ----
    // samples the screen being pushed (the next entry on the stack) or, for a back, the one leaving (__pn) while it is on the stack
    const pushProbe = () => page.evaluate(() => { window.__p = []; window.__pstop = 0; const k0 = typeof NAV !== 'undefined' ? NAV.length : 0;
      const f = () => { const n = window.__pn || (typeof NAV !== 'undefined' && NAV[k0]), F = frame.getBoundingClientRect(), s = {};
        if (n && NAV.includes(n) && n.el.isConnected && getComputedStyle(n.el).display !== 'none') { const r = n.el.getBoundingClientRect(); s.x = r.left - F.left; s.y = r.top - F.top; s.u = n.under.map(u => u.getBoundingClientRect().left - F.left); s.dim = +getComputedStyle(n.dim).opacity; s.op = +getComputedStyle(n.el).opacity; }
        s.pages = document.querySelectorAll('.page').length; s.tb = document.querySelector('.tbar').getBoundingClientRect().top - F.top;
        __p.push(s); if (__p.length < 600 && !__pstop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const pushCollect = () => page.evaluate(() => { window.__pstop = 1; window.__pn = null; return window.__p; });
    const pushed = (ss, label, dir) => { const xs = ss.filter(s => s.x != null);
      assert(xs.length > (RMm ? 2 : 8), `${label}: a pushed screen was sampled (${xs.length} frames)`);
      ss.forEach((s, i) => assert(Math.abs(s.tb - ss[0].tb) < .5, `${label}: the tab bar never moves (frame ${i})`));
      xs.forEach((s, i) => assert(Math.abs(s.y) < .5, `${label}: the screen never moves vertically (frame ${i}: y ${s.y})`));
      if (RMm) { xs.forEach((s, i) => assert(Math.abs(s.x) < .5, `${label}: reduced motion: no slide, a crossfade (frame ${i}: x ${s.x})`)); return; }
      xs.forEach((s, i) => { assert(s.x > -.5 && s.x < W + .5, `${label}: x ${s.x.toFixed(1)} stays on the screen's width (frame ${i})`);
        if (i) assert((s.x - xs[i - 1].x) * (dir === 'in' ? -1 : 1) >= -.6, `${label}: moves one way (frame ${i}: ${xs[i - 1].x.toFixed(1)} -> ${s.x.toFixed(1)})`);
        if (s.x > .5 && s.x < W - .5) { const p = 1 - s.x / W;
          s.u.forEach(u => assert(Math.abs(u + .3 * W * p) < 1, `${label}: the screen under it shifts left with it (frame ${i}: ${u.toFixed(1)} vs ${(-.3 * W * p).toFixed(1)})`));
          assert(Math.abs(s.dim - .1 * p) < .012, `${label}: the screen under it dims slightly (frame ${i}: ${s.dim.toFixed(3)} vs ${(.1 * p).toFixed(3)})`); } });
      if (dir === 'in') { assert(xs[0].x > W * .8, `${label}: it enters from the right edge (first frame x ${xs[0].x.toFixed(1)})`); assert(Math.abs(xs.at(-1).x) < .5, `${label}: at rest it covers the screen`); }
      else assert(xs.at(-1).x > W * .8, `${label}: it leaves by the right edge (last frame x ${xs.at(-1).x.toFixed(1)})`); };
    const atRest = async label => assert.equal(await page.evaluate(() => NAV.flatMap(n => n.under).filter(u => getComputedStyle(u).transform !== 'none').length + document.querySelectorAll('.pushing').length), 0, `${label}: the covered screen is restored at rest`);
    const back = () => page.evaluate(() => { const n = NAV.at(-1); window.__pn = n; (n.el.querySelector('[data-act=pageback]') || document.querySelector('#mctl [data-act=back]')).click(); });
    const sources = [
      ['event card in Search', 'state=search', () => page.evaluate(() => document.querySelector('#q').blur()), '#evc .evcard'],
      ['event note in a hall', 'state=menu', null, '#mlist .evnote'],
      ['café result in Search', 'state=search', async () => { await page.keyboard.type('wasabi'); await page.waitForTimeout(300); }, '#sres .prow2:not([data-act=hall])'],
      ['hall result in Search', 'state=search', async () => { await page.keyboard.type('worcester'); await page.waitForTimeout(300); }, '#sres .prow2[data-act=hall]'],
      ['area row', '', null, '#areas .lrow'],
      ['You row', 'state=you', null, '#you .lrow'],
    ];
    for (const [label, q, setup, sel] of sources) await scen('push: ' + label, async () => {
      await go(q, setup); await pushProbe(); await page.locator(sel).first().tap(); await page.waitForTimeout(900);
      pushed(await pushCollect(), label + ', open', 'in'); await atRest(label);
      assert.equal(await page.evaluate(() => document.activeElement.id), '', `${label}: the keyboard never stays up over it`);
      if (!RMm) { await touch(line([200, 330], [200, 700], 12), 30);   // no drag-down on a pushed screen
        assert.equal(await page.evaluate(() => [NAV.length, Math.round(NAV.at(-1).el.getBoundingClientRect().left)].join()), '1,0', `${label}: a drag down doesn't dismiss a pushed screen`); }
      await pushProbe(); await back(); await page.waitForTimeout(800); pushed(await pushCollect(), label + ', back', 'out');
      assert.equal(await page.evaluate(() => [NAV.length, document.querySelectorAll('.page, .pdim').length, document.querySelector('#tab-' + S.tab).style.transform].join()), '0,0,', `${label}, back: nothing left over`); });
    await scen('push: two levels, Cafés & markets -> café -> back -> back', async () => {
      await go(''); await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(800);
      await pushProbe(); await page.locator('.page .lrow', { hasText: 'Wasabi' }).tap(); await page.waitForTimeout(900);
      pushed(await pushCollect(), 'café over the list, open', 'in');
      assert.equal(await page.evaluate(() => [NAV.length, NAV[1].el.id, NAV[1].under[0] === NAV[0].el, S.cafe != null].join()), '2,menu,true,true', 'the café is pushed over the list page');
      await pushProbe(); await back(); await page.waitForTimeout(800); pushed(await pushCollect(), 'café over the list, back', 'out');
      assert.equal(await page.evaluate(() => [NAV.length, NAV[0].el.dataset.p, document.querySelector('#menu').classList.contains('hide')].join()), '1,cafes,true', 'back shows the list');
      await back(); await page.waitForTimeout(800); assert.equal(await page.evaluate(() => NAV.length), 0, 'back again shows Halls'); });
    if (!RMm) await scen('push: the edge swipe follows the finger 1:1, past half it pops, short of half it returns', async () => {
      for (const [to, pops] of [[210, true], [130, false]]) {
        await go('state=search', () => page.evaluate(() => document.querySelector('#q').blur())); await page.locator('#evc .evcard').first().tap(); await page.waitForTimeout(900);
        await T('touchStart', [4, 500]); const seen = [];
        for (let x = 24; x <= to; x += 20) { await T('touchMove', [x, 500]); await page.waitForTimeout(40); seen.push([x - 4, await page.evaluate(() => NAV.at(-1).el.getBoundingClientRect().left - frame.getBoundingClientRect().left)]); }
        seen.forEach(([dx, px]) => assert(Math.abs(px - dx) < 1.5, `edge swipe: the page is under the finger (dx ${dx}, page x ${px.toFixed(1)})`));
        await page.waitForTimeout(300); await T('touchEnd', [to, 500]); await page.waitForTimeout(900);
        assert.equal(await page.evaluate(() => NAV.length), pops ? 0 : 1, `edge swipe released at ${to}: ${pops ? 'pops' : 'returns'}`);
        if (!pops) assert.equal(await page.evaluate(() => Math.round(NAV.at(-1).el.getBoundingClientRect().left - frame.getBoundingClientRect().left)), 0, 'returned to rest'); } });
    // ---- the dish sheet ----
    const sheetProbe = sel => page.evaluate(sel => { window.__s = []; window.__sstop = 0; const row = document.querySelector(sel), sc = row.closest('#search, #mscroll, #psbody');
      const f = () => { const F = frame.getBoundingClientRect(), sh = document.querySelector('#isheet'), r = row.getBoundingClientRect();
        __s.push({ y: sh.getBoundingClientRect().top - F.top, vis: getComputedStyle(sh).visibility === 'visible', op: +getComputedStyle(sh).opacity, row: r.top - F.top, sc: sc.scrollTop, pages: document.querySelectorAll('.page').length });
        if (__s.length < 600 && !__sstop) requestAnimationFrame(f); }; requestAnimationFrame(f); }, sel);
    const sheetCollect = () => page.evaluate(() => { window.__sstop = 1; return window.__s; });
    const sheetSources = [
      ['Search', 'state=search', async () => { await page.keyboard.type('posole'); await page.waitForTimeout(300); }, '#sres .row:has(.n)'],
      ['a hall menu', 'state=menu', null, '#mlist .row[data-id="W.lunch.1.0"]'],
      ['the plate', 'state=plate', null, '#psheet .prow'],
    ];
    for (const [label, q, setup, sel] of sheetSources) await scen('dish sheet from ' + label, async () => {
      await go(q, setup); await sheetProbe(sel); await page.locator(sel).first().locator('.n').tap(); await page.waitForTimeout(1100);
      const ss = await sheetCollect(), vs = ss.filter(s => s.vis);
      ss.forEach((s, i) => assert.equal(s.pages, 0, `${label}: it is a sheet, not a page (frame ${i})`));
      assert(vs.length > (RMm ? 2 : 8), `${label}: a sheet was sampled (${vs.length} frames)`); const rest = vs.at(-1).y;
      ss.forEach((s, i) => {
        assert(Math.abs(s.row - ss[0].row) < .5 && s.sc === ss[0].sc, `${label}: the list under it stays where it was (frame ${i}: row ${s.row.toFixed(1)} vs ${ss[0].row.toFixed(1)}, scroll ${s.sc} vs ${ss[0].sc})`); });
      if (RMm) vs.forEach((s, i) => assert(Math.abs(s.y - rest) < .5, `${label}: reduced motion: it crossfades where it rests (frame ${i})`));
      else { assert(vs[0].y > H * .85, `${label}: it rises from the bottom edge (first frame top ${vs[0].y.toFixed(1)})`); let up = true;
        vs.forEach((s, i) => { if (i && up) assert(s.y <= vs[i - 1].y + .6, `${label}: its top only rises until it rests (frame ${i}: ${vs[i - 1].y.toFixed(1)} -> ${s.y.toFixed(1)})`); if (s.y <= rest + 1) up = false;
          assert(s.y >= rest - 6, `${label}: it never overshoots its rest by more than a spring's 6 px (frame ${i}: ${s.y.toFixed(1)} vs ${rest.toFixed(1)})`); }); }
      // at rest it shows the name, Add (today), where it's served and the top of the label without scrolling
      const vis = await page.evaluate(() => { const F = frame.getBoundingClientRect(), b = F.top + F.height, t = document.querySelector('#isheet').getBoundingClientRect().top;
        return ['.dn', '.dadd', '.where .hchip:last-of-type', '.label .cal'].map(s => { const e = document.querySelector('#isheet ' + s); if (!e) return s + ' missing'; const r = e.getBoundingClientRect(); return r.top >= t && r.bottom <= b + .5 ? 'ok' : s + ' cut at ' + Math.round(r.bottom - F.top); }); });
      assert.deepEqual(vis, ['ok', 'ok', 'ok', 'ok'], `${label}: at rest it shows the name, Add, where and the label's Calories`);
      assert(rest > 200, `${label}: it rests part-way up, over the list (top at ${rest.toFixed(0)})`);
      if (!RMm) { // a drag down follows the finger, and a long one puts it away
        const y0 = rest + 80; await T('touchStart', [200, y0]); const seen = [];
        for (let k = 1; k <= 12; k++) { await T('touchMove', [200, y0 + k * 25]); await page.waitForTimeout(40); seen.push([k * 25, await page.evaluate(() => document.querySelector('#isheet').getBoundingClientRect().top - frame.getBoundingClientRect().top)]); }
        seen.forEach(([dy, y]) => assert(Math.abs(y - (rest + dy)) < 1.5, `${label}: the drag follows the finger (dy ${dy}: top ${y.toFixed(1)} vs ${(rest + dy).toFixed(1)})`));
        await T('touchEnd', [200, y0 + 300]); await page.waitForTimeout(900);
        assert.equal(await page.evaluate(() => isheet.state), 'closed', `${label}: a long drag down puts it away`);
        await page.locator(sel).first().locator('.n').tap(); await page.waitForTimeout(900); }
      await page.touchscreen.tap(200, 40); await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => [isheet.state, getComputedStyle(document.querySelector('#isheet')).visibility].join()), 'closed,hidden', `${label}: a tap on the dimmed backdrop puts it away`);
      if (label === 'the plate') assert.equal(await page.evaluate(() => [psheet.state !== 'closed', activeSheet === psheet].join()), 'true,true', 'the plate is still open under it, and active again');
      if (!RMm) { await page.locator(sel).first().locator('.n').tap(); await page.waitForTimeout(900);
        await touch(line([200, rest + 200], [200, rest - 150], 10), 30); await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => isheet.state), 'top', `${label}: dragged up, it goes to full height`); }
      if (await page.evaluate(() => isheet.state) !== 'closed') { await page.touchscreen.tap(200, 20); await page.waitForTimeout(900); }
      await page.locator(sel).first().locator('.n').tap(); await page.waitForTimeout(900);
      await page.mouse.move(200, 700); await page.mouse.wheel(0, 300); await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => isheet.state), 'top', `${label}: scrolled at rest (wheel), it goes to full height`); });
    await scen('dish sheet: one spacing scale, and the label never touches "where"', async () => {
      await go('state=search', async () => { await page.keyboard.type('golden bbq'); await page.waitForTimeout(300); }); await page.locator('#sres .row .n').first().tap(); await page.waitForTimeout(900);
      const gaps = await page.evaluate(() => { const q = s => document.querySelector('#isheet ' + s).getBoundingClientRect(), seq = ['.dn', '.dsv', '.mks', '.dal', '.dadd', '.where', '.facts.label:not(.grades)', '.grades', '.ingh'];
        return seq.slice(1).map((s, i) => [seq[i] + ' > ' + s, Math.round(q(s).top - q(seq[i]).bottom)]); });
      assert.deepEqual(gaps.map(g => g[1]), [4, 8, 8, 16, 24, 24, 12, 24], 'gaps: ' + JSON.stringify(gaps)); });
    for (const on of [false, true]) await scen('dish sheet: "Show all" exactly when the ingredients are cut, and every dish rests showing name, Add, where and Calories' + (on ? ' (scores on)' : ''), async () => {
      await go('state=menu', on && (() => page.evaluate(() => { if (typeof tileSVG === 'undefined') throw new Error('no scores'); S.show.hf = S.show.cr = true; })));
      const bad = await page.evaluate(() => { const out = []; let n = 0, top = 0; const ids = Object.keys(DISH).filter(id => DISH[id].ing).filter((_, i) => i % 7 === 0);
        for (const id of ids) { const d = DISH[id]; DS = { d, refs: { [d.h]: d } }; renderDish(); n++; const ing = document.querySelector('#ing'), more = document.querySelector('#isheet [data-act=ing]'), cut = ing.scrollHeight > ing.clientHeight + 1;
          if (cut !== !!more) out.push(d.n + ': cut ' + cut + ', Show all ' + !!more);
          const mid = dishMid(); if (mid <= ST + 8) { top++; continue; }
          const b = document.querySelector('#isbody'), t0 = b.getBoundingClientRect().top;
          for (const s of ['.dn', '.dadd', '.where .hchip', '.label .cal']) { const e = b.querySelector(s); if (e && mid + GRAB_H + e.getBoundingClientRect().bottom - t0 > H + .5) out.push(d.n + ': ' + s + ' below the rest height'); } }
        return { out, n, top }; });
      assert.deepEqual(bad.out, [], `of ${bad.n} dishes`); assert(bad.top < bad.n * .05, `few dishes need the full height at rest (${bad.top} of ${bad.n})`); });
    // ---- the sheet's "where": a navigation ----
    await scen('sheet -> another hall from Search: the sheet goes, then the hall is pushed, already at the dish', async () => {
      await go('state=search', async () => { await page.keyboard.type('korean bbq'); await page.waitForTimeout(300); });
      await sRow('Korean BBQ Chicken').locator('.n').tap(); await page.waitForTimeout(900);
      const rest = await page.evaluate(() => document.querySelector('#isheet').getBoundingClientRect().top - frame.getBoundingClientRect().top);
      await page.evaluate(() => { window.__h = []; window.__hstop = 0; const f = () => { const F = frame.getBoundingClientRect(), m = document.querySelector('#menu'), on = !m.classList.contains('hide');
        __h.push({ sy: document.querySelector('#isheet').getBoundingClientRect().top - F.top, mx: on ? m.getBoundingClientRect().left - F.left : null, sc: on ? document.querySelector('#mscroll').scrollTop : null }); if (!__hstop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.locator('#isheet .hchip', { hasText: 'Berkshire' }).tap(); await page.waitForTimeout(1400);
      const hs = await page.evaluate(() => { __hstop = 1; return __h; }), on = hs.filter(h => h.mx != null);
      assert(on.length > (RMm ? 2 : 8), 'the hall was sampled arriving');
      if (!RMm) assert(on[0].sy >= rest + (H - rest) * .5 - 1, `the hall starts once the sheet is half-way out (sheet top ${on[0].sy.toFixed(0)}, rest ${rest.toFixed(0)})`);
      on.forEach((h, i) => assert.equal(h.sc, on[0].sc, `it arrives already at the dish: no scroll while it slides in (frame ${i})`));
      assert.equal(await page.evaluate(() => [S.hall, S.mmeal, NAV.at(-1).el.id, isheet.state].join()), 'B,dinner,menu,closed', 'Berkshire dinner, pushed, the sheet gone');
      const here = await page.locator('#mlist .row.here').boundingBox(); assert(here && here.y > 150 && here.y < 260, 'the dish sits under the header: ' + (here && here.y)); });
    await scen('sheet -> the hall it was opened in: it only goes away and brings the dish up', async () => {
      await go('state=menu'); await mRow('Roasted Red Pepper').locator('.n').tap(); await page.waitForTimeout(900);
      await page.locator('#isheet .hchip', { hasText: 'Worcester' }).tap(); await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(() => [S.hall, NAV.length, isheet.state, document.querySelectorAll('.menughost').length].join()), 'W,0,closed,0', 'no navigation');
      const here = await page.locator('#mlist .row.here').boundingBox(); assert(here && here.y > 150 && here.y < 300, 'the dish is brought up: ' + (here && here.y)); });
    await scen('sheet -> another hall from inside a hall: pushed over the first, and back returns to it where it was', async () => {
      await go('state=menu'); await page.evaluate(() => { const s = document.querySelector('#mscroll'); s.scrollTop = 200; }); await page.waitForTimeout(300);
      const y0 = await page.evaluate(() => document.querySelector('#mscroll').scrollTop);
      await mRow('Green Chile Posole').locator('.n').tap(); await page.waitForTimeout(900);
      await pushProbe(); await page.locator('#isheet .hchip', { hasText: 'Franklin' }).tap(); await page.waitForTimeout(1400);
      pushed(await pushCollect(), 'Franklin over Worcester, open', 'in');
      assert.equal(await page.evaluate(() => [S.hall, NAV.length, document.querySelectorAll('.menughost').length, NAV[0].under[0].className].join()), 'F,1,1,menughost', 'Franklin is pushed over a frozen Worcester');
      await pushProbe(); await back(); await page.waitForTimeout(900); pushed(await pushCollect(), 'Franklin over Worcester, back', 'out');
      assert.equal(await page.evaluate(() => [S.hall, NAV.length, document.querySelectorAll('.menughost').length, document.querySelector('#mscroll').scrollTop].join()), `W,0,0,${y0}`, 'back: Worcester where it was, nothing left over');
      if (!RMm) { await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(1200); assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.band[data-h=W]')).visibility), 'visible', 'and back from Worcester still returns into its band'); } });
    // ---- cafés: the halls' family ----
    await scen('pinned cafés are hall bands at three-quarter scale, in the halls\' grade', async () => {
      await go('pins=2'); const s = await page.evaluate(() => { const pin = document.querySelector('#pins .band'), hall = document.querySelector('.band[data-h=W]'), kids = b => [...b.children].map(c => c.className.baseVal ?? c.className).filter(c => c !== 'let').join(' ');
        return [kids(pin), kids(hall), pin.offsetHeight, getComputedStyle(pin.querySelector('.ph')).filter, getComputedStyle(pin.querySelector('.t')).mixBlendMode]; });
      assert.deepEqual(s, ['win lgrad press bt', 'win lgrad press bt', 84, 'grayscale(1) contrast(1.12)', 'multiply'], 'pinned band structure'); });
    await scen('a café page is the hall page: photo header, name over it, collapsing into the maroon bar like a hall', async () => {
      const bar = async () => page.evaluate(() => { const F = frame.getBoundingClientRect(), n = document.querySelector('#mtn').getBoundingClientRect(); return [Math.round(n.bottom - F.top), Math.round(n.height), +getComputedStyle(document.querySelector('#msolid')).opacity]; });
      await go('state=menu'); await page.evaluate(() => { document.querySelector('#mscroll').scrollTop = 600; }); await page.waitForTimeout(300); const hb = await bar();
      await go('state=place'); assert.equal(await page.evaluate(() => [document.querySelector('#menu').classList.contains('cafe'), document.querySelector('#mtn').textContent, getComputedStyle(document.querySelector('#mhead')).display].join()), 'true,Wasabi,block', 'café in the hall screen');
      await page.evaluate(() => { document.querySelector('#mscroll').scrollTop = 600; }); await page.waitForTimeout(300);
      const cb = await bar(); assert.equal(cb[0], hb[0], 'the name ends in the bar where a hall\'s does'); assert(Math.abs(cb[1] - hb[1]) <= 1, `at the same size (${cb[1]} vs ${hb[1]})`); assert.equal(cb[2], 1, 'over the same solid maroon bar'); });
    if (!RMm) await scen('a pinned café opens as the halls do: its band is a window into the page photo, continuous from the first frame', async () => {
      await go('pins=2'); await page.evaluate(() => { document.querySelector('#halls').scrollTop = 9999; }); await page.waitForTimeout(300);
      const win = await page.evaluate(() => { const b = document.querySelector('#pins .band'), F = frame.getBoundingClientRect(); window.__pb = b; return b.querySelector('.win').getBoundingClientRect().top - F.top; });
      await page.evaluate(() => { window.__c = []; window.__cstop = 0; const f = () => { if (!document.querySelector('#menu').classList.contains('hide')) __c.push(document.querySelector('#mph').getBoundingClientRect().top - frame.getBoundingClientRect().top); if (!__cstop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.locator('#pins .band').first().tap(); await page.waitForTimeout(900);
      const ys = await page.evaluate(() => { __cstop = 1; return __c; });
      assert(ys.length > 8, 'sampled'); assert(Math.abs(ys[0] - win) < TOL, `frame 1: the page photo sits exactly where the band showed it (${ys[0].toFixed(1)} vs ${win.toFixed(1)})`);
      ys.forEach((y, i) => { if (i) assert(y <= ys[i - 1] + .6, `the photo moves one way (frame ${i})`); });
      assert.equal(await page.evaluate(() => [S.hallSrc === __pb, getComputedStyle(__pb).visibility, NAV.length].join()), 'true,hidden,0', 'the band is the screen: not a push');
      await touch(line([200, 420], [200, 760], 12), 30); await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => [document.querySelector('#menu').classList.contains('hide'), getComputedStyle(__pb).visibility].join()), 'true,visible', 'a drag down returns it into its band'); });
  };

  // Round 8: marks and scores. Plant based and vegetarian are two silhouettes; healthfulness and carbon grade are opt-in
  // readings on dish rows (You tab, device-local); the ratings panel has only rules that separate ratings.
  // RED=8 runs only this block, each scenario caught (SRC=build/r8/before/index.html shows which fail on round 7).
  const round8 = async () => {
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async (q, setup) => { await page.goto(URL + (q ? '?' + q : '')); await page.waitForTimeout(500); if (setup) await setup(); };
    const clear = () => page.evaluate(() => localStorage.removeItem('udine-m2'));
    // every rendered row agrees with its dish: a reading exactly when shown and the data exists, with the right value
    const rowsAgree = (sel, hf, cr) => page.evaluate(([sel, hf, cr]) => [...document.querySelectorAll(sel)].map(r => {
      const d = r.dataset.id ? DISH[r.dataset.id] : rep(BYK[S.smeal][r.dataset.k]), h = r.querySelector('.m .hs'), c = r.querySelector('.m .cs'), bad = [];
      if (!!h !== (hf && d.hf != null)) bad.push('hs ' + !!h + ' hf ' + d.hf);
      if (!!c !== (cr && d.cr != null)) bad.push('cs ' + !!c + ' cr ' + d.cr);
      if (h && (h.textContent.trim() !== String(d.hf) || h.querySelector('rect').getAttribute('fill') !== HFC[d.hf])) bad.push('hs value ' + h.textContent + ' vs ' + d.hf);
      if (c && (c.textContent.trim() !== d.cr || c.querySelector('rect').getAttribute('fill') !== CRC[d.cr][0])) bad.push('cs value ' + c.textContent + ' vs ' + d.cr);
      return bad.length ? d.n + ': ' + bad.join(', ') : null; }).filter(Boolean).concat(document.querySelectorAll(sel).length ? [] : ['no rows for ' + sel]), [sel, hf, cr]);
    await scen('scores: off by default; the You toggles persist and update rows in a hall and in Search', async () => {
      await go('state=menu'); await clear(); await go('state=menu');
      assert.deepEqual(await rowsAgree('#mlist .row', false, false), [], 'default: no readings on hall rows');
      assert.equal(await page.locator('.hs, .cs').count(), 0, 'default: no reading anywhere');
      await page.locator('.tbar [data-tab=you]').tap(); await page.waitForTimeout(500);
      for (const k of ['hf', 'cr']) assert.equal(await page.locator(`#you [data-show=${k}]`).getAttribute('aria-checked'), 'false', k + ' starts off');
      await page.locator('#you [data-show=hf]').tap(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#you [data-show=hf]').getAttribute('aria-checked'), 'true', 'healthfulness turns on');
      await page.locator('.tbar [data-tab=halls]').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await rowsAgree('#mlist .row', true, false), [], 'health only: hall rows');
      await page.locator('.tbar [data-tab=search]').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await rowsAgree('#sres .row', true, false), [], 'health only: Search rows');
      await page.reload(); await page.waitForTimeout(500);
      await page.locator('.tbar [data-tab=you]').tap(); await page.waitForTimeout(500);
      assert.equal(await page.locator('#you [data-show=hf]').getAttribute('aria-checked'), 'true', 'healthfulness persists across a reload');
      await page.locator('#you [data-show=cr]').tap(); await page.locator('#you [data-show=hf]').tap(); await page.waitForTimeout(300);
      await go('state=menu');
      assert.deepEqual(await rowsAgree('#mlist .row', false, true), [], 'carbon only, after a reload: hall rows');
      await go('state=search', async () => { await page.keyboard.type('wings'); await page.waitForTimeout(400); });
      assert.deepEqual(await rowsAgree('#sres .row', false, true), [], 'carbon only: Search rows, now and later');
      await page.evaluate(() => { S.show.hf = true; save(); });
      await go('state=menu'); assert.deepEqual(await rowsAgree('#mlist .row', true, true), [], 'both: hall rows');
      await page.locator('#mlist .row .n').first().tap(); await page.waitForTimeout(900);
      assert.equal(await page.locator('#isheet .mks .hs').count() + await page.locator('#isheet .mks .cs').count() >= 1, true, 'both: the sheet patch row carries the readings');
      await clear(); await go('state=menu');
      assert.equal(await page.locator('.hs, .cs').count(), 0, 'cleared: rows are calm again'); });
    await scen('scores: missing data draws nothing (no placeholder); a 0 is a score, not missing', async () => {
      await go('state=menu', async () => { await page.evaluate(() => { S.show.hf = S.show.cr = true; }); });
      const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('#mlist .row')], a = DISH[rows[0].dataset.id], b = DISH[rows[1].dataset.id];
        const was = [a.hf, b.cr]; a.hf = null; b.cr = null; renderMenuList(); const ra = document.querySelector(`#mlist .row[data-id="${a.id}"]`), rb = document.querySelector(`#mlist .row[data-id="${b.id}"]`);
        const out = { aHs: !!ra.querySelector('.hs'), aCs: !!ra.querySelector('.cs') === (a.cr != null), bCs: !!rb.querySelector('.cs'), bHs: !!rb.querySelector('.hs') === (b.hf != null),
          aText: ra.querySelector('.m').innerText, bText: rb.querySelector('.m').innerText };
        a.hf = null; a.cr = null; renderMenuList(); out.none = document.querySelector(`#mlist .row[data-id="${a.id}"] .m`).innerHTML.includes(' sc"');
        DS = { d: a, refs: { [a.h]: a } }; renderDish(); out.sheet = !!document.querySelector('#isheet .mks-s, #isheet .grades');
        a.hf = was[0]; a.cr = DISH[a.id].cr; b.cr = was[1]; return out; });
      assert.deepEqual([r.aHs, r.aCs, r.bCs, r.bHs, r.none, r.sheet], [false, true, false, true, false, false], 'missing: ' + JSON.stringify(r));
      assert(!/[–—?]|n\/a/i.test(r.aText + r.bText), 'no placeholder text: ' + r.aText + ' | ' + r.bText);
      const real = await page.evaluate(() => { const d = Object.values(DISH).find(d => d.cr == null && d.hf != null); DS = { d, refs: { [d.h]: d } }; renderDish();
        return [document.querySelectorAll('#isheet .mks .cs').length, document.querySelectorAll('#isheet .mks .hs').length, document.querySelectorAll('#isheet .grades .crs').length, document.querySelectorAll('#isheet .grades .gr').length]; });
      assert.deepEqual(real, [0, 1, 0, 1], 'a real dish with no carbon grade: no footprint, no scale, one rating');
      const zero = await page.evaluate(() => { const d = Object.values(DISH).find(d => d.hf === 0); DS = { d, refs: { [d.h]: d } }; renderDish(); const h = document.querySelector('#isheet .mks .hs'); return h && h.textContent.trim(); });
      assert.equal(zero, '0', 'healthfulness 0 (an H0 code) shows a 0 tile');
      // unscored for healthfulness (no H0..H7 in the feed's legend codes, though data-healthfulness carries a number): no tile, no scale
      const uns = await page.evaluate(() => { const ds = Object.values(DISH).filter(d => d.hf == null); const d = ds.find(d => !d.day && d.meal === 'lunch') || ds[0];
        DS = { d, refs: { [d.h]: d } }; renderDish(); const out = [ds.length, d.n, document.querySelectorAll('#isheet .hs, #isheet .hscale').length];
        if (!d.day) { S.hall = d.h; S.mmeal = d.meal; openHall(d.h, true); renderMenuList(); const r = document.querySelector(`#mlist .row[data-id="${d.id}"]`); out.push(r ? r.querySelectorAll('.hs').length : 'no row'); }
        return out; });
      assert(uns[0] >= 10, 'the feed has unscored dishes (' + uns[0] + ')');
      assert.deepEqual(uns.slice(2), [0, 0], 'an unscored dish (' + uns[1] + ') shows no health tile on its row, its sheet or its panel'); });
    await scen('ratings panel: every rule separates two ratings; no rule ends a section that is not there', async () => {
      await go('state=menu');
      const bad = await page.evaluate(() => { const out = []; const base = Object.values(DISH).find(d => d.hf != null && d.cr != null);
        for (const [hf, cr] of [[base.hf, base.cr], [base.hf, null], [null, base.cr]]) { const d = { ...base, hf, cr }; DS = { d, refs: { [d.h]: d } }; renderDish();
          const g = document.querySelector('#isheet .grades'), kids = [...g.children], px = (e, s) => parseFloat(getComputedStyle(e)['border' + s + 'Width']) || 0;
          const tag = `[${hf},${cr}] `;
          if (g.classList.contains('label')) out.push(tag + 'the panel borrows the label class (and its section rules)');
          for (const e of g.querySelectorAll('*')) for (const s of ['Top', 'Bottom']) { const w = px(e, s); if (w > 1) out.push(tag + `a ${w}px ${s.toLowerCase()} rule on ${e.className || e.tagName}`); }
          const ratings = kids.length, rules = kids.filter((e, i) => px(e, 'Top') > 0 && i > 0).length + kids.filter((e, i) => px(e, 'Bottom') > 0 && i < kids.length - 1).length;
          if (rules !== ratings - 1) out.push(tag + `${rules} rules between ${ratings} ratings`);
          if (px(kids.at(-1), 'Bottom') || px(kids[0], 'Top')) out.push(tag + 'a rule at the panel edge');
          for (const k of kids) for (const e of k.querySelectorAll('*')) if (px(e, 'Bottom') || px(e, 'Top')) out.push(tag + 'a rule inside one rating: ' + (e.className || e.tagName)); }
        return out; });
      assert.deepEqual(bad, [], 'ratings panel rules'); });
    await scen('plant based and vegetarian: different silhouettes on rows, patches and chips', async () => {
      await go('state=menu');
      const r = await page.evaluate(() => { const ds = el => el ? [...el.querySelectorAll('path,circle')].map(p => p.getAttribute('d') || 'c' + p.getAttribute('cx')).sort().join('|') : null;
        const row = l => ds(document.querySelector(`#mlist .tg[aria-label="${l}"]`));
        const patch = bit => { const d = Object.values(DISH).find(d => !d.day && (d.d & 3) === bit); DS = { d, refs: { [d.h]: d } }; renderDish(); return ds(document.querySelector('#isheet .mk')); };
        const out = { rowP: row('Plant based'), rowV: row('Vegetarian'), patP: patch(2) || patch(3), patV: patch(1) };
        renderLenses(); out.chipP = ds(document.querySelector('[data-lens=plant]')); out.chipV = ds(document.querySelector('[data-lens=veg]')); return out; });
      for (const k in r) assert(r[k], 'rendered: ' + k);
      for (const [p, v] of [['rowP', 'rowV'], ['patP', 'patV'], ['chipP', 'chipV']]) { const P = r[p].split('|'), V = r[v].split('|');
        assert.deepEqual(P.filter(x => V.includes(x)), [], `${p} and ${v} share no shape`); }
      // silhouette, not fill: each mark is filled solid and rasterised; the two shapes must overlap less than 60% (IoU).
      // Round 7's filled and outlined leaf score 1.0 here.
      const iou = await page.evaluate(async () => { const mask = async l => { const svg = document.querySelector(`#mlist .tg[aria-label="${l}"] svg`).cloneNode(true);
          svg.querySelectorAll('path,circle').forEach(e => { e.setAttribute('fill', '#000'); e.setAttribute('stroke', '#000'); });
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', 64); svg.setAttribute('height', 64);
          const img = new Image(); img.src = 'data:image/svg+xml,' + encodeURIComponent(svg.outerHTML); await img.decode();
          const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
          return [...x.getImageData(0, 0, 64, 64).data].filter((_, i) => i % 4 === 3).map(a => a > 128); };
        const P = await mask('Plant based'), V = await mask('Vegetarian'); let i = 0, u = 0; P.forEach((p, k) => { i += p && V[k]; u += p || V[k]; }); return i / u; });
      assert(iou < .6, `plant and veg silhouettes overlap ${iou.toFixed(2)} (IoU)`); if (process.env.RED) results.push(`       (plant/veg silhouette IoU ${iou.toFixed(2)})`);
      assert.equal(new Set([r.rowP, r.patP, r.chipP]).size, 1, 'plant based is one mark everywhere');
      assert.equal(new Set([r.rowV, r.patV, r.chipV]).size, 1, 'vegetarian is one mark everywhere'); });
    await scen('every badge on: meta groups wrap whole and flush, at 360 and 390, longest names included', async () => {
      for (const w of [360, 390]) { await page.setViewportSize({ width: w, height: 844 });
        const check = sel => page.evaluate(sel => { const out = []; for (const m of document.querySelectorAll(sel)) { const M = m.getBoundingClientRect(), gs = [...m.querySelectorAll(':scope > .mg')];
            if (!gs.length || [...m.childNodes].some(n => n.nodeType === 1 ? !n.classList.contains('mg') : n.textContent.trim())) out.push('loose content: ' + m.innerText);
            let lineTop = null; for (const g of gs) { const r = g.getBoundingClientRect(), lines = new Set([...g.getClientRects()].map(x => Math.round(x.top)));
              if (r.height > 26) out.push(`group split over lines (${Math.round(r.height)}px): ${g.innerText}`);
              if (r.right > M.right + .5) out.push('overflows: ' + g.innerText);
              const newLine = lineTop == null || r.top > lineTop + 8; if (newLine && Math.abs(r.left - M.left) > .5) out.push(`wrapped line starts ${Math.round(r.left - M.left)}px in: ${g.innerText}`);
              if (newLine) lineTop = r.top; } }
          return out; }, sel);
        await go('state=menu', async () => { await page.evaluate(() => { S.show.hf = S.show.cr = true; }); });
        for (const h of ['W', 'F', 'H', 'B']) { await page.evaluate(h => { openHall(h, true); renderMenuList(); }, h); assert.deepEqual(await check('#mlist .row .m'), [], `${w}px, hall ${h}`); }
        await go('state=search', async () => { await page.evaluate(() => { S.show.hf = S.show.cr = true; }); });
        for (const q of ['', 'rigatoni', 'ramen', 'penne w', 'wings', 'posole']) { await page.evaluate(q => { S.q = q; renderSearch(); }, q); assert.deepEqual(await check('#sres .row .m'), [], `${w}px, Search "${q}"`); }
        // a Search row keeps its shape whatever the toggles: the hall letters live under the +, never in the meta line
        const shape = await page.evaluate(() => { const out = []; for (const q of ['', 'rigatoni', 'posole', 'sweet potato', 'chicken']) { S.q = q; const hs = {};
            for (const on of [false, true]) { S.show.hf = S.show.cr = on; renderSearch();
              for (const r of document.querySelectorAll('#sres .row:not(.later)')) { if (!r.querySelector('.lane > .tags') || r.querySelector('.m .tags')) out.push('letters not under the +: ' + r.dataset.k);
                const h = Math.round(r.getBoundingClientRect().height), m = r.querySelector('.m'), lines = new Set([...m.children].map(c => Math.round(c.getBoundingClientRect().top))).size;
                if (!on) hs[r.dataset.k] = h; else if (lines === 1 && h !== hs[r.dataset.k]) out.push(`${r.dataset.k}: ${hs[r.dataset.k]}px off, ${h}px on`); } } }
          S.show.hf = S.show.cr = true; return out; });
        assert.deepEqual(shape, [], `${w}px: Search rows keep their shape with the scores on`);
        const long = await page.evaluate(() => { S.q = 'cheese rigatoni'; renderSearch(); const r = document.querySelector('#sres .row'); return [r.querySelector('.n').textContent, !!r.querySelector('.hs'), !!r.querySelector('.cs'), !!r.querySelector('.tg')]; });
        assert.deepEqual(long, ['Cheese Rigatoni w/Plant Based Nasoya Bolognese Sauce', true, true, true], 'the longest name carries every badge'); }
      await page.setViewportSize({ width: 390, height: 844 }); });
  };
  if (process.env.RED) { await (process.env.RED === '8' ? round8 : round7)(); console.log(results.join('\n')); await browser.close(); return; }

  // Round 5: the rack has one seam colour. Every seam between the Halls header, the hall bands and the pinned cafés is
  // deep maroon (the stack's own container), never the chalk of #halls behind it. Checked at three widths, at rest, after a
  // hall opens and closes, after a pin opens and closes, and after a tab round trip. Plus: the event row's end gutter
  // equals its start gutter.
  for (const w of [360, 390, 430]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
    const p2 = await c2.newPage(); await p2.goto(URL + '?pins=2'); await p2.waitForTimeout(400);
    const seams = async when => {
      // a pixel check, not a hit test: Blink's hit testing and its painted seams disagree by a fraction of a pixel
      const sm = await p2.evaluate(() => { const els = [...document.querySelectorAll('#halls .hhead, #halls .band')], out = [];
        for (let i = 1; i < els.length; i++) { const a = els[i - 1].getBoundingClientRect(), b = els[i].getBoundingClientRect(); out.push([els[i - 1].className + '/' + els[i].className, a.bottom, b.top]); } return out; });
      const buf = await p2.screenshot();
      const bad = JSON.parse(require('child_process').execSync(`python3 -c "
import sys,io,json
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB'); W,H=im.size; out=[]
for name,a,b in json.loads(sys.argv[1]):
  if b-a>1.01: out.append('%s: %.2fpx apart'%(name,b-a))
  for x in (10*3, W-20*3):
    for y in range(int(a*3)-1, min(H, int(b*3)+2)):
      if min(im.getpixel((x,y)))>200: out.append('%s: ground showing at y %d'%(name,y)); break
print(json.dumps(out))" '${JSON.stringify(sm)}'`, { input: buf }).toString());
      assert.deepEqual(bad, [], `${w}px, ${when}: seams in the rack show the ground: ${bad.join("; ")}`);
    };
    await seams('at rest');
    await p2.locator('.band[data-h=W]').tap(); await p2.waitForTimeout(900); await p2.locator('#mctl [data-act=back]').tap(); await p2.waitForTimeout(900);
    await seams('after a hall closes');
    await p2.locator('#pins .band').first().tap(); await p2.waitForTimeout(800); await p2.locator('#mctl [data-act=back]').tap(); await p2.waitForTimeout(800);
    await seams('after a pin closes');
    await p2.locator('.tbar button[data-tab=search]').tap(); await p2.waitForTimeout(500);
    const gut = await p2.evaluate(async () => { document.querySelector('#q').blur(); const c = document.querySelector('#evc'); c.scrollLeft = c.scrollWidth; await new Promise(r => setTimeout(r, 400));
      const cr = c.getBoundingClientRect(), cards = c.querySelectorAll('.evcard'), last = cards[cards.length - 1].getBoundingClientRect(); c.scrollLeft = 0; await new Promise(r => setTimeout(r, 300));
      return [Math.round(cards[0].getBoundingClientRect().left - cr.left), Math.round(cr.right - last.right)]; });
    assert.equal(gut[1], gut[0], `${w}px: the last event card's end gutter (${gut[1]}) matches the first card's start gutter (${gut[0]})`);
    await p2.locator('.tbar button[data-tab=halls]').tap(); await p2.waitForTimeout(500);
    await seams('after Search -> Halls');
    await c2.close();
  }

  // A. Search tab, brisket first (plate {W,B} -> {W}), keyboard stays up between picks
  await page.goto(URL); await page.waitForTimeout(400); taps = 0; scrolls = 0;
  await tap(page.locator('.tbar button[data-tab=search]'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q', 'tab tap focuses the field');
  await page.keyboard.type('brisket'); await page.waitForTimeout(200);
  const vis = async n => { const b = await sRow(n).boundingBox(); return b && b.y + b.height < 844 - 57 - 68; };
  assert(await vis('Beef Brisket Noodle Bowl'), 'brisket in view without scrolling');
  await tap(sRow('Beef Brisket Noodle Bowl').locator('.add'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q', 'keyboard stays up after a pick');
  assert.equal(await page.locator('#barL').textContent(), 'Worcester or Berkshire lunch');
  assert.equal(await page.evaluate(() => document.activeElement.selectionEnd - document.activeElement.selectionStart), 7, 'query selected for replace');
  await page.keyboard.type('bbq'); await page.waitForTimeout(200);
  assert(await vis('Golden BBQ Chicken Thigh'), 'Golden BBQ in view above the bar without scrolling');
  await tap(sRow('Golden BBQ Chicken Thigh').locator('.add'));
  assert.equal(await page.locator('#barL').textContent(), 'Worcester lunch', 'plate narrows to Worcester with no prompt');
  await tap(sRow('Golden BBQ Chicken Thigh').locator('.inc'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
  await tap(page.locator('#bar [data-act=barlog]'));
  await checkLogged('A');
  results.push(`A search: ${taps} taps, typing "brisket" + "bbq", ${scrolls} scrolls`);

  // B. Halls: Worcester band -> Golden BBQ (one flick) -> station jump to Noodle Bowl -> Log
  await page.goto(URL); await page.waitForTimeout(400); taps = 0; scrolls = 0;
  await tap(page.locator('.band[data-h=W]'));
  assert(await page.locator('#menu').isVisible());
  if (!(await visible(mRow('Golden BBQ Chicken Thigh')))) await flick(600, 420);
  assert(await visible(mRow('Golden BBQ Chicken Thigh')), 'Golden BBQ in reach');
  await tap(mRow('Golden BBQ Chicken Thigh').locator('.add'));
  await tap(mRow('Golden BBQ Chicken Thigh').locator('.inc'));
  await tap(page.locator('#mswitch .swbtn')); // the pinned station switcher opens the jump list
  await tap(page.locator('#stidx [data-jump]', { hasText: 'Noodle Bowl' }));
  await page.waitForTimeout(500);
  assert(await visible(mRow('Beef Brisket Noodle Bowl')), 'jump lands on Noodle Bowl');
  await tap(mRow('Beef Brisket Noodle Bowl').locator('.add'));
  assert.equal(await page.locator('#barL').textContent(), 'Worcester lunch', 'menu adds are scoped to the hall');
  await tap(page.locator('#bar [data-act=barlog]'));
  await checkLogged('B');
  results.push(`B hall + station index: ${taps} taps, ${scrolls} scrolls`);

  // C. Halls, scrolling only
  await page.goto(URL); await page.waitForTimeout(400); taps = 0; scrolls = 0;
  await tap(page.locator('.band[data-h=W]'));
  if (!(await visible(mRow('Golden BBQ Chicken Thigh')))) await flick(600, 420);
  await tap(mRow('Golden BBQ Chicken Thigh').locator('.add'));
  await tap(mRow('Golden BBQ Chicken Thigh').locator('.inc'));
  for (let i = 0; i < 6 && !(await visible(mRow('Beef Brisket Noodle Bowl'))); i++) await flick(640, 240);
  await tap(mRow('Beef Brisket Noodle Bowl').locator('.add'));
  await tap(page.locator('#bar [data-act=barlog]'));
  await checkLogged('C');
  results.push(`C hall + scrolling: ${taps} taps, ${scrolls} scrolls`);

  // Gestures: bar drag-up opens the sheet; drag past top rubber-bands; fling down closes
  await page.goto(URL + '?state=typed'); await page.waitForTimeout(500);
  const bar = await page.locator('#bar').boundingBox();
  await touch(line([200, bar.y + 30], [200, bar.y - 260], 10));
  let y = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#psheet')).transform).m42);
  assert(y < 500 && y > 30, 'bar drag-up settles the sheet at a detent: ' + y);
  await touch(line([200, y + 10], [200, 0], 10).concat([[200, -200]].map(p => p)), 16);
  y = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#psheet')).transform).m42);
  assert(y >= 20 && y < 60, 'drag past top springs back to the large detent: ' + y);
  await touch(line([200, y + 10], [200, y + 400], 4), 8);
  await page.waitForTimeout(400);
  // M2: the sheet is the bar grown taller, so "closed" is the bar back in its own slot above the tab bar
  assert.equal(await page.evaluate(() => [document.querySelector('#bar').parentElement.id, psheet.state, getComputedStyle(document.querySelector('#psheet')).visibility].join()), 'frame,closed,hidden', 'fling down closes back into the bar');
  // M2: a plain tap on the bar opens the sheet (M1's scrim swallowed the tap's click and closed it again)
  await page.locator('#bar .txt').tap(); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => psheet.state + (document.querySelector('#bar').classList.contains('insheet') ? ' insheet' : '')), 'mid insheet', 'tap on the bar opens the sheet, bar on top');
  await page.locator('#pscrim').tap({ position: { x: 200, y: 60 } }); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => psheet.state), 'closed');
  // M2: with the keyboard up (bar lifted over it), the opened sheet still has the bar as its top edge
  assert.equal(await page.evaluate(async () => { const f = document.querySelector('#frame'); f.classList.add('kb'); f.style.setProperty('--kb', '300px');
    plateOpen(); psheet.to('mid'); await new Promise(r => setTimeout(r, 900));
    const d = document.querySelector('#bar').getBoundingClientRect().top - document.querySelector('#psheet').getBoundingClientRect().top;
    psheet.to('closed'); await new Promise(r => setTimeout(r, 900)); f.classList.remove('kb'); return Math.round(d); }), 0, 'bar stays the sheet\'s top edge with the keyboard up');

  // Second plate: add a Franklin-only dish from search -> new plate, no dialog
  await page.goto(URL + '?state=typed'); await page.waitForTimeout(500);
  await page.locator('#q').fill('pulled pork'); await page.waitForTimeout(200);
  await sRow('BBQ Pulled Pork').locator('.add').tap(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => __S.plates.length), 2, 'incompatible add starts a second plate');
  // ambiguous plate at Log: inline hall choice
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('brisket');
  await sRow('Beef Brisket Noodle Bowl').locator('.add').tap(); await page.locator('#bar [data-act=barlog]').tap(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#bar [data-act=logat]').count(), 2, 'Log asks Worcester or Berkshire inline');
  await page.locator('#bar [data-act=logat][data-h=B]').tap(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => __S.log.at(-1).items[0].cal), 220, 'Berkshire brisket logs at 220');
  // no-match -> custom food -> plate
  await page.locator('#q').fill('chobani'); await page.waitForTimeout(200);
  await page.locator('#sres [data-act=custom]').first().tap(); await page.waitForTimeout(500);
  await page.locator('#cc').fill('140'); await page.locator('#cp').fill('12');
  await page.locator('#cform .btn').tap(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => __S.plates[__S.front].items[0].n), 'chobani');
  // - steps 1 -> half -> remove
  await page.goto(URL + '?state=menu'); await page.waitForTimeout(500);
  const r = mRow('Black Bean Burger');
  const rh0 = (await r.boundingBox()).height;
  await r.locator('.add').tap(); await page.waitForTimeout(600); await r.locator('.dec').tap(); await page.waitForTimeout(350);
  assert.equal((await r.boundingBox()).height, rh0, '+ -> stepper never re-wraps the row');
  assert.equal(await r.locator('.q').textContent(), '½');
  await r.locator('.dec').tap(); await page.waitForTimeout(350);
  assert.equal(await r.locator('.add').count(), 1, 'half -> removed');
  // back to Halls via reverse transition; every tab renders
  await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(1000);
  assert(await page.locator('#menu').isHidden());
  for (const t of ['you', 'search', 'halls']) { await page.locator(`.tbar button[data-tab=${t}]`).tap(); await page.waitForTimeout(200); }
  for (const p of ['favs', 'diet', 'rank', 'export']) { await page.locator('.tbar button[data-tab=you]').tap(); await page.waitForTimeout(100); await page.locator(`[data-p=${p}]`).tap(); await page.waitForTimeout(420); assert(await page.locator('.page').last().isVisible(), p); await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(350); }

  // Round 2: places, events, real hours, transition bookkeeping
  await page.goto(URL); await page.waitForTimeout(300);
  assert.equal(await page.locator('.band[data-h=W] .st').textContent(), 'Open until midnight', 'Worcester hours from get_infov2 (07:00-23:59)');
  assert.equal(await page.locator('.band[data-h=F] .st').textContent(), 'Open until 9 PM');
  await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(450);
  assert(await page.locator('.page[data-p=cafes]').isVisible(), 'area row opens cafés');
  const openRows = await page.locator('.page[data-p=cafes] .lrow').count();
  await page.locator('[data-act=opennow]').tap(); await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-act=opennow]').getAttribute('aria-pressed'), 'false'); assert(await page.locator('.page[data-p=cafes] .lrow').count() >= openRows, 'Open now off never hides places'); assert.equal(openRows, 27, 'all 27 cafés are open at 12:40');
  await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Wasabi' }).tap(); await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => [S.cafe != null, document.querySelector('#menu').classList.contains('cafe')].join()), 'true,true', 'café detail (the hall screen, café mode)');
  assert.match(await page.locator('#mts').textContent(), /Open until 9 PM/);
  await page.locator('#mlist .lrow', { hasText: 'California Roll' }).locator('.add').tap(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#cn').inputValue(), 'California Roll', 'café menu item -> custom food, name prefilled');
  await page.goto(URL); await page.waitForTimeout(300);
  // Round 4: events live in Search's idle state (4 cards, IPD + its Hours merged), snap, open the event page
  const wTop = (await page.locator('.band[data-h=W]').boundingBox()).y;
  assert(wTop < 160, 'Halls is compact again; Worcester band at ' + wTop);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#evc .evcard').count(), 4, '5 feed entries -> 4 rows');
  assert.equal(await page.locator('#evc .evcard').first().locator('.evtag').textContent(), 'Mon, Oct 12');
  // M2: lens chips sit above the events, so tapping one never moves the chip row
  await page.waitForTimeout(300);   // let the tab's fade through finish
  const chipY = (await page.locator('[data-lens=protein]').boundingBox()).y;
  await page.locator('[data-lens=protein]').tap(); await page.waitForTimeout(400);
  assert.equal((await page.locator('[data-lens=protein]').boundingBox()).y, chipY, 'chip row stays under the finger');
  assert(await page.locator('#sdisc').isHidden(), 'a lens leaves the idle hub');
  await page.locator('[data-lens=protein]').tap(); await page.waitForTimeout(400);
  await page.locator('#evc .evcard').first().tap(); await page.waitForTimeout(650);
  assert.deepEqual(await page.locator('.page[data-p=event] a.evbtn').allTextContents(), ['See the menu', 'Holiday hours'], 'merged hours entry becomes a second link');
  await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(350);
  await page.locator('#q').fill('x'); await page.waitForTimeout(350);
  assert(await page.locator('#sdisc').isHidden(), 'typing leaves the idle hub');
  assert.equal(await page.evaluate(() => document.querySelectorAll('img.trav').length), 0, 'event banner: no shared layer left at rest');
  await page.goto(URL + '?events=1&state=search'); await page.waitForTimeout(300);
  assert.equal(await page.locator('#evc.one .evcard').count(), 1, 'one event: one full-width card');
  await page.goto(URL + '?events=0&state=search'); await page.waitForTimeout(300);
  assert(await page.locator('#sdisc').isHidden(), 'no events -> no carousel, no empty state');
  // contextual: the all-DCs event shows as a quiet note inside each hall menu this week
  await page.goto(URL + '?state=menu&hall=H'); await page.waitForTimeout(400);
  assert.equal(await page.locator('#mlist .evnote').count(), 1, 'IPD note in Hampshire');

  // Round 4: only the tapped band moves; every other band, the Halls header and the café rows hold still in every frame
  for (const h of ['W', 'H']) {
    await page.goto(URL + '?slow=6'); await page.waitForTimeout(400);
    const still = () => page.evaluate(h => [...document.querySelectorAll(`.band:not([data-h=${h}]), .hhead, #areas`)].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); }).join('|'), h);
    const r0 = await still(); const hy = [];
    await page.locator(`.band[data-h=${h}]`).click();
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(220); assert.equal(await still(), r0, `open ${h}: Halls moved at sample ${i}`); hy.push(await page.evaluate(() => getComputedStyle(document.querySelector('#mhead')).transform)); }
    if (!process.env.RM) assert(new Set(hy).size > 3, 'the header itself does move');   // reduced motion: the menu crossfades instead
    await page.waitForTimeout(1500);
    await page.locator('#mctl [data-act=back]').click();
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(220); assert.equal(await still(), r0, `close ${h}: Halls moved at sample ${i}`); }
  }

  // Round 4: dish detail with the full label, ingredients expand, search results open it too, plate Full label
  await page.goto(URL + '?state=menu'); await page.waitForTimeout(400);
  await mRow('Golden BBQ Chicken Thigh').locator('.n').tap(); await page.waitForTimeout(600);
  const lab = page.locator('#isheet .label:not(.grades)');
  assert(await lab.isVisible(), 'detail view opens with a label');
  for (const n of ['Total Fat', 'Saturated Fat', 'Trans Fat', 'Cholesterol', 'Sodium', 'Total Carbohydrate', 'Dietary Fiber', 'Total Sugars', 'Protein'])
    assert.equal(await lab.locator('.lr', { hasText: n }).count() >= 1, true, 'label row ' + n);
  const sod = lab.locator('.lr.sod');
  assert.match(await sod.textContent(), /Sodium 685\.5mg/); assert.equal((await sod.locator('.dv').textContent()).trim(), '30%');
  assert.match(await page.locator('#isheet .dal').textContent(), /Corn/, 'allergens shown');
  assert.equal(await page.locator('#isheet .crs i.on').textContent(), 'C'); assert.equal(await page.locator('#isheet .hscale i.on').textContent(), '3');
  const ing = page.locator('#ing'); const h0 = (await ing.boundingBox()).height;
  await page.locator('#isheet [data-act=ing]').tap(); await page.waitForTimeout(400);
  const h1 = (await ing.boundingBox()).height;
  assert(h1 > h0 * 2, `ingredients expand ${h0} -> ${h1}`);
  await page.goto(URL + '?state=typed'); await page.waitForTimeout(400);
  await sRow('Golden BBQ Chicken Thigh').locator('.n').tap(); await page.waitForTimeout(600);
  assert(await page.locator('#isheet .label:not(.grades)').isVisible(), 'search result opens the same detail view');
  await page.goto(URL + '?state=plate'); await page.waitForTimeout(600);
  await page.locator('#psheet [data-act=fulllabel]').tap(); await page.waitForTimeout(600);
  assert.equal((await page.locator('#isheet .label:not(.grades) .cal b').textContent()).trim(), '404', 'plate Full label sums the plate');

  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('coffee'); await page.waitForTimeout(200);
  assert(await page.locator('#sres .prow2', { hasText: "People's Organic Coffee" }).count() === 1, 'search finds cafés');
  // M2 r2: places are first-class results; a café result grows into its page
  await page.locator('#q').fill('wasabi'); await page.waitForTimeout(150);
  await page.locator('#sres [data-act=cafe]').first().tap(); await page.waitForTimeout(700);
  assert.equal(await page.locator('#mtn').textContent(), 'Wasabi', 'a place result opens its page');
  await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(600);
  // a hall result: the hall is pushed over Search (the hall belongs to the Search tab), and popped back
  await page.locator('#q').fill('worcester'); await page.waitForTimeout(150);
  await page.locator('#sres .prow2[data-act=hall]').first().tap(); await page.waitForTimeout(900);
  assert(await page.locator('#menu').isVisible(), 'hall result opens the hall');
  assert.equal(await page.evaluate(() => [S.tab, S.hallTab, S.hallSrc, NAV.at(-1).el.id].join()), 'search,search,,menu', 'pushed over Search');
  assert.equal(await page.evaluate(() => document.querySelector('#mhead').style.clipPath), 'none');
  await page.evaluate(() => { document.querySelector('#mscroll').scrollTop = 400; }); await page.waitForTimeout(200);
  await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(1200);
  assert(await page.locator('#menu').isHidden(), 'close from collapsed');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#sres .prow2[data-act=hall]')).visibility), 'visible', 'the row is back');
  // from Halls: the band is the source, hidden while it is the screen; identity transforms at rest
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.band[data-h=W]').tap(); await page.waitForTimeout(900);
  if (!process.env.RM) assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.band[data-h=W]')).visibility), 'hidden');
  assert.equal(await page.evaluate(() => document.querySelector('#mhead').style.clipPath), 'none');
  // interactive back: a short drag down springs back, a long one completes; an edge swipe completes
  if (!process.env.RM) {
    await touch(line([200, 420], [200, 470], 8), 30); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => [XP, !document.querySelector('#menu').classList.contains('hide')].join()), '1,true', 'short drag-back cancels');
    await page.evaluate(() => { window.__alive = 1; });
    await touch(line([200, 420], [200, 720], 12), 30); await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.__alive), 1, 'same page: the gesture closed it, not a navigation');
    assert(await page.locator('#menu').isHidden(), 'long drag-back completes');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.band[data-h=W]')).visibility), 'visible');
    await page.locator('.band[data-h=H]').tap(); await page.waitForTimeout(900);
    await page.evaluate(() => { window.__alive = 1; });
    await touch(line([4, 500], [300, 505], 12), 30); await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.__alive), 1, 'same page: the gesture closed it, not a navigation');
    assert(await page.locator('#menu').isHidden(), 'edge swipe completes');
    // a page too: an edge swipe shrinks it back into its row
    await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(700);
    await page.evaluate(() => { window.__alive = 1; });
    await touch(line([4, 500], [320, 505], 12), 30); await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.__alive), 1, 'same page: the gesture closed it, not a navigation');
    assert.equal(await page.locator('.page').count(), 0, 'edge swipe closes a page');
  }
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#halls .band, #halls > .sec')].filter(e => e.style.transform).length), 0, 'Halls content back in place');

  // Round 5: where can I get this, now or next. A pure answer from the clock (minutes after midnight), checked at four times,
  // then the rendered block: served now; now plus later at another hall; later today only; tomorrow only; and the hall tags.
  const say = (n, t) => page.evaluate(([n, t]) => whereAnswer(norm(n), t).map((g, i, A) => whenText(g, A[i - 1]) + ' ' + g.hs.join('')).join(' | '), [n, t]);
  await page.goto(URL); await page.waitForTimeout(300);
  assert.equal(await say('Green Chile Posole', 760), 'Lunch now, until 3:30 PM WFHB', '12:40: posole at every hall now');
  assert.equal(await say('Green Chile Posole', 945), 'Dinner from 4:30 PM WFHB', '3:45, between meals: next is dinner');
  assert.equal(await say('Green Chile Posole', 1290), 'Tomorrow, lunch from 11 AM H', '9:30 PM: tomorrow');
  assert.equal(await say('Black Bean Burger', 760), 'Lunch now, until 3:30 PM WFB | Dinner from 4:30 PM H', 'now, then later at another hall');
  assert.equal(await say('Black Bean Burger', 1430), 'Late night now, until midnight W', '11:50 PM: late night');
  assert.equal(await say('Chewy M&M Bar', 760), "Grab 'N Go now, until 4 PM F | Until 8 PM WB", 'two closing times for the same meal');
  assert.equal(await say('Beef Brisket Noodle Bowl', 945), '', 'nothing left: no answer');
  const where = async n => { await page.goto(URL); await page.waitForTimeout(300);
    await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type(n.toLowerCase()); await page.waitForTimeout(300);
    await page.locator('#sres .row', { has: page.locator('.n', { hasText: new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }) }).first().locator('.n').tap(); await page.waitForTimeout(700);
    return page.evaluate(() => [...document.querySelectorAll('#isheet .where .wl')].map(l => l.querySelector('.wt').textContent + ': ' + [...l.querySelectorAll('.hchip')].map(c => c.textContent).join(', '))); };
  assert.deepEqual(await where('Beef Brisket Noodle Bowl'), ['Lunch now, until 3:30 PM: WWorcester, BBerkshire'], 'served now');
  assert.deepEqual(await where('Black Bean Burger'), ['Lunch now, until 3:30 PM: WWorcester, FFranklin, BBerkshire', 'Dinner from 4:30 PM: HHampshire'], 'now, and later at another hall');
  assert.deepEqual(await where('Korean BBQ Chicken'), ['Dinner from 4:30 PM: BBerkshire'], 'later today only');
  assert.deepEqual(await where('Chinese Twist Cruller'), ['Tomorrow, breakfast from 7 AM: WWorcester, FFranklin'], 'tomorrow only');
  assert.equal(await page.locator('#isheet .agrid, #isheet .adays').count(), 0, 'no grid, no day switch');
  for (const c of await page.locator('#isheet .hchip').all()) { const bb = await c.boundingBox(); assert(bb.height >= 44 && bb.width >= 44, 'hall tag is a 44px target'); }
  // search rows: under "Lunch now" only the halls serving it; later rows say when in words
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('bbq'); await page.waitForTimeout(300);
  assert.equal(await sRow('Golden BBQ Chicken Thigh').locator('.tags').getAttribute('aria-label'), 'Served now at Worcester');
  assert.equal(await sRow('Golden BBQ Chicken Thigh').locator('.tags .ht').count(), 1, 'only the hall serving it, no empty letters');
  assert.equal(await sRow('Korean BBQ Chicken').locator('.m').innerText().then(t => t.replace(/\s+/g, ' ').trim()), '342 cal 7.2g protein Dinner B');
  assert.equal(await sRow('Korean BBQ Chicken').locator('.tags').getAttribute('aria-label'), 'Dinner at Berkshire');
  // a tag opens that hall at that meal and day, scrolled to the dish
  await sRow('Korean BBQ Chicken').locator('.n').tap(); await page.waitForTimeout(700);
  await page.locator('#isheet .hchip', { hasText: 'Berkshire' }).tap(); await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => [S.hall, S.mday, S.mmeal].join()), 'B,0,dinner', 'opens Berkshire, today, dinner');
  let here = await page.locator('#mlist .row.here').boundingBox();
  assert(here && here.y > 150 && here.y < 260, 'scrolled to the dish under the header: ' + (here && here.y));
  assert.match(await page.locator('#mlist .row.here .n').textContent(), /Korean BBQ Chicken/);
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('cruller'); await page.waitForTimeout(300);
  await sRow('Chinese Twist Cruller').locator('.n').tap(); await page.waitForTimeout(700);
  await page.locator('#isheet .hchip', { hasText: 'Franklin' }).tap(); await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => [S.hall, S.mday, S.mmeal, document.querySelector('#mts').textContent].join()), 'F,1,breakfast,Tomorrow, Friday', 'opens Franklin, tomorrow, breakfast');
  here = await page.locator('#mlist .row.here').boundingBox();
  assert(here && here.y > 150 && here.y < 260, 'scrolled to the dish under the header: ' + (here && here.y));
  assert.match(await page.locator('#mlist .row.here .n').textContent(), /Chinese Twist Cruller/);
  assert.equal(await page.locator('#mlist .row.here .add').count(), 0, "tomorrow's dishes carry no + (today's plate only)");

  // round 3: no tab switch shows bare ground. Sample frames mid-switch; the share of near-white pixels never exceeds
  // what the two panes show at rest by more than a little.
  if (!process.env.RM) {
    await page.goto(URL); await page.waitForTimeout(400);
    const white = async () => { const buf = await page.screenshot(); return +require('child_process').execSync(`python3 -c "
import sys,io
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('L').resize((97,211))
d=im.get_flattened_data(); print(sum(1 for v in d if v>236)/len(d))"`, { input: buf }).toString(); };
    for (const [from, to] of [['halls', 'you'], ['you', 'search'], ['search', 'halls']]) {
      const w0 = await white(); await page.locator(`.tbar button[data-tab=${to}]`).tap(); let mx = 0;
      for (let i = 0; i < 6; i++) mx = Math.max(mx, await white());
      await page.waitForTimeout(400); const w1 = await white();
      assert(mx <= Math.max(w0, w1) + .08, `${from} -> ${to}: a frame is ${(mx * 100).toFixed(0)}% white (rest ${(w0 * 100).toFixed(0)}% / ${(w1 * 100).toFixed(0)}%)`);
    }
  }

  await round7();
  await round8();

  // pins: device-local, survive a reload, open with the container transform, unpin from the same control
  await page.goto(URL); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.reload(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#pins .band').count(), 0, 'no pins: Halls is the four bands');
  await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(700);
  await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Wasabi' }).tap(); await page.waitForTimeout(700);
  await page.locator('#mctl [data-act=pin]').tap(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#mctl [data-act=pin]').getAttribute('aria-pressed'), 'true');
  await page.reload(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#pins .band').count(), 1, 'pin persists across a reload');
  assert.match(await page.locator('#pins .band').textContent(), /Wasabi\s*Open until 9 PM/, 'pinned row has live status');
  await page.locator('#pins .band').tap(); await page.waitForTimeout(700);
  assert.equal(await page.locator('#mtn').textContent(), 'Wasabi', 'a pin opens its café');
  assert.equal(await page.evaluate(() => document.querySelector('#mph').className), 'ph ph-C', 'the café page is headed by its photo');
  await page.locator('#mctl [data-act=pin]').tap(); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#pins .band').count(), 0, 'unpin persists');
  await page.evaluate(() => localStorage.removeItem('udine-m2'));

  assert.deepEqual(errs, [], 'no page errors');
  console.log(results.join('\n')); console.log(`all ${NCHK} checks passed`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
