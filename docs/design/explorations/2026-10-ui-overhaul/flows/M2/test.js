// Benchmark driver: Worcester lunch, Beef Brisket Noodle Bowl x1 + Golden BBQ Chicken Thigh x2 -> Log.
// Real touch input through CDP (Chromium's touch pipeline, touch-action arbitration), not synthetic events.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const assert = require('assert');
const URL = 'file://' + __dirname + '/index.html';
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
  assert(await page.locator('.page[data-p=place]').isVisible(), 'café detail');
  assert.match(await page.locator('.page[data-p=place] .pstat').textContent(), /Open until 9 PM/);
  await page.locator('.page[data-p=place] .lrow', { hasText: 'California Roll' }).locator('.add').tap(); await page.waitForTimeout(400);
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
  assert.deepEqual(await page.locator('.page[data-p=event] a.btn').allTextContents(), ['See the menu', 'Holiday hours'], 'merged hours entry becomes a second link');
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
  assert.match(await page.locator('#isheet .alg').textContent(), /Corn/, 'allergens shown');
  assert.equal(await page.locator('#isheet .crs i.on').textContent(), 'C'); assert.equal(await page.locator('#isheet .hbars i.on').count(), 3);
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
  await page.locator('#sres .prow2[data-p=place]').first().tap(); await page.waitForTimeout(700);
  assert.equal(await page.locator('.page[data-p=place] .pbar .o').textContent(), 'Wasabi', 'a place result opens its page');
  await page.locator('[data-act=pageback]').tap(); await page.waitForTimeout(600);
  // a hall result: the row grows into the hall over Search (the hall belongs to the Search tab), and shrinks back into it
  await page.locator('#q').fill('worcester'); await page.waitForTimeout(150);
  await page.locator('#sres .prow2[data-act=hall]').first().tap(); await page.waitForTimeout(900);
  assert(await page.locator('#menu').isVisible(), 'hall result opens the hall');
  assert.equal(await page.evaluate(() => [S.tab, S.hallTab, matchMedia('(prefers-reduced-motion: reduce)').matches || getComputedStyle(S.hallSrc).visibility].join()), 'search,search,' + (process.env.RM ? 'true' : 'hidden'), 'opened over Search, from the row');
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

  // where and when: Green Chile Posole is at every hall today and at Hampshire lunch tomorrow
  await page.goto(URL); await page.waitForTimeout(300);
  await page.locator('.tbar button[data-tab=search]').tap(); await page.keyboard.type('posole'); await page.waitForTimeout(300);
  // round 4: the row carries four hall letters, the halls serving it now filled
  assert.equal(await sRow('Green Chile Posole').locator('.tags').getAttribute('aria-label'), 'Served now at Worcester, Franklin, Hampshire and Berkshire');
  assert.equal(await sRow('Green Chile Posole').locator('.tags .ht.on').count(), 4);
  assert.equal(await sRow('Green Chile Posole').locator('.ww').count(), 0, 'no text list under the row');
  await sRow('Green Chile Posole').locator('.n').tap(); await page.waitForTimeout(700);
  // detail: the halls x meals grid; today shows lunch as now (gold) at all four, dinner at all four
  assert.equal(await page.locator('#isheet .agrid .c.now').count(), 4, 'served now at four halls');
  assert.equal(await page.locator('#isheet .agrid button[aria-label="Served at Worcester, dinner, today"]').count(), 1);
  await page.locator('#isheet [data-act=aday][data-day="1"]').tap(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#isheet .agrid button.c').count(), 1, 'tomorrow: one serving');
  const tmr = page.locator('#isheet .agrid button[aria-label="Served at Hampshire, lunch, tomorrow"]');
  assert.equal(await tmr.count(), 1, "tomorrow's Hampshire lunch cell");
  await tmr.tap(); await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => [S.hall, S.mday, S.mmeal, document.querySelector('#mts').textContent].join()), 'H,1,lunch,Tomorrow, Friday', 'opens Hampshire, tomorrow, lunch');
  const here = await page.locator('#mlist .row.here').boundingBox();
  assert(here && here.y > 150 && here.y < 260, 'scrolled to the dish under the header: ' + (here && here.y));
  assert.match(await page.locator('#mlist .row.here .n').textContent(), /Green Chile Posole/);
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

  // pins: device-local, survive a reload, open with the container transform, unpin from the same control
  await page.goto(URL); await page.evaluate(() => localStorage.removeItem('udine-m2')); await page.reload(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#pins .pcard').count(), 0, 'no pins: Halls is the four bands');
  await page.locator('#areas .lrow').first().tap(); await page.waitForTimeout(700);
  await page.locator('.page[data-p=cafes] .lrow', { hasText: 'Wasabi' }).tap(); await page.waitForTimeout(700);
  await page.locator('.page[data-p=place] [data-act=pin]').tap(); await page.waitForTimeout(200);
  assert.equal(await page.locator('.page[data-p=place] [data-act=pin]').getAttribute('aria-pressed'), 'true');
  await page.reload(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#pins .pcard').count(), 1, 'pin persists across a reload');
  assert.match(await page.locator('#pins .pcard').textContent(), /Wasabi.*Open until 9 PM/, 'pinned row has live status');
  await page.locator('#pins .pcard').tap(); await page.waitForTimeout(700);
  assert.equal(await page.locator('.page[data-p=place] .pbar .o').textContent(), 'Wasabi', 'a pin opens its café');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.page[data-p=place] .phero img')].length), 1, 'the café page is headed by its photo');
  assert.equal(await page.evaluate(() => document.querySelectorAll('img.trav').length), 0, 'the shared photo layer is gone at rest');
  await page.locator('.page[data-p=place] [data-act=pin]').tap(); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#pins .pcard').count(), 0, 'unpin persists');
  await page.evaluate(() => localStorage.removeItem('udine-m2'));

  assert.deepEqual(errs, [], 'no page errors');
  console.log(results.join('\n')); console.log('all checks passed');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
