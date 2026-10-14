// Drives the benchmark with touch taps: Worcester lunch, Golden BBQ Chicken Thigh x2 + Beef Brisket Noodle Bowl x1 -> Log.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const assert = require('assert');
const URL = 'file://' + __dirname + '/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let taps = 0, scrolls = 0;
  const cdp = await ctx.newCDPSession(page);
  // real touch pipeline (touch-action arbitration, pointercancel), not synthetic PointerEvents
  const touch = async pts => {
    const T = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', pts[0]);
    for (const p of pts.slice(1)) { await T('touchMove', p); await page.waitForTimeout(16); }
    await T('touchEnd', pts[pts.length - 1]);
    await page.waitForTimeout(650);
  };
  const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const tap = async loc => { await loc.tap(); taps++; await page.waitForTimeout(600); };
  const row = name => page.locator('#feed .row', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) });
  const inView = async loc => { const b = await loc.boundingBox(); const bar = await page.locator('#acc').boundingBox(); const limit = (await page.locator('#acc').evaluate(e => e.classList.contains('off'))) ? 844 - 90 : bar.y; return b && b.y >= 150 && b.y + b.height <= limit; };

  // Variant A: the order the task names, nothing preselected
  await page.goto(URL); await page.waitForTimeout(300);
  const today0 = +(await page.locator('#todayN').textContent()).replace(/,/g, '');
  assert(await inView(row('Golden BBQ Chicken Thigh').locator('.add')), 'Golden BBQ visible on first screen');
  await tap(row('Golden BBQ Chicken Thigh').locator('.add'));
  assert.equal(await page.locator('#acc .t1').textContent(), 'Worcester');
  await tap(row('Golden BBQ Chicken Thigh').locator('[data-act=add]'));
  assert.equal(await row('Golden BBQ Chicken Thigh').locator('.stp b').textContent(), '2');
  const brisket = row('Beef Brisket Noodle Bowl').locator('.add');
  assert(await inView(brisket), 'Brisket within reach after commit, no scroll');
  await tap(brisket);
  assert.equal(await page.locator('#acc .t2').textContent(), '3 items, 404 cal');
  await tap(page.locator('#acc [data-act=log]'));
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#acc .t1').textContent(), 'Logged Worcester lunch');
  const st = await page.evaluate(() => ({ e: S.log[S.log.length - 1], today: todayTot().cal }));
  assert.equal(st.e.hall, 0);
  assert.equal(st.e.items.find(i => i.n === 'Beef Brisket Noodle Bowl').cal, 218);
  assert.equal(Math.round(st.today), today0 + 404);
  assert.equal(+(await page.locator('#todayN').textContent()).replace(/,/g, ''), today0 + 404);
  assert.equal(+(await page.locator('#toastN').textContent()).replace(/,/g, ''), today0 + 404);
  await page.screenshot({ path: __dirname + '/tmp-bench-done.png' });
  console.log(`A: ${taps} taps, ${scrolls} scrolls, today ${today0} -> ${today0 + 404}`);

  // Variant B: brisket first (served at Worcester AND Berkshire) - plate narrows, no prompt
  await page.goto(URL); await page.waitForTimeout(300); taps = 0;
  await page.evaluate(() => { const r = [...document.querySelectorAll('#feed .row')].find(r => r.querySelector('.nm').textContent === 'Beef Brisket Noodle Bowl'); feedScroll.scrollTop += r.getBoundingClientRect().top - 400; }); scrolls++;
  await page.waitForTimeout(200);
  await tap(row('Beef Brisket Noodle Bowl').locator('.add'));
  assert.equal(await page.locator('#acc .t1').textContent(), 'Worcester or Berkshire');
  const g = row('Golden BBQ Chicken Thigh').locator('.add');
  assert(await inView(g), 'Golden BBQ in reach after ambiguous commit');
  await tap(g);
  assert.equal(await page.locator('#acc .t1').textContent(), 'Worcester');
  await tap(row('Golden BBQ Chicken Thigh').locator('[data-act=add]'));
  await tap(page.locator('#acc [data-act=log]'));
  assert.equal(await page.locator('#acc .t1').textContent(), 'Logged Worcester lunch');
  console.log(`B: ${taps} taps, ${scrolls} scroll`);

  // Variant C: conflict - Worcester plate then a dish not at Worcester -> second plate, swipe back, log Worcester, other plate discarded
  await page.goto(URL); await page.waitForTimeout(300);
  await tap(row('Golden BBQ Chicken Thigh').locator('.add'));
  await page.evaluate(() => { const r = [...document.querySelectorAll('#feed .row')].find(r => r.querySelector('.nm').textContent === 'Pepperoni Pizza'); feedScroll.scrollTop += r.getBoundingClientRect().top - 400; });
  await page.waitForTimeout(200);
  await tap(row('Pepperoni Pizza').locator('.add.away'));
  assert.equal(await page.evaluate(() => S.plates.length), 2);
  assert.equal(await page.evaluate(() => S.active), 1);
  // swipe the plate bar right to get back to Worcester
  const bb = await page.locator('#acc').boundingBox();
  await touch(line([bb.x + 60, bb.y + 32], [bb.x + 300, bb.y + 34], 10));
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => S.active), 0);
  assert.equal(await page.locator('#acc .card').nth(0).locator('.t1').textContent(), 'Worcester');
  await tap(page.locator('#acc .card').nth(0).locator('[data-act=log]'));
  assert.equal(await page.evaluate(() => S.plates.length), 0);
  await tap(page.locator('[data-act=undo]'));
  assert.equal(await page.evaluate(() => S.plates.length), 2);
  console.log('C: conflict -> second plate, swipe back, log, undo restores both');

  // Sheet: open, drag to large, drag down to dismiss
  await tap(page.locator('#acc .card').nth(0));
  assert.equal(await page.evaluate(() => SH.mode), 'plate');
  await page.screenshot({ path: __dirname + '/tmp-sheet-live.png' });


  // plate sheet: drag from the BODY at medium up to large, then from the header down to dismiss
  const body = await page.locator('.sheet .tot').boundingBox();
  await touch(line([195, body.y + 10], [195, 120]));
  assert.equal(await page.evaluate(() => SH.det), 'large');
  await touch(line([195, 70], [195, 800], 8));
  assert.equal(await page.evaluate(() => SH.mode), null);
  console.log('plate sheet: body drag to large, header drag dismisses (CDP touch)');

  // dish sheet (overflowing body): medium body drag up -> large, body scrolls natively at large
  await page.goto(URL); await page.waitForTimeout(300);
  // the dish whose station has the most folded-in toppings, so the sheet overflows
  await page.evaluate(() => { const n = d => dishes.filter(x => x.extra && x.at[d.halls[0]] && x.at[d.halls[0]].st === d.at[d.halls[0]].st).length; const d = dishes.filter(d => !d.extra).sort((a, b) => n(b) - n(a))[0]; openSheet('dish', d.id); });
  await page.waitForTimeout(700);
  await touch(line([195, 560], [195, 200]));
  assert.equal(await page.evaluate(() => SH.det), 'large');
  await touch(line([195, 700], [195, 300]));
  assert(await page.evaluate(() => document.querySelector('.shb').scrollTop) > 0, 'dish sheet body scrolls at large');
  console.log('dish sheet: body drag to large, then body scrolls');

  // lens + hall scrub (real touch drag across the segmented control)
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('[data-lens=protein]').tap(); await page.waitForTimeout(600);
  const firstP = await page.locator('#feed .row .nm').first().textContent();
  const sb = await page.locator('#hallSeg').boundingBox();
  await touch(line([sb.x + 30, sb.y + 22], [sb.x + 105, sb.y + 22], 6));
  assert.equal(await page.evaluate(() => S.hall), 0);
  const firstW = await page.locator('#feed .row .nm').first().textContent();
  assert(await page.evaluate(() => lens.scrollHeight <= lens.clientHeight), 'chip row has no vertical scroll');

  // back button at the very left edge still works; edge swipe pops
  await page.goto(URL + '?state=menu'); await page.waitForTimeout(700);
  const back = await page.locator('.pushed .back').boundingBox();
  await page.touchscreen.tap(back.x + 6, back.y + back.height / 2); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => stack.length), 0, 'edge tap on back pops');
  await page.goto(URL + '?state=menu'); await page.waitForTimeout(700);
  await touch(line([8, 400], [300, 400], 10));
  assert.equal(await page.evaluate(() => stack.length), 0, 'edge swipe pops');
  console.log('back: edge tap and edge swipe both pop');

  // custom-only plate logs without a hall
  await page.goto(URL); await page.waitForTimeout(300);
  await page.evaluate(() => { addCustom({ n: 'Clif bar', cal: 250, p: 9, c: 40, f: 6 }); render(); });
  await page.locator('#acc [data-act=log]').tap(); await page.waitForTimeout(500);
  assert.equal(await page.locator('#acc .t1').textContent(), 'Logged lunch');
  console.log('lens: high protein campus #1', firstP, '| scrubbed to Worcester #1', firstW);

  // secondary paths render without errors
  for (const s of ['halls', 'menu', 'you', 'search', 'rank', 'dish', 'lens', 'conflict', 'choose', 'ambiguous']) { await page.goto(URL + '?state=' + s); await page.waitForTimeout(250); }
  assert.deepEqual(errs, []);
  console.log('all states load, no page errors');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
