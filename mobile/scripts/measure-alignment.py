#!/usr/bin/env python3
"""Measure the pixel offset between a colored UI marker (an icon/badge circle) and the nearest
text to its left, in a screenshot from mobile/scripts/screenshot.sh.

Why this exists: "looks centered" is not a check. This session's badge-centering bug (e753e24)
was missed by eye twice -- once by the implementer, once by a reviewer -- and only caught once
pixels were actually measured. This is that measurement, promoted from a one-off scratch script
into a documented, reusable tool instead of being reinvented (or skipped) next time.

Usage:
  measure-alignment.py SCREENSHOT.png --marker '#c99a2e' --marker-opacity 22 --marker-bg '#fbf7ef'
  measure-alignment.py SCREENSHOT.png --marker-rgb 240,227,197   # pre-composited color, if you
                                                                  # already know the exact pixel value

Finds every on-screen instance of the marker color (a tinted circle, a filled icon -- anything
with a known, distinct solid color), then for each instance scans a window to its LEFT for dark
text-ink pixels and reports both bounding boxes and the vertical/horizontal offset between their
centers. Multiple marker instances (e.g. one badge per visible row) are each reported separately.

Options:
  --marker HEX            Base color (e.g. a badge's accent color before opacity is applied).
                           Combine with --marker-opacity and --marker-bg to composite the actual
                           on-screen color, matching how RN's rgba()-over-a-card-background works.
  --marker-opacity PCT     0-100. Default 100 (opaque -- use with --marker-rgb-style solid colors).
  --marker-bg HEX          Background the marker composites over. Default #fbf7ef (this app's
                           paper50 card surface -- see mobile/src/lib/theme.ts). Ignored at 100% opacity.
  --marker-rgb R,G,B       Exact composited color to search for, if you already know it (skips
                           --marker/--marker-opacity/--marker-bg entirely).
  --marker-tol N           Per-channel match tolerance. Default 4.
  --dark-max R,G,B         A pixel counts as text ink if every channel is <= this (an upper-bound
                           threshold, not a delta from a target color -- anti-aliased glyph edges
                           span a range of darkness, so "dark enough" is the right test, not "close
                           to one exact color"). Default 90,80,80, tuned for this app's ink900
                           (#241a14) rendered at the font weights/sizes this file uses; pass one int
                           to use it for all three channels, or re-tune if measuring different text.
  --search-left N          How many px left of a marker to scan for text. Default 350.
  --search-margin N        Vertical px above/below a marker's own bounding box to include in the
                           text search band. Default 40.
  --json                   Emit machine-readable JSON instead of the human-readable report.

Exit status: 0 if at least one marker was found, 1 if none were (wrong color, wrong screenshot,
or the marker genuinely isn't on screen -- the message says which to check first).
"""
import argparse
import collections
import json
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: pip install Pillow (or `pnpm --filter mobile exec pip install Pillow`)", file=sys.stderr)
    sys.exit(2)


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def composite(fg: tuple[int, int, int], bg: tuple[int, int, int], opacity_pct: float) -> tuple[float, float, float]:
    a = opacity_pct / 100.0
    return tuple(a * f + (1 - a) * b for f, b in zip(fg, bg))


def find_color_clusters(arr, target, tol, min_run=3):
    """Returns a list of (y0, y1, x0, x1) bounding boxes for contiguous-ish y-bands of pixels
    matching `target` within `tol` per channel. Bands within 5px of each other merge (anti-
    aliased edges and sub-pixel gaps shouldn't split one visual marker into two)."""
    import numpy as np

    mask = (
        (abs(arr[:, :, 0].astype(int) - target[0]) <= tol)
        & (abs(arr[:, :, 1].astype(int) - target[1]) <= tol)
        & (abs(arr[:, :, 2].astype(int) - target[2]) <= tol)
    )
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return []
    yvals = sorted(set(ys.tolist()))
    bands = []
    cur = [yvals[0]]
    for y in yvals[1:]:
        if y - cur[-1] <= 5:
            cur.append(y)
        else:
            bands.append(cur)
            cur = [y]
    bands.append(cur)
    boxes = []
    for band in bands:
        y0, y1 = band[0], band[-1]
        sel = (ys >= y0) & (ys <= y1)
        xsel = xs[sel]
        if len(xsel) < min_run:
            continue
        boxes.append((y0, y1, int(xsel.min()), int(xsel.max())))
    return boxes


def find_text_cluster(arr, y0, y1, x_right, search_left, margin, dark_max):
    import numpy as np

    top = max(0, y0 - margin)
    bottom = y1 + margin
    left = max(0, x_right - search_left)
    band = arr[top:bottom, left:x_right]
    dark = (
        (band[:, :, 0].astype(int) <= dark_max[0])
        & (band[:, :, 1].astype(int) <= dark_max[1])
        & (band[:, :, 2].astype(int) <= dark_max[2])
    )
    ys, xs = np.where(dark)
    if len(ys) == 0:
        return None
    ys_abs = ys + top
    xs_abs = xs + left
    # Take the cluster of dark-pixel rows closest to the marker's own vertical center -- a search
    # band this wide can catch the row above/below too, and we want the same text line the marker
    # sits next to, not just "any text in the neighborhood".
    marker_cy = (y0 + y1) / 2
    counts = collections.Counter(ys_abs.tolist())
    rows_sorted = sorted(counts.keys())
    clusters = []
    cur = [rows_sorted[0]]
    for y in rows_sorted[1:]:
        if y - cur[-1] <= 3:
            cur.append(y)
        else:
            clusters.append(cur)
            cur = [y]
    clusters.append(cur)
    best = min(clusters, key=lambda c: abs((c[0] + c[-1]) / 2 - marker_cy))
    best_ys = [y for y in best]
    sel = np.isin(ys_abs, best_ys)
    xsel = xs_abs[sel]
    return (best[0], best[-1], int(xsel.min()), int(xsel.max()))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("screenshot")
    p.add_argument("--marker")
    p.add_argument("--marker-opacity", type=float, default=100)
    p.add_argument("--marker-bg", default="#fbf7ef")
    p.add_argument("--marker-rgb")
    p.add_argument("--marker-tol", type=int, default=4)
    p.add_argument("--dark-max", default="90,80,80")
    p.add_argument("--search-left", type=int, default=350)
    p.add_argument("--search-margin", type=int, default=40)
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if args.marker_rgb:
        target = tuple(int(v) for v in args.marker_rgb.split(","))
    elif args.marker:
        target = composite(hex_to_rgb(args.marker), hex_to_rgb(args.marker_bg), args.marker_opacity)
    else:
        p.error("pass --marker HEX (with --marker-opacity/--marker-bg as needed) or --marker-rgb R,G,B")

    dark_parts = [int(v) for v in args.dark_max.split(",")]
    dark_max = dark_parts * 3 if len(dark_parts) == 1 else dark_parts

    import numpy as np

    im = Image.open(args.screenshot).convert("RGB")
    arr = np.array(im)

    markers = find_color_clusters(arr, target, args.marker_tol)
    if not markers:
        print(
            f"No pixels matched marker color rgb{tuple(round(c) for c in target)} (tol {args.marker_tol}) "
            f"in {args.screenshot}. Check the color/opacity/bg args, and that the marker is actually "
            "on screen in this capture (not scrolled off, not behind a loading state).",
            file=sys.stderr,
        )
        sys.exit(1)

    results = []
    for y0, y1, x0, x1 in markers:
        marker_cx, marker_cy = (x0 + x1) / 2, (y0 + y1) / 2
        text = find_text_cluster(arr, y0, y1, x0, args.search_left, args.search_margin, dark_max)
        entry = {
            "marker_bbox": [x0, y0, x1, y1],
            "marker_center": [marker_cx, marker_cy],
        }
        if text is None:
            entry["text_bbox"] = None
            entry["vertical_offset"] = None
            entry["note"] = "no text found in the search window -- widen --search-left or check this marker has an adjacent label"
        else:
            ty0, ty1, tx0, tx1 = text
            text_cy = (ty0 + ty1) / 2
            entry["text_bbox"] = [tx0, ty0, tx1, ty1]
            entry["text_center_y"] = text_cy
            entry["vertical_offset"] = round(text_cy - marker_cy, 1)
        results.append(entry)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        for i, r in enumerate(results):
            mx, my = r["marker_center"]
            if r["text_bbox"] is None:
                print(f"marker[{i}] center=({mx:.0f},{my:.0f})  {r['note']}")
            else:
                off = r["vertical_offset"]
                verdict = "OK (<=1px)" if abs(off) <= 1 else f"MISALIGNED by {off:+.1f}px"
                print(f"marker[{i}] center=({mx:.0f},{my:.0f})  text_center_y={r['text_center_y']:.0f}  vertical_offset={off:+.1f}px  {verdict}")


if __name__ == "__main__":
    main()
