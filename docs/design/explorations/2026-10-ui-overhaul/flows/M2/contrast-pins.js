// AA for pinned-café photo cards: pin all 27, hide the text, and report the worst contrast of white text against the
// brightest background pixel under each text line's box (name: large text 3:1 applies only >=24px, so both lines use 4.5:1).
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/index.html'); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { S.pins = P.places.map(x => x[0]); renderPins(); });
  const N = await p.evaluate(() => document.querySelectorAll('#pins .pcard').length);
  await p.addStyleTag({ content: '#pins .pt{visibility:hidden}' });
  let worst = 99, out = [];
  for (let i = 0; i < N; i++) {
    const bx = await p.evaluate(i => { const c = document.querySelectorAll('#pins .pcard')[i]; c.scrollIntoView({ block: 'center' }); const n = c.querySelector('.pn'), s = c.querySelector('.ps');
      const r = e => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; }; return { name: n.textContent, n: r(n), s: r(s), off: s.classList.contains('off') }; }, i);
    for (const [k, rr, alpha] of [['name', bx.n, 1], ['status', bx.s, bx.off ? .85 : 1]]) {
      const buf = await p.screenshot({ clip: { x: rr[0], y: rr[1], width: Math.max(1, rr[2]), height: Math.max(1, rr[3]) } });
      const { execSync } = require('child_process');
      const L = +execSync(`python3 -c "
import sys,io
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
f=lambda c:(c/255/12.92 if c/255<=.03928 else ((c/255+.055)/1.055)**2.4)
print(max(.2126*f(r)+.7152*f(g)+.0722*f(b) for r,g,b in im.get_flattened_data()))"`, { input: buf }).toString();
      // text colour: white at alpha over the brightest pixel
      const fg = alpha * 1 + (1 - alpha) * L, cr = (Math.max(fg, L) + .05) / (Math.min(fg, L) + .05);
      out.push([bx.name, k, cr.toFixed(2)]); worst = Math.min(worst, cr);
    }
  }
  out.sort((a, b) => a[2] - b[2]); console.log(out.slice(0, 5).map(x => x.join(' ')).join('\n')); console.log('worst', worst.toFixed(2));
  await b.close();
})();
