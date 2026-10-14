// Prints page errors for each ?state=
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('ERR', e.message, e.stack.split('\n')[1]));
  for (const s of process.argv.slice(2)) { console.log('--', s); await p.goto('file://' + __dirname + '/../index.html?state=' + s); await p.waitForTimeout(500); }
  await b.close();
})();
