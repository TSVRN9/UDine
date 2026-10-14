const {chromium} = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 2});
  const p = await ctx.newPage(); await p.goto('file://' + process.argv[2] + '/index.html?state=filled'); await p.waitForTimeout(1000);
  const c = await ctx.newCDPSession(p);
  await c.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 195, y: 790}]});
  for (let y = 790; y >= 560; y -= 23) { await c.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: 195, y}]}); await p.waitForTimeout(30); }
  await p.waitForTimeout(400);
  await p.screenshot({path: process.argv[2] + '/shot-tray-midpull.png'});
  await c.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await b.close();
})();
