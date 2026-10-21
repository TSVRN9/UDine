// Benchmark driver: Worcester lunch, Beef Brisket Noodle Bowl x1 + Golden BBQ Chicken Thigh x2 -> Log.
// Real touch input through CDP (Chromium's touch pipeline, touch-action arbitration), not synthetic events.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
// every assert call is counted, so the report can say how many checks ran
let NCHK = 0; const assert0 = require('assert');
const assert = new Proxy(assert0, { apply: (t, th, a) => { NCHK++; return t(...a); }, get: (t, k) => typeof t[k] === 'function' ? (...a) => { NCHK++; return t[k](...a); } : t[k] });
const URL = 'file://' + (process.env.SRC || __dirname + '/index.html');   // SRC: test an older build (RED=1)
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--disable-features=OverscrollHistoryNavigation'] });   // a left-edge swipe must not navigate the test page back
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} });   // round 10: first run done (tested in its own context)
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
  const fmt = m => `${(Math.floor(m / 60) + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;   // minutes -> get_infov2's "H:MM AM"
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
      ['event note in a hall', 'state=menu&day=4', null, '#mlist .evnote'],
      ['café result in Search', 'state=search', async () => { await page.keyboard.type('wasabi'); await page.waitForTimeout(300); }, '#sres .prow2:not([data-act=hall])'],
      ['area row', '', null, '#areas .lrow'],
      ['You row', 'state=you', null, '#you .lrow[data-act=page]'],
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
  // Round 9: the place and its day. Real meal windows; the day cell and the schedule; allergens behind "Show all"; network
  // states; cafés with dishes (plates, price, Search, "where"). RED=9 runs only this block, each scenario caught
  // (SRC=build/r9/before/index.html shows which fail on round 8b).
  const round9 = async () => {
    const RMm = !!process.env.RM;
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async q => { await page.goto(URL + (q || '')); await page.evaluate(() => { localStorage.removeItem('udine-m2'); }); await page.goto(URL + (q || '')); await page.waitForTimeout(500); };
    const cafeIdx = n => page.evaluate(n => P.places.findIndex(x => x[0] === n), n);
    const rowsN = () => page.locator('#mlist .row').count();
    await scen('round 10: no band text ever runs under its letter', async () => {
      for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await go();
        // every busy word a band can say, the longest forced into every band
        const bad = await page.evaluate(() => { const out = [], words = ['Busy', 'Not busy', 'A little busy', 'Probably busy', 'Probably not busy', 'Probably a little busy'];
          for (const bd of document.querySelectorAll('#bands .band')) for (const wd of words) { const sp = bd.querySelector('.bz span:not(.meter)'); if (sp) sp.textContent = wd;
            const sv = bd.querySelector('.let'), r = sv.getBoundingClientRect(), k = r.width / 200, bb = sv.querySelector('text.felt').getBBox(), ink = r.left + (bb.x - 6) * k, top = r.top + (bb.y - 6) * k, rg = document.createRange();
            for (const el of bd.querySelectorAll('.bt .nm, .bt .st, .bt .bz')) { rg.selectNodeContents(el); const q = rg.getBoundingClientRect(); if (q.width && q.right > ink - 8 && q.bottom > top) out.push(`${bd.dataset.h} "${el.textContent}" ends ${q.right.toFixed(1)}, letter at ${ink.toFixed(1)}`); } }
          return out; });
        assert.deepEqual(bad, [], `${w}px: band text keeps 8 px clear of the letter`); }
      await page.setViewportSize({ width: 390, height: 844 });
    });
    await scen('round 10: the hall letters stand in a loose column (owner)', async () => {
      for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await go();
        await page.addStyleTag({ content: '.band>*:not(.let){visibility:hidden}.band{background:#000!important}' });
        const L = [];
        for (const b of await page.locator('#bands .band').all()) { const r = await b.boundingBox(); L.push(+require('child_process').execSync(`python3 -c "
import sys,io
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('L'); W,H=im.size; px=im.load()
print(next(x for x in range(W) if any(px[x,y]>200 for y in range(H))))"`, { input: await page.screenshot({ clip: r }) }).toString() / 2); }
        // W, H and B where they always were; Franklin's F 19 px left of where it was before 9c (it read as pushed right)
        const want = w === 390 ? [262, 296, 285.5, 288] : [232, 266, 255.5, 258];
        L.forEach((x, i) => assert(Math.abs(x - want[i]) <= .5, `${w}px: ${'WFHB'[i]}'s left edge is at ${want[i]} (${x})`)); }
      // Franklin's header letter is the band's, offset by the open: the open lands with its felt at the same left edge
      await page.setViewportSize({ width: 390, height: 844 }); await go('?state=menu&hall=F');
      const hl = await page.evaluate(() => { const t = document.querySelector('#mlet text.felt').getBBox(), r = document.querySelector('#mlet').getBoundingClientRect(); return Math.round((r.left + t.x * r.width / 200) * 10) / 10; });
      await go('?state=menu&hall=W');
      const wl = await page.evaluate(() => { const t = document.querySelector('#mlet text.felt').getBBox(), r = document.querySelector('#mlet').getBoundingClientRect(); return Math.round((r.left + t.x * r.width / 200) * 10) / 10; });
      assert(Math.abs((hl - wl) - (99 - 72)) < 1, `the header letters keep the bands' offsets, so Franklin's open lands in place (F ${hl}, W ${wl})`);
    });
    await scen('real meal windows (hours.ts)', async () => {
      await go();
      // `TZ=America/New_York node` on shared/src/hours.ts: mapInfoV2(locations-2026-10-08.json), then
      // effectiveMealWindow(Worcester, 'lunch', Thu Oct 8 12:41) -> {"openTime":"11:00 AM","closeTime":"4:30 PM"}
      const EW_WORCESTER_LUNCH = { openTime: '11:00 AM', closeTime: '4:30 PM' };
      const w = await page.evaluate(() => [WIN.W.lunch, WIN.B.breakfast, WIN.F.late, WIN.H.late, WIN.W.late, WIN.B.late, typeof MEALWIN]);
      assert.deepEqual([fmt(w[0][0]), fmt(w[0][1])], [EW_WORCESTER_LUNCH.openTime, EW_WORCESTER_LUNCH.closeTime], "Worcester's lunch is effectiveMealWindow's");
      assert.deepEqual(w.slice(1, 6), [null, null, null, [1260, 1439], [1260, 1439]], 'no breakfast at Berkshire, no late night at Franklin or Hampshire, late night 9 to 11:59 at W and B');
      assert.equal(w[6], 'undefined', 'the guessed MEALWIN is gone');
      assert.equal(await page.evaluate(() => NOW), 12 * 60 + 41, 'the clock is 12:41');
    });
    await scen('day change: tabs for that day, header still, fade through', async () => {
      await go('?state=franklin');
      assert.deepEqual(await page.locator('#mtabs .mts button').allTextContents(), ['Breakfast', 'Lunch', 'Dinner', "Grab 'N Go"], 'Franklin Thursday');
      // where each part of the header is (x, y, height: a status line's width follows its words)
      const head = () => page.evaluate(() => ['#mhead', '#mtabs', '#mswitch', '#mtn', '#mts', '.dayc'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s === '.dayc' ? r.right : r.x, r.y, r.height].map(v => Math.round(v * 10) / 10).join(','); }).join('|'));   // (the day cell is right-aligned: its right edge)
      const h0 = await head();
      await page.locator('.dayc').tap(); await page.waitForTimeout(700);
      assert(await page.locator('#days').isVisible(), 'the day cell opens the schedule');
      await page.evaluate(() => { window.__f = []; const f = () => { const r = ['#mhead', '#mtabs', '#mswitch', '#mtn', '#mts', '.dayc'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return [s === '.dayc' ? b.right : b.x, b.y, b.height].map(v => Math.round(v * 10) / 10).join(','); }).join('|');
        const l = document.querySelector('#mlist'); __f.push([r, +getComputedStyle(l).opacity, getComputedStyle(l).transform]); if (__f.length < 90) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      // what names the place never fades or repaints: the letter's nodes, the name's text node and the photo stay, opaque, in every frame
      await page.evaluate(() => { const id = [document.querySelector('#mlet text'), document.querySelector('#mtn').firstChild, document.querySelector('#mph')]; window.__id = []; const g = () => { const now = [document.querySelector('#mlet text'), document.querySelector('#mtn').firstChild, document.querySelector('#mph')];
        __id.push([now.every((n, i) => n === id[i]), ['#mlet', '#mtn', '#mph', '#mhead'].map(q => +getComputedStyle(document.querySelector(q)).opacity).join()]); if (__id.length < 90) requestAnimationFrame(g); }; requestAnimationFrame(g); });
      // pixels too: the letter's warm felt, measured against the same spot just before the tap (under the same scrim)
      const lb = await page.locator('#mlet').boundingBox(), clip = { x: lb.x + 100, y: Math.max(0, lb.y + 30), width: 80, height: 60 };
      const warm = async () => +require('child_process').execSync(`python3 -c "
import sys,io
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB'); d=list(im.getdata()); print(sum(1 for r,g,b in d if r>b+45 and g>b+25)/len(d))"`, { input: await page.screenshot({ clip }) }).toString();
      const w0 = await warm(), gold = [];
      await page.locator('#days [data-day="3"]').tap();
      for (let i = 0; i < 8; i++) { gold.push(await warm()); await page.waitForTimeout(30); }
      await page.waitForTimeout(1000);
      (await page.evaluate(() => __id)).forEach(([same, op], i) => { assert(same, `the letter, name and photo are never re-drawn during a day change (frame ${i})`); assert.equal(op, '1,1,1,1', `and stay opaque (frame ${i})`); });
      assert(w0 > .15, `the letter is in the sampled spot (${(w0 * 100).toFixed(0)}% warm)`);
      gold.forEach((g, i) => assert(g > w0 * .7, `the letter's gold is on screen in every sample (${i}: ${(g * 100).toFixed(0)}% vs ${(w0 * 100).toFixed(0)}% before)`));
      const fr = await page.evaluate(() => __f);
      assert.deepEqual(await page.locator('#mtabs .mts button').allTextContents(), ['Lunch', 'Dinner'], 'Franklin Sunday: no breakfast, no Grab \'N Go');
      assert.equal(await page.locator('#dayl').textContent(), 'Sun 11');
      assert.equal(await page.evaluate(() => S.mmeal), 'lunch', 'the meal is kept when the day has it');
      fr.forEach(([r], i) => assert.equal(r, h0, `the header never moves during a day change (frame ${i})`));
      if (!RMm) { const tr = fr.filter(([, , t]) => t !== 'none'); assert(tr.length > 3, 'the list fades through from .97 (scale frames sampled: ' + tr.length + ')');
        tr.forEach(([, , t], i) => { const m = t.match(/matrix\(([^,]+),\s*0,\s*0,\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/); assert(m && Math.abs(m[1] - m[2]) < 1e-6 && +m[1] >= .969 && +m[1] <= 1, `a uniform .97 -> 1 scale, never a slide (frame ${i}: ${t})`); }); }
      const ops = fr.map(([, o]) => o); assert(Math.min(...ops) < .5 && ops.at(-1) === 1, 'the new list fades in');
      assert.equal(await page.locator('.dghost, #mscroll > div:not(#mspace):not(#mlist)').count(), 0, 'nothing left over at rest');
      // round 9c: every meal of every place, every day, is visible at 360 and 390: whole, inside the row, unclipped, never
      // ellipsized, 44 px tall, with no scroller or edge fade; the day cell ends the station row in both header states
      for (const w of [360, 390]) { await page.setViewportSize({ width: w, height: 844 }); await go();
        const bad = await page.evaluate(async () => { const out = []; const keys = [...HALLS, ...[...DISHMENU].filter(isCafe)];
          for (const k of keys) for (let d = 0; d < DAYS.length; d++) { if (!menuOf(d, k)) continue;
            if (isCafe(k)) openHall('C', true, null, { cafe: +k.slice(1), day: d }); else openHall(k, true, null, { day: d });
            for (const y of [0, 600]) { const sc = document.querySelector('#mscroll'); sc.scrollTop = y; paint(1, sc.scrollTop);
              const row = document.querySelector('#mtabs .mts'), r = row.getBoundingClientRect(), st = getComputedStyle(row);
              if (st.overflowX !== 'visible' || row.scrollWidth > row.clientWidth + .5 || (st.maskImage || st.webkitMaskImage || 'none') !== 'none') out.push(`${PN(k)} day ${d}: the row scrolls or fades`);
              for (const b of row.querySelectorAll('button')) { const q = b.getBoundingClientRect();
                if (b.scrollWidth > b.clientWidth + .5 || getComputedStyle(b).textOverflow === 'ellipsis' || q.left < r.left - .5 || q.right > r.right + .5 || q.height < 44) out.push(`${PN(k)} day ${d}: ${b.textContent} (${q.left.toFixed(1)}-${q.right.toFixed(1)} of ${r.right.toFixed(1)}, h ${q.height})`); }
              const dc = document.querySelector('.dayc').getBoundingClientRect(), sw = document.querySelector('#mswitch').getBoundingClientRect();
              if (document.querySelector('.dayc').parentElement.id !== 'mswitch' || Math.abs(dc.right - sw.right) > .5 || dc.height < 44) out.push(`${PN(k)} day ${d}: the day cell is not at the station row's end`); } }
          return out; });
        assert.deepEqual(bad, [], `${w}px: every meal tab of every place and day is whole and visible`); }
      assert.deepEqual(await page.evaluate(() => typeof showTab + typeof tabFade), 'undefinedundefined', 'the scrolling-tab code and the edge fade are gone');
      await page.setViewportSize({ width: 390, height: 844 });
    });
    await scen('the schedule: where, every window, every day', async () => {
      await go('?state=menu');
      await page.locator('#mts').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .schn').textContent(), 'Worcester', 'the status line opens the schedule');
      assert.equal(await page.locator('#isheet .scha').textContent(), '667 N Pleasant St');
      assert.match(await page.locator('#isheet .dirb').getAttribute('href'), /42\.3924624,-72\.5255959/, "Directions hands map_address to the maps app");
      const days = await page.locator('#days .day').evaluateAll(b => b.map(x => [x.children[0].textContent, x.children[1].textContent]));
      assert.equal(days.length, 15, 'every day of the feed, Oct 8 to 22');
      assert.deepEqual(days[0], ['Today', '7 AM to midnight']); assert.deepEqual(days[2], ['Saturday, October 10', 'No menu posted'], 'Oct 10: No menu posted'); assert.equal(days[14][0], 'Thursday, October 22');
      assert.deepEqual(await page.locator('#days .mws .mw').evaluateAll(r => r.map(x => x.textContent)), ['Breakfast7 AM to 11 AM', 'Lunch11 AM to 4:30 PM', 'Dinner4:30 PM to 9 PM', 'Late night9 PM to midnight', "Grab 'N Go7 AM to 8 PM"], "today's every window");
      assert.equal(await page.locator('#days .mws').count(), 1, 'only the chosen day is open');
      const ch = await page.evaluate(() => getComputedStyle(document.querySelector('#mts .sch')).stroke); assert.match(ch, /rgba\(255, 255, 255, 0\.6\)/, "the status line's chevron is quieter than the gold ones: " + ch);
      // opened from the day cell on a late day, that day is on screen without scrolling
      await page.locator('#scrim').tap({ position: { x: 200, y: 40 } }); await page.waitForTimeout(600);
      await page.evaluate(() => { S.mday = 13; renderMenu(); }); await page.locator('.dayc').tap(); await page.waitForTimeout(800);
      const vis = await page.evaluate(() => { const s = document.querySelector('#isheet').getBoundingClientRect(), m = document.querySelector('#days .mws').getBoundingClientRect(), d = document.querySelector('#days .day.cur').getBoundingClientRect(); return [d.top >= s.top + 22, m.bottom <= innerHeight + .5, document.querySelector('#days .day.cur').firstElementChild.textContent, Math.round(s.top), Math.round(d.top), Math.round(m.bottom)]; });
      assert.deepEqual(vis.slice(0, 3), [true, true, 'Wednesday, October 21'], 'the chosen day (and its hours) is visible at rest: ' + vis.slice(3));
      // a café's schedule: building and payment too
      await go(); await page.evaluate(i => openHall('C', true, null, { cafe: i }), await cafeIdx('Wasabi')); await page.locator('#mts').tap(); await page.waitForTimeout(700);
      assert.match(await page.locator('#isheet .sched').textContent(), /Blue Wall, Campus Center.*Payment.*Dining Dollars/s);
      assert.deepEqual(await page.locator('#days .day').nth(3).evaluate(x => x.textContent), 'Sunday, October 11No menu posted', 'Wasabi Sunday: No menu posted (closed weekends: never "yet")');
      // Oct 12 at a hall: the row opens the holiday's hours event (its real title, a chevron, a 44 px target), by the event push
      await go('?state=menu&day=4'); await page.locator('.dayc').tap(); await page.waitForTimeout(800);
      const ev = page.locator('#days .mws .evrow'); assert.equal(await ev.locator('.evtt').textContent(), 'Indigenous Peoples Day Hours');
      assert.equal(await ev.locator('svg.chev').count(), 1, 'with a chevron'); assert((await ev.boundingBox()).height >= 44, 'a 44 px target');
      await ev.tap(); await page.waitForTimeout(1300);
      assert.deepEqual(await page.locator('.page[data-p=event] a.evbtn').allTextContents(), ['See the menu', 'Holiday hours'], 'it pushes the event page, with its Holiday hours');
    });
    await scen('allergens: hidden behind the line, Show all reveals, the setting survives', async () => {
      await go('?state=you'); await page.locator('[data-p=diet]').tap(); await page.waitForTimeout(700);
      assert.deepEqual(await page.locator('.page [data-avoid]').evaluateAll(b => b.map(x => x.textContent)), ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame', 'Gluten', 'Corn'], "the feed's 11 allergens, in order");
      await page.locator('.page [data-avoid=Milk]').tap(); await page.waitForTimeout(300);
      await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(600);
      assert.equal(await page.locator('#you [data-p=diet] .b').textContent(), 'No milk', 'You says what you avoid');
      await page.locator('.tbar button[data-tab=halls]').tap(); await page.waitForTimeout(400); await page.locator('.band[data-h=W]').tap(); await page.waitForTimeout(900);
      const D = await page.evaluate(() => { const all = MD[0].W.lunch.flatMap((s, si) => s[1].map((x, di) => DISH[`W.lunch.${si}.${di}`])); return [all.length, all.filter(d => d.algs.includes('Milk')).length, all.filter(d => !d.alg).length]; });
      assert.equal(await rowsN(), D[0] - D[1], `the ${D[1]} dishes that list milk are hidden`);
      assert.equal(await page.locator('.dietnote span').textContent(), `Hiding ${D[1]} dishes that list milk`, 'the line counts them and never calls the rest safe');
      assert.equal(await mRow('Green Chile Posole').count(), 1, 'a dish that lists nothing is not hidden (blank is "not listed")');
      await page.locator('.dietnote [data-act=prefshow]').tap(); await page.waitForTimeout(500);
      assert.equal(await rowsN(), D[0], 'Show all reveals them');
      assert.equal(await page.locator('#mlist .row .cont').count(), D[1], 'each revealed dish leads with "Contains milk"');
      assert.equal(await page.locator('#mlist .row .cont').first().textContent(), 'Contains milk');
      assert.equal(await page.locator('.dietnote span').textContent(), 'Showing all dishes');
      assert.deepEqual(await page.evaluate(() => [S.avoid, JSON.parse(localStorage.getItem('udine-m2')).avoid]), [{ Milk: true }, { Milk: true }], 'Show all never edits the preference');
      await page.locator('#mtabs .mts button[data-meal=dinner]').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('.dietnote span').textContent(), 'Showing all dishes', 'revealed across a meal change');
      await page.locator('.dayc').tap(); await page.waitForTimeout(700); await page.locator('#days [data-day="1"]').tap(); await page.waitForTimeout(900);
      assert.deepEqual([await page.evaluate(() => [S.reveal, S.mday].join()), await page.locator('.dietnote span').textContent()], ['true,1', 'Showing all dishes'], 'and across a day change');
      await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(900); await page.locator('.band[data-h=W]').tap(); await page.waitForTimeout(900);
      assert.match(await page.locator('.dietnote span').textContent(), /^Hiding \d+ dishes that list milk$/, 'leaving the hall hides them again');
      await mRow('Golden BBQ Chicken Thigh').locator('.n').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .dal .av').count(), 0, 'Golden BBQ lists no milk');
      await page.reload(); await page.waitForTimeout(400); assert.deepEqual(await page.evaluate(() => S.avoid), { Milk: true }, 'the setting survives a reload');
      // Search hides them too, behind the same line
      await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('pizza'); await page.waitForTimeout(400);
      assert.match(await page.locator('#sres .dietnote span').textContent(), /^Hiding \d+ dish(es)? that lists? milk$/, 'Search has the line');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('#sres .row')].filter(r => { const d = r.dataset.id ? DISH[r.dataset.id] : rep(sGroup(r)); return d.algs.includes('Milk'); }).length), 0, 'no row in Search lists milk');
      // arriving at a hidden dish through "where" opens that list revealed, the row marked
      await page.evaluate(() => { S.avoid = { Milk: true }; }); await go('?state=search'); await page.evaluate(() => { S.avoid = { Milk: true }; save(); });
      await page.locator('#q').fill('gouda bisque'); await page.waitForTimeout(400); await page.evaluate(() => { S.sreveal = true; renderSearch(); });
      await page.locator('#sres .row .n').first().tap(); await page.waitForTimeout(700); await page.locator('#isheet .hchip').first().tap(); await page.waitForTimeout(1600);
      assert.equal(await page.evaluate(() => S.reveal), true, 'the list arrives revealed');
      assert.equal(await page.locator('#mlist .row.here .cont').textContent(), 'Contains milk', 'and the dish it arrived at is marked');
      await page.evaluate(() => localStorage.removeItem('udine-m2'));
    });
    await scen('network states: ?net=slow|offline|fail', async () => {
      await page.goto(URL + '?net=slow'); await page.waitForTimeout(200);
      assert.equal(await page.locator('.band[data-h=W] .st').textContent(), '', 'slow: the rack is drawn, its hours not yet');
      await page.waitForTimeout(1800); assert.equal(await page.locator('.band[data-h=W] .st').textContent(), 'Open until midnight', 'slow: then they arrive');
      await page.goto(URL + '?net=slow&state=menu'); await page.waitForTimeout(700);
      assert(await page.locator('#mlist .spin').isVisible(), 'slow: the menu shows the activity indicator after 400 ms'); assert.equal(await page.locator('#mtabs .mts button').count(), 0, 'and no meals yet');
      await page.waitForTimeout(1600); assert(await rowsN() > 20, 'slow: then the menu arrives');
      await page.goto(URL + '?net=offline&pins=2'); await page.waitForTimeout(400);
      assert.deepEqual(await page.locator('.hhead').evaluate(h => [h.querySelector('.date').textContent, h.querySelector('#netl').textContent]), ['Thursday, October 8', "You're offline"], 'offline: the date stays and the line adds it');
      assert.equal(await page.locator('#bands .meter').count(), 0, 'offline: no busy meter (live data is never shown stale)');
      assert.equal(await page.locator('.band[data-h=W] .st').textContent(), 'Open until midnight', 'offline: cached hours stay');
      const filt = await page.evaluate(() => [...document.querySelectorAll('.band .ph, .band .duo, .band')].map(e => getComputedStyle(e).filter + getComputedStyle(e).opacity).join('|'));
      await page.goto(URL + '?pins=2'); await page.waitForTimeout(400);
      assert.equal(filt, await page.evaluate(() => [...document.querySelectorAll('.band .ph, .band .duo, .band')].map(e => getComputedStyle(e).filter + getComputedStyle(e).opacity).join('|')), 'offline alters no photo');
      await page.goto(URL + '?net=offline&state=menu'); await page.waitForTimeout(500);
      assert(await rowsN() > 20, "offline: today's saved menu"); assert.equal(await page.locator('#mhist svg').count(), 0, 'offline: no lamp board');
      await page.evaluate(() => { S.mday = 5; renderMenu(); });
      assert.equal(await page.locator('#mlist .empty').textContent(), "You're offline, and the menu for Tuesday, October 13 isn't saved on this phone.");
      await page.locator('.dayc').tap(); await page.waitForTimeout(700); assert.equal(await page.locator('#days .day').nth(6).locator('.r').textContent(), 'Not saved');
      await page.goto(URL + '?net=fail&state=menu'); await page.waitForTimeout(500);
      assert.equal(await page.locator('#mlist .empty').textContent(), "Worcester's menu didn't load."); assert.equal(await page.locator('#netl').textContent(), "Couldn't connectTry again"); assert.equal(await page.locator('#netl .obtn').count(), 1, 'the same kind of control as the hall\'s Try again');
      await page.locator('#mlist [data-act=retry]').tap(); await page.waitForTimeout(700);
      assert(await rowsN() > 20, 'fail: Try again loads the menu'); assert.equal(await page.locator('#netl').textContent(), '', 'and clears the line');
      await page.goto(URL + '?net=fail'); await page.waitForTimeout(300);
      assert.equal(await page.locator('.band[data-h=W] .st').textContent(), '', 'fail: no hours');
      for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(150);
        const [tb, h1, hd] = await page.evaluate(() => ['#netl .obtn', '.hhead h1', '.hhead'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; }));
        const h1w = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.hhead h1')); return r.getBoundingClientRect().right; });
        assert(tb.h >= 44, `${w}px: Halls' Try again is a 44 px outlined button (${tb.h})`); assert(tb.b <= hd.b - 4, `${w}px: inside the header`); assert(tb.l - h1w >= 16, `${w}px: clear of "Lunch" (${(tb.l - h1w).toFixed(0)} px)`); }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#netl [data-act=retry]').tap(); await page.waitForTimeout(500);
      assert.equal(await page.locator('.band[data-h=W] .st').textContent(), 'Open until midnight', 'Try again on Halls');
      // the name never moves between states (the status keeps its room)
      const ny = async q => { await page.goto(URL + q); await page.waitForTimeout(500); return (await page.locator('#mtn').boundingBox()).y; };
      const y0 = await ny('?state=menu'); for (const q of ['?net=fail&state=menu', '?net=slow&state=menu', '?net=offline&state=menu']) assert.equal(await ny(q), y0, q + ': the name stays put');
    });
    await scen('cafés: dishes, their own plate, price', async () => {
      await go('?state=menu'); await page.evaluate(() => bench());
      const gf = await cafeIdx('Green Fields'); await page.evaluate(i => openHall('C', false, null, { cafe: i }), gf); await page.waitForTimeout(900);
      assert.deepEqual(await page.locator('#mtabs .mts button').allTextContents(), ['Lunch', 'Dinner'], 'meal tabs from the feed');
      assert(await page.locator('#mlist .sth').count() >= 3 && await rowsN() > 20, 'stations and dish rows');
      await mRow('Caesar Salad w/Chicken').locator('.add').tap(); await page.waitForTimeout(500);
      const pl = await page.evaluate(() => S.plates.map(p => [plateLabel(p), __plateHalls(p).join()]));
      assert.deepEqual(pl, [['Worcester lunch', 'W'], ['Green Fields lunch', 'c' + gf]], 'a café dish starts its own plate, "Green Fields lunch"');
      // the same dish name at a hall and a café never shares a plate
      await page.evaluate(() => { const g = BYK.lunch['french fries'], c = CBYK.lunch['french fries'] || CBYK.all['french fries']; addDish('lunch', g.k, g.refs, g.n); addDish('lunch', c.k, c.refs, c.n); });
      assert.equal(await page.evaluate(() => S.plates.filter(p => p.items.some(i => i.k === 'french fries')).length), 2, 'french fries: a hall plate and a café plate');
      assert.equal(await page.evaluate(() => S.plates.filter(p => __plateHalls(p).some(isCafe) && __plateHalls(p).some(h => !isCafe(h))).length), 0, 'no plate mixes a café and a hall');
      await mRow('Caesar Salad w/Chicken').locator('.n').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .dsv').textContent(), '$11.001 each', 'the price leads the serving line');
      assert.equal(await page.locator('#mlist .row .pr, #sres .row .pr').count(), 0, 'rows never show a price');
      await page.locator('#scrim').tap({ position: { x: 200, y: 40 } }); await page.waitForTimeout(600);
      await page.evaluate(() => openDish(DISH['14.F.lunch.5.1'])); await page.waitForTimeout(600);
      assert.equal(await page.locator('#isheet .pr').count(), 0, 'a hall serving never shows a price (the one priced hall dish)');
      await page.evaluate(() => isheet.to('closed')); await page.waitForTimeout(500);
      await page.evaluate(() => openDish(DISH['W.lunch.' + MD[0].W.lunch.findIndex(s => s[1].some(x => DISHES[x][0] === 'Golden BBQ Chicken Thigh')) + '.0'] || byName('W', 'lunch', 'Golden BBQ Chicken Thigh'))); await page.waitForTimeout(500);
      assert.equal(await page.locator('#isheet .pr').count(), 0, 'a hall dish: no price');
      // from the plate, the café dish keeps its price
      await page.evaluate(() => isheet.to('closed')); await page.waitForTimeout(500);
      await page.evaluate(() => { S.front = S.plates.findIndex(p => plateLabel(p) === 'Green Fields lunch'); renderBar(); if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(700);
      await page.locator('#psbody .prow .n', { hasText: 'Caesar Salad w/Chicken' }).tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .pr').textContent(), '$11.00', 'a café dish opened from the plate keeps its price');
      // a one-menu café: the day cell leads the station row, and the collapsed header is the bar plus that one row
      await go(); await page.evaluate(i => openHall('C', true, null, { cafe: i }), await cafeIdx('Worcester Café'));
      assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.querySelector('#mtabs')).display, document.querySelector('.dayc').parentElement.id, PIN() - CH]), ['none', 'mswitch', 48]);
      await page.evaluate(() => { const sc = document.querySelector('#mscroll'); sc.scrollTop = 600; paint(1, 600); }); await page.waitForTimeout(200);
      const top = await page.evaluate(() => { const r = document.querySelector('#mlist .sth').getBoundingClientRect(); return [document.querySelector('#mswitch').getBoundingClientRect().bottom, CH + 48]; });
      assert(Math.abs(top[0] - top[1]) < 1, `collapsed: the bar and one row (${top[0]} vs ${top[1]})`);
      // a café without a dish menu keeps its body
      await page.evaluate(i => openHall('C', true, null, { cafe: i }), await cafeIdx('ISB Café'));
      assert.match(await page.locator('#mlist').textContent(), /ISB Café doesn't list its menu in the app\./);
    });
    await scen('round 9b: Terrace on campus; Charles River behind its toggle', async () => {
      // Terrace: in Southwest's group, with its own page, Search, "where" and price
      await go(); await page.locator('#areas .lrow', { hasText: 'Southwest' }).tap(); await page.waitForTimeout(800);
      assert.equal(await page.locator('.page[data-p=cafes] .ahd[data-area="3"] ~ .lrow', { hasText: 'Terrace' }).count() >= 1, true, 'Terrace is listed');
      assert.equal(await page.evaluate(() => { const i = P.places.findIndex(x => x[0] === 'Terrace'); return [P.places[i][1], P.places[i][2], DISHMENU.has('c' + i), !!RIMG.Terrace].join(); }), '3,Fieldstone Apartments,true,true', 'area 3, Fieldstone Apartments, a dish menu, its own photo');
      await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Terrace' }).tap(); await page.waitForTimeout(900);
      assert.deepEqual(await page.locator('#mtabs .mts button').allTextContents(), ['Breakfast', 'Dinner'], "Terrace's meals today");
      await go('?state=search'); await page.locator('#q').fill('harissa chicken'); await page.waitForTimeout(400);
      const tr = page.locator('#sres .row', { has: page.locator('.n', { hasText: /^Harissa Chicken/ }) }); assert.equal(await tr.count(), 1, 'a Terrace dish is searchable');
      assert.match(await tr.locator('.m').innerText(), /Dinner\s*Terrace/, 'later today, at Terrace');
      await tr.locator('.n').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .pr').textContent(), '$13.50', 'with its price on the sheet');
      assert.equal(await page.locator('#isheet .hchip.cafe').textContent(), 'Terrace', '"where" names Terrace');
      // Charles River, off (the default): nowhere
      const crd = await page.evaluate(() => Object.values(CBYK.lunch).find(g => g.n.length > 10 && /^[A-Za-z]/.test(g.n) && SERV[g.k].every(x => inNewton(x.h))).n);   // a dish served only at Charles River
      const crIdx = await page.evaluate(() => P.places.findIndex(x => x[0] === 'Charles River Campus'));
      await page.evaluate(n => { localStorage.setItem('udine-m2', JSON.stringify({ pins: ['Wasabi', n] })); }, 'Charles River Campus'); await page.goto(URL); await page.waitForTimeout(500);
      const nowhere = async label => {
        assert.equal(await page.locator('#areas .lrow', { hasText: 'Charles River' }).count(), 0, label + ': no area row');
        assert.equal(await page.locator('#pins .band').count(), 1, label + ': its pin is kept but not drawn'); assert.deepEqual(await page.evaluate(() => S.pins), ['Wasabi', 'Charles River Campus'], label + ': the pin is not deleted');
        await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(700); assert.equal(await page.locator('.page[data-p=cafes]', { hasText: 'Charles River' }).count(), 0, label + ': not in Cafés & markets');
        await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(500);
        await page.locator('.tbar button[data-tab=search]').tap(); await page.locator('#q').fill('charles river'); await page.waitForTimeout(400);
        assert.equal(await page.locator('#sres .prow2').count(), 0, label + ': Search has no place');
        await page.locator('#q').fill(crd.toLowerCase()); await page.waitForTimeout(400);
        assert.equal(await page.evaluate(n => [...document.querySelectorAll('#sres .row .n')].filter(e => e.textContent.startsWith(n)).length, crd), 0, label + `: no "${crd}" row`);
        assert.deepEqual(await page.evaluate(n => whereAnswer(norm(n)), crd), [], label + ': no "where"');
        await page.locator('.tbar button[data-tab=halls]').tap(); await page.waitForTimeout(400); };
      await nowhere('off');
      // on, by a real tap on You: everything appears
      await page.locator('.tbar button[data-tab=you]').tap(); await page.waitForTimeout(400);
      const tg = page.locator('#you [data-act=newton]'); assert.equal(await tg.getAttribute('aria-checked'), 'false', 'off by default');
      assert.match(await tg.textContent(), /^Charles River CampusNewton$/); await tg.tap(); await page.waitForTimeout(300);
      await page.reload(); await page.waitForTimeout(500); assert.equal(await page.evaluate(() => S.newton), true, 'the toggle survives a reload');
      assert.equal(await page.locator('#areas .lrow').last().locator('.a').textContent(), 'Charles River Campus, Newton', 'its area group comes last');
      const pin = page.locator('#pins .band[data-c="' + crIdx + '"]'); assert.equal(await pin.count(), 1, 'its pinned band is back');
      assert.equal(await pin.evaluate(b => [b.classList.contains('nophoto'), getComputedStyle(b.querySelector('.win')).display].join()), 'true,none', 'no photo is invented: the band is its own maroon');
      await page.locator('#areas .lrow').last().tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Charles River Campus' }).count(), 1, 'in Cafés & markets');
      assert.deepEqual(await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Charles River Campus' }).evaluate(r => { const t = r.querySelector('.thumb'), a = r.querySelector('.a').getBoundingClientRect().left, o = document.querySelector('.page[data-p=cafes] .lrow .a').getBoundingClientRect().left;
        return [!!t && t.classList.contains('nophoto'), !!(t && t.querySelector('img')), getComputedStyle(t).backgroundColor, Math.round(a - o)]; }), [true, false, 'rgb(136, 28, 28)', 0], 'a maroon tile, no picture, and its text in the column');
      await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Charles River Campus' }).tap(); await page.waitForTimeout(900);
      assert.deepEqual([await page.locator('#mtn').textContent(), await page.evaluate(() => document.querySelector('#menu').classList.contains('nophoto')), await page.locator('#mtabs .mts button').allTextContents()], ['Charles River Campus', true, ['Breakfast', 'Lunch', 'Dinner']], 'its page, built from its feed');
      await page.locator('#mts').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#isheet .scha').textContent(), '100 Carlson AveNewton'); assert.match(await page.locator('#isheet .dirb').getAttribute('href'), /42\.299095,-71\.187034/, 'Directions to Newton');
      await go('?state=search'); await page.evaluate(() => { S.newton = true; save(); }); await page.reload(); await page.waitForTimeout(400); await page.locator('#q').fill(crd.toLowerCase()); await page.waitForTimeout(400);
      const cr = page.locator('#sres .row[data-cg]', { has: page.locator('.n', { hasText: new RegExp('^' + crd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }) }).first();
      assert.equal(await cr.locator('.cnm').textContent(), 'Charles River', 'Search finds its dish (the lane uses the short name)');
      assert.match(await page.evaluate(n => whereAnswer(norm(n)).map(g => g.hs.map(PN).join()).join(), crd), /Charles River Campus/, '"where" names it');
      // its plate is set aside when the toggle goes off, and comes back
      await cr.locator('.add').tap(); await page.waitForTimeout(400); assert.equal(await page.locator('#barL').textContent(), 'Charles River Campus lunch', 'its own plate');
      await page.evaluate(() => setNewton(false)); assert.deepEqual(await page.evaluate(() => [S.plates.length, S.offPlates.length]), [0, 1], 'off: the plate is set aside, not deleted');
      await page.evaluate(() => setNewton(true)); assert.equal(await page.evaluate(() => plateLabel(S.plates[0])), 'Charles River Campus lunch', 'on: it comes back');
      await page.evaluate(() => { setNewton(false); }); await page.goto(URL); await page.waitForTimeout(400); await page.evaluate(() => localStorage.setItem('udine-m2', JSON.stringify({ pins: ['Wasabi', 'Charles River Campus'], newton: false }))); await page.reload(); await page.waitForTimeout(500);
      await nowhere('off again');
      await page.evaluate(() => localStorage.removeItem('udine-m2'));
    });
    await scen('Search finds café dishes; "where" names the café', async () => {
      await go('?state=search'); await page.locator('#q').fill('caesar'); await page.waitForTimeout(400);
      const r = page.locator('#sres .row[data-cg]', { has: page.locator('.n', { hasText: /^Caesar Salad w\/Chicken/ }) });
      assert.equal(await r.count(), 1, 'a café dish row');
      assert.equal(await r.locator('.cnm').textContent(), 'Green Fields', 'its lane names the café');
      assert.equal(await page.locator('#sres .sgrp', { hasText: 'At cafés' }).count(), 1);
      assert.equal(await page.locator('#sres .prow2', { hasText: 'Green Fields' }).count(), 0, 'Places no longer matches a café by its old names list');
      await r.locator('.n').tap(); await page.waitForTimeout(700);
      assert.deepEqual(await page.locator('#isheet .where .wl').evaluateAll(l => l.map(x => x.querySelector('.wt').textContent + ': ' + [...x.querySelectorAll('.hchip')].map(c => c.textContent).join(', '))), ['Lunch now, until 4:30 PM: Green Fields'], '"where" names the café');
      await page.locator('#isheet .hchip.cafe').tap(); await page.waitForTimeout(1600);
      assert.equal(await page.evaluate(() => [PK() === 'c' + P.places.findIndex(x => x[0] === 'Green Fields'), S.mmeal].join()), 'true,lunch', 'the café tag opens Green Fields at lunch');
      assert.match(await page.locator('#mlist .row.here .n').textContent(), /Caesar Salad w\/Chicken/, 'scrolled to the dish');
      // plate from Search: the café row's + starts the café plate
      await go('?state=search'); await page.locator('#q').fill('caesar'); await page.waitForTimeout(400);
      await r.locator('.add').tap(); await page.waitForTimeout(500);
      assert.equal(await page.locator('#barL').textContent(), 'Green Fields lunch');
      // where answers carry cafés at 4:31 too (a café dish only served at cafés)
      assert.match(await page.evaluate(() => whereAnswer(norm('Caesar Salad w/Chicken'), 991).map(g => whenText(g) + ' ' + g.hs.map(PN).join()).join(' | ')), /^Dinner now, until 9 PM Green Fields/);
    });
  };
  // Round 10: first run, tracking off, past logs, bowls, Health. RED=10 runs only this block, each scenario caught
  // (SRC=build/r9/before-r10-index.html shows which fail on round 9c).
  const round10 = async () => {
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async q => { await page.goto(URL + (q || '')); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.goto(URL + (q || '')); await page.waitForTimeout(500); };
    const ev = (f, a) => page.evaluate(f, a);
    await scen('first run: shown once, over a live rack; band, Done and drag each finish it; defaults', async () => {
      for (const how of ['band', 'done', 'drag']) {
        const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
        const p = await cx.newPage(); await p.goto(URL); await p.waitForTimeout(1200);
        const st = await p.evaluate(() => [obsheet.state, document.querySelector('#obbody .check[data-act=track]').getAttribute('aria-checked'), JSON.stringify([S.track, S.diet, S.avoid, S.show]),
          document.querySelector('#bands').getBoundingClientRect().bottom <= document.querySelector('#obsheet').getBoundingClientRect().top + 1]);
        assert.deepEqual(st, ['mid', 'true', JSON.stringify([true, { veg: false, plant: false, halal: false }, {}, { hf: false, cr: false }]), true], `${how}: first run rests under the four bands, tracking on, no diet, scores off`);
        assert.equal(await p.locator('#obbody [data-act=newton]').count(), 0, 'Charles River is not asked');
        if (how === 'band') { await p.locator('.band[data-h=F]').tap(); await p.waitForTimeout(1400);
          assert.equal(await p.evaluate(() => [obsheet.state, S.hall, !document.querySelector('#menu').classList.contains('hide')].join()), 'closed,F,true', 'one tap on a band: the sheet goes and Franklin opens'); }
        if (how === 'done') { await p.locator('#obbody [data-diet=veg]').tap(); await p.locator('#obbody [data-act=obdone]').tap(); await p.waitForTimeout(800);
          assert.equal(await p.evaluate(() => [obsheet.state, S.diet.veg].join()), 'closed,true', 'Done keeps what was chosen (one control per setting: the same rows as You)'); }
        if (how === 'drag') { const g = await p.locator('#obsheet .grab').boundingBox(); await p.mouse.move(195, g.y + 8); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(195, g.y + 8 + i * 45); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(900);
          assert.equal(await p.evaluate(() => obsheet.state), 'closed', 'dragged away'); }
        await p.reload(); await p.waitForTimeout(1000);
        assert.equal(await p.evaluate(() => obsheet.state), 'closed', `${how}: it never comes back`);
        await cx.close(); }
    });
    await scen('tracking off: a menu; every way to record is gone; on: all back as it was', async () => {
      await go('?state=menu'); await page.locator('#mlist .row', { hasText: 'Golden BBQ Chicken Thigh' }).locator('.add').tap(); await page.waitForTimeout(500);
      const hts = () => ev(() => [...document.querySelectorAll('#mlist .row')].slice(0, 12).map(r => Math.round(r.getBoundingClientRect().height)).join());
      const h0 = await hts(), days0 = await ev(() => logDays().length);
      await ev(() => setTrack(false)); await page.waitForTimeout(400);
      assert.equal(await ev(() => [...document.querySelectorAll('#mlist .row .add, #mlist .row .step')].filter(e => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none').length), 0, 'no + or stepper on a hall row');
      assert(await ev(() => [...document.querySelectorAll('#mlist .row')].slice(0, 12).every(r => r.getBoundingClientRect().height >= 47.5 && r.getBoundingClientRect().height <= 90)) && (await hts()) !== h0, 'hall rows close up to name-only (round 13): ' + h0 + ' -> ' + await hts());
      assert.equal(await ev(() => getComputedStyle(document.querySelector('#bar')).display), 'none', 'no plate bar');
      assert.equal(await ev(() => [addDish('lunch', 'x', { W: {} }, 'x'), plateOpen()].join()), ',false', 'nothing records and the plate cannot open');
      await page.locator('#mlist .row', { hasText: 'Golden BBQ Chicken Thigh' }).locator('.n').tap(); await page.waitForTimeout(800);
      const sh = await ev(() => { const w = document.querySelector('#isbody .where'), prev = w.previousElementSibling; return [document.querySelectorAll('#isbody .dadd').length, Math.round(w.getBoundingClientRect().top - prev.getBoundingClientRect().bottom)]; });
      assert.deepEqual(sh, [0, 16], 'the sheet has no Add, and "where" takes its slot 16 px under the identity');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(500);
      await ev(() => { openDish(Object.values(DISH).find(x => !x.day && x.h === 'W' && x.n === 'Beef Brisket Noodle Bowl')); }); await page.waitForTimeout(700);
      assert.equal(await ev(() => document.querySelectorAll('#isbody .brow').length + (document.querySelector('#bfoot').classList.contains('hide') ? 0 : 1)), 0, 'no bowl builder');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(400);
      await page.locator('.tbar button[data-tab=search]').tap(); await page.locator('#q').fill('bbq'); await page.waitForTimeout(400);
      assert.equal(await ev(() => [...document.querySelectorAll('#sres .lane .add, #sres .lane .step, #sres [data-act=custom]')].filter(e => getComputedStyle(e).display !== 'none').length), 0, 'Search: no +, no custom food');
      await page.locator('.tbar button[data-tab=you]').tap(); await page.waitForTimeout(500);
      const you = await ev(() => [document.querySelector('#you h1').textContent, !!document.querySelector('#you [data-p=rank]'), !!document.querySelector('#you [data-p=export]'), !!document.querySelector('#you [data-p=day]'), !!document.querySelector('#you [data-act=health]')]);
      assert.deepEqual(you, ['You', false, true, false, false], 'You: "You", no ranking, Export stays while there is history, no days, no Health');
      await ev(() => { window.__keep = S.log; S.log = []; renderYou(); });
      assert.equal(await ev(() => !!document.querySelector('#you [data-p=export]')), false, 'no history: no Export');
      await ev(() => { S.log = window.__keep; }); await page.locator('#you [data-act=track]').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await ev(() => [S.track, getComputedStyle(document.querySelector('#bar')).display !== 'none', document.querySelector('#barL').textContent, S.plates[0].items.map(i => i.n + i.qty).join(), logDays().length, !!document.querySelector('#you [data-p=rank]')]),
        [true, true, 'Worcester lunch', 'Golden BBQ Chicken Thigh1', days0, true], 'on: the plate in progress, the days and ranking are back as they were');
      await page.reload(); await page.waitForTimeout(400); assert.equal(await ev(() => S.track), true, 'the switch persists');
    });
    await scen('past logs: day totals, the 2 AM rollover, edit, remove with Undo, Delete meal with Undo', async () => {
      await go('?state=you');
      const rows = await ev(() => [...document.querySelectorAll('#you [data-p=day]')].map(r => [r.dataset.c, +r.querySelector('.mc b').textContent.replace(/,/g, '')]));
      const want = await ev(() => logDays().filter(d => d !== TODAY).map(d => [d, Math.round(S.log.filter(m => m.day === d).flatMap(m => m.items).reduce((a, i) => a + i.cal * i.qty, 0))]));
      assert.deepEqual(rows, want, 'Earlier: one row per logged day, newest first, with its total');
      assert(!rows.some(([d]) => d === '2026-10-03'), 'a day with nothing logged has no row');
      assert.deepEqual(await ev(() => { const m = S.log.find(x => x.at === '2026-10-06T00:30'); return [m.day, S.log.filter(x => x.day === '2026-10-06').length]; }), ['2026-10-05', 3], 'a 12:30 AM meal belongs to the day before (2 AM rollover)');
      await page.locator('#you [data-p=day][data-c="2026-10-06"]').tap(); await page.waitForTimeout(900);
      assert.equal(await page.locator('.page .pbar .o').textContent(), 'Tuesday, October 6');
      const dayCal = () => ev(() => +document.querySelector('.page .facts .cal b').textContent.replace(/,/g, ''));
      const c0 = await dayCal(); assert.equal(c0, rows.find(r => r[0] === '2026-10-06')[1], 'the day page totals the day');
      await page.locator('.page [data-meal-id]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(800);
      const lr = n => page.locator('#isbody .prow[data-li]', { has: page.locator('.n', { hasText: new RegExp('^' + n) }) });
      await lr('Golden BBQ').locator('.inc').tap(); await page.waitForTimeout(300);
      assert.equal(await dayCal(), c0 + 93, 'a step edits the meal and the day at once');
      await lr('Beef Brisket').locator('.dec').tap(); await page.waitForTimeout(250); await lr('Beef Brisket').locator('.dec').tap(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#isbody .lgone .n').textContent(), 'Removed Beef Brisket Noodle Bowl', 'the last half leaves an inline Undo');
      await page.locator('#isbody [data-act=ungone]').tap(); await page.waitForTimeout(300);
      assert.equal(await ev(() => MS.m.items.find(i => i.n === 'Beef Brisket Noodle Bowl').qty), .5, 'Undo puts it back');
      await page.locator('#isbody [data-act=mdelete]').tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [isheet.state, S.log.filter(x => x.day === '2026-10-06').length, document.querySelector('#bar .l1').textContent]), ['closed', 2, 'Deleted Worcester lunch'], 'Delete meal: the sheet goes and the receipt offers Undo');
      await page.locator('#bar [data-act=undo]').tap(); await page.waitForTimeout(500);
      assert.equal(await ev(() => S.log.filter(x => x.day === '2026-10-06').length), 3, 'Undo restores the meal');
      assert.equal(await dayCal(), c0 + 93 - 340 / 2, 'and the day page shows it');
    });
    await scen('bowls: Noodle Bowl, a café with Add-ons, the synthetic Salad Bar, reopen to edit', async () => {
      await go('?state=menu');
      const sheetOf = async n => { await ev(n => { openDish(Object.values(DISH).find(x => !x.day && x.h === 'W' && x.n === n)); }, n); await page.waitForTimeout(800); };
      await sheetOf('Beef Brisket Noodle Bowl');
      assert.equal(await page.locator('#isbody .bh').textContent(), 'Noodle Bowl', "the station's own name heads its add-ins");
      for (const n of ['Hard Boiled Egg', 'Steamed Bok Choy']) await ev(n => document.querySelector(`#isbody .brow[data-bp="${Object.values(DISH).find(x => !x.day && x.h === 'W' && x.n === n && x.meal === 'lunch').id}"] .add`).click(), n);
      assert.equal(await page.locator('#bfoot .l2 b').first().textContent(), '340', 'the foot sums 218 + 111 + 11');
      assert.equal(await page.locator('#isbody .blab .cal b').textContent(), '340', 'and so does the label');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      const it = () => ev(() => S.plates[0].items.map(i => [i.n, i.qty, Math.round(macroOf(i).cal), (macroOf(i).parts || []).map(([x, q]) => x.n + q).join('+')]));
      assert.deepEqual(await it(), [['Beef Brisket Noodle Bowl', 1, 340, 'Hard Boiled Egg1+Steamed Bok Choy1']], 'the bowl lands on the plate, one item with its parts');
      await page.locator('#mlist .row', { hasText: 'Beef Brisket Noodle Bowl' }).locator('.add').tap(); await page.waitForTimeout(500);
      assert.equal((await it()).length, 2, "the row's + still adds the plain dish (the benchmark's one tap)");
      assert.equal(await page.locator('#mlist .row', { hasText: 'Beef Brisket Noodle Bowl' }).locator('.step .q').textContent(), '1', 'the row counts the plain dish only');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      await page.locator('#psbody .prow', { hasText: 'with Hard Boiled Egg' }).locator('.n').tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [document.querySelector('#bfoot [data-act=badd]').textContent, [...DS.build.sel.keys()].length]), ['Update', 2], 'a bowl reopens from the plate with its parts chosen');
      await ev(() => document.querySelector('#isbody .brow:has(.n) .add').click());
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1200);
      assert.deepEqual(await ev(() => [S.plates[0].items.length, macroOf(S.plates[0].items[0]).parts.length]), [2, 3], 'Update replaces it in place, now with three parts');
      // a café with Add-ons: price sums
      await go(); const gf = await ev(() => P.places.findIndex(x => x[0] === 'Green Fields'));
      await ev(i => openHall('C', true, null, { cafe: i }), gf);
      await page.locator('#mlist .row', { hasText: 'Create Your Own Salad' }).locator('.n').tap(); await page.waitForTimeout(800);
      assert.equal(await page.locator('#isbody .bh').textContent(), 'Add-ons');
      for (const n of ['Add Fresh Avocado', 'Grilled Diced Chicken']) await ev(n => [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent.startsWith(n)).querySelector('.add').click(), n);
      assert.deepEqual(await ev(() => [document.querySelector('#bfoot .l2 b').textContent, document.querySelector('#isbody .bsv .pr').textContent]), ['628', '$19.00'], '487 + 55 + 86 cal; $12.25 + $2.50 + $4.25');
      assert.equal(await page.locator('#isbody .brow .n', { hasText: 'Fountain Drink' }).count(), 1, 'an add-on with no calories recorded is offered, with – (round 12c; round 10 left it out)');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => [plateLabel(S.plates[0]), macroOf(S.plates[0].items[0]).price]), ['Green Fields lunch', '$19.00']);
      // the synthetic Salad Bar base totals only what was chosen
      await go('?state=menu&hall=B'); await page.locator('#mtabs .mts button[data-meal=dinner]').tap(); await page.waitForTimeout(700);
      const sr = page.locator('#mlist .row.syn').first(); assert.equal(await sr.locator('.n').textContent(), 'Salad Bar');   // round 11: named after the station
      await sr.tap(); await page.waitForTimeout(800);
      assert.deepEqual(await ev(() => [document.querySelector('#bfoot .l2 b').textContent, document.querySelector('#bfoot [data-act=badd]').disabled]), ['0', true], 'nothing chosen: 0, and nothing to add');
      const picked = await ev(() => { const rows = [...document.querySelectorAll('#isbody .brow')].slice(0, 3); rows.forEach(r => r.querySelector('.add').click()); return rows.reduce((a, r) => a + DISH[r.dataset.bp].cal, 0); });
      assert.equal(+await page.locator('#bfoot .l2 b').first().textContent(), Math.round(picked), 'the salad is only the sum of its items');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => [S.plates[0].items[0].n, Math.round(macroOf(S.plates[0].items[0]).cal)]), ['Salad Bar', Math.round(picked)]);
      assert(await page.locator('#mlist .row:not(.syn) .add').count() > 10, 'its singles keep their own +');
      // and the Deli Bar
      await go('?state=menu&hall=F'); assert.equal(await page.locator('#mlist .row.syn .n', { hasText: /^Deli Bar$/ }).count(), 1);
    });
    await scen('Health: allow, deny, revoked; writes on log, follows edits and deletes; nothing while tracking is off', async () => {
      const toHealth = async q => { await go('?state=you' + q); };
      await toHealth('&health=allow'); assert.equal(await page.locator('#you [data-act=health] span span').first().textContent(), 'Write to Health ConnectEach meal you log');
      await page.locator('#you [data-act=health]').tap(); await page.waitForTimeout(300); assert.equal(await page.locator('.ossheet').count(), 1, "tapping the row asks the OS at once");
      await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#you [data-act=health]').getAttribute('aria-checked'), 'true', 'allowed: on');
      await ev(() => { bench(); logPlate(S.plates[0]); }); await page.waitForTimeout(300);
      const rec = () => ev(() => HEALTH.records.map(r => [r.name, r.energyKcal]));
      assert.deepEqual(await rec(), [['Lunch at Worcester', 404]], 'a logged meal is written');
      await ev(() => { const m = S.log.at(-1); openMeal(m.id); }); await page.waitForTimeout(700);
      await page.locator('#isbody .prow[data-li]').first().locator('.inc').tap(); await page.waitForTimeout(300);
      assert.deepEqual(await rec(), [['Lunch at Worcester', 404 + 218]], 'an edit rewrites its record');
      await page.locator('#isbody [data-act=mdelete]').tap(); await page.waitForTimeout(900);
      assert.deepEqual(await rec(), [], 'a delete deletes it');
      await page.locator('#bar [data-act=undo]').tap(); await page.waitForTimeout(400); assert.equal((await rec()).length, 1, 'Undo writes it back');
      await ev(() => setTrack(false)); await ev(() => { bench(); }); assert.equal((await rec()).length, 1, 'tracking off: nothing is written');
      assert.equal(await page.locator('#you [data-act=health]').count(), 0, 'and the Health row is gone');
      await ev(() => setTrack(true)); assert.equal(await page.locator('#you [data-act=health]').getAttribute('aria-checked'), 'true', 'back on: still on');
      await toHealth('&health=deny'); await page.locator('#you [data-act=health]').tap(); await page.waitForTimeout(300); await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.deepEqual(await ev(() => [document.querySelector('#you [data-act=health]').getAttribute('aria-checked'), document.querySelector('#you [data-act=health] .cb').textContent, document.querySelector('#you [data-act=hsettings]').textContent]), ['false', "Health Connect didn't allow it", 'Open Health Connect'], 'denied');
      assert((await page.locator('#you [data-act=hsettings]').boundingBox()).height >= 44);
      await ev(() => { bench(); logPlate(S.plates[0]); }); assert.equal((await rec()).length, 0, 'denied: nothing is written');
      await go('?state=you&health=revoked'); await ev(() => localStorage.setItem('udine-m2', JSON.stringify({ health: true }))); await page.reload(); await page.waitForTimeout(400); await ev(() => setTab('you'));
      assert.deepEqual(await ev(() => [document.querySelector('#you [data-act=health]').getAttribute('aria-checked'), document.querySelector('#you [data-act=health] .cb').textContent]), ['false', 'Not allowed in Health Connect any more'], 'revoked in system settings');
      await go('?state=you&os=ios'); assert.match(await page.locator('#you [data-act=health]').textContent(), /^Write to Apple Health/, 'iOS names Apple Health');
      await page.evaluate(() => localStorage.removeItem('udine-m2'));
    });
  };
  // Round 11: packaged and saved foods, Search UMass Dining, offline search, café PDFs, favourite alerts, bowls.
  // RED=11 runs only this block, each scenario caught (SRC=build/r11/before-index.html shows which fail on round 10).
  const round11 = async () => {
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async q => { await page.goto(URL + (q || '')); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.goto(URL + (q || '')); await page.waitForTimeout(500); };
    const ev = (f, a) => page.evaluate(f, a);
    const type = async q => { await page.locator('#q').fill(q); await page.waitForTimeout(900); };
    const groups = () => ev(() => [...document.querySelectorAll('#sres .sgrp')].map(g => g.dataset.key));
    const grpRows = key => ev(k => { const out = []; let el = document.querySelector(`#sres .sgrp[data-key="${k}"]`); if (!el) return out;
      for (el = el.nextElementSibling; el && !el.classList.contains('sgrp'); el = el.nextElementSibling) if (el.classList.contains('row')) out.push({ n: el.querySelector('.n').textContent, m: el.querySelector('.m').textContent.replace(/\s+/g, ''), tags: el.querySelectorAll('.lane .tags').length, add: el.querySelectorAll('.lane .add').length }); return out; }, key);
    await scen('bowls: Salad Bar and Deli Bar; no by-the-pound base; exactly one Noodle Bowl base per hall station-day', async () => {
      await go('?state=menu&hall=B'); await page.locator('#mtabs .mts button[data-meal=dinner]').tap(); await page.waitForTimeout(700);
      assert.equal(await page.locator('#mlist .row.syn .n').first().textContent(), 'Salad Bar', 'the synthetic base reads "Salad Bar"');
      await page.locator('#mlist .row.syn').first().tap(); await page.waitForTimeout(800);
      assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelectorAll('#isbody .bh').length]), ['Salad Bar', 0], 'its sheet is titled by the station and drops the heading that would repeat it');
      await go('?state=menu&hall=F'); assert.equal(await page.locator('#mlist .row.syn .n', { hasText: /^Deli Bar$/ }).count(), 1, '"Deli Bar"');
      const lb = await ev(() => { const out = []; MD.forEach((d, day) => Object.entries(d).forEach(([k, ms]) => Object.entries(ms).forEach(([meal, ss]) => ss.forEach(([st], si) => { const y = synOf(day, k, meal, si); if (y && (/LB|\$/.test(st) || y.head === 'Cold Bar')) out.push([day, PN(k), st]); })))); return out; });
      assert.deepEqual(lb, [], 'no by-the-pound bar (Harvest Market, Roots) and no Cold Bar gets a base');
      const nb = await ev(() => noodleBases());
      assert.equal(nb.length, 82, 'every hall Noodle Bowl station-day, Oct 8-22');
      assert.deepEqual(nb.filter(x => x.n !== 1), [], 'each resolves exactly one base');
      const by = Object.fromEntries(nb.map(x => [x.day + ' ' + x.h + ' ' + x.meal, x.base]));
      const want = { '2026-10-19 W lunch': 'Shrimp Tom Yum Soup (Chicken Broth)', '2026-10-08 W dinner': 'Kumamoto Style Ramen (Pork & Chicken)', '2026-10-09 H lunch': 'Chicken Katsu',
        '2026-10-14 H dinner': 'Japanese Curry Noodles', '2026-10-14 B lunch': 'Bun Heo Quay (Crispy Pork Belly Bowl)', '2026-10-11 H lunch': 'Chicken Congee', '2026-10-09 H dinner': 'Tonkotsu Ramen (Fish)',
        '2026-10-20 H lunch': 'Shoyu Ramen Bar (Fish, Chicken)', '2026-10-14 B dinner': 'Masala Dosa', '2026-10-20 W dinner': 'Khoa Soi', '2026-10-08 W lunch': 'Beef Brisket Noodle Bowl', '2026-10-08 H lunch': 'Noodle Bowl' };
      for (const [k, v] of Object.entries(want)) assert.equal(by[k], v, k);
      assert.equal(nb.filter(x => x.base === 'Noodle Bowl').length, 15, 'the 15 pho bars (two or more broths) take the station as a synthetic base');
      assert(!nb.some(x => /Pork Belly$|Mayu|Hard Boiled Egg/.test(x.base)), 'a topping is never the base');
      await go('?state=menu&hall=H'); assert.equal(await page.locator('#mlist .row.syn .n', { hasText: /^Noodle Bowl$/ }).count(), 1, "Hampshire's pho bar today has its synthetic base");
      assert.equal(await ev(() => { const d = Object.values(DISH).find(x => !x.day && x.h === 'W' && x.meal === 'dinner' && /^Mayu/.test(x.n)); return buildOf(d); }), null, 'Mayu oil beside the ramen does not build');
    });
    await scen('packaged and saved foods: after the menus, no letters, per 100 g; sheets; save, edit, delete + Undo; You; export; tracking off', async () => {
      await go('?state=search'); await page.locator('#q').fill('clif'); await page.waitForTimeout(60);
      assert.equal(await page.locator('#sres [data-key=pk-wait] .spin').count(), 1, 'packaged, in flight: the indicator in its slot');
      await page.waitForTimeout(900);
      const gs = await groups(); assert.deepEqual(gs.filter(k => ['g-now', 'g-cafes', 'g-later', 'g-yours', 'g-pack'].includes(k)), ['g-yours', 'g-pack'], 'nothing served: Your foods, then Packaged');
      const yours = await grpRows('g-yours'), pack = await grpRows('g-pack');
      assert.deepEqual(yours, [{ n: 'Clif Bar Chocolate Chip', m: '250cal6gprotein', tags: 0, add: 1 }], 'a saved packaged food: its own serving, a + and no place');
      assert(pack.length >= 5, 'packaged hits');
      assert.deepEqual(pack[0], { n: 'Clif bar', m: '368calper100g', tags: 0, add: 1 }, 'per-100 g values say so');
      assert.equal(new Set(pack.map(r => r.n.toLowerCase())).size, pack.length, 'a name once');
      assert(!pack.some(r => r.n === 'Clif Bar Chocolate Chip'), 'a food already in Your foods is not repeated');
      await type('bbq'); const g2 = await groups(); assert(g2.indexOf('g-now') >= 0 && (g2.indexOf('g-pack') < 0 || g2.indexOf('g-pack') > g2.indexOf('g-now')), 'served dishes come first');
      await type('clif');
      await page.locator('#sres .row[data-food]', { hasText: /^Clif bar/ }).first().locator('.n').tap(); await page.waitForTimeout(800);
      assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#isbody .dsv').textContent, document.querySelectorAll('#isbody .where, #isbody .grades, #isbody .favb, #isbody [data-act=fedit]').length, !!document.querySelector('#isbody .dadd')]),
        ['Clif bar', '100 g', 0, true], 'a packaged sheet: name, serving, Add to plate; no where, no grades, no star');
      await page.locator('#isbody [data-act=dadd]').tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [S.plates[0].items[0].n, S.foods.some(f => f.n === 'Clif bar')]), ['Clif bar', true], 'added, and saved to Your foods');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(900);
      assert.equal(await page.locator('#psbody .prow .m').first().textContent(), '368 cal per 100 g', 'on the plate, the serving says what it is'); await ev(() => psheet.to('closed')); await page.waitForTimeout(600);
      await go('?state=search&pack=fail'); await type('clif');
      assert.equal(await page.locator('#sres [data-key=pk-fail]').textContent(), "Packaged foods didn't load.Try again", 'packaged failed: what happened, and Try again');
      await go('?state=search'); await type('clif');
      await page.locator('#sres .row[data-food^="p"] .add').first().tap(); await page.waitForTimeout(900);
      // a custom food from Search is saved too
      await type('overnight oats'); await page.locator('#sres [data-act=custom]').first().tap(); await page.waitForTimeout(500);
      await page.locator('#cc').fill('310'); await page.locator('#cp').fill('11'); await page.locator('#cform .btn').tap(); await page.waitForTimeout(700);
      assert(await ev(() => S.foods.some(f => f.n === 'overnight oats' && f.cal === 310)), 'Add to plate saves the custom food');
      // You -> Your foods -> a food's sheet -> Edit -> Save; Delete + Undo
      await page.locator('.tbar button[data-tab=you]').tap(); await page.waitForTimeout(500);
      assert.equal(await page.locator('#you [data-p=foods] .a').textContent(), 'Your foods');
      assert.equal(await page.locator('#you [data-p=foods] .b').textContent(), '4 foods');
      await page.locator('#you [data-p=foods]').tap(); await page.waitForTimeout(800);
      assert.deepEqual(await ev(() => [...document.querySelectorAll('.page[data-p=foods] [data-food] .a')].map(e => e.textContent)), ['overnight oats', 'Clif bar', 'Chobani', 'Clif Bar Chocolate Chip'], 'newest first');
      await page.locator('.page[data-p=foods] [data-food]', { hasText: 'Chobani' }).tap(); await page.waitForTimeout(800);
      assert.equal(await page.locator('#isbody [data-act=fedit]').textContent(), 'Edit', "Edit in the star's slot");
      await page.locator('#isbody [data-act=fedit]').tap(); await page.waitForTimeout(400);
      assert.equal(await page.locator('#cn').inputValue(), 'Chobani'); await page.locator('#cc').fill('150');
      assert.equal(await page.locator('#cform .btn').textContent(), 'Save');
      await page.locator('#cform .btn').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#isbody .label .cal b').textContent, S.foods.find(f => f.n === 'Chobani').cal]), ['Chobani', '150', 150], 'Save returns to the sheet with the new numbers');
      await page.locator('#isbody [data-act=fedit]').tap(); await page.waitForTimeout(300); await page.locator('#isbody [data-act=fdelete]').tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [isheet.state, S.foods.some(f => f.n === 'Chobani'), document.querySelector('#bar .l1').textContent]), ['closed', false, 'Deleted Chobani'], 'Delete: the sheet goes and the receipt offers Undo');
      await page.locator('#bar [data-act=undo]').tap(); await page.waitForTimeout(400);
      assert(await ev(() => S.foods.some(f => f.n === 'Chobani' && f.cal === 150)), 'Undo puts it back');
      assert(await ev(() => JSON.parse(exportBody('json')).foods.some(f => f.name === 'Chobani')), 'export includes saved foods');
      // tracking off: the ledger's parts of Search and You go
      await ev(() => setTrack(false)); await page.locator('.tbar button[data-tab=search]').tap(); await page.waitForTimeout(400); await type('clif');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#sres [data-key=g-yours], #sres [data-key=g-pack], #sres [data-act=lookup], #sres [data-act=custom]')].length), 0, 'tracking off: no Your foods, Packaged, lookup or custom food');
      await page.locator('.tbar button[data-tab=you]').tap(); await page.waitForTimeout(400);
      assert.equal(await page.locator('#you [data-p=foods]').count(), 0, 'and no Your foods row'); await ev(() => setTrack(true));
    });
    await scen('Search UMass Dining: in flight, found, none, failed, rate-limited', async () => {
      const lk = async q => { await go('?state=search&lookup=' + q); await type('laksa'); return page.locator('#sres [data-act=lookup]'); };
      let b = await lk('found'); assert.equal(await b.textContent(), 'Search UMass Dining for “laksa”', 'a text button after the groups');
      assert.equal(await ev(() => !!document.querySelector('#sres [data-act=lookup]').nextElementSibling?.matches('[data-act=custom]')), true, 'just before the custom food');
      await b.tap(); await page.waitForTimeout(650);
      assert.equal(await page.locator('#sres .lkst .spin').count(), 1, 'in flight: the indicator, in its slot'); assert.equal(await page.locator('#sres [data-act=lookup]').count(), 0);
      await page.waitForTimeout(1200);
      const um = await grpRows('g-umass'); assert.equal(await page.locator('#sres .sgrp[data-key=g-umass]').textContent(), 'UMass Dining');
      assert.deepEqual(um.map(r => [r.n, r.tags, r.add]), [['Laksa Noodle Bowl (Shrimp, Fish, Eggs, Almonds,Tofu)', 0, 1]], 'found: a dish not on a menu today or tomorrow, no place in its lane');
      await page.locator('#sres .row[data-food] .n', { hasText: 'Laksa' }).tap(); await page.waitForTimeout(800);
      assert.equal(await ev(() => document.querySelectorAll('#isbody .where').length), 0, 'its sheet has no "where"');
      const st = async q => { await lk(q); await page.locator('#sres [data-act=lookup]').tap(); await page.waitForTimeout(1900); return ev(() => document.querySelector('#sres .lkst').textContent.trim()); };
      assert.equal(await st('none'), 'UMass Dining has nothing else called “laksa”.');
      assert.equal(await st('offline'), "Couldn't reach UMass Dining.Try again", 'failed: what happened, and Try again');
      assert((await page.locator('#sres [data-act=lookupretry]').boundingBox()).height >= 44, 'Try again is 44 px');
      assert.equal(await st('limited'), 'Searching UMass Dining is paused until 1 PM.', 'rate-limited: when it comes back');
    });
    await scen('offline search: says what it searches; unsaved cafés absent; Your foods offline; failed: Couldn\'t connect, Packaged still answers, Try again', async () => {
      await go('?state=search&net=offline');
      assert.equal(await page.locator('#search .netnote').textContent(), "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow.", 'the line, idle');
      await type('caesar'); assert.equal(await page.locator('#sres .row[data-cg]').count(), 0, 'a café never opened is not searched');
      await type('bbq'); assert((await groups()).includes('g-now'), "the halls' saved menus are");
      await type('clif'); const gs = await groups();
      assert(gs.includes('g-yours') && !gs.includes('g-pack'), 'Your foods answers; Packaged needs the network');
      assert.equal(await page.locator('#sres [data-act=lookup]').count(), 0, 'no Search UMass Dining offline'); assert(await page.locator('#sres [data-act=custom]').count() > 0, 'a custom food needs nothing');
      await type('green fields'); assert.equal(await page.locator('#sres .prow2', { hasText: 'Green Fields' }).count(), 1, 'places still match by name');
      await go('?state=search&net=offline&saved=Green%20Fields');
      assert.equal(await page.locator('#search .netnote').textContent(), "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow, and Green Fields, today.");
      await type('caesar'); assert(await page.locator('#sres .row[data-cg]').count() > 0, 'a saved café is searched');
      await go(); const gf = await ev(() => P.places.findIndex(x => x[0] === 'Green Fields'));
      await go('?net=offline'); await ev(i => openHall('C', true, null, { cafe: i }), gf); await page.waitForTimeout(300);
      assert.equal(await page.locator('#mlist .empty').textContent(), "You're offline, and the menu for Thursday, October 8 isn't saved on this phone.", 'an unsaved café, opened offline');
      await go('?state=search&net=fail'); await type('bbq');
      assert.equal(await page.locator('#search .netfail span').textContent(), "Couldn't connect"); assert.equal(await page.locator('#search .netfail [data-act=retry]').textContent(), 'Try again');
      assert(!(await groups()).includes('g-now'), 'failed: no menus');
      await type('clif'); assert((await groups()).includes('g-pack'), 'failed: Packaged still answers'); assert.equal(await page.locator('#sres [data-act=lookup]').count(), 1);
      await type('bbq'); await page.locator('#search .netfail [data-act=retry]').tap(); await page.waitForTimeout(600);
      assert((await groups()).includes('g-now'), 'Try again: the menus are back'); assert.equal(await page.locator('#search .netfail').count(), 0);
    });
    await scen('café PDFs: The Commonwealth Restaurant, four menus as rows, a pushed page of pages; offline and failed', async () => {
      await go(); const ci = await ev(() => P.places.findIndex(x => x[0] === 'The Commonwealth Restaurant'));
      assert(ci >= 0, 'The Commonwealth Restaurant is a place'); assert.deepEqual(await ev(i => [P.places[i][1], P.places[i][2]], ci), [1, 'Worcester Commons']);
      const open = async q => { await go(q); await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(300); };
      await open('');
      assert.equal(await page.locator('#mlist .cbody h3').first().textContent(), 'Menus');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#mlist [data-pdf] .a')].map(e => e.textContent)), ['Lunch', 'Lite fare', 'Dinner', 'Dessert'], 'one row per PDF, in the feed order');
      assert.equal(await page.locator('#mlist [data-act=custom]').count(), 1, 'Add a custom food stays');
      await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(250);
      assert.deepEqual(await ev(() => [NAV.at(-1).el.querySelectorAll('.spin').length, NAV.at(-1).el.querySelectorAll('img.pdfp').length]), [1, 0], 'loading: the indicator, no pages yet');
      await page.waitForTimeout(1150);
      assert.deepEqual(await ev(() => { const p = NAV.at(-1).el; return [p.dataset.p, p.querySelector('.pbar .o').textContent, p.querySelectorAll('img.pdfp').length]; }), ['pdf', 'Lunch menu', 2], 'pushed: "Lunch menu", its two pages');
      assert(await ev(() => [...document.querySelectorAll('.page[data-p=pdf] img.pdfp')].every(i => i.naturalWidth > 0 && Math.abs(i.getBoundingClientRect().width - (frame.clientWidth - 32)) < 1)), 'pages drawn at the screen width, 16 px gutters');
      await open('?net=offline');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#mlist [data-pdf] .r')].map(e => e.textContent)), ['Not saved', 'Not saved', 'Not saved', 'Not saved'], 'offline: never-opened menus say "Not saved"');
      await page.locator('#mlist [data-pdf]', { hasText: 'Dinner' }).tap(); await page.waitForTimeout(900);
      assert.equal(await page.locator('.page[data-p=pdf] .empty').textContent(), "You're offline, and this menu isn't saved on this phone.");
      await open('?net=offline&saved=pdf:Lunch');
      assert.equal(await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).locator('.r').count(), 0, 'an opened menu is kept');
      await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(1400);
      assert.equal(await page.locator('.page[data-p=pdf] img.pdfp').count(), 2, 'and opens offline');
      await open('?net=fail'); await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(900);
      assert.equal(await page.locator('.page[data-p=pdf] .empty').textContent(), "The lunch menu didn't load.");
      await page.locator('.page[data-p=pdf] [data-act=pdfretry]').tap(); await page.waitForTimeout(1400);
      assert.equal(await page.locator('.page[data-p=pdf] img.pdfp').count(), 2, 'Try again loads it');
      await go('?state=search'); await type('commonwealth'); assert.equal(await page.locator('#sres .prow2', { hasText: 'The Commonwealth Restaurant' }).count(), 1, 'Search finds it');
    });
    await scen('favourite alerts: Notify me with the OS ask; denied, blocked, background off; one per dish per day; tap opens the hall at the dish', async () => {
      const fav = () => ev(() => { S.fav = new Set([norm('Beef Brisket Noodle Bowl'), norm('Golden BBQ Chicken Thigh')]); save(); });
      const favs = async q => { await go('?state=you' + q); await fav(); await page.locator('#you [data-p=favs]').tap(); await page.waitForTimeout(800); return page.locator('.page[data-p=favs] [data-act=alerts]'); };
      let r = await favs('');
      assert.equal(await r.textContent(), "Notify meWhen a favorite is on today's menu", 'the switch sits with the favourites, saying what it agrees to');
      assert.equal(await r.getAttribute('aria-checked'), 'false');
      await r.tap(); await page.waitForTimeout(300); assert.equal(await page.locator('.ossheet').count(), 1, 'a tap asks the OS at once');
      await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.equal(await r.getAttribute('aria-checked'), 'true', 'allowed: on');
      const run = (m, day) => ev(([m, day]) => alertRun(m, day).map(n => [n.title, n.body]), [m, day]);
      assert.deepEqual(await run(6 * 60 + 50), [], 'nothing before 7 AM');
      assert.deepEqual(await run(7 * 60 + 15), [['Beef Brisket Noodle Bowl', 'Lunch from 11 AM at Worcester and Berkshire'], ['Golden BBQ Chicken Thigh', 'Lunch from 11 AM at Worcester']], 'one per dish, every place named');
      assert.deepEqual(await run(7 * 60 + 30), [], 'one per dish per day');
      await ev(() => { ALERTS.seen.clear(); }); assert.deepEqual(await run(12 * 60 + 41), [], 'the server pushes once, at about 7 AM: nothing later posts, so a dish added to a menu after 7 AM is not alerted (round 13)');
      assert.deepEqual(await run(8 * 60), [], 'and the window closes at 8');
      r = await favs('&alerts=deny'); await r.tap(); await page.waitForTimeout(300); await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.deepEqual(await ev(() => { const a = document.querySelector('.page[data-p=favs] [data-act=alerts]'); return [a.getAttribute('aria-checked'), a.querySelector('.cb').textContent, document.querySelector('.page[data-p=favs] [data-act=asettings]').textContent]; }), ['false', 'Notifications are off for UDine', 'Open Settings'], 'denied');
      assert((await page.locator('.page[data-p=favs] [data-act=asettings]').boundingBox()).height >= 44);
      assert.deepEqual(await run(7 * 60 + 15), [], 'denied: nothing posts');
      await favs('&alerts=revoked');
      assert.deepEqual(await ev(() => { const a = document.querySelector('.page[data-p=favs] [data-act=alerts]'); return [a.getAttribute('aria-checked'), a.querySelector('.cb').textContent]; }), ['false', 'Notifications are off for UDine'], 'revoked in system settings: the denied state');
      r = await favs('&alerts=blocked'); await r.tap(); await page.waitForTimeout(300);
      assert.equal(await page.locator('.ossheet').count(), 0, 'blocked: the OS will not ask again');
      assert.equal(await page.locator('.page[data-p=favs] [data-act=alerts] .cb').textContent(), 'Notifications are off for UDine');
      for (const [os, want] of [['android', ['true', "Battery use is restricted, so notifications can't arrive"]], ['ios', ['true', "When a favorite is on today's menu"]]]) {
        r = await favs('&alerts=bgoff&os=' + os); await r.tap(); await page.waitForTimeout(300); await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
        assert.deepEqual(await ev(() => { const a = document.querySelector('.page[data-p=favs] [data-act=alerts]'); return [a.getAttribute('aria-checked'), a.querySelector('.cb').textContent]; }), want, os + ': restricted battery is a state on Android only (FCM is not delivered to a Restricted app); iOS has no such row'); }
      assert.deepEqual(await ev(() => document.querySelector('.page[data-p=favs] [data-act=asettings]')?.textContent || null), null, 'iOS: no button');
      await favs('&alerts=bgoff&os=android'); await page.locator('.page[data-p=favs] [data-act=alerts]').tap(); await page.waitForTimeout(300); await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.equal(await ev(() => document.querySelector('.page[data-p=favs] [data-act=asettings]').textContent), 'App info', 'Android: App info');
      assert.deepEqual(await run(7 * 60 + 15), [], 'restricted: the push does not arrive');
      await go('?notify=1'); await page.waitForTimeout(400);
      assert.deepEqual(await ev(() => [...document.querySelectorAll('.osnote b, .osnote span.t')].map(e => e.textContent)), ['Beef Brisket Noodle Bowl', 'Lunch from 11 AM at Worcester and Berkshire'], 'the notification: the dish, then where and when');
      await ev(() => { openHall('W', false, null, { day: 0, meal: 'lunch' }); }); await page.waitForTimeout(1200);
      await page.locator('.osnote').tap(); await page.waitForTimeout(1200);
      assert.deepEqual(await ev(() => [S.tab, S.hall, !document.querySelector('#tab-halls').classList.contains('hide'), document.querySelector('#menu').classList.contains('hide')]), ['halls', null, true, true], 'tapping it lands on the Halls home (the tab root), not the hall (round 13: the pushed hall is gone)');
    });
    // ---- round 11b (owner, 2026-10-14): pho is named after its broth; cafés' pho builders; pinned cafés saved; row gaps
    await scen('pho: named after the broth picked; Add waits for one; one broth at a time; Whitmore and Star Ginger build one pho', async () => {
      await go('?state=menu&hall=H'); await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
      const st = () => ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#bfoot [data-act=badd]').disabled, +document.querySelector('#bfoot .l2 b').textContent]);
      assert.deepEqual(await st(), ['Noodle Bowl', true, 0], 'no broth yet: the station names it, and Add waits');
      // round 12: a broth is picked by its chip; the other parts stay add-in rows
      const pick = n => ev(n => { const c = [...document.querySelectorAll('#isbody .vpick [data-var]')].find(c => c.textContent.startsWith(n)); if (c) return c.click(); [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent.startsWith(n)).querySelector('.add,.inc').click(); }, n);
      await pick('Chicken Pho Broth'); await page.waitForTimeout(200);
      assert.deepEqual(await st(), ['Chicken Pho Broth (Fish)', false, 24], 'a broth names the bowl');
      await pick('Green Curry Pho Broth'); await page.waitForTimeout(200);
      assert.deepEqual(await st(), ['Green Curry Pho Broth (Anchovies)', false, 249], 'another broth replaces it');
      assert.equal(await ev(() => document.querySelectorAll('#isbody .vpick [aria-checked=true]').length), 1, 'one broth at a time');
      await pick('Pho Noodles'); await pick('Chicken for Pho'); await page.waitForTimeout(200);
      assert.equal((await st())[2], 288, '249 + 11 + 28');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => { const it = S.plates[0].items[0], m = macroOf(it); return [it.n, m.parts.map(([x]) => x.n)]; }), ['Green Curry Pho Broth (Anchovies)', ['Pho Noodles', 'Chicken for Pho']], 'on the plate: the broth, with its parts');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      await page.locator('#psbody .prow .n').first().tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#bfoot [data-act=badd]').textContent, DS.build.sel.size]), ['Green Curry Pho Broth (Anchovies)', 'Update', 3], 'reopened to edit');
      for (const cafe of ['Whitmore Café', 'Star Ginger']) {
        await go(); const ci = await ev(n => P.places.findIndex(x => x[0] === n), cafe);
        await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(400);
        assert.equal(await ev(() => [...document.querySelectorAll('#mlist .row')].filter(r => /Pho|Ramen/.test(r.querySelector('.n').textContent) && buildOf(DISH[r.dataset.id])).length), 0, cafe + ': no pho builds on its own');
        await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
        assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#bfoot [data-act=badd]').disabled, [...document.querySelectorAll('#isbody .bh')].map(h => h.textContent)]), ['Noodle Bowl', true, ['Add-ons']], cafe + ': one builder, its add-ons under their own heading');
        const first = await ev(() => { document.querySelector('#isbody .vpick [data-var]').click(); const g = document.querySelectorAll('#isbody .vpick'); if (g.length > 1) g[1].querySelector('[data-var]').click();   // round 12b: protein, then broth
          return DISH[[...DS.build.sel.keys()].find(id => DISH[id] && DS.build.syn.choices.includes(DISH[id]))]; }); await page.waitForTimeout(500);
        assert.deepEqual(await ev(() => [document.querySelector('#isbody .dn').textContent, document.querySelector('#isbody .bsv .pr').textContent]), [first.n, first.price], cafe + ': the pho picked names it, at its price');
      }
    });
    await scen('pinned cafés are saved: their menu and PDFs open offline', async () => {
      await go(); await ev(() => localStorage.setItem('udine-m2', JSON.stringify({ pins: ['Green Fields', 'The Commonwealth Restaurant'] })));
      await page.goto(URL + '?state=search&net=offline'); await page.waitForTimeout(500);
      assert.equal(await page.locator('#search .netnote').textContent(), "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow, and Green Fields, today.", 'a pinned café is saved');
      await type('caesar'); assert(await page.locator('#sres .row[data-cg]').count() > 0, "and searched");
      const ci = await ev(() => P.places.findIndex(x => x[0] === 'The Commonwealth Restaurant'));
      await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(400);
      assert.equal(await page.locator('#mlist [data-pdf] .r').count(), 0, "a pinned café's PDFs are never 'Not saved'");
      await page.locator('#mlist [data-pdf]', { hasText: 'Dinner' }).tap(); await page.waitForTimeout(900);
      assert.equal(await page.locator('.page[data-p=pdf] img.pdfp').count(), 2, 'and open offline');
      await ev(() => localStorage.removeItem('udine-m2'));
    });
    await scen('a PDF page: double-tap zooms in where tapped, and again back out', async () => {
      await go(); const ci = await ev(() => P.places.findIndex(x => x[0] === 'The Commonwealth Restaurant'));
      await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(300);
      await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(1400);
      const w = () => ev(() => Math.round(document.querySelector('.page[data-p=pdf] img.pdfp').getBoundingClientRect().width));
      const w0 = await w(); const dbl = async () => { await page.touchscreen.tap(200, 400); await page.waitForTimeout(90); await page.touchscreen.tap(200, 400); await page.waitForTimeout(400); };
      await dbl(); assert.equal(await w(), Math.round(w0 * 2.5), 'double-tap: 2.5x');
      assert(await ev(() => NAV.at(-1).el.querySelector('.pbody').scrollLeft > 0 && NAV.at(-1).el.querySelector('.pbar').getBoundingClientRect().left === frame.getBoundingClientRect().left), 'zoomed where tapped (the pages scroll sideways to keep the point; the bar stays)');
      await dbl(); assert.equal(await w(), w0, 'double-tap again: back to the width of the screen');
    });
    await scen('a PDF page: the bar (back and title) and the tab bar stay whole and fixed at 1x, 2.5x and scrolled sideways', async () => {
      await go(); const ci = await ev(() => P.places.findIndex(x => x[0] === 'The Commonwealth Restaurant'));
      await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(300);
      await page.locator('#mlist [data-pdf]', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(1400);
      const bars = () => ev(() => { const el = NAV.at(-1).el, r = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round).join(); };
        const back = el.querySelector('.pbar [data-act=pageback]').getBoundingClientRect(), hit = document.elementFromPoint(back.left + back.width / 2, back.top + back.height / 2);
        return [r(el.querySelector('.pbar')), r(el.querySelector('.pbar [data-act=pageback]')), r(el.querySelector('.pbar .o')), r(document.querySelector('.tbar')), !!hit?.closest('.pbar')]; });
      const b0 = await bars(); assert.equal(b0[4], true, '1x: the back button is on top');
      await page.touchscreen.tap(300, 420); await page.waitForTimeout(90); await page.touchscreen.tap(300, 420); await page.waitForTimeout(400);
      assert.deepEqual(await bars(), b0, '2.5x: the bar, back, title and tab bar are where they were, and back is on top');
      await ev(() => { const pb = NAV.at(-1).el.querySelector('.pbody'); pb.scrollLeft += 300; NAV.at(-1).el.scrollTop += 400; }); await page.waitForTimeout(200);
      assert.deepEqual(await bars(), b0, 'scrolled sideways and down: still');
    });
    await scen('a row with a button under it: the button sits 12 px under the line, one line or two', async () => {
      const gap = async q => { await go('?state=you' + q); await page.locator('#you [data-p=favs]').tap(); await page.waitForTimeout(800);
        await page.locator('.page[data-p=favs] [data-act=alerts]').tap(); await page.waitForTimeout(300); if (await page.locator('.ossheet').count()) { await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300); }
        return ev(() => { const cb = document.querySelector('.page[data-p=favs] [data-act=alerts] .cb').getBoundingClientRect(), b = document.querySelector('.page[data-p=favs] [data-act=asettings]').getBoundingClientRect(); return Math.round(b.top - cb.bottom); }); };
      for (const q of ['&alerts=deny', '&alerts=bgoff']) assert.equal(await gap(q), 12, q + ': 12 px from the line to Open Settings');
      await go('?state=you&health=deny'); await page.locator('#you [data-act=health]').tap(); await page.waitForTimeout(300); await page.locator('.ossheet [data-os="1"]').tap(); await page.waitForTimeout(300);
      assert.equal(await ev(() => Math.round(document.querySelector('#you [data-act=hsettings]').getBoundingClientRect().top - document.querySelector('#you [data-act=health] .cb').getBoundingClientRect().bottom)), 12, "Health's denied row reads the same");
    });
  };
  // Round 12: variant pickers. A family (sizes, milks) is one row with a pick-one in its sheet; the pho's broth uses the same
  // picker. RED=12 runs only this block, each scenario caught (SRC=build/r12/before-index.html shows which fail on round 11b).
  const round12 = async () => {
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async q => { await page.goto(URL + (q || '')); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.goto(URL + (q || '')); await page.waitForTimeout(500); };
    const ev = (f, a) => page.evaluate(f, a);
    const type = async q => { await page.locator('#q').fill(q); await page.waitForTimeout(900); };
    const cafe = async n => { await go(); const ci = await ev(n => P.places.findIndex(x => x[0] === n), n); await ev(i => openHall('C', true, null, { cafe: i }), ci); await page.waitForTimeout(500); };
    const names = () => ev(() => [...document.querySelectorAll('#mlist .row:not(.syn)')].map(r => r.querySelector('.n').textContent.replace('★', '')));
    const meta = n => ev(n => [...[...document.querySelectorAll('#mlist .row:not(.syn), #sres .row')].find(r => r.querySelector('.n').textContent.replace('★', '') === n).querySelector('.m').children].map(c => c.textContent.trim()).join(' ').replace(/\s+/g, ' '), n);
    const sheet = () => ev(() => ({ n: document.querySelector('#isbody .dn').textContent,
      chips: [...document.querySelectorAll('#isbody .vpick [role=radio]')].map(c => c.textContent.trim() + (c.getAttribute('aria-checked') === 'true' ? '*' : '')),
      group: document.querySelector('#isbody .vpick')?.getAttribute('role') || null, sv: document.querySelector('#isbody .dsv')?.textContent || '',
      al: (document.querySelector('#isbody .dal:not([hidden])')?.textContent || '').replace('Contains', ''), cal: document.querySelector('#isbody .label .cal b')?.textContent,
      add: document.querySelector('#isbody .dadd, #bfoot:not(.hide) [data-act=badd]')?.textContent || null, star: document.querySelector('#isbody .favb')?.getAttribute('aria-pressed') || null }));
    const chip = async t => { await page.locator('#isbody .vpick [role=radio]', { hasText: new RegExp('^\\s*' + t.replace(/[()]/g, '\\$&') + '\\s*$') }).tap(); await page.waitForTimeout(450); };
    const openRow = async n => { await page.locator('#mlist .row:not(.syn), #sres .row', { has: page.locator('.n', { hasText: new RegExp('^' + n + '★?$') }) }).first().locator('.tx').tap(); await page.waitForTimeout(900); };
    const SIZES = ['Cappuccino', 'Caramel Macchiato', 'Chai', 'Chamomile Tea', 'Coffee', 'Earl Grey Tea', 'Hot Americano', 'Latte', 'Matcha Latte'];
    await scen('a size family: one row at Worcester Café; its chips pick the size; the sheet follows in place; add-ins stay chosen', async () => {
      await cafe('Worcester Café'); const ns = await names();
      for (const f of [...SIZES, 'Boba']) assert.equal(ns.filter(n => n === f).length, 1, f + ': one row, named for the family');
      assert.deepEqual(ns.filter(n => /^(16|20) oz (Cappuccino|Caramel Macchiato|Chai|Chamomile Tea|Coffee|Earl Grey Tea|Hot Americano|Latte|Matcha Latte)$/.test(n)), [], 'no member keeps a row of its own');
      assert.match(await meta('Cappuccino'), /^16 oz 0 cal/, 'the row leads with its default, the smallest size, and says what + adds');
      await openRow('Cappuccino'); let s = await sheet();
      assert.deepEqual([s.n, s.chips, s.group], ['Cappuccino, 16 oz', ['16 oz*', '20 oz'], 'radiogroup'], 'the sheet: named for the variant, one chip per size, the default chosen');
      assert.match(s.sv, /^\$5\.00/, '16 oz is $5.00');
      await ev(() => [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent === 'PACIFIC Almond Milk').querySelector('.add').click()); await page.waitForTimeout(300);
      const y0 = await ev(() => Math.round(isheet.y));
      await chip('20 oz'); s = await sheet();
      assert.deepEqual([s.n, s.chips], ['Cappuccino, 20 oz', ['16 oz', '20 oz*']], 'a chip picks the size and names it');
      assert.match(s.sv, /^\$5\.50/, 'the price follows');
      assert.equal(await ev(() => Math.round(isheet.y)), y0, 'the sheet does not move');
      assert.deepEqual(await ev(() => [...DS.build.sel].map(([id, q]) => [DISH[id].n, q])), [['PACIFIC Almond Milk', 1]], 'the add-in stays chosen across the size');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => { const it = S.plates[0].items[0], m = macroOf(it); return [it.n, m.base.n, m.parts.map(([x]) => x.n)]; }), ['Cappuccino, 20 oz', '20 oz Cappuccino', ['PACIFIC Almond Milk']], 'on the plate: the variant, with its add-in; the base is the feed item');
      await ev(() => logPlate(S.plates[0])); await page.waitForTimeout(400);
      assert.equal(await ev(() => S.log.at(-1).items[0].n), '20 oz Cappuccino', 'the log keeps the feed\'s own name');
    });
    await scen('the boba family: five milks in one row at Procrastination Station; Contains and the label follow the milk; the log records the feed item', async () => {
      await cafe('Procrastination Station'); const ns = await names();
      assert.deepEqual([ns.filter(n => n === 'Boba').length, ns.filter(n => /^Boba \w+ Milk$/.test(n)).length], [1, 0], 'one row, "Boba"');
      assert.match(await meta('Boba'), /^Almond 180 cal/, 'it stands for the first milk in the feed\'s order, in its chip\'s word');
      await page.setViewportSize({ width: 360, height: 844 }); await page.waitForTimeout(300);
      assert.equal(await ev(() => { const r = [...document.querySelectorAll('#mlist .row')].find(r => r.querySelector('.n').textContent.startsWith('Boba')); const a = r.querySelector('.m .vt').getBoundingClientRect(), c = r.querySelector('.m .vt + .mg').getBoundingClientRect(); return a.top < c.bottom && c.top < a.bottom && a.right <= c.left; }), true, 'at 360 the token and the calories share a line');
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
      await openRow('Boba'); let s = await sheet();
      assert.deepEqual([s.n, s.chips], ['Boba, Almond Milk', ['Almond*', 'Maple', 'Oat', 'Skim', 'Soy']], 'one chip per milk, labelled by the milk');
      assert.match(s.al, /Tree Nuts/, 'almond milk lists tree nuts');
      const widths = () => ev(() => [...document.querySelectorAll('#isbody .vpick [role=radio]')].map(c => { const b = c.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)].join(); }));
      const w0 = await widths();
      await chip('Oat'); s = await sheet();
      assert.deepEqual(await widths(), w0, 'choosing never moves or resizes a chip (pass 1)');
      assert.deepEqual([s.n, s.cal, /Tree Nuts/.test(s.al)], ['Boba, Oat Milk', '262', false], 'oat: its own name, label and Contains');
      const oat = await ev(() => DS.d.id);
      await page.locator('#isbody .dadd').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => [S.plates[0].items[0].n, S.plates[0].items[0].k]), ['Boba, Oat Milk', 'boba oat milk'], 'the plate names the variant');
      assert.match(await meta('Boba'), /^Oat 262 cal/, 'the row follows the plate: it stands for the oat just added (owner, 2026-10-16)');
      assert.equal(await ev(() => document.querySelector('#mlist .row[data-id] .step .q')?.textContent), '1', 'and counts it');
      await ev(() => logPlate(S.plates[0])); await page.waitForTimeout(400);
      assert.deepEqual(await ev(() => { const i = S.log.at(-1).items[0]; return [i.n, i.cal, i.id]; }), ['Boba Oat Milk', 262, oat], 'logged as the feed item, with its own nutrition');
      await ev(() => { setTab('you'); openMeal(S.log.at(-1).id); }); await page.waitForTimeout(800);
      assert.equal(await ev(() => document.querySelector('#isbody .lmeal .prow .n').textContent), 'Boba, Oat Milk', 'a past meal reads the variant the same way');
    });
    await scen('the pho\'s broth is the same picker: chips with no heading; none chosen waits; a chip names the bowl; Whitmore\'s phos too', async () => {
      await go('?state=menu&hall=H'); await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
      let s = await sheet();
      assert.equal(s.n, 'Noodle Bowl', 'no broth yet: the station names it');
      assert(s.chips.length >= 2 && s.chips.every(c => /\b(Broth|Base)\b/.test(c) && !c.endsWith('*')), 'the broths are the chips, none chosen: ' + s.chips);
      assert.equal(await ev(() => [...document.querySelectorAll('#isbody .brow .n')].filter(n => /\b(Broth|Base)\b/.test(n.textContent.replace(/\([^)]*\)/g, ''))).length), 0, 'no broth is an add-in row any more');
      assert.equal(await ev(() => document.querySelectorAll('#isbody .bh, #isbody .vpick h3').length), 0, 'no heading: the chips say what is chosen');
      assert.equal(await ev(() => document.querySelector('#bfoot [data-act=badd]').disabled), true, 'Add waits for a broth');
      await chip('Green Curry Pho Broth (Anchovies)'); s = await sheet();
      assert.deepEqual([s.n, s.chips.filter(c => c.endsWith('*'))], ['Green Curry Pho Broth (Anchovies)', ['Green Curry Pho Broth (Anchovies)*']], 'a chip names the bowl');
      await chip('Chicken Pho Broth (Fish)'); assert.deepEqual((await sheet()).chips.filter(c => c.endsWith('*')), ['Chicken Pho Broth (Fish)*'], 'one broth at a time');
      await chip('Green Curry Pho Broth (Anchovies)');
      for (const n of ['Pho Noodles', 'Chicken for Pho']) await ev(n => [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent === n).querySelector('.add').click(), n);
      await page.waitForTimeout(300);
      assert.equal(await ev(() => +document.querySelector('#bfoot .l2 b').textContent), 288, '249 + 11 + 28');
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      await page.locator('#psbody .prow .n').first().tap(); await page.waitForTimeout(900);
      s = await sheet(); assert.deepEqual([s.n, s.chips.filter(c => c.endsWith('*')), s.add], ['Green Curry Pho Broth (Anchovies)', ['Green Curry Pho Broth (Anchovies)*'], 'Update'], 'reopened on its broth');
      await cafe('Whitmore Café'); await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
      s = await sheet(); assert.equal(s.chips.length, 5, 'Whitmore: three proteins and two broths');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#isbody .bh')].map(h => h.textContent)), ['Add-ons'], 'its add-ons keep their heading');
      await chip('Beef Pho'); await chip('Vegetable Broth'); assert.equal((await sheet()).n, 'Beef Pho w/Vegetable Broth', 'a protein and a broth name the pho');
      assert.equal(await ev(() => { const c = [...document.querySelectorAll('#isbody .vpick [role=radio]')], w = document.querySelector('#isbody .vpick').getBoundingClientRect().right; return c.filter(x => x.getBoundingClientRect().right > w + 0.5).length; }), 0, 'every chip fits the line, long names wrapping inside');
    });
    await scen('a family on the plate: its own stepper; it reopens on its variant; Update switches the size and merges with a twin', async () => {
      await cafe('Worcester Café');
      await page.locator('#mlist .row', { has: page.locator('.n', { hasText: /^Cappuccino$/ }) }).locator('.add').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Cappuccino, 16 oz', 1]], '+ adds the default');
      assert.equal(await ev(() => document.querySelector('#mlist .row[data-id] .step .q')?.textContent), '1', 'and the row counts it');
      const upd = async to => { await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
        await page.locator('#psbody .prow .n', { hasText: /^Cappuccino, 16 oz$/ }).tap(); await page.waitForTimeout(900);
        const s = await sheet(); assert.deepEqual([s.n, s.chips, s.add], ['Cappuccino, 16 oz', ['16 oz*', '20 oz'], 'Update'], 'it reopens on its variant, with Update');
        await chip(to); await page.locator('#isbody [data-act=vupd], #bfoot [data-act=badd]').first().tap(); await page.waitForTimeout(1100); };
      await upd('20 oz');
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty, i.k])), [['Cappuccino, 20 oz', 1, '20 oz cappuccino']], 'Update: the item is now the 20 oz');
      await ev(() => psheet.to('closed')); await page.waitForTimeout(600);
      assert.match(await meta('Cappuccino'), /^20 oz/, 'the row follows the plate: it stands for the 20 oz now on it');
      assert.equal(await ev(() => document.querySelector('#mlist .row[data-id] .step .q')?.textContent), '1', 'and counts it');
      await openRow('Cappuccino'); await chip('16 oz'); await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Cappuccino, 20 oz', 1], ['Cappuccino, 16 oz', 1]], 'the other size is its own item');
      await upd('20 oz');
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Cappuccino, 20 oz', 2]], 'a twin merges');
    });
    await scen('a family in Search: matched once, on any member; what you type picks its variant; favourites and alerts follow the family; tracking off keeps the picker', async () => {
      await go('?state=search'); await type('boba');
      const rows = () => ev(() => [...document.querySelectorAll('#sres .row')].map(r => [r.querySelector('.n').textContent.replace('★', ''), r.querySelector('.lane .cnm')?.textContent || '']));
      assert.deepEqual(await rows(), [['Boba', '3 cafés']], '"boba": one row, at three cafés');
      await type('oat'); assert.match(await meta('Boba'), /^Oat 262 cal/, '"oat" finds Boba, and the row stands for oat');
      await page.locator('#sres .row', { has: page.locator('.n', { hasText: /^Boba$/ }) }).locator('.add').tap(); await page.waitForTimeout(500);
      assert.deepEqual(await ev(() => [S.plates[0].items[0].n, Object.keys(S.plates[0].items[0].refs).length]), ['Boba, Oat Milk', 3], 'its + adds oat, at the three cafés');
      await type('cappuccino'); assert.deepEqual((await rows()).map(r => r[0]), ['Cappuccino'], '"cappuccino": one row');
      await type('20 oz latte'); assert.match(await meta('Latte'), /^20 oz/, '"20 oz latte": Latte stands for its 20 oz');
      await type('oatmeal'); assert.deepEqual(await ev(() => [...document.querySelectorAll('#sres .row.later')].filter(r => /Hot Oatmeal$/.test(r.querySelector('.n').textContent)).map(r => r.querySelector('.n').textContent + ' @ ' + (r.querySelector('.cnm')?.textContent || [...r.querySelectorAll('.ht')].map(x => x.textContent).join('')))), ['Hot Oatmeal @ WFH', 'Hot Oatmeal @ Harvest Market'], 'later today and tomorrow: Harvest Market\'s oatmeal once, under its family name, beside Worcester\'s own');
      await type('boba'); await openRow('Boba'); await page.locator('#isbody .favb').tap(); await page.waitForTimeout(200);
      await chip('Soy'); assert.equal((await sheet()).star, 'true', 'the star is the family\'s, whichever milk is chosen');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(500);
      await type(''); await page.locator('#lenses [data-lens=fav]').tap(); await page.waitForTimeout(700);
      assert.deepEqual((await rows()).map(r => r[0]), ['Boba'], 'the Favorites lens finds the family');
      assert.deepEqual(await ev(() => { ALERTS.on = true; ALERTS.granted = true; ALERTS.seen = new Set(); return alertRun(7 * 60 + 15).map(n => n.title); }), ['Boba'], 'an alert names the family, once');
      await ev(() => setTab('you')); await page.locator('#you [data-p=favs]').tap(); await page.waitForTimeout(800);
      assert.equal(await ev(() => [...document.querySelectorAll('.page[data-p=favs] .lrow .a')].map(a => a.textContent).join()), 'Boba', 'You → Favorites lists the family by its name');
      await go('?state=search'); await ev(() => setTrack(false)); await type('boba'); await openRow('Boba');
      let s = await sheet(); assert.deepEqual([s.chips.length, s.add], [5, null], 'tracking off: the picker stays, Add goes');
      await chip('Oat'); assert.equal((await sheet()).n, 'Boba, Oat Milk', 'and it picks the variant whose name you read (the label is gone with tracking)');
    });
    // ---- round 12b (owner's answers, 2026-10-16) ----
    const rowQ = n => ev(n => [...document.querySelectorAll('#mlist .row:not(.syn), #sres .row')].find(r => r.querySelector('.n').textContent.replace('★', '') === n)?.querySelector('.step .q')?.textContent || null, n);
    const addVia = async (n, to) => { await openRow(n); await chip(to); await page.locator('#isbody .dadd, #bfoot [data-act=badd]').first().tap(); await page.waitForTimeout(1000); };
    await scen('Courtside\'s smoothies are families: Coconut or Yogurt is a base picker, the same shape as the milk; the other near-misses stay', async () => {
      await cafe('Courtside Café'); const ns = await names();
      for (const f of ['Banana Berry Smoothie', 'Mango Tango Smoothie', 'Passionate Pineapple Smoothie', 'Summer Blush Smoothie', 'The Green Monster Smoothie', 'Matcha Strawberry', 'V-9 Smoothie']) assert.equal(ns.filter(n => n === f).length, 1, f + ': one row, named for the family');
      assert.deepEqual(ns.filter(n => /(Coconut|Yogurt) Smoothie$|w\/(Coconut|Yogurt)$/.test(n)), [], 'no member keeps a row');
      assert.match(await meta('Banana Berry Smoothie'), /^Coconut \d+ cal/, 'the row stands for the first base, in its chip\'s word');
      await openRow('Banana Berry Smoothie'); let s = await sheet();
      assert.deepEqual([s.n, s.chips], ['Banana Berry Smoothie, Coconut', ['Coconut*', 'Yogurt']], 'two chips, the base');
      await chip('Yogurt'); s = await sheet(); assert.equal(s.n, 'Banana Berry Smoothie, Yogurt', 'the name follows');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(500);
      await addVia('Matcha Strawberry', 'Yogurt');
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, macroOf(i).n])), [['Matcha Strawberry, Yogurt', 'Matcha Strawberry w/Yogurt']], 'on the plate as the variant; the feed item underneath');
      await cafe('Worcester Café'); const ws = await names();
      assert(ws.includes('Coconut Flavored Syrup'), 'a flavour that starts with the word is no base');
      await cafe('Newman Café'); const nn = await names();
      assert(nn.includes('Decaf Coffee') && nn.includes('Regular Coffee') && !nn.includes('Coffee'), 'decaf and regular stay two drinks, each a size family');
      assert.equal(await ev(() => variantFamilies().filter(f => f.axis === 'base').map(f => f.name).filter((n, i, a) => a.indexOf(n) === i).length), 7, 'seven base families');
    });
    await scen('a family row follows the plate: it stands for the variant last added, counts it, and falls back when it is removed', async () => {
      await cafe('Procrastination Station');
      assert.match(await meta('Boba'), /^Almond/, 'empty plate: the default');
      await addVia('Boba', 'Oat'); assert.match(await meta('Boba'), /^Oat 262 cal/, 'oat added: the row stands for oat');
      assert.equal(await rowQ('Boba'), '1', 'and counts it');
      await addVia('Boba', 'Soy'); assert.match(await meta('Boba'), /^Soy 240 cal/, 'two variants on the plate: the last one added');
      assert.equal(await rowQ('Boba'), '1', 'the row counts that variant, not the family');
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Boba, Oat Milk', 1], ['Boba, Soy Milk', 1]], 'both are on the plate');
      await page.locator('#mlist .row', { has: page.locator('.n', { hasText: /^Boba$/ }) }).locator('.inc').tap(); await page.waitForTimeout(400);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Boba, Oat Milk', 1], ['Boba, Soy Milk', 2]], 'the row\'s stepper changes the variant it stands for');
      await page.locator('#mlist .row', { has: page.locator('.n', { hasText: /^Boba$/ }) }).locator('.dec').tap(); await page.waitForTimeout(400);
      await ev(() => { const it = S.plates[0].items[0]; stepItem(S.plates[0], it, 1); }); await page.waitForTimeout(400);
      assert.match(await meta('Boba'), /^Oat 262 cal/, 'a plate item stepped up counts as added last');
      assert.equal(await rowQ('Boba'), '2', 'and the row counts it (2)');
      await ev(() => { const pl = S.plates[0]; stepItem(pl, pl.items[0], -1); stepItem(pl, pl.items[0], -1); stepItem(pl, pl.items[0], -1); }); await page.waitForTimeout(400);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => i.n)), ['Boba, Soy Milk'], 'oat is gone');
      assert.match(await meta('Boba'), /^Soy 240 cal/, 'removed: the row falls back to the next variant still on the plate');
      await ev(() => { const pl = S.plates[0]; stepItem(pl, pl.items[0], -1); stepItem(pl, pl.items[0], -1); }); await page.waitForTimeout(500);
      assert.match(await meta('Boba'), /^Almond 180 cal/, 'nothing of the family left: the default');
      assert.equal(await rowQ('Boba'), null, 'and it is + again');
    });
    await scen('a family row follows the plate: an Update counts as added, a built variant is its own item, Search lets what you typed win', async () => {
      await cafe('Worcester Café');
      await page.locator('#mlist .row', { has: page.locator('.n', { hasText: /^Cappuccino$/ }) }).locator('.add').tap(); await page.waitForTimeout(500);
      await openRow('Cappuccino'); await chip('20 oz');
      await ev(() => [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent === 'PACIFIC Almond Milk').querySelector('.add').click()); await page.waitForTimeout(300);
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.match(await meta('Cappuccino'), /^16 oz/, 'a variant built with add-ins is its own item (round 10): the row stays on the plain 16 oz');
      assert.equal(await rowQ('Cappuccino'), '1', 'and counts it');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      await page.locator('#psbody .prow .n', { hasText: /^Cappuccino, 16 oz$/ }).tap(); await page.waitForTimeout(900);
      await chip('20 oz'); await page.locator('#isbody [data-act=vupd], #bfoot [data-act=badd]').first().tap(); await page.waitForTimeout(1100);
      await ev(() => psheet.to('closed')); await page.waitForTimeout(600);
      assert.match(await meta('Cappuccino'), /^20 oz/, 'Update makes the item the 20 oz, and the row follows');
      await go('?state=search'); await ev(() => { addDish('lunch', 'boba oat milk', Object.fromEntries(Object.entries(DISH).filter(([, d]) => d.n === 'Boba Oat Milk' && !d.day).map(([, d]) => [d.h, d])), 'Boba, Oat Milk'); });
      await type('boba'); assert.match(await meta('Boba'), /^Oat 262 cal/, 'Search: with oat on the plate, "boba" stands for oat');
      assert.equal(await rowQ('Boba'), '1', 'and counts it');
      await type('soy'); assert.match(await meta('Boba'), /^Soy 240 cal/, 'but what you type picks its variant first');
      assert.equal(await rowQ('Boba'), null, 'soy is not on the plate');
    });
    await scen('café phos have two pickers: protein, then broth; Add waits for both; the bowl is the feed\'s pho; Update re-resolves', async () => {
      await cafe('Star Ginger'); await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
      let s = await sheet();
      assert.deepEqual(s.chips, ['Beef Pho', 'Chicken Pho', 'Pulmuone Tofu Pho', 'Chicken Broth', 'Spicy Green Curry Broth', 'Vegetable Broth'], 'Star Ginger: three proteins, then three broths, none chosen');
      assert.equal(await ev(() => document.querySelectorAll('#isbody .vpick').length), 2, 'two groups');
      assert.equal(await ev(() => document.querySelectorAll('#isbody .vpick h3, #isbody .bh + .vpick').length), 0, 'no heading: the chips say what is chosen');
      assert.deepEqual([s.n, await ev(() => document.querySelector('#bfoot [data-act=badd]').disabled)], ['Noodle Bowl', true], 'neither chosen: the station\'s name, Add waits');
      await chip('Chicken Pho'); s = await sheet();
      assert.deepEqual([s.n, await ev(() => document.querySelector('#bfoot [data-act=badd]').disabled)], ['Noodle Bowl', true], 'a protein alone: Add still waits');
      await chip('Vegetable Broth'); s = await sheet();
      assert.deepEqual([s.n, s.chips.filter(c => c.endsWith('*')), await ev(() => document.querySelector('#bfoot [data-act=badd]').disabled)], ['Chicken Pho w/Vegetable Broth', ['Chicken Pho*', 'Vegetable Broth*'], false], 'both: the feed\'s pho names the bowl, Add is on');
      assert.equal(await ev(() => +document.querySelector('#bfoot .l2 b').textContent), 145, 'its own calories');
      await chip('Beef Pho'); s = await sheet(); assert.deepEqual([s.n, s.chips.filter(c => c.endsWith('*'))], ['Beef Pho w/Vegetable Broth', ['Beef Pho*', 'Vegetable Broth*']], 'one protein at a time; the broth stays');
      assert.equal(await ev(() => { const w = document.querySelector('#isbody .vpick').getBoundingClientRect().right; return [...document.querySelectorAll('#isbody .vpick [role=radio]')].filter(x => x.getBoundingClientRect().right > w + .5).length; }), 0, 'every chip fits the line');
      for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(300);
        assert.equal(await ev(() => { const g = [...document.querySelectorAll('#isbody .vpick')].map(x => x.getBoundingClientRect()); return Math.round(g[1].top - g[0].bottom); }), 24, w + ': the groups sit a section gap (24 px, the add-ons heading\'s) apart, not a chip gap'); }
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
      await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, macroOf(i).base.n])), [['Beef Pho w/Vegetable Broth', 'Beef Pho w/Vegetable Broth']], 'the plate names the feed\'s pho');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      await page.locator('#psbody .prow .n').first().tap(); await page.waitForTimeout(900);
      s = await sheet(); assert.deepEqual([s.n, s.chips.filter(c => c.endsWith('*')), s.add], ['Beef Pho w/Vegetable Broth', ['Beef Pho*', 'Vegetable Broth*'], 'Update'], 'reopened with both chosen');
      await chip('Spicy Green Curry Broth'); await page.locator('#bfoot [data-act=badd]').tap(); await page.waitForTimeout(1100);
      assert.deepEqual(await ev(() => S.plates[0].items.map(i => [i.n, i.qty])), [['Beef Pho w/Spicy Green Curry Broth', 1]], 'Update re-resolves to the new pho and keeps the quantity');
      await ev(() => logPlate(S.plates[0])); await page.waitForTimeout(400);
      assert.equal(await ev(() => S.log.at(-1).items[0].n), 'Beef Pho w/Spicy Green Curry Broth', 'logged as the feed item');
      assert.equal(await ev(() => { const o = []; MD.forEach((D, day) => { const h = 'c' + P.places.findIndex(x => x[0] === 'Star Ginger'); for (const [meal, ss] of Object.entries(D[h] || {})) ss.forEach(([st], si) => { if (stName(st) === 'Noodle Bowl') o.push(!!synOf(day, h, meal, si)?.axes); }); }); return [...new Set(o)].sort().join(); }), 'false,true', 'the ramen days keep one picker');
    });
    await scen('blank calories draw "–", not 0; a real 0 stays 0; the plate and the bar leave an unknown out', async () => {
      await cafe('Worcester Café');
      assert.match(await meta('Cappuccino'), /^16 oz 0 cal/, 'a recorded 0 is 0');
      await addVia('Chai', '20 oz');
      assert.match(await meta('Chai'), /^20 oz – cal\s*– protein/, 'blank calories and protein: the row says – for both (round 12c)');
      assert.equal(await ev(() => document.querySelector('#barCal').textContent), '–', 'a plate of only unknowns has no total');
      assert.equal(await ev(() => document.querySelector('#barP').textContent), '–', 'nor a protein total (round 12c)');
      await ev(() => { if (plateOpen()) psheet.to('mid'); }); await page.waitForTimeout(800);
      assert.equal(await ev(() => document.querySelector('#psbody .prow .m').textContent.trim()), '– cal each', 'the plate row');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#psbody .facts b')].map(b => b.textContent)), ['–', '–', '–', '–'], 'the plate\'s totals: calories, protein, carbs and fat are all unknown (round 12c)');
      await ev(() => psheet.to('closed')); await page.waitForTimeout(500);
      await openRow('Chai'); assert.equal((await sheet()).cal, '–', 'the label\'s Calories');
      await chip('16 oz'); assert.equal((await sheet()).cal, '211', 'the 16 oz has its 211');
      await page.locator('#isbody .dadd, #bfoot [data-act=badd]').first().tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => [document.querySelector('#barCal').textContent, document.querySelector('#barP').textContent]), ['211', '0g'], 'with a known item the total is the known (a recorded 0g is 0g)');
      assert.equal(await ev(() => { logPlate(S.plates[0]); return JSON.stringify(S.log.at(-1).items.map(i => i.cal)); }), '[null,211]', 'the log keeps the unknown as null');
      assert.equal(await ev(() => JSON.stringify(S.log.at(-1).items.map(i => [i.p, i.c, i.f]))), '[[null,null,null],[0,52.7,0]]', 'protein, carbs and fat too (round 12c)');
      assert.deepEqual(await ev(() => Object.keys(healthRecord({ id: 0, at: '2026-10-08T12:41', day: '2026-10-08', time: '12:41 PM', meal: 'lunch', hall: 'c12', items: [{ n: 'x', qty: 1, cal: null, p: null, c: null, f: null }] })).filter(k => /Kcal|G$/.test(k))), [], 'Health writes leave an unknown field out, never 0 (round 12c)');
      await cafe('Whitmore Café'); await page.locator('#mlist .row.syn', { hasText: /^Noodle Bowl$/ }).tap(); await page.waitForTimeout(800);
      assert.match(await ev(() => [...document.querySelectorAll('#isbody .brow')].find(r => r.querySelector('.n').textContent === 'Add Crispy Chicken')?.querySelector('.m').textContent.trim().replace(/\s+/g, ' ') || 'missing'), /^– cal/, 'a blank-calorie add-on is offered, with – (round 12c)');
    });
    await scen('every dining commons has a Fountain Drink: a last Beverages station at every meal, blank nutrients, logged as a count, no star; Search finds it', async () => {
      for (const [h, meals] of [['W', ['breakfast', 'lunch', 'dinner', 'late']], ['F', ['breakfast', 'lunch', 'dinner']], ['H', ['breakfast', 'lunch', 'dinner']], ['B', ['lunch', 'dinner', 'late']]]) {
        await go('?state=menu&hall=' + h);
        for (const m of meals) {
          await page.locator(`#mtabs .mts button[data-meal=${m}]`).tap(); await page.waitForTimeout(600);
          assert.deepEqual(await ev(() => { const st = [...document.querySelectorAll('#mlist .sth')], last = st.at(-1); const rows = []; for (let e = last?.nextElementSibling; e; e = e.nextElementSibling) if (e.classList.contains('row')) rows.push(e.querySelector('.n').textContent); return [last?.textContent, rows]; }), ['Beverages', ['Fountain Drink']], h + ' ' + m + ': Beverages is the last station, with one row');
        }
        await page.locator('#mtabs .mts button[data-meal=grab]').tap().catch(() => {}); await page.waitForTimeout(500);
        assert.equal(await ev(() => [...document.querySelectorAll('#mlist .sth')].some(x => x.textContent === 'Beverages')), false, h + ': Grab \'N Go has no stations');
      }
      await go('?state=menu&hall=W'); await page.locator('#mtabs .mts button[data-meal=lunch]').tap(); await page.waitForTimeout(500);
      assert.match(await ev(() => { const r = [...document.querySelectorAll('#mlist .row')].find(r => r.querySelector('.n').textContent === 'Fountain Drink'); return r.querySelector('.m').textContent.trim().replace(/\s+/g, ' '); }), /^– cal\s*– protein$/, 'its row: – cal – protein');
      assert.equal(await ev(() => document.querySelectorAll('#mlist .row:has(.n:not(:empty)) .tg').length >= 0 && [...document.querySelectorAll('#mlist .row')].find(r => r.querySelector('.n').textContent === 'Fountain Drink').querySelectorAll('.tg').length), 0, 'a drink, not food: no diet marks');
      await ev(() => { S.diet.veg = true; S.diet.plant = true; S.diet.halal = true; relist(); }); await page.waitForTimeout(300);
      assert.equal(await ev(() => [...document.querySelectorAll('#mlist .row .n')].some(n => n.textContent === 'Fountain Drink')), true, 'Vegetarian, Plant based and Halal: no diet preference hides it');
      await ev(() => { S.diet.veg = false; S.diet.plant = false; S.diet.halal = false; relist(); }); await page.waitForTimeout(300);
      await openRow('Fountain Drink'); const s = await sheet();
      assert.deepEqual([s.n, s.star, s.cal], ['Fountain Drink', null, '–'], 'its sheet: no star, Calories –');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(500);
      await page.locator('#mlist .row', { has: page.locator('.n', { hasText: /^Fountain Drink$/ }) }).locator('.add').tap(); await page.waitForTimeout(600);
      assert.deepEqual(await ev(() => [S.plates[0].items[0].n, document.querySelector('#barCal').textContent, document.querySelector('#barP').textContent]), ['Fountain Drink', '–', '–'], 'on the plate: a count, no calories');
      await ev(() => logPlate(S.plates[0])); await page.waitForTimeout(400);
      assert.equal(await ev(() => JSON.stringify(S.log.at(-1).items.map(i => [i.n, i.qty, i.cal, i.p]))), '[["Fountain Drink",1,null,null]]', 'logged as a count only');
      await go('?state=search'); await type('fountain');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#sres .row')].map(r => r.querySelector('.n').textContent + ' @ ' + (r.querySelector('.cnm')?.textContent || [...r.querySelectorAll('.ht')].map(x => x.textContent).join('')))), ['Fountain Drink @ WFHB', 'Fountain Drink @ 8 cafés'], 'Search finds it when typed: once among the halls, once among the cafés that list it (a hall and a café group never share a row)');
      await go('?state=search'); assert.equal(await ev(() => [...document.querySelectorAll('#sres .row .n')].some(n => n.textContent === 'Fountain Drink')), false, 'but it is not in the idle list');
    });
    await scen('near-misses stay rows: lone sizes, a different word, add-ons, a milk with no name left; the rule finds 59 families on 325 station-days', async () => {
      await cafe('Worcester Café'); const ns = await names();
      for (const n of ['20 oz Cold Brew', '20 oz Iced Latte', '20 oz Iced Tea', 'Single Espresso', 'Double Espresso', 'Chocolate Milkshake']) assert(ns.includes(n), n + ' keeps its row');
      await openRow('Cappuccino');
      assert.deepEqual(await ev(() => [...document.querySelectorAll('#isbody .brow .n')].map(n => n.textContent).filter(n => /^(MAPLELINE|PACIFIC)/.test(n))), ['MAPLELINE Skim Milk', 'MAPLELINE Whole Milk', 'PACIFIC Almond Milk', 'PACIFIC Soy Milk'], 'add-on milks stay add-ins');
      await cafe('Courtside Café'); const cs = await names();
      assert(cs.includes('Banana Berry Smoothie') && !cs.some(n => /(Coconut|Yogurt) Smoothie$/.test(n)), 'Coconut and Yogurt smoothies are one drink each (owner, 2026-10-16)');
      assert(cs.includes('Coconut Mango Acai Bowl') && !cs.some(n => /Acai Bowl \(/.test(n)), 'the acai bowls, sized "(8oz)", are families');
      await go('?state=menu&hall=W'); await page.locator('#mtabs .mts button[data-meal=grab]').tap(); await page.waitForTimeout(700);
      assert((await names()).includes('1% Milk'), '1% Milk is a dish');
      const f = await ev(() => variantFamilies());
      assert.deepEqual([new Set(f.map(x => [x.place, x.station, x.name].join('|'))).size, new Set(f.map(x => [x.day, x.place, x.station, x.name].join('|'))).size, f.length], [59, 325, 392], '59 families on 325 station-days (392 with each meal counted), Oct 8-22: the 52 sizes and milks and the 7 smoothies');
    });
  };
  // Round 13 (owner, 2026-10-17): a notification lands on Halls home; a star on a hall card that serves a favorite; the icon badge; the
  // tracking layer lifting away; Health Connect missing. RED=13 runs only this block.
  const round13 = async () => {
    const scen = async (name, fn) => { if (!process.env.RED) return fn(); try { await fn(); results.push('green  ' + name); } catch (e) { results.push('RED    ' + name + ': ' + e.message.split('\n')[0].slice(0, 240)); } };
    const go = async q => { await page.goto(URL + (q || '')); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.goto(URL + (q || '')); await page.waitForTimeout(500); };
    const ev = (f, a) => page.evaluate(f, a);
    await scen('a notification tap lands on Halls home: every sheet closes, a first run stays, a pushed hall and pages go', async () => {
      await go('?state=menu&hall=W'); await ev(() => { ALERTS.on = true; ALERTS.granted = true; S.fav.add('beef brisket noodle bowl'); showNote(alertRun(7 * 60 + 15)[0]); });
      await page.locator('#mlist .row').first().locator('.tx').tap(); await page.waitForTimeout(900);
      assert.notEqual(await ev(() => isheet.state), 'closed', 'a dish sheet is open');
      await page.locator('.osnote').tap(); await page.waitForTimeout(1200);
      assert.deepEqual(await ev(() => [S.tab, S.hall, isheet.state, psheet.state, document.querySelector('#menu').classList.contains('hide')]), ['halls', null, 'closed', 'closed', true], 'Halls home, every sheet closed');
      await go('?first=1'); await page.waitForTimeout(900); await ev(() => { ALERTS.on = true; ALERTS.granted = true; S.fav.add('beef brisket noodle bowl'); showNote(alertRun(7 * 60 + 15)[0]); });
      assert.notEqual(await ev(() => obsheet.state), 'closed', 'the first run is up');
      await page.locator('.osnote').tap(); await page.waitForTimeout(1000);
      assert.deepEqual(await ev(() => [S.tab, obsheet.state !== 'closed']), ['halls', true], 'an undismissed first run stays');
    });
    await scen('a hall card shows a star when a favorite is served there in its meal now, or the next ahead', async () => {
      await go(); const stars = () => ev(() => [...document.querySelectorAll('#bands .band')].filter(b => b.querySelector('.bstar')).map(b => b.dataset.h));
      assert.deepEqual(await stars(), [], 'no favorites: no star');
      await ev(() => { S.fav.add('golden bbq chicken thigh'); relist(); }); await page.waitForTimeout(300);
      assert.deepEqual(await stars(), ['W'], 'Golden BBQ Chicken Thigh is on at Worcester at lunch, now');
      assert.equal(await ev(() => document.querySelector('#bands .band[data-h=W]').getAttribute('aria-label')).then(x => /serves a favorite/.test(x)), true, 'named for a screen reader');
      await ev(() => { S.fav.clear(); S.fav.add('korean bbq chicken'); relist(); }); await page.waitForTimeout(300);
      assert.deepEqual(await stars(), [], 'a dinner-only dish does not star a hall whose meal now is lunch');
      assert.deepEqual(await ev(() => [hallStar('B', 17 * 60), hallStar('B', 12 * 60 + 41), hallMeal('W', 6 * 60), hallMeal('F', 22 * 60), hallMeal('W', 22 * 60)]), [true, false, 'breakfast', null, 'late'], 'by the clock: the meal now, else the next one ahead, else none after the last');
      await ev(() => { S.fav.clear(); S.fav.add('golden bbq chicken thigh'); relist(); }); await page.waitForTimeout(300);
      for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(300);
        assert.equal(await ev(() => { const b = document.querySelector('#bands .band[data-h=W]'), s = b.querySelector('.bstar').getBoundingClientRect(), n = b.querySelector('.nm').getBoundingClientRect(), l = b.getBoundingClientRect(); return s.right <= l.right && s.top >= n.top - 6 && s.bottom <= n.bottom + 6 && s.left >= n.left; }), true, w + ': the star sits on the name line, inside the card'); }
      await page.setViewportSize({ width: 390, height: 844 });
    });
    await scen('the icon badge: iOS shows the number delivered since the app was last opened, Android the dot; opening clears it; the notification lands on Halls', async () => {
      await go('?launcher=1&os=ios'); assert.deepEqual(await ev(() => [document.querySelector('.oshome .bdg')?.textContent, document.querySelectorAll('.oshome .osn').length, !!document.querySelector('.oshome .dot')]), ['2', 2, false], 'iOS: the number is the notifications delivered');
      await page.locator('.oshome [data-ic]').tap(); await page.waitForTimeout(300);
      assert.deepEqual(await ev(() => [!!document.querySelector('.oshome'), ALERTS.unread]), [false, 0], 'opening the app clears it');
      await go('?launcher=1&os=android'); assert.deepEqual(await ev(() => [!!document.querySelector('.oshome .bdg'), !!document.querySelector('.oshome .dot')]), [false, true], 'Android: the launcher dot');
      await page.locator('.oshome .osn').first().tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [!!document.querySelector('.oshome'), ALERTS.unread, S.tab, S.hall]), [false, 0, 'halls', null], 'tapping a notification clears it and lands on Halls');
    });
    await scen('turning tracking off lifts a layer away: the bar leaves first, figures fade, then Today folds; on is the reverse', async () => {
      await go('?state=you'); await ev(() => { addDish('lunch', 'golden bbq chicken thigh', { W: Object.values(DISH).find(d => d.n === 'Golden BBQ Chicken Thigh' && d.h === 'W' && !d.day) }, 'Golden BBQ Chicken Thigh'); });
      await page.waitForTimeout(500);
      const probe = () => ev(() => { const y = document.querySelector('#you'), td = [...y.querySelectorAll(':scope > .sec')].find(e => e.querySelector('h2')?.textContent === 'Today'); return { bar: getComputedStyle(document.querySelector('#bar')).transform, today: td ? td.getBoundingClientRect().height : null, check: y.querySelector('[data-act=track]').getAttribute('aria-checked') }; });
      const p0 = await probe(); assert(p0.today > 100, 'Today is open');
      await ev(() => { window.__p = setTrack(false); }); await page.waitForTimeout(60);
      const p1 = await probe(); assert.equal(p1.check, 'false', 'the switch answers at once');
      if (!process.env.RM) assert.notEqual(p1.bar, 'none', 'the bar is on its way down');   // reduced motion: it fades instead
      assert(p1.today === p0.today || p1.today > p0.today * .9, 'Today has not started to fold while the bar leaves');
      await page.waitForTimeout(300);
      const p2 = await probe(); assert(p2.today < p0.today, 'then it folds');
      await ev(() => window.__p); await page.waitForTimeout(100);
      assert.deepEqual(await ev(() => [document.querySelector('#frame').classList.contains('notrack'), !![...document.querySelectorAll('#you > .sec')].find(e => e.querySelector('h2')?.textContent === 'Today')]), [true, false], 'off: the layer is gone');
      await ev(() => { window.__p = setTrack(true); }); await page.waitForTimeout(40);
      const q1 = await probe(); if (!process.env.RM) assert(q1.today < p0.today, 'on: Today opens from nothing');   // reduced motion: a crossfade, no height
      await ev(() => window.__p); await page.waitForTimeout(100);
      assert.equal((await probe()).today, p0.today, 'and arrives at its full height');
    });
    await scen('Health Connect not installed: the row shows, and a tap opens its Play listing', async () => {
      await go('?state=you&health=missing&os=android');
      assert.equal(await page.locator('#you [data-act=health]').count(), 1, 'the row shows');
      await page.locator('#you [data-act=health]').tap(); await page.waitForTimeout(400);
      assert.equal(await ev(() => document.querySelector('.osplay h3')?.textContent), 'Health Connect', 'its Play listing opens');
      await page.locator('.osplay button').first().tap(); await page.waitForTimeout(300);
      assert.equal(await ev(() => !!document.querySelector('.osplay') || S.health), false, 'back closes it, nothing turned on');
    });
    await scen('a hall opens as one continuous card: the letter, title, status and meter travel at full opacity, the ground never thins, only the differences crossfade', async () => {
      await go(); await page.waitForTimeout(300);
      const src = await ev(() => { const b = document.querySelector('#bands .band[data-h=W]'), r = e => { const q = b.querySelector(e).getBoundingClientRect(); return [q.left, q.top, q.width]; }; window.__src = { let: r('.let') }; openHall('W', false, b); cancelAnimationFrame(xfRaf); return window.__src; });
      const at = p => ev(p => { XP = p; paint(p, 0); const o = e => +getComputedStyle(document.getElementById(e)).opacity, g = document.getElementById('mghost');
        const L = document.getElementById('mlet').getBoundingClientRect(); return { let: o('mlet'), nm: o('mtn'), st: o('mts'), bz: o('mbz'), duo: o('mduo'), ghostKids: g.children.length, ghost: +getComputedStyle(g).opacity, bzx: +getComputedStyle(document.querySelector('#mbz .bzx')).opacity, sch: +getComputedStyle(document.querySelector('#mts .sch')).opacity, rect: [L.left, L.top, L.width] }; }, p);
      for (const p of [0, .1, .3, .5, .8]) { const r = await at(p);
        assert.deepEqual([r.let, r.nm, r.st, r.bz, r.duo, r.ghostKids, r.ghost], [1, 1, 1, 1, 1, 0, 0], 'p ' + p + ': the shared elements and the ground are fully drawn, and there is no ghost copy of a band'); }
      const f = await at(1), s0 = await at(0), m = await at(.3);
      const lerp = (a, b, k) => a + (b - a) * k;
      assert(Math.abs(s0.rect[0] - src.let[0]) < 1.5 && Math.abs(s0.rect[1] - src.let[1]) < 1.5 && Math.abs(s0.rect[2] - src.let[2]) < 1.5, 'p 0: the header\'s letter is exactly where the card drew it');
      assert(Math.abs(m.rect[0] - lerp(src.let[0], f.rect[0], .3)) < 1.5 && Math.abs(m.rect[1] - lerp(src.let[1], f.rect[1], .3)) < 1.5 && Math.abs(m.rect[2] - lerp(src.let[2], f.rect[2], .3)) < 1.5, 'p .3: it is on the straight line between the two (position and size)');
      const x1 = await at(.1), x5 = await at(.5);
      assert(x1.bzx < .01 && x1.sch < .01 && x5.bzx > .3 && x5.bzx < 1 && f.bzx === 1, 'what the header adds (the "Calmer around" line, the chevron) crossfades in on top of the travelling element');
    });
    await scen('a busy reading that lands late: the title and the letter stay put, the block grows in below, the tabs and the list ride down; loaded titles keep M2\'s positions', async () => {
      const m = () => ev(() => { const r = e => { const q = document.querySelector(e).getBoundingClientRect(); return [Math.round(q.left * 10) / 10, Math.round(q.top * 10) / 10]; }; return { nm: r('#mtn'), let: r('#mlet'), tabs: r('#mtabs'), list: r('#mlist .row') }; });
      const loaded = {}; for (const h of ['W', 'F', 'H', 'B']) { await go('?state=menu&hall=' + h); await page.waitForTimeout(500); loaded[h] = await m(); }
      assert.deepEqual([loaded.W.nm[1], loaded.H.nm[1], loaded.B.nm[1], loaded.F.nm[1] - loaded.W.nm[1]], [loaded.W.nm[1], loaded.W.nm[1], loaded.W.nm[1], 22], 'loaded: Worcester, Hampshire and Berkshire at one height, Franklin 22 lower (M2\'s measured 82 and 104): ' + JSON.stringify(Object.fromEntries(Object.entries(loaded).map(([h, v]) => [h, v.nm[1]]))));
      for (const h of ['W', 'F']) { await go('?state=menu&hall=' + h + '&busy=late'); await page.waitForTimeout(500); const a = await m();
        await ev(() => arriveBusy()); await page.waitForTimeout(100); const z = await m();
        assert.deepEqual([z.nm, z.let], [a.nm, a.let], h + ': the title and the letter do not move when the reading lands');
        assert(z.tabs[1] - a.tabs[1] >= 20 && z.list[1] - a.list[1] >= 20, h + ': the meal tabs and the list ride down (' + (z.tabs[1] - a.tabs[1]) + ' px)');
        assert.deepEqual([z.nm, z.tabs], [loaded[h].nm, loaded[h].tabs], h + ': and it ends exactly where a header opened with the reading is'); }
      // no frame shows the line partly clipped, and the chart is not there before the reading
      for (const h of ['W', 'F']) { await go('?state=menu&hall=' + h + '&busy=late'); await page.waitForTimeout(500); await ev(() => arriveBusy(true));
        const bad = await ev(() => { const out = []; for (let i = 0; i <= 20; i++) { const k = i / 20; busyStep(k); const bz = document.querySelector('#mbz'), cs = getComputedStyle(bz.firstElementChild), q = bz.getBoundingClientRect(), hd = document.querySelector('#mhead').getBoundingClientRect(), ch = document.querySelector('#mhist svg');
            if (+cs.opacity > 0 && (bz.scrollHeight > q.height + .5 || q.bottom > hd.bottom + .5)) out.push(['clipped', k, +cs.opacity, bz.scrollHeight, Math.round(q.height)]);
            if (i === 0 && ch && +getComputedStyle(ch).opacity > 0) out.push(['chart at k 0']); } return out; });
        assert.deepEqual(bad, [], h + ': while the line has any opacity it is whole and inside the header; the chart is not drawn at k 0'); }
    });
    await scen('Search tiles: centred on the meta line, and as one group under the +, clamped at the row\'s content edge (360)', async () => {
      await page.setViewportSize({ width: 360, height: 844 }); await go('?state=search'); await page.locator('#q').fill('chicken'); await page.waitForTimeout(900);
      const rows = await ev(() => [...document.querySelectorAll('#sres .row:not(.later)')].map(r => { const t = r.querySelector('.lane .tags'); if (!t || t.querySelector('.cnm')) return null; const R = x => { const q = x.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; };
        const tiles = [...t.querySelectorAll('.ht')].map(R), add = R(r.querySelector('.lane .add, .lane .step')), m = R([...r.querySelectorAll('.m .mg:not(.vt)')].at(-1)), rr = R(r); return { n: tiles.length, left: tiles[0][0], right: tiles.at(-1)[0] + tiles.at(-1)[2], cy: tiles[0][1] + tiles[0][3] / 2, addC: add[0] + add[2] / 2, mC: m[1] + m[3] / 2, edge: rr[0] + rr[2] - 20 }; }).filter(Boolean));
      const seen = new Set();
      for (const r of rows) { seen.add(r.n);
        assert(Math.abs(r.cy - r.mC) < .6, r.n + ' tile(s): centred on the meta line (' + r.cy + ' vs ' + r.mC + ')');
        const gc = (r.left + r.right) / 2, want = Math.min(r.addC, r.edge - (r.right - r.left) / 2);
        assert(Math.abs(gc - want) < .6, r.n + ' tile(s): the group centres under the + (' + r.addC + '), clamped at the content edge ' + r.edge + ': centre ' + gc + ', wanted ' + want);
        assert(r.right <= r.edge + .6, r.n + ' tile(s): the right edge never passes the content edge'); }
      assert([1, 2, 3].every(n => seen.has(n)), 'rows with 1, 2 and 3 tiles were measured: ' + [...seen]);
      await page.setViewportSize({ width: 390, height: 844 });
    });
    await scen('tracking off hides the calorie and protein figures everywhere: they fade with the rest, then the rows close to name-only; on is the reverse', async () => {
      await go('?state=search'); await page.locator('#q').fill('chicken'); await page.waitForTimeout(900);
      const snap = () => ev(() => { const r = [...document.querySelectorAll('#sres .row:not(.later)')].slice(0, 6); return { h: r.map(x => Math.round(x.getBoundingClientRect().height)), fig: r.map(x => { const f = x.querySelector('.fig'); return f ? [getComputedStyle(f).display, +getComputedStyle(f).opacity] : null; }) }; });
      const a0 = await snap(); assert(a0.fig.every(f => f && f[0] !== 'none' && f[1] === 1), 'tracking on: the figures are there');
      await ev(() => { window.__p = setTrack(false); }); await page.waitForTimeout(70);
      const a1 = await snap(); assert(a1.fig.every(f => f && f[1] < 1 && f[1] > 0) && a1.h.join() === a0.h.join(), 'at 70 ms the figures are fading and no row has moved: ' + JSON.stringify(a1));
      await page.waitForTimeout(220);
      const a2 = await snap(); assert(a2.fig.every(f => f[1] === 0) && a2.h.some((h, i) => h < a0.h[i]), 'mid-close: the figures are gone and the rows are closing: ' + JSON.stringify(a2));
      await ev(() => window.__p); await page.waitForTimeout(100);
      const a3 = await snap(); assert(a3.fig.every(f => f === null || f[0] === 'none') && a3.h.every((h, i) => h < a0.h[i]), 'off: no figures, every row shorter: ' + JSON.stringify([a0.h, a3.h]));
      assert(await ev(() => [...document.querySelectorAll('#sres .row:not(.later)')].slice(0, 6).every(r => r.getBoundingClientRect().height >= 48)), 'a row is never shorter than 48');
      await go('?state=menu&hall=W'); await ev(() => setTrack(false)); await page.waitForTimeout(600);
      assert.equal(await ev(() => [...document.querySelectorAll('#mlist .row .fig')].filter(f => f.getBoundingClientRect().width > 0).length), 0, 'hall menus: no figures');
      await page.locator('#mlist .row:not(.syn) .tx').first().tap(); await page.waitForTimeout(900);
      assert.deepEqual(await ev(() => [!!document.querySelector('#isbody .dn'), !!document.querySelector('#isbody .label') && getComputedStyle(document.querySelector('#isbody .label')).display !== 'none', !!document.querySelector('#isbody .ing, #isbody .where, #isbody .dal, #isbody .dsv')]), [true, false, true], 'the sheet: the name, serving and marks stay, the label goes');
      await ev(() => isheet.to('closed')); await page.waitForTimeout(400);
      await go('?state=search'); await ev(() => setTrack(false)); await page.waitForTimeout(500); await ev(() => { window.__p = setTrack(true); }); await page.waitForTimeout(700); await page.locator('#q').fill('chicken'); await page.waitForTimeout(800);
      assert(await ev(() => [...document.querySelectorAll('#sres .row:not(.later)')].slice(0, 4).every(r => { const f = r.querySelector('.fig'); return f && getComputedStyle(f).display !== 'none'; })), 'tracking back on: the figures return');
    });
  };
  if (process.env.RED) { await ({ 8: round8, 9: round9, 10: round10, 11: round11, 12: round12, 13: round13 }[process.env.RED] || round7)(); console.log(results.join('\n')); console.log(`${NCHK} checks`); await browser.close(); return; }

  // Round 5: the rack has one seam colour. Every seam between the Halls header, the hall bands and the pinned cafés is
  // deep maroon (the stack's own container), never the chalk of #halls behind it. Checked at three widths, at rest, after a
  // hall opens and closes, after a pin opens and closes, and after a tab round trip. Plus: the event row's end gutter
  // equals its start gutter.
  for (const w of [360, 390, 430]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
    await c2.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} });
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
  assert.equal(await page.locator('[data-act=opennow]').getAttribute('aria-pressed'), 'false'); assert(await page.locator('.page[data-p=cafes] .lrow').count() >= openRows, 'Open now off never hides places'); assert.equal(openRows, 29, 'all 29 Amherst cafés (Terrace too, round 9b; The Commonwealth Restaurant, round 11) are open at 12:41');
  await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Wasabi' }).tap(); await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => [S.cafe != null, document.querySelector('#menu').classList.contains('cafe')].join()), 'true,true', 'café detail (the hall screen, café mode)');
  assert.match(await page.locator('#mts').textContent(), /Open until 9 PM/);
  // round 9: a café's menu is dishes now, and a café dish starts a plate of its own, labelled by the café
  await mRow('California Roll').locator('.add').tap(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#barL').textContent(), 'Wasabi lunch', 'café dish -> its own plate, "Wasabi lunch"');
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
  // contextual: the all-DCs event shows as a quiet note inside each hall menu, on its own day (round 9: Monday Oct 12)
  await page.goto(URL + '?state=menu&hall=H'); await page.waitForTimeout(400);
  assert.equal(await page.locator('#mlist .evnote').count(), 0, 'no IPD note on Thursday');
  await page.evaluate(() => { S.mday = 4; renderMenu(); });
  assert.equal(await page.locator('#mlist .evnote').count(), 1, 'IPD note in Hampshire on Monday');
  assert.equal(await page.locator('#mlist .evnote .evtag').count(), 0, 'on its own day the note does not repeat the date');

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
  // round 9c: a hall in Search is its band, short and without a letter; it grows into the hall (container transform)
  await page.locator('#q').fill('worcester'); await page.waitForTimeout(150);
  const hc = page.locator('#sres .band.hcard').first();
  assert.deepEqual(await hc.evaluate(b => [b.dataset.h, Math.round(b.getBoundingClientRect().height), !!b.querySelector('.let'), !!b.querySelector('.duo'), !!b.querySelector('.meter')]), ['W', 76, false, true, true], 'a 76 px duotone band with its meter and no letter');
  assert.equal(await page.locator('#sres .prow2[data-act=hall]:not([data-meal])').count(), 0, 'no hall row besides the card (Grab \'N Go keeps its own place row)');
  await hc.tap(); await page.waitForTimeout(900);
  assert(await page.locator('#menu').isVisible(), 'hall card opens the hall');
  assert.equal(await page.evaluate(() => [S.tab, S.hallTab, S.hallSrc && S.hallSrc.classList.contains('hcard'), NAV.filter(n => n.kind === 'menu').length].join()), 'search,search,true,0', 'by the container transform, not a push');
  assert.equal(await page.evaluate(() => document.querySelector('#mhead').style.clipPath), 'none');
  await page.evaluate(() => { document.querySelector('#mscroll').scrollTop = 400; }); await page.waitForTimeout(200);
  await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(1200);
  assert(await page.locator('#menu').isHidden(), 'close from collapsed');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#sres .band.hcard')).visibility), 'visible', 'the card is back');
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
  // round 9: the real windows (hours.ts: standard windows clamped to the hall's hours) end lunch at 4:30, when dinner starts
  assert.equal(await say('Green Chile Posole', 761), 'Lunch now, until 4:30 PM WFHB', '12:41: posole at every hall now');
  assert.equal(await say('Green Chile Posole', 945), 'Lunch now, until 4:30 PM WFHB', '3:45: still lunch (no gap between meals)');
  assert.equal(await say('Green Chile Posole', 991), 'Dinner now, until 9 PM WFHB', '4:31: dinner');
  assert.equal(await say('Green Chile Posole', 1290), 'Tomorrow, lunch from 11 AM H', '9:30 PM: tomorrow');
  assert.equal(await say('Black Bean Burger', 761), 'Lunch now, until 4:30 PM WFB | Dinner from 4:30 PM H', 'now, then later at another hall');
  assert.equal(await say('Black Bean Burger', 1430), 'Late night now, until midnight W', '11:50 PM: late night');
  assert.equal(await say('Chewy M&M Bar', 761), "Grab 'N Go now, until 4 PM F | Until 8 PM WB", 'two closing times for the same meal');
  assert.equal(await say('Beef Brisket Noodle Bowl', 991), '', 'nothing left: no answer');
  const where = async n => { await page.goto(URL); await page.waitForTimeout(300);
    await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type(n.toLowerCase()); await page.waitForTimeout(300);
    await page.locator('#sres .row', { has: page.locator('.n', { hasText: new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }) }).first().locator('.n').tap(); await page.waitForTimeout(700);
    return page.evaluate(() => [...document.querySelectorAll('#isheet .where .wl')].map(l => l.querySelector('.wt').textContent + ': ' + [...l.querySelectorAll('.hchip')].map(c => c.textContent).join(', '))); };
  assert.deepEqual(await where('Beef Brisket Noodle Bowl'), ['Lunch now, until 4:30 PM: WWorcester, BBerkshire'], 'served now');
  assert.deepEqual(await where('Black Bean Burger'), ['Lunch now, until 4:30 PM: WWorcester, FFranklin, BBerkshire', 'Dinner from 4:30 PM: HHampshire'], 'now, and later at another hall');
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
  assert.equal(await page.evaluate(() => [S.hall, S.mday, S.mmeal, document.querySelector('#dayl').textContent, document.querySelector('#mts').textContent].join()), 'F,1,breakfast,Fri 9,7 AM to 9 PM', 'opens Franklin, tomorrow (the day cell), breakfast; the status line gives that day\'s hours');
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
      // round 14 (fade content, keep ground): every frame of the switch has at most one pane's content above 5% opacity, never both
      await page.evaluate(([f, t]) => { const op = k => document.getElementById('tab-' + k).classList.contains('hide') ? 0 : Math.max(0, ...tabParts(document.getElementById('tab-' + k).firstElementChild).map(e => +getComputedStyle(e).opacity)); window.__both = 0; const tick = () => { if (Math.min(op(f), op(t)) > .05) { window.__both++; (window.__log ||= []).push([performance.now() | 0, op(f), op(t)].join('/')); } if (!window.__stop) requestAnimationFrame(tick); }; window.__stop = false; tick(); }, [from, to]);
      const w0 = await white(); await page.locator(`.tbar button[data-tab=${to}]`).tap(); let mx = 0;
      for (let i = 0; i < 6; i++) mx = Math.max(mx, await white());
      await page.waitForTimeout(400); const w1 = await white();
      assert.equal(await page.evaluate(() => { window.__stop = true; return window.__both ? window.__both + ' ' + window.__log.join(' ') : 0; }), 0, `${from} -> ${to}: a frame shows both panes' content`);
      assert(mx <= Math.max(w0, w1) + .08, `${from} -> ${to}: a frame is ${(mx * 100).toFixed(0)}% white (rest ${(w0 * 100).toFixed(0)}% / ${(w1 * 100).toFixed(0)}%)`);
    }
  }

  await round7();
  await round8();
  await round9();
  await round10();
  await round11();
  await round12(); await round13();

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
