// Benchmark driver: Worcester lunch, Beef Brisket Noodle Bowl x1 + Golden BBQ Chicken Thigh x2 -> Log.
// Real touch input through CDP (Chromium's touch pipeline, touch-action arbitration), not synthetic events.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const assert = require('assert');
const URL = 'file://' + __dirname + '/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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

  // A. Search tab, brisket first (plate {W,B} -> {W}), keyboard stays up between picks
  await page.goto(URL); await page.waitForTimeout(400); taps = 0; scrolls = 0;
  await tap(page.locator('.tbar button[data-tab=search]'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q', 'tab tap focuses the field');
  await page.keyboard.type('brisket'); await page.waitForTimeout(200);
  await tap(sRow('Beef Brisket Noodle Bowl').locator('.add'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q', 'keyboard stays up after a pick');
  assert.equal(await page.locator('#barL').textContent(), 'Worcester or Berkshire lunch');
  assert.equal(await page.evaluate(() => document.activeElement.selectionEnd - document.activeElement.selectionStart), 7, 'query selected for replace');
  await page.keyboard.type('bbq'); await page.waitForTimeout(200);
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
  y = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#psheet')).transform).m42);
  assert(y >= 800, 'fling down closes: ' + y);

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
  await r.locator('.add').tap(); await page.waitForTimeout(300); await r.locator('.dec').tap(); await page.waitForTimeout(350);
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
  assert(await page.locator('.page[data-p=place]').isVisible(), 'café detail');
  assert.match(await page.locator('.page[data-p=place] .pstat').textContent(), /Open until 9 PM/);
  await page.locator('.page[data-p=place] .lrow', { hasText: 'California Roll' }).locator('.add').tap(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#cn').inputValue(), 'California Roll', 'café menu item -> custom food, name prefilled');
  await page.goto(URL); await page.waitForTimeout(300);
  // Round 4: events live in Search's idle state (4 cards, IPD + its Hours merged), snap, open the event page
  const wTop = (await page.locator('.band[data-h=W]').boundingBox()).y;
  assert(wTop < 160, 'Halls is compact again; Worcester band at ' + wTop);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#evc .evcard').count(), 4, '5 feed entries -> 4 cards');
  assert.equal(await page.locator('#evc .evcard').first().locator('.evtag').textContent(), 'Mon, Oct 12');
  const ev = await page.locator('#evc').boundingBox();
  await touch(line([300, ev.y + 60], [120, ev.y + 62], 6), 12); await page.waitForTimeout(500);
  const sl = await page.evaluate(() => document.querySelector('#evc').scrollLeft);
  assert(sl > 200 && Math.abs(sl - 292) < 3, 'carousel snaps to the next card: ' + sl);
  await page.locator('#evc .evcard').first().evaluate(e => e.scrollIntoView({ inline: 'start' }));
  await page.locator('#evc .evcard').first().tap(); await page.waitForTimeout(450);
  assert.deepEqual(await page.locator('.page[data-p=event] a.btn').allTextContents(), ['See the menu', 'Holiday hours'], 'merged hours entry becomes a second link');
  await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(350);
  await page.locator('#q').fill('x'); await page.waitForTimeout(350);
  assert(await page.locator('#sdisc').isHidden(), 'typing leaves the idle hub');
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
    assert(new Set(hy).size > 3, 'the header itself does move');
    await page.waitForTimeout(1500);
    await page.locator('#mctl [data-act=back]').click();
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(220); assert.equal(await still(), r0, `close ${h}: Halls moved at sample ${i}`); }
  }

  // Round 4: dish detail with the full label, ingredients expand, search results open it too, plate Full label
  await page.goto(URL + '?state=menu'); await page.waitForTimeout(400);
  await mRow('Golden BBQ Chicken Thigh').locator('.n').tap(); await page.waitForTimeout(600);
  const lab = page.locator('#isheet .label');
  assert(await lab.isVisible(), 'detail view opens with a label');
  for (const n of ['Total Fat', 'Saturated Fat', 'Trans Fat', 'Cholesterol', 'Sodium', 'Total Carbohydrate', 'Dietary Fiber', 'Total Sugars', 'Protein'])
    assert.equal(await lab.locator('.lr', { hasText: n }).count() >= 1, true, 'label row ' + n);
  const sod = lab.locator('.lr.sod');
  assert.match(await sod.textContent(), /Sodium 685\.5mg/); assert.equal((await sod.locator('.dv').textContent()).trim(), '30%');
  assert.match(await page.locator('#isheet .alg').textContent(), /Corn/, 'allergens shown');
  assert.equal(await page.locator('#isheet .crs i.on').textContent(), 'C'); assert.equal(await page.locator('#isheet .hbars i.on').count(), 3);
  const ing = page.locator('#ing'); const h0 = (await ing.boundingBox()).height;
  await page.locator('#isheet [data-act=ing]').tap(); await page.waitForTimeout(400);
  const h1 = (await ing.boundingBox()).height;
  assert(h1 > h0 * 2, `ingredients expand ${h0} -> ${h1}`);
  await page.goto(URL + '?state=typed'); await page.waitForTimeout(400);
  await sRow('Golden BBQ Chicken Thigh').locator('.n').tap(); await page.waitForTimeout(600);
  assert(await page.locator('#isheet .label').isVisible(), 'search result opens the same detail view');
  await page.goto(URL + '?state=plate'); await page.waitForTimeout(600);
  await page.locator('#psheet [data-act=fulllabel]').tap(); await page.waitForTimeout(600);
  assert.equal((await page.locator('#isheet .label .cal b').textContent()).trim(), '404', 'plate Full label sums the plate');

  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('coffee'); await page.waitForTimeout(200);
  assert(await page.locator('#sres .prow2', { hasText: "People's Organic Coffee" }).count() === 1, 'search finds cafés');
  await page.locator('#q').fill('worcester'); await page.waitForTimeout(150);
  await page.locator('#sres .prow2[data-act=hall]').first().tap(); await page.waitForTimeout(900);
  assert(await page.locator('#menu').isVisible(), 'hall result opens the hall');
  // transition bookkeeping: band hidden while its header is up, identity transforms at rest, band back after close (from collapsed)
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.band[data-h=W]')).visibility), 'hidden');
  assert.equal(await page.evaluate(() => document.querySelector('#mhead').style.clipPath), 'none');
  await page.evaluate(() => { document.querySelector('#mscroll').scrollTop = 400; }); await page.waitForTimeout(200);
  await page.locator('#mctl [data-act=back]').tap(); await page.waitForTimeout(1200);
  assert(await page.locator('#menu').isHidden(), 'close from collapsed');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.band[data-h=W]')).visibility), 'visible');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#halls .band, #halls > .sec')].filter(e => e.style.transform).length), 0, 'Halls content back in place');

  assert.deepEqual(errs, [], 'no page errors');
  console.log(results.join('\n')); console.log('all checks passed');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
