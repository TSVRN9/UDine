#!/usr/bin/env python3
"""Add a "Directions" page to the canvas artifact HTML: 3 directions x (Home, HallMenu, PlateSheet), NOTES.md as annotations.

usage: merge.py <canvas.html in> <out.html>
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
PAGE = {"id": "page-13", "name": "Directions (2026-10)"}
ROWS = [("D1", "D1 — Push the identity"), ("D2", "D2 — Open exploration"), ("D3", "D3 — Native-first restraint")]
COLS = [("Home", "Home"), ("HallMenu", "Hall menu"), ("PlateSheet", "Plate sheet")]

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r'(<script[^>]*id=["\']appifact-doc["\'][^>]*>)(.*?)(</script>)', src, re.S)
doc = json.loads(m.group(2))
files = doc["content"]["files"]
cj = json.loads(files["canvas.json"])

cj["pages"] = [p for p in cj["pages"] if p["id"] != PAGE["id"]] + [PAGE]
cj["artboards"] = [a for a in cj["artboards"] if a.get("page") != PAGE["id"]]
cj["annotations"] = [a for a in cj["annotations"] if a.get("page") != PAGE["id"]]
for r, (d, dname) in enumerate(ROWS):
    for c, (screen, sname) in enumerate(COLS):
        name = f"{d}{screen}.dc.html"
        files[name] = (HERE / d / name).read_text(encoding="utf-8")
        cj["artboards"].append({"file": name, "x": c * 450, "y": r * 960, "w": 390, "h": 844,
                                "title": f"{dname} / {sname}", "page": PAGE["id"]})
    cj["annotations"].append({"id": f"direction-{d.lower()}", "x": 1350, "y": r * 960, "w": 520,
                              "text": (HERE / d / "NOTES.md").read_text(encoding="utf-8"), "page": PAGE["id"]})
files["canvas.json"] = json.dumps(cj, indent=2, ensure_ascii=False)

payload = json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")
out = src[: m.start(2)] + "\n" + payload + "\n" + src[m.end(2):]
pathlib.Path(sys.argv[2]).write_text(out, encoding="utf-8")
# round-trip check
m2 = re.search(r'<script[^>]*id=["\']appifact-doc["\'][^>]*>(.*?)</script>', out, re.S)
assert json.loads(m2.group(1))["content"]["files"]["D1Home.dc.html"] == files["D1Home.dc.html"]
print("ok", len(out))
