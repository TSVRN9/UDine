// Captures the hall transition during real playback (slowed 8x via ?slow=8) for open and close,
// and the scroll-scrubbed collapse; writes build/fr/{open,close}-NN.png for strip assembly.
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const hall = process.argv[2] || 'H'; require('fs').mkdirSync(__dirname + '/build/fr', { recursive: true });
  await p.goto('file://' + __dirname + '/index.html?slow=8'); await p.waitForTimeout(500);
  const grab = async (tag, n) => { const xs = []; for (let i = 0; i < n; i++) { await p.screenshot({ path: `build/fr/${tag}-${String(i).padStart(2, '0')}.png` }); xs.push(await p.evaluate(() => XP)); } return xs; };
  await p.locator(`.band[data-h=${hall}]`).click();
  console.log('open p:', (await grab('open', 14)).map(x => x.toFixed(2)).join(' '));
  await p.waitForTimeout(4500);
  await p.locator('#mctl [data-act=back]').click();
  console.log('close p:', (await grab('close', 14)).map(x => x.toFixed(2)).join(' '));
  await b.close();
})();
