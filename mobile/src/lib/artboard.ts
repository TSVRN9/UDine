// Reads design values straight out of the committed artboards (docs/design/*.dc.html) so parity
// tests assert against the spec file instead of a number someone copied by eye. A canvas edit +
// extract.py then shows up as red tests, not as a 48-ticket audit.
//
// The artboards are inline-styled HTML, so this is a regex reader, not an HTML parser:
// `artboardStyle` matches the innermost tag whose immediately-following text contains the anchor.
// ponytail: text anchors only — an element with no text of its own (a bare rule/divider) can't be
// addressed; add an `nth`-tag selector if a test ever needs one.
import fs from "node:fs";
import path from "node:path";

const DESIGN_DIR = path.join(__dirname, "..", "..", "..", "docs", "design");

export type ArtboardStyle = Record<string, number | string>;
export type ArtboardTransition = { prop: string; ms: number; curve: string };

const cache = new Map<string, string>();
function read(file: string): string {
  let src = cache.get(file);
  if (src === undefined) {
    src = fs.readFileSync(path.join(DESIGN_DIR, file), "utf8");
    cache.set(file, src);
  }
  return src;
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` → `rgba(r,g,b,a)` so theme and artboard spellings compare equal. */
export function normalizeColor(value: string): string {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex) {
    const h = hex.length <= 4 ? hex.split("").map((c) => c + c).join("") : hex;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    const a = h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1;
    return `rgba(${n(0)},${n(2)},${n(4)},${a})`;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v)?.[1];
  if (rgb) {
    const [r, g, b, a = "1"] = rgb.split(",").map((s) => s.trim());
    // Round alpha the same way the hex branch does, so "rgba(…,0.502)" and "#…80" (which rounds
    // 0x80/255 to 0.50) compare equal instead of failing on a spelling difference.
    return `rgba(${r},${g},${b},${Math.round(Number(a) * 100) / 100})`;
  }
  return v;
}

const isColor = (v: string) => /^(#|rgba?\()/.test(v.trim());
const px = (v: string) => Number(v.replace("px", ""));

/** The CSS subset the artboards use, mapped to React Native style props. Anything else is dropped, never guessed. */
function toRnStyle(css: string): ArtboardStyle {
  const out: ArtboardStyle = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    switch (prop) {
      case "font-size": out.fontSize = px(value); break;
      case "letter-spacing": out.letterSpacing = px(value); break;
      case "line-height": out.lineHeight = px(value); break;
      case "font-weight": out.fontWeight = value; break;
      case "text-transform": out.textTransform = value; break;
      case "color": out.color = normalizeColor(value); break;
      case "background":
      case "background-color": if (isColor(value)) out.backgroundColor = normalizeColor(value); break;
      case "opacity": out.opacity = Number(value); break;
      case "gap": out.gap = px(value); break;
      case "width": out.width = px(value); break;
      case "height": out.height = px(value); break;
      case "border-radius": out.borderRadius = px(value); break;
      case "align-items": out.alignItems = value; break;
      case "padding": {
        const [t, r = t, b = t, l = r] = value.split(/\s+/).map(px);
        if (t === b && r === l) Object.assign(out, { paddingVertical: t, paddingHorizontal: r });
        else Object.assign(out, { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l });
        break;
      }
      case "margin-top": out.marginTop = px(value); break;
      case "padding-top": out.paddingTop = px(value); break;
      case "padding-right": out.paddingRight = px(value); break;
      case "padding-bottom": out.paddingBottom = px(value); break;
      case "padding-left": out.paddingLeft = px(value); break;
      case "border": {
        const m = /^([\d.]+)px\s+\w+\s+(.+)$/.exec(value);
        if (m) Object.assign(out, { borderWidth: Number(m[1]), borderColor: normalizeColor(m[2]) });
        break;
      }
    }
  }
  return out;
}

/** Inline style of the `nth` element on `file` whose own text contains `anchorText`. Throws if absent. */
export function artboardStyle(file: string, anchorText: string, nth = 0): ArtboardStyle {
  const tag = /<(\w+)\b([^>]*)>([^<]*)/g;
  let seen = 0;
  for (let m = tag.exec(read(file)); m; m = tag.exec(read(file))) {
    if (!m[3].replace(/\s+/g, " ").includes(anchorText)) continue;
    if (seen++ < nth) continue;
    const style = /style="([^"]*)"/.exec(m[2])?.[1] ?? "";
    return toRnStyle(style);
  }
  throw new Error(`artboard ${file}: no element #${nth} with text "${anchorText}"`);
}

/** Attributes (plus the parsed inline `style`) of the first tag whose opening-tag text contains
 * `anchor` -- the way in to an element with no text of its own: an `<svg>`/`<path>` (anchor on
 * `d="M15 5l-7 7 7 7"`, `viewBox="0 0 20 20"`) or a bare divider (anchor on its style string). */
export function artboardTag(file: string, anchor: string): { attrs: Record<string, string>; style: ArtboardStyle } {
  const tag = /<(\w+)\b([^>]*)>/g;
  for (let m = tag.exec(read(file)); m; m = tag.exec(read(file))) {
    if (!m[2].includes(anchor)) continue;
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    return { attrs, style: toRnStyle(attrs.style ?? "") };
  }
  throw new Error(`artboard ${file}: no tag whose attributes contain "${anchor}"`);
}

/** Style of the `nth` occurrence of a bare `<tag>` in document order (0-indexed), regardless of
 * its own text content -- the nth-tag selector this file's header comment invites for an element
 * with no text of its own (e.g. a full-bleed banner image div) that `artboardStyle`'s text-anchor
 * can't address. */
export function artboardNthStyle(file: string, tag: string, nth: number): ArtboardStyle {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  let seen = 0;
  for (let m = re.exec(read(file)); m; m = re.exec(read(file))) {
    if (seen++ < nth) continue;
    const style = /style="([^"]*)"/.exec(m[1])?.[1] ?? "";
    return toRnStyle(style);
  }
  throw new Error(`artboard ${file}: no <${tag}> #${nth}`);
}

/**
 * Style of the `up`-th enclosing `<div>` around the first occurrence of `anchorText` -- for a
 * container styled around a nested icon+label (e.g. a spinner + "Looking up…" row) whose own
 * immediate text is empty, so `artboardStyle`'s leaf-text match can't reach it (see this file's
 * header comment). `up=0` is the label's own immediate div (same element `artboardStyle` would
 * find); `up=1`/`up=2` climb past icon-row wrapper divs to the actual pill container. Tracks only
 * `<div>` open/close pairs (not the icon's `<svg>`/`<circle>`/`<path>`), so it stays a few lines
 * instead of a real HTML parser -- fine for these artboards' div-based layout.
 */
export function artboardEnclosingStyle(file: string, anchorText: string, up: number): ArtboardStyle {
  const src = read(file);
  const idx = src.indexOf(anchorText);
  if (idx < 0) throw new Error(`artboard ${file}: no element containing text "${anchorText}"`);
  const stack: string[] = []; // style attrs of currently-open <div>s, outermost first
  const divTag = /<div\b([^>]*)>|<\/div>/g;
  for (let m = divTag.exec(src); m && m.index < idx; m = divTag.exec(src)) {
    if (m[0] === "</div>") stack.pop();
    else stack.push(/style="([^"]*)"/.exec(m[1])?.[1] ?? "");
  }
  const style = stack[stack.length - 1 - up];
  if (style === undefined) throw new Error(`artboard ${file}: no enclosing <div> #${up} around "${anchorText}"`);
  return toRnStyle(style);
}

/**
 * The bottom-sheet panel's own `gap` -- the uniform space every `*.dc.html` sheet artboard puts
 * between its direct rows (handle, title row, section rows, …), CSS's flex `gap` collapsing what
 * `artboardStyle`'s leaf-text anchor and `artboardEnclosingStyle`'s div-climb can't reach: a
 * container's own layout property when nothing written inside it is unique text. Every sheet panel
 * shares the same `border-radius: 12px 12px 0 0` corner treatment (the bottom-sheet convention
 * across `docs/design/*.dc.html`), so that's the anchor, not a fragile tag position.
 */
export function artboardPanelGap(file: string): number {
  const m = /<div style="([^"]*border-radius:\s*12px 12px 0 0[^"]*)"/.exec(read(file));
  if (!m) throw new Error(`artboard ${file}: no bottom-sheet panel div (border-radius: 12px 12px 0 0)`);
  const gap = toRnStyle(m[1]).gap;
  if (typeof gap !== "number") throw new Error(`artboard ${file}: panel div has no gap`);
  return gap;
}

/** Every `transition:` / `animation:` declaration in the artboard's <style> rules, keyed by selector. */
export function artboardTransitions(file: string): Record<string, ArtboardTransition[]> {
  const out: Record<string, ArtboardTransition[]> = {};
  const rule = /([.#\w-]+)\s*\{([^}]*)\}/g;
  const styles = (read(file).match(/<style>[\s\S]*?<\/style>/g) ?? []).join("\n");
  for (let m = rule.exec(styles); m; m = rule.exec(styles)) {
    for (const decl of m[2].split(";")) {
      const [prop, value] = decl.split(/:(.+)/).map((s) => s?.trim());
      if (prop !== "transition" && prop !== "animation") continue;
      // split on commas outside parentheses (cubic-bezier has its own commas)
      for (const part of value.split(/,(?![^(]*\))/)) {
        const words = part.trim().split(/\s+/);
        const durIdx = words.findIndex((w) => /^[\d.]+m?s$/.test(w));
        if (durIdx < 0) continue;
        const dur = words[durIdx];
        const ms = dur.endsWith("ms") ? Number(dur.slice(0, -2)) : Number(dur.slice(0, -1)) * 1000;
        const curve = /(cubic-bezier\([^)]*\)|ease(?:-in-out|-in|-out)?|linear)/.exec(part)?.[1] ?? "ease";
        (out[m[1]] ??= []).push({ prop: prop === "animation" ? "animation" : words[0], ms, curve });
      }
    }
  }
  return out;
}
