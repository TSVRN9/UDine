// Screenshots key states and drives the benchmark three ways. Run: node drive.js
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const assert = require('assert');
const url = s => `file://${__dirname}/index.html?state=${s}`;
const STATES = (process.argv[2] || 'home,empty,checklist-picked,empty-search,logged,again').split(',');

(async () => {
  const b = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const s of STATES) { await p.goto(url(s)); await p.waitForTimeout(900); await p.screenshot({ path: `${__dirname}/shot-${s}.png` }); }
  const kcal = async () => +(await p.textContent('#kn'));
  const lunchCal = async () => +(await p.textContent('.meals .now b')).replace('–', '0');

  // A: seeded, "Same as Tuesday" card -> Log (1 tap)
  await p.goto(url('home')); await p.waitForTimeout(400);
  const before = await kcal();
  await p.tap('.plate [data-plate]'); await p.waitForTimeout(700);
  assert.strictEqual(await p.textContent('#tmsg'), 'Logged lunch, 404 cal');
  assert.strictEqual(await kcal(), before + 404); assert.strictEqual(await lunchCal(), 404);
  console.log('  macros now:', await p.textContent('.macros'));
  await p.tap('#tundo'); await p.waitForTimeout(700); assert.strictEqual(await kcal(), before);
  console.log('A same-as-Tuesday: 1 tap, total', before, '->', before + 404, ', undo restores');

  // B: seeded, two usuals (2 taps)
  await p.goto(url('home')); await p.waitForTimeout(400);
  const us = await p.$$eval('[data-u] .name', a => a.map(x => x.textContent));
  await p.tap(`[data-uadd="${us.indexOf('Golden BBQ Chicken Thigh')}"]`); await p.waitForTimeout(500);
  await p.tap(`[data-uadd="${us.indexOf('Beef Brisket Noodle Bowl')}"]`); await p.waitForTimeout(700);
  assert.strictEqual(await lunchCal(), 404);
  console.log('B usuals: 2 taps, lunch 404 cal');

  // C: first run, no history: tile -> search -> tap rows -> Log
  await p.goto(url('empty')); await p.waitForTimeout(400);
  await p.tap('.tile[data-hall="Worcester"]'); await p.waitForTimeout(700);
  const row = n => `.crow[data-n="${n}"]`;
  await p.tap('#q'); await p.keyboard.type('bris'); await p.waitForTimeout(200);
  await p.tap(row('Beef Brisket Noodle Bowl'));
  await p.tap('#qclear'); await p.keyboard.type('bbq'); await p.waitForTimeout(200);
  await p.tap(row('Golden BBQ Chicken Thigh')); await p.tap(row('Golden BBQ Chicken Thigh'));
  assert.strictEqual(await p.textContent('#logbtn'), 'Log lunch, 404 cal');
  await p.tap('#logbtn'); await p.waitForTimeout(900);
  assert.strictEqual(await p.textContent('#tmsg'), 'Logged lunch, 404 cal');
  assert.strictEqual(await kcal(), 404);
  console.log('C first run (search): 1 + 2 typed queries + 3 row taps + Log; total 404');

  // C2: first run without typing: scroll the list
  await p.goto(url('empty')); await p.waitForTimeout(400);
  await p.tap('.tile[data-hall="Worcester"]'); await p.waitForTimeout(700);
  for (const n of ['Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh', 'Beef Brisket Noodle Bowl']) {
    await p.$eval(row(n), el => el.scrollIntoView({ block: 'center' })); await p.tap(row(n));
  }
  assert.strictEqual(await p.textContent('#logbtn'), 'Log lunch, 404 cal');
  console.log('C2 first run (scroll): 1 + 3 row taps + Log = 5 taps, scrolling ~11 rows');

  // gestures: header drag to medium detent, fling to dismiss; swipe-to-delete with undo
  await p.goto(url('checklist')); await p.waitForTimeout(700);
  const drag = async (x, y0, y1, steps) => { await p.mouse.move(x, y0); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(x, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(650); };
  const YM = await p.evaluate('YM');
  await drag(195, 40, 40 + (YM - await p.evaluate('S.y')) + 10, 25);
  assert.strictEqual(await p.evaluate('S.y'), YM);
  await drag(195, YM + 30, YM + 200, 4); assert.strictEqual(await p.evaluate('S.open'), false);
  console.log('sheet: drag to medium detent, fling dismisses');
  await p.goto(url('logged')); await p.waitForTimeout(800);
  const r = await (await p.$('.swipe')).boundingBox();
  await p.mouse.move(r.x + r.width - 30, r.y + 30); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(r.x + r.width - 30 - i * 20, r.y + 30); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(700);
  assert.match(await p.textContent('#tmsg'), /^Removed Beef Brisket/); assert.strictEqual(await lunchCal(), 186);
  await p.tap('#tundo'); await p.waitForTimeout(500); assert.strictEqual(await lunchCal(), 404);
  console.log('swipe-to-delete + undo ok');

  // list -> sheet hand-off with real touch events (CDP): at scrollTop 0 a downward drag moves the sheet,
  // from a scrolled list the same drag scrolls instead
  const cdp = await ctx.newCDPSession(p);
  const touch = async (y0, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: y0 }] });
    for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y0 + (y1 - y0) * i / 15 }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(700);
  };
  await p.goto(url('checklist')); await p.waitForTimeout(700);
  await touch(500, 500 + (YM - (await p.evaluate('S.y'))) + 10);
  assert.strictEqual(await p.evaluate('S.y'), YM);
  await p.goto(url('checklist')); await p.waitForTimeout(700);
  await p.evaluate("$('#slist').scrollTop=400"); const yl = await p.evaluate('S.y');
  await touch(400, 700);
  assert.strictEqual(await p.evaluate('S.y'), yl); assert.ok(await p.evaluate("$('#slist').scrollTop") < 400);
  console.log('touch hand-off: list at top drags sheet to medium; scrolled list scrolls, sheet stays');

  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
