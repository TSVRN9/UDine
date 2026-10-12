# UDine design directions: shared brief

UDine is a calorie and macro tracker for UMass Amherst Dining (four halls: Worcester, Franklin, Hampshire and Berkshire). Its main job is to let a student between classes pick a hall that's open now, build a plate from today's real menu, and log it in seconds.

The owner says the current app feels "empty, generic, and janky", and wants it to feel ergonomic, smooth and native. We're exploring three directions. Each direction draws the same three screens.

## Deliverable (per direction)

Write three files into `/tmp/claude-1000/-home-tavern-Projects-js-UDine/3718f897-df0b-46b0-ad79-8b558c257cbe/scratchpad/directions/<Dn>/`:

1. `<Dn>Home.dc.html`: Home screen. Shows today's date and meal, the four hall cards with live open/closed status and Grab 'N Go, and a short "Cafés & markets" list.
2. `<Dn>HallMenu.dc.html`: Worcester, lunch tab selected. Header with back, hall name, info and a date stepper. Meal tabs: Breakfast, Lunch, Dinner, Late night, Grab 'N Go. The dish list is grouped by station. Golden BBQ Chicken Thigh (×2, Grill Station) and Beef Brisket Noodle Bowl (×1, Noodle Bowl) are already on the plate and show their quantity steppers. The station scrubber sits on the right edge (one segment per station, the current one highlighted). The plate bar is at the bottom ("3 items, 404 cal", protein, Log).
3. `<Dn>PlateSheet.dc.html`: the same hall menu dimmed behind an open plate sheet at its medium detent. It shows a grabber, "Your plate" with Worcester lunch context, two dishes with quantity steppers, totals for calories, protein, carbs and fat, a primary "Log 3 items" action, and a secondary "Add something else" search entry.

Also write `<Dn>/NOTES.md`, containing:
- (a) the token plan: 4–6 named hex values, typefaces and their roles, the type scale, radii and spacing;
- (b) your self-review against the generic-tells list, with what you changed and why;
- (c) a motion and feel spec: sheet detents, which moments get haptics, press feedback, and the one signature motion. Durations go in ms, and easings as cubic-bezier.

NOTES.md becomes a canvas annotation, so it's the only place rationale is allowed.

## Artboard file format (must match exactly)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=...&display=swap");
    body { margin: 0; font-family: ...; background: ...; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; overflow: hidden; position: relative; box-sizing: border-box; ...">
  ... plain HTML, INLINE styles only (tests grep hex/px straight out of style attributes), inline SVG icons ...
</div>
</x-dc>
</body>
</html>
```

The rules:
- **No JS.** No classes, except in the helmet `<style>` if truly needed.
- **No status bar chrome, no device frame.** The 390×844 frame is the screen.
- **Fonts:** Google Fonts only.
- **Target size:** keep each file around 8–20KB.

## Hard rules

- **No explanatory captions anywhere in the artboards.** No "tap to…" text, no labels that describe what an element is, no legends, no rationale. Product copy a real student would read is fine. Rationale goes in NOTES.md only.
- **Use real content.** These are Worcester's real menu items for 2026-10-08 (cal / protein per serving):
  - Grill Station: Black Bean Burger 160/7g, Golden BBQ Chicken Thigh 93/13.3g, Halal Burger Patty 144/12.6g, Halal French Fries 193/1.8g
  - Noodle Bowl: Beef Brisket Noodle Bowl 218/12.3g, Bean Sprouts 2/0.2g, Hard Boiled Egg 111/10.7g
  - Street Food: Mee Goreng 107/4.3g, Braised Pulmuone Tofu 123/9.2g, Vegetable Spring Rolls 158/1.1g, Stir Fry Green Vegetables 34/1.9g
  - Tandoor: Baked Salmon w/Paprika Ginger Eggplant Sauce 155/13.1g, Cumin Basmati Rice 138/2.5g, Chickpea Salad w/Teardrop Peppers & Artichoke Hearts 115/3.4g
  - Mediterranean: Baked Italian Sausage w/Potatoes & Onions 199/12.4g, Fettuccini Pasta 149/5.2g, Basil Cream Pesto Sauce 203/3.4g
  - Soups: Green Chile Posole 62/1.9g, Roasted Red Pepper & Smoked Gouda Bisque 176/4.1g
  - Desserts: Chocolate Soft Serve Ice Cream 222/3.9g, Vanilla Soft Serve Ice Cream 169/2.6g

  Show 2–3 stations in view on the menu screen; the scrubber implies the 7 stations above. The plate has Beef Brisket Noodle Bowl ×1 and Golden BBQ Chicken Thigh ×2 (218 + 186 = 404 cal, 38.9g protein). Use your own judgment for consistent carbs and fat. Fix the bar and sheet numbers to match the plate.
- **Real hall status for a Wednesday at 12:40 PM:**
  - Worcester: open until 9 PM
  - Franklin: open until 7 PM
  - Hampshire: open until 9 PM
  - Berkshire: closed, opens 4:30 PM
  - Grab 'N Go: about 7 PM
  - Cafés: Blue Wall (Campus Center, open until 8 PM); Harvest Market (Worcester Commons, opens 11 AM, so open now); People's Organic Coffee (Franklin Patio, open until 4 PM)

  Write status in plain sentence-case language, e.g. "Open until 9". Don't build "OPEN · CLOSES 9:00 PM" strings.
- **Touch targets:** at least 44px. The text contrast must pass AA.

## Generic tells to avoid (unless your direction's plan explicitly justifies one)

These are what make the current app read as generic:
- warm cream ground (around #F4F1EA / #f3ead8);
- tracked uppercase labels everywhere;
- monospace for small data labels (the current app uses `ui-monospace` for "320 cal · 11g protein");
- meta strings joined with middle dots;
- the SaaS card kit: every item an identical rounded card with the same radius and a soft grey shadow;
- near-black #111 standing in for black;
- a '→' appended to buttons;
- "big number + small label + gradient" hero stats;
- one-word accent in headlines;
- numbered 01/02/03 markers on non-sequences.

Spend boldness in one place; keep everything else quiet. Before leaving the house, remove one accessory.

## Self-critique loop (required)

Render each artboard and look at it:

```
~/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell --headless --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=4000 --screenshot=<out>.png file://<abs path to .dc.html>
```

If that path differs, `ls ~/.cache/ms-playwright/chromium_headless_shell-1234/` and find the binary. Read the PNG and fix what looks off, at least two passes per screen. Leave the final PNGs next to the HTML as `<Dn>Home.png` etc.

## Your direction

(see the dispatch prompt)
