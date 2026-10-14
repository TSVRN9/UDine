// AA check: hides the text, screenshots, and reports the worst contrast of white text over the brightest
// background pixel under each text box (bands on Halls, each expanded hall header). Run: node contrast.js && python3 contrast.py
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
const fs = require('fs'); fs.mkdirSync(__dirname + '/build/ct', { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const out = {};
  const grab = async (key, sel, hide) => {
    await p.waitForTimeout(700);
    out[key] = await p.evaluate(([sel, hide]) => { const r = [...document.querySelectorAll(sel)].map(e => [e.className || e.id, e.closest('.nm,#mtn') ? 1 : .86, ...[...Object.values(e.getBoundingClientRect().toJSON())].slice(0, 0), Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().right), Math.round(e.getBoundingClientRect().bottom)]);
      document.querySelectorAll(hide).forEach(e => e.style.visibility = 'hidden'); return r; }, [sel, hide]);
    await p.screenshot({ path: `build/ct/${key}.png` });
  };
  await p.goto('file://' + __dirname + '/index.html'); await grab('bands', '.band .bt .nm, .band .bt .st, .band .bt .bz span:not(.meter)', '.band .bt');
  for (const h of 'WFHB') { await p.goto('file://' + __dirname + '/index.html?state=menu&hall=' + h); await grab(h, '#mtn, #mts, #mbz span:not(.meter)', '#mt'); }
  fs.writeFileSync(__dirname + '/build/ct/boxes.json', JSON.stringify(out)); await b.close();
})();
