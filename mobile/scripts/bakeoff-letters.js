#!/usr/bin/env node
// Pre-renders the band's chenille varsity letters (HallLetter) to PNG at 1x/2x/3x, from the same paths the SVG drew: Oswald 700 at 210 px in a
// 200 px box, a white felt stroke (12) under a gold fill with a dashed maroon stitch. react-native-svg rasterises every Svg in software on the
// UI thread on every draw (invalidate drops the bitmap), and two 200 dp dashed letters cost the hall open its first 187 ms; an image does not.
// Needs rsvg-convert. Writes mobile/assets/bakeoff/letters/{W,F,H,B}{,@2x,@3x}.png (OFL glyphs, UDine's own drawing: committed).
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tokens = require("../../design-tokens/m2.json");

const X = tokens.letterX; // M2 `LX` (src/bakeoff/logic/letters.ts HALL_LX)
const BOX = tokens.size.letterBox, FONT = tokens.size.letterFont, C = tokens.color;
const ttf = path.join(__dirname, "../node_modules/@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf");
const out = path.join(__dirname, "../assets/bakeoff/letters");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "letters-"));
fs.mkdirSync(path.join(dir, "fonts"));
fs.copyFileSync(ttf, path.join(dir, "fonts/Oswald_700Bold.ttf"));
fs.writeFileSync(path.join(dir, "fonts.conf"), `<?xml version="1.0"?><fontconfig><dir>${dir}/fonts</dir><cachedir>${dir}/cache</cachedir></fontconfig>`);

for (const [letter, x] of Object.entries(X)) {
  const text = (extra) => `<text x="${x}" y="${BOX * 0.93}" font-family="Oswald" font-weight="700" font-size="${FONT}" ${extra}>${letter}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}">`
    + text(`fill="${C.white}" stroke="${C.white}" stroke-width="12" stroke-linejoin="round"`)
    + text(`fill="${C.gold}" stroke="${C.dm}" stroke-width="1.5" stroke-dasharray="5 4"`) + "</svg>";
  const src = path.join(dir, `${letter}.svg`);
  fs.writeFileSync(src, svg);
  for (const [suffix, k] of [["", 1], ["@2x", 2], ["@3x", 3]]) {
    execFileSync("rsvg-convert", ["-z", String(k), "-o", path.join(out, `${letter}${suffix}.png`), src], { env: { ...process.env, FONTCONFIG_FILE: path.join(dir, "fonts.conf") } });
  }
}
console.log("wrote", out);
