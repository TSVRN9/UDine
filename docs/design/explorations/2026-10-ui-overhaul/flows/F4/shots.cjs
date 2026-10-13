const {chromium} = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const url = 'file://' + __dirname + '/index.html';
(async () => {
  const b = await chromium.launch({executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 2});
  const states = (process.argv[2] || 'menu,filled,open,lift,logged,today,dinner,late-franklin,search,filter').split(',');
  for (const st of states) {
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(url + (st === 'menu' ? '' : '?state=' + st)); await p.waitForTimeout(1500);
    await p.screenshot({path: `/tmp/claude-1000/-home-tavern-Projects-js-UDine/3718f897-df0b-46b0-ad79-8b558c257cbe/scratchpad/flows/F4/s-${st}.png`});
    console.log(st, errs.join(' | ') || 'ok'); await p.close();
  }
  await b.close();
})();
