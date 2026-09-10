#!/usr/bin/env python3
"""Extract the UDine Mobile v2 artboards from a downloaded canvas artifact.

Usage:  python3 docs/design/extract.py <artifact.html>

Get <artifact.html> by reading the canvas URL in docs/design/README.md with the
Artifact tool (action: "read"); it saves the full page to a local file and prints
the path. The canvas keeps its whole editable state -- every .dc.html artboard
plus canvas.json -- as JSON in a <script id="appifact-doc"> block, so re-running
this after a canvas edit refreshes the committed copy in place.
"""
import json
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
block = re.search(
    r'<script[^>]*id=["\']appifact-doc["\'][^>]*>(.*?)</script>', src, re.S
)
if not block:
    sys.exit("no <script id='appifact-doc'> block -- is this a canvas artifact?")

out = pathlib.Path(__file__).parent
files = json.loads(block.group(1))["content"]["files"]
for name, body in sorted(files.items()):
    (out / name).write_text(body, encoding="utf-8")
print(f"wrote {len(files)} files to {out}/")
