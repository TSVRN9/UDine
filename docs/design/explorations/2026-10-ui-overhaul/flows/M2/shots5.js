// Round 5 screenshots: shot-pins.png (0, 2, 5 pins; 5 also scrolled), shot-dish.png (the where block in four states),
// shot-search.png (a typed search with now and later rows). node shots5.js [pins|dish|search]
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const { execSync } = require('child_process');
const ONLY = process.argv[2], D = __dirname, B = D + '/build/s5';
require('fs').mkdirSync(B, { recursive: true });
const join = (files, out) => execSync(`python3 -c "
import sys
from PIL import Image
ims=[Image.open(f) for f in sys.argv[2:]]; W=sum(i.width for i in ims)+10*(len(ims)-1); o=Image.new('RGB',(W,max(i.height for i in ims)),(120,120,120)); x=0
for i in ims: o.paste(i,(x,0)); x+=i.width+10
o.save(sys.argv[1])" ${out} ${files.join(' ')}`);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const go = async q => { await p.goto('file://' + D + '/index.html' + q); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500); };
  if (!ONLY || ONLY === 'pins') {
    const f = [];
    for (const [q, sc] of [['?pins=0', 0], ['?pins=2', 0], ['?pins=5', 0], ['?pins=5', 9999]]) {
      await go(q); if (sc) { await p.evaluate(y => { document.querySelector('#halls').scrollTop = y; }, sc); await p.waitForTimeout(200); }
      const out = `${B}/pins-${f.length}.png`; await p.screenshot({ path: out }); f.push(out);
    }
    join(f, D + '/shot-pins.png');
  }
  if (!ONLY || ONLY === 'dish') {
    const f = [];
    for (const n of ['Beef Brisket Noodle Bowl', 'Black Bean Burger', 'Korean BBQ Chicken', 'Chinese Twist Cruller']) {
      await go('?state=search'); await p.keyboard.type(n.toLowerCase()); await p.waitForTimeout(300);
      await p.locator('#sres .row', { has: p.locator('.n', { hasText: new RegExp('^' + n) }) }).first().locator('.n').tap(); await p.waitForTimeout(900);
      const out = `${B}/dish-${f.length}.png`; await p.screenshot({ path: out }); f.push(out);
    }
    join(f, D + '/shot-dish.png');
  }
  if (!ONLY || ONLY === 'search') {
    const f = [];
    for (const q of ['bbq', 'posole', 'cruller']) {
      await go('?state=search'); await p.keyboard.type(q); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#q').blur()); await p.waitForTimeout(200);
      const out = `${B}/search-${f.length}.png`; await p.screenshot({ path: out }); f.push(out);
    }
    join(f, D + '/shot-search.png');
  }
  await b.close();
})();
