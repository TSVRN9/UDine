// Round 13 hall open/close strips: node shots13h.js [out-dir] [hall] [src-html]. 390 wide, dpr 1: open and close, 12 frames each, evenly spaced
// in eased progress, and the slow predictive-back scrub at p .1, .3, .5. The run is frozen after its first frame and painted at each p.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const { execSync } = require('child_process');
const D = __dirname, OUT = D + '/build/r12/' + (process.argv[2] || 'p7'), HALL = process.argv[3] || 'W', SRC = process.argv[4] || D + '/index.html'; require('fs').mkdirSync(OUT, { recursive: true });
const sheet = (name, files) => execSync(`python3 -c "
import sys
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',22)
args=sys.argv[2:]; ims=[(Image.open(args[i]),args[i+1]) for i in range(0,len(args),2)]
w,h=ims[0][0].size; cols=6 if len(ims)>6 else len(ims); rows=(len(ims)+cols-1)//cols
o=Image.new('RGB',((w+10)*cols,(h+36)*rows),(60,60,60)); d=ImageDraw.Draw(o)
for k,(im,t) in enumerate(ims):
    x,y=(k%cols)*(w+10),(k//cols)*(h+36); d.text((x+6,y+6),t,fill=(255,255,255),font=F); o.paste(im,(x,y+30))
o.save(sys.argv[1])" ${OUT}/${name}.png ${files.map(([f, t]) => f + ' ' + t.replace(/ /g, '_')).join(' ')}`);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const mk = async w => { const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} });
    const p = await ctx.newPage(); await p.goto('file://' + SRC); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600); return [ctx, p]; };
  const N = 12;
  for (const w of [390, 360]) {
    // open
    let [ctx, p] = await mk(w); let files = [];
    await p.evaluate(h => { openHall(h, false, document.querySelector(`#bands .band[data-h=${h}]`)); cancelAnimationFrame(xfRaf); }, HALL);
    for (let i = 0; i < N; i++) { const k = i / (N - 1); await p.evaluate(k => { XP = EMPH(k); paint(XP, 0); }, k); await p.waitForTimeout(60);
      const pv = await p.evaluate(() => XP.toFixed(2)); const f = `${OUT}/open${w}-${i}.png`; await p.screenshot({ path: f }); files.push([f, 'p ' + pv]); }
    sheet('open' + w, files); await ctx.close();
    // close, and the scrub
    [ctx, p] = await mk(w); files = [];
    await p.evaluate(h => { openHall(h, true, null, {}); }, HALL); await p.waitForTimeout(600);
    await p.evaluate(h => { const src = document.querySelector(`#bands .band[data-h=${h}]`); S.hallSrc = src; }, HALL);
    await p.evaluate(() => { closeHall(); cancelAnimationFrame(xfRaf); });
    for (let i = 0; i < N; i++) { const k = i / (N - 1); await p.evaluate(k => { XP = 1 - EMPH(k); paint(XP, 0); }, k); await p.waitForTimeout(60);
      const pv = await p.evaluate(() => XP.toFixed(2)); const f = `${OUT}/close${w}-${i}.png`; await p.screenshot({ path: f }); files.push([f, 'p ' + pv]); }
    sheet('close' + w, files);
    files = [];
    for (const pv of [.1, .3, .5]) { await p.evaluate(pv => { XP = pv; paint(pv, 0); }, pv); await p.waitForTimeout(60); const f = `${OUT}/scrub${w}-${pv}.png`; await p.screenshot({ path: f }); files.push([f, 'back p ' + pv]); }
    sheet('scrub' + w, files); await ctx.close();
  }
  await b.close();
})();
