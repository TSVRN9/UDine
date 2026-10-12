// Endpoint check for the hall transition: the frames where a pop could hide.
//  halls-before vs progress=0 (per hall), progress=1 vs menu at rest, halls after close vs before; also with reduced motion.
// Writes build/ep/*.png; endpoints.py diffs the pairs.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const fs = require('fs'); fs.mkdirSync(__dirname + '/build/ep', { recursive: true });
const U = 'file://' + __dirname + '/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  for (const rm of ['no-preference', 'reduce']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: rm });
    const shot = async n => { /* let the busy-meter fill-in finish */ await p.waitForTimeout(900); await p.screenshot({ path: `build/ep/${rm}-${n}.png` }); };
    for (const h of ['W', 'F', 'H', 'B']) {
      if (rm === 'no-preference') {
        await p.goto(U); await shot(`before-${h}`);
        await p.goto(U + `?progress=0&hall=${h}`); await shot(`p0-${h}`);
        await p.goto(U + `?progress=1&hall=${h}`); await shot(`p1-${h}`);
        await p.goto(U + `?state=menu&hall=${h}`); await shot(`rest-${h}`);
      }
      await p.goto(U); await shot(`open0-${h}`);
      await p.locator(`.band[data-h=${h}]`).click(); await p.waitForTimeout(900);
      await p.evaluate(() => { document.querySelector('#mscroll').scrollTop = 300; }); await p.waitForTimeout(200);
      await p.locator('#mctl [data-act=back]').click(); await p.waitForTimeout(1300);
      await shot(`closed-${h}`);
    }
    await p.close();
  }
  await b.close();
})();
