// Round 13 tracking-lift strips: node shots13.js [out-dir]. 390 wide, dpr 1, 12 frames per transition: every animation of the lift is
// paused at once and seeked, so the frames are evenly spaced in animation time. build/r12/<out>/off.png and on.png (two rows of six).
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const { execSync } = require('child_process');
const D = __dirname, OUT = D + '/build/r12/' + (process.argv[2] || 'p7'); require('fs').mkdirSync(OUT, { recursive: true });
const N = 12;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  for (const [dir0, W] of [['off', 390], ['on', 390], ['off', 360], ['on', 360], ['rowsoff', 390], ['rowson', 390], ['rowsoff', 360], ['rowson', 360]]) {
    const rows = dir0.startsWith('rows'), dir = dir0.replace('rows', ''), nm = dir0 + (W === 390 ? '' : W);
    const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} });
    const p = await ctx.newPage(); await p.goto('file://' + D + '/index.html?state=' + (rows ? 'search' : 'you')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    if (rows) { await p.locator('#q').fill('chicken'); await p.waitForTimeout(900); await p.evaluate(() => document.querySelector('#q').blur()); await p.waitForTimeout(300); }
    if (!rows) await p.evaluate(() => { const W = Object.values(DISH).find(d => d.n === 'Golden BBQ Chicken Thigh' && d.h === 'W' && !d.day); addDish('lunch', W.k, { W }, W.n); }); await p.waitForTimeout(700);
    if (dir === 'on') { await p.evaluate(() => setTrack(false)); await p.waitForTimeout(900); }
    await p.evaluate(d => { window.__p = setTrack(d === 'on'); document.getAnimations().forEach(a => a.pause()); }, dir);
    const T = await p.evaluate(() => Math.max(...document.getAnimations().map(a => a.effect.getComputedTiming().endTime)));
    const files = [];
    for (let i = 0; i < N; i++) { const t = Math.round(T * i / (N - 1)); await p.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), t);
      await p.waitForTimeout(60); const f = `${OUT}/${nm}-${i}.png`; await p.screenshot({ path: f }); files.push([f, t]); }
    execSync(`python3 -c "
import sys
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',22)
args=sys.argv[2:]; ims=[(Image.open(args[i]),args[i+1]) for i in range(0,len(args),2)]
w,h=ims[0][0].size; cols=6; rows=(len(ims)+cols-1)//cols
o=Image.new('RGB',((w+10)*cols,(h+36)*rows),(60,60,60)); d=ImageDraw.Draw(o)
for k,(im,t) in enumerate(ims):
    x,y=(k%cols)*(w+10),(k//cols)*(h+36); d.text((x+6,y+6),t+' ms',fill=(255,255,255),font=F); o.paste(im,(x,y+30))
o.save(sys.argv[1])" ${OUT}/${nm}.png ${files.map(([f, t]) => f + ' ' + t).join(' ')}`);
    console.log(nm, 'T =', T);
    await ctx.close();
  }
  await b.close();
})();
