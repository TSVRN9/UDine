#!/usr/bin/env node
// Pre-renders the kit's small drawn glyphs to PNG from the paths the SVGs drew: chevrons, + / -, the tick, the diet patch glyphs, the dish sheet's marks,
// and the score tiles (the pictogram and its figure in Oswald 600). react-native-svg rasterises every Svg in software on the UI thread whenever one mounts
// (and a row remount mounts several), and each mount dispatches a layout event Reanimated tries to apply to a tag that may not be mounted yet.
// An Image is neither. Chevrons, +, - and the tick are white and tinted (`tintColor`); the rest carry their own colours.
// Needs rsvg-convert. Writes mobile/assets/bakeoff/glyphs/*.png (UDine's own drawing, OFL type: committed).
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const t = require("../../design-tokens/m2.json");
const C = t.color;
const out = process.env.BAKEOFF_OUT || path.join(__dirname, "../assets/bakeoff/glyphs");
const ttf = path.join(__dirname, "../node_modules/@expo-google-fonts/oswald/600SemiBold/Oswald_600SemiBold.ttf");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glyphs-"));
fs.mkdirSync(path.join(dir, "fonts"));
fs.copyFileSync(ttf, path.join(dir, "fonts/Oswald_600SemiBold.ttf"));
fs.writeFileSync(path.join(dir, "fonts.conf"), `<?xml version="1.0"?><fontconfig><dir>${dir}/fonts</dir><cachedir>${dir}/cache</cachedir></fontconfig>`);
const env = { ...process.env, FONTCONFIG_FILE: path.join(dir, "fonts.conf") };

const png = (name, w, h, body, px) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  const src = path.join(dir, `${name}.svg`);
  fs.writeFileSync(src, svg);
  execFileSync("rsvg-convert", ["-w", String(px), "-o", path.join(out, `${name}.png`), src], { env });
};
const stroke = (d, w, color = "#fff") => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// white, tinted at the call site: the stroke widths are the ones the SVGs had (2.2 in the 24 box, 2.4 and 2 in the 18 box)
png("chevron-back", 24, 24, stroke("M15 5l-7 7 7 7", 2.2), 96);
png("chevron-forward", 24, 24, stroke("M9 6l6 6-6 6", 2.2), 96);
png("chevron-down", 18, 18, stroke("M4 7l5 5 5-5", 2.4), 96);
png("chevron-down-thin", 18, 18, stroke("M4 7l5 5 5-5", 2), 96);
png("plus", 24, 24, stroke("M12 5v14M5 12h14", 2.4), 96);
png("minus", 24, 24, stroke("M5 12h14", 2.4), 96);
png("tick", 16, 16, stroke("M2.5 8.5l4 4 7-8", 2.5), 96);

const dm = C.dm, wh = C.white;
const plant = `<path d="M8 15.2V8" stroke="${dm}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M7.6 9.6C7.6 5.6 5.4 3.4 1 3.4 1 7.6 3.4 9.6 7.6 9.6Z M8.4 8.2C8.4 4.2 10.8 1.4 15 1.4 15 5.6 12.6 8.2 8.4 8.2Z" fill="${dm}"/>`;
const veg = `<path d="M3 13C3 6 7 3 13.5 2.5 13.5 9 10 13 3 13Z" fill="${dm}"/><path d="M3 13 9 7" stroke="${wh}" stroke-width="1.2" fill="none"/>`;
const halal = `<circle cx="8" cy="8" r="6" fill="none" stroke="${dm}" stroke-width="1.5"/><path d="M5.5 5v6M10.5 5v6M5.5 8h5" stroke="${dm}" stroke-width="1.5"/>`;
const local = `<path d="M8 14.5S3 9.6 3 6.5a5 5 0 0 1 10 0c0 3.1-5 8-5 8Z" fill="none" stroke="${dm}" stroke-width="1.5"/><circle cx="8" cy="6.5" r="1.6" fill="${dm}"/>`;
const sus = `<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke="${dm}" stroke-width="1.5"/>`;
for (const [n, b] of Object.entries({ plant, veg, halal, local, sus })) png(`mark-${n}`, 16, 16, b, 96);

// M2's FOOT / HEART pictograms in the 24 x 30 tile
const FOOT = "M15.6 2.3a2 2 0 1 1 0 4a2 2 0 0 1 0-4ZM11.3 1.9a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3ZM7.6 3.15a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5ZM4.2 12.4C4.2 8.9 7.6 7.4 12 7.4s7.8 1.5 7.8 5c0 3-1.4 4.6-1.4 8 0 4.4-2.6 7.4-6.4 7.4s-6.4-3-6.4-7.4c0-3.4-1.8-5-1.8-8Z";
const HEART = "M12 27.6C5.9 23.2 1.8 19.4 1.8 12.9 1.8 8.7 4.7 5.6 8.4 5.6c1.6 0 2.9.7 3.6 2 .7-1.3 2-2 3.6-2 3.7 0 6.6 3.1 6.6 7.3 0 6.5-4.1 10.3-10.2 14.7Z";
const tile = (kind, value, bg, ink, edge) => {
  const carbon = kind === "carbon";
  return `<rect x="0.5" y="0.5" width="23" height="29" rx="4.5" fill="${bg}"${edge ? ` stroke="${ink}" stroke-opacity="0.55"` : ""}/>`
    + `<path d="${carbon ? FOOT : HEART}" fill="${wh}"/>`
    + `<text x="12" y="${carbon ? 22.9 : 20.6}" text-anchor="middle" fill="${ink}" font-family="Oswald" font-weight="600" font-size="${t.type.tile.size}">${value}</text>`;
};
t.grade.health.tiles.forEach((bg, i) => png(`score-health-${i}`, 24, 30, tile("health", i, bg, t.grade.health.ink, i < 4), 96));
for (const [k, v] of Object.entries(t.grade.carbon)) png(`score-carbon-${k}`, 24, 30, tile("carbon", k, v.tile, v.ink, ["B", "C", "D"].includes(k)), 96);
console.log("wrote", out);
