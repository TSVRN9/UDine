// Round 9 review shots: node shots9.js [out-dir] [filter]. Each state at 390 and 360 (dpr 2), joined into one sheet per
// state as build/r9/<out>/<name>.png (390 left, 360 right).
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const { execSync } = require('child_process');
const D = __dirname, OUT = D + '/build/r9/' + (process.argv[2] || 'p1'), ONLY = process.argv[3];
require('fs').mkdirSync(OUT, { recursive: true });
const cafe = n => `P.places.findIndex(x=>x[0]===${JSON.stringify(n)})`;
const STATES = [
  ['hall-top', '?state=menu'],
  ['hall-collapsed', '?state=collapsed'],
  ['hall-day', '?state=menu', p => p.evaluate(() => { S.mday = 3; renderMenu(); })],
  ['hall-day-collapsed', '?state=menu', p => p.evaluate(() => { S.mday = 9; renderMenu(); const sc = document.querySelector('#mscroll'); sc.scrollTop = 520; paint(1, 520); })],
  ['sched-status', '?state=menu', async p => { await p.locator('#mts').tap(); await p.waitForTimeout(700); }],
  ['sched-day', '?state=menu', async p => { await p.evaluate(() => { S.mday = 9; renderMenu(); }); await p.locator('.dayc').tap(); await p.waitForTimeout(700); }],
  ['sched-ipd', '?state=menu', async p => { await p.evaluate(() => { S.mday = 4; renderMenu(); }); await p.locator('.dayc').tap(); await p.waitForTimeout(700); }],
  ['sched-cafe', '?state=menu', async p => { await p.evaluate(`openHall('C',true,null,{cafe:${cafe('Wasabi')}})`); await p.locator('.dayc').tap(); await p.waitForTimeout(700); }],
  ['empty-day', '?state=menu', p => p.evaluate(() => { S.mday = 2; renderMenu(); })],
  ['diet-page', '?state=you', async p => { await p.evaluate(() => { S.avoid = { Peanuts: true, Milk: true }; S.diet.veg = true; renderYou(); }); await p.locator('[data-p=diet]').tap(); await p.waitForTimeout(700); }],
  ['hiding', '?state=menu', p => p.evaluate(() => { S.avoid = { Milk: true, Eggs: true }; renderMenuList(); })],
  ['revealed', '?state=menu', p => p.evaluate(() => { S.avoid = { Milk: true, Eggs: true }; S.reveal = true; renderMenuList(); })],
  ['halls-slow', '?net=slow'], ['halls-offline', '?net=offline&pins=2'], ['halls-fail', '?net=fail&pins=2'],
  ['hall-slow', '?net=slow&state=menu', p => p.waitForTimeout(400)],
  ['hall-offline', '?net=offline&state=menu'],
  ['hall-offline-day', '?net=offline&state=menu', async p => { await p.evaluate(() => { S.mday = 5; renderMenu(); }); }],
  ['hall-offline-sched', '?net=offline&state=menu', async p => { await p.locator('.dayc').tap(); await p.waitForTimeout(700); }],
  ['hall-fail', '?net=fail&state=menu'],
  ['cafe-multi', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('Green Fields')}})`)],
  ['cafe-multi-collapsed', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('Harvest Market')}}); document.querySelector('#mscroll').scrollTop=400; paint(1,400)`)],
  ['cafe-one', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('Worcester Café')}})`)],
  ['cafe-one-collapsed', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('Worcester Café')}}); document.querySelector('#mscroll').scrollTop=500; paint(1,500)`)],
  ['cafe-nomenu', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('ISB Café')}})`)],
  ['cafe-sheet', '', async p => { await p.evaluate(`openHall('C',true,null,{cafe:${cafe('Green Fields')}})`); await p.waitForTimeout(300); await p.locator('#mlist .row .n').nth(1).tap(); await p.waitForTimeout(800); }],
  // round 9b
  ['b-terrace-area', '', async p => { await p.evaluate(() => openPage('cafes', 3, true)); await p.waitForTimeout(500); }],
  ['b-terrace-page', '', p => p.evaluate(`openHall('C',true,null,{cafe:${cafe('Terrace')}})`)],
  ['b-you-off', '?state=you', p => p.evaluate(() => { document.querySelector('#you').scrollTop = 9999; })],
  ['b-you-on', '?state=you', async p => { await p.evaluate(() => { document.querySelector('#you').scrollTop = 9999; }); await p.locator('#you [data-act=newton]').tap(); await p.waitForTimeout(300); }],
  ['b-areas-on', '', async p => { await p.evaluate(() => { setNewton(true); S.pins = ['Wasabi', 'Charles River Campus']; renderPins(); fillBands(false); document.querySelector('#halls').scrollTop = 9999; }); }],
  ['b-cafes-cr', '', async p => { await p.evaluate(() => { setNewton(true); openPage('cafes', 4, true); }); await p.waitForTimeout(500); }],
  ['b-cr-page', '', p => p.evaluate(`setNewton(true); openHall('C',true,null,{cafe:${cafe('Charles River Campus')}})`)],
  ['b-cr-search', '?state=search', async p => { await p.evaluate(() => setNewton(true)); await p.locator('#q').fill('chorizo'); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#q').blur()); }],
  ['search-cafe', '?state=search', async p => { await p.locator('#q').fill('caesar'); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#q').blur()); await p.waitForTimeout(200); }],
  ['search-cafe-sheet', '?state=search', async p => { await p.locator('#q').fill('caesar'); await p.waitForTimeout(400); await p.locator('#sres .row[data-cg] .n').first().tap(); await p.waitForTimeout(800); await p.evaluate(() => { const b = document.querySelector('#isbody'); b.scrollTop = 0; }); }],
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  for (const [name, q, fn] of STATES) {
    if (ONLY && !name.match(ONLY)) continue;
    const files = [];
    for (const w of [390, 360]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto('file://' + D + '/index.html' + q); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
      if (fn) { await fn(p); await p.waitForTimeout(500); }
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
  }
  await b.close();
})();
