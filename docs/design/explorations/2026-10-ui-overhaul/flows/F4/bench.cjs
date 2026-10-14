// Drives the benchmark task with real touch input: Worcester lunch, Beef Brisket Noodle Bowl x1 + Golden BBQ Chicken Thigh x2, log.
const {chromium} = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const assert = require('assert');
const OUT = __dirname + '/';
(async () => {
  const b = await chromium.launch({executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 2});
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/index.html'); await p.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(p);
  const touch = async (pts, holdMs = 0) => { // pts: [[x,y],...] path
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: pts[0][0], y: pts[0][1]}]});
    if (holdMs) await p.waitForTimeout(holdMs);
    for (const [x, y] of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y}]}); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  };
  const line = (a, b2, n) => Array.from({length: n + 1}, (_, i) => [a[0] + (b2[0] - a[0]) * i / n, a[1] + (b2[1] - a[1]) * i / n]);
  const center = async sel => { const r = await p.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const rowSel = name => `.page[data-i="1"] .row:has(.nm:text-is("${name}"))`;
  let taps = 0, drags = 0, scrolls = 0;
  const tapAt = async ([x, y]) => { taps++; await p.touchscreen.tap(x, y); await p.waitForTimeout(350); };
  const nameXY = async name => { const r = await p.locator(rowSel(name) + ' .nm').boundingBox(); return [r.x + 40, r.y + r.height / 2]; };

  // 1-2: Golden BBQ Chicken Thigh is on the first screen (Grill Station) — tap the row twice
  await tapAt(await nameXY('Golden BBQ Chicken Thigh'));
  await tapAt(await nameXY('Golden BBQ Chicken Thigh'));
  // 3: flick the station rail toward Noodle Bowl (one throw); tap the chip only if the throw lands short/long
  let ry = (await center('#rail'))[1]; drags++; await touch(line([330, ry], [150, ry + 1], 6)); await p.waitForTimeout(1200);
  let st = await p.evaluate(() => R.chips[R.idx].textContent);
  console.log('rail flick landed on', st);
  if (st !== 'Noodle Bowl') { await tapAt(await center('#rtrk .chip:text-is("Noodle Bowl")')); await p.waitForTimeout(900); }
  // 4: tap Beef Brisket Noodle Bowl
  await tapAt(await nameXY('Beef Brisket Noodle Bowl')); await p.waitForTimeout(600);
  const tray = await p.evaluate(() => [...S.tray.values()].map(i => [i.d[0], i.q]));
  console.log('tray', tray);
  assert.deepStrictEqual(Object.fromEntries(tray), {'Golden BBQ Chicken Thigh': 2, 'Beef Brisket Noodle Bowl': 1});
  assert.match(await p.locator('#tc .sum .a').innerText(), /3 items, 404 cal/);
  await p.screenshot({path: OUT + 'shot-tray-filled.png'});
  // 5: drag the tray up to review (one drag)
  drags++; await touch(line([195, 800], [195, 420], 12));
  await p.waitForTimeout(250); 
  await p.waitForTimeout(900);
  assert(await p.evaluate(() => trayOpen), 'tray opened');
  await p.screenshot({path: OUT + 'shot-tray-open.png'});
  // 6: Log
  await tapAt(await center('#xlog')); await p.waitForTimeout(1500);
  await p.screenshot({path: OUT + 'shot-logged.png'});
  const conf = await p.locator('#tc').innerText();
  console.log('confirmation:', conf.replace(/\n/g, ' / '));
  assert.match(conf, /Logged 3 items/); assert.match(conf, /Today 825 cal/);
  console.log(`benchmark: ${taps} taps, ${drags} drag, ${scrolls} scrolls`);

  // extra gestures: long-press lift + throw onto tray
  await touch(line(await nameXY('Hard Boiled Egg'), [200, 790], 10), 450); await p.waitForTimeout(900);
  const egg = await p.evaluate(() => [...S.tray.values()].map(i => [i.d[0], i.q]));
  console.log('after lift+drop:', egg); assert.deepStrictEqual(egg, [['Hard Boiled Egg', 1]]);
  // rail flick: should land exactly on a station start
  ry = (await center('#rail'))[1]; await touch(line([260, ry], [120, ry], 4)); await p.waitForTimeout(1200);
  const snap = await p.evaluate(() => ({top: R.el.scrollTop, s: R.s, idx: R.idx}));
  console.log('rail flick -> station', snap.idx, 'scrollTop', snap.top, 'start', snap.s[snap.idx]);
  assert(Math.abs(snap.top - snap.s[snap.idx]) < 2);
  // hall swipe to Franklin
  await touch(line([300, 400], [80, 405], 8)); await p.waitForTimeout(900);
  const pg = await p.evaluate(() => pos); console.log('pager pos', pg); assert.strictEqual(pg, 2);
  
  // ruler drag to dinner
  await touch(line([200, 88], [60, 88], 6)); await p.waitForTimeout(1000);
  console.log('meal', await p.evaluate(() => S.meal));
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
