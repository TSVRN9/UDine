// Drives the benchmark task and the planner path with real pointer input; asserts the logged totals.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core');
const assert = require('assert');
const URL = 'file://' + __dirname + '/../index.html';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: false });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let taps = 0, scrolls = 0;
  const tap = async sel => { await p.locator(sel).first().click(); taps++; await p.waitForTimeout(350); };

  // --- Benchmark: Worcester lunch, Brisket x1 + Golden BBQ Chicken Thigh x2
  await p.goto(URL); await p.waitForTimeout(400);
  // Pre-step (not counted): peek at the Worcester proposal and dismiss it; it must not leak into the manual plate.
  const wk = await p.evaluate(() => __f3.S.props.findIndex(pl => pl.hall === 0));
  if (wk >= 0) {
    const pb = await p.locator('#pager').boundingBox();
    for (let k = 0; k < wk; k++) { await p.mouse.move(pb.x + 300, pb.y + 120); await p.mouse.down(); for (let i = 1; i <= 8; i++) { await p.mouse.move(pb.x + 300 - 220 * i / 8, pb.y + 120); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(700); }
    await p.locator(`[data-prop="${wk}"]`).click(); await p.waitForTimeout(800);
    assert.strictEqual(await p.evaluate(() => __f3.S.plate.hall), 0);
    await p.mouse.click(195, 20); await p.waitForTimeout(700);
    assert.strictEqual(await p.evaluate(() => __f3.S.cart[0].length), 0, 'proposal leaked into the manual plate');
  }
  await tap('[data-hall="0"]');
  const row = n => `#mList .mrow:has(.bd:text-is("${n}"))`;
  assert(await p.locator(row('Golden BBQ Chicken Thigh')).isVisible());
  const inView = async n => p.locator(row(n)).evaluate(el => { const r = el.getBoundingClientRect(); return r.top > 150 && r.bottom < 760; });
  assert(await inView('Golden BBQ Chicken Thigh'), 'BBQ thigh visible without scrolling');
  await tap(row('Golden BBQ Chicken Thigh') + ' [data-step="1"]');
  await tap(row('Golden BBQ Chicken Thigh') + ' [data-step="1"]');
  // one fling with the wheel to reach Noodle Bowl
  await p.mouse.move(195, 500); await p.mouse.wheel(0, 760); scrolls++; await p.waitForTimeout(500);
  assert(await inView('Beef Brisket Noodle Bowl'), 'Brisket visible after one scroll');
  await tap(row('Beef Brisket Noodle Bowl') + ' [data-step="1"]');
  assert.match(await p.textContent('#pbTop'), /3 items, 404 cal/);
  await tap('#pbLog');
  await p.waitForSelector('#hud.show', { timeout: 1000 });
  await p.waitForTimeout(1600);
  const r = await p.evaluate(() => ({ cal: __f3.eaten().cal, last: __f3.LOG.at(-1), sub: document.querySelector('#daySub').textContent, top: __f3.stack.at(-1) }));
  assert.strictEqual(Math.round(r.cal), 461 + 404);
  assert.deepStrictEqual(r.last.items.map(i => [i.n, i.q]).sort(), [['Beef Brisket Noodle Bowl', 1], ['Golden BBQ Chicken Thigh', 2]]);
  assert.strictEqual(r.last.hall, 0);
  assert.match(r.sub, /^865 of 2,200 cal today/);
  assert.strictEqual(r.top, 'home');
  console.log(`benchmark OK: ${taps} taps, ${scrolls} scroll, day total ${Math.round(r.cal)} cal ("${r.sub}")`);
  await p.screenshot({ path: __dirname + '/run-bench-done.png' });

  // --- Planner path: drag the ruler, page the plates, swipe a dish, log
  await p.goto(URL); await p.waitForTimeout(400);
  const drag = async (x0, y0, x1, y1, steps = 12) => { await p.mouse.move(x0, y0); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(900); };
  const rb = await p.locator('#ruler').boundingBox();
  await drag(rb.x + 200, rb.y + 30, rb.x + 280, rb.y + 30, 20); // slow drag right -> lower target
  const T = await p.evaluate(() => __f3.S.T);
  assert(T < 850 && T % 10 === 0, 'ruler moved target: ' + T);
  const pg = await p.locator('#pager').boundingBox();
  await drag(pg.x + 300, pg.y + 120, pg.x + 80, pg.y + 120, 8);
  const pi = await p.evaluate(() => document.querySelectorAll('#pdots i.on')[0] && [...document.querySelectorAll('#pdots i')].findIndex(i => i.classList.contains('on')));
  assert.strictEqual(pi, 1, 'pager advanced');
  await p.locator('[data-prop="1"]').click(); await p.waitForTimeout(700);
  const before = await p.evaluate(() => ({ id: __f3.S.plate.items[0].id, cal: __f3.totals(__f3.S.plate.items).cal, n: __f3.S.plate.items[0].cyc.length }));
  assert(before.n > 1, 'row has alternatives');
  const sw = await p.locator('[data-row="0"] .swipe').boundingBox();
  await drag(sw.x + sw.width - 20, sw.y + 38, sw.x + 20, sw.y + 38, 8);
  const after = await p.evaluate(() => ({ id: __f3.S.plate.items[0].id, cal: __f3.totals(__f3.S.plate.items).cal, T: __f3.S.T, gauge: document.querySelector('#gCal').dataset.v }));
  assert.notStrictEqual(after.id, before.id, 'swipe swapped the dish');
  assert(Math.abs(after.cal - after.T) / after.T < .15, 'refit keeps plate near target: ' + after.cal);
  assert.strictEqual(Math.round(+after.gauge), Math.round(after.cal));
  await p.screenshot({ path: __dirname + '/run-swapped.png' });
  await p.locator('#sLog').click(); await p.waitForTimeout(1700);
  const r2 = await p.evaluate(() => __f3.eaten().cal);
  assert.strictEqual(Math.round(r2), Math.round(461 + after.cal));
  console.log(`planner OK: target ${T}, swapped to dish ${after.id}, plate ${Math.round(after.cal)} cal, day ${Math.round(r2)}`);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
