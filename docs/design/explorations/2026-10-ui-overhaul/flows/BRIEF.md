# UDine flow experiments: shared brief

UDine is a calorie and macro tracker for UMass Amherst Dining. Today's designs (D1–D3, see `../directions/`) are reskins of a single flow, and the owner wants **genuinely different UX flows**, not new skins. Each agent prototypes one flow concept as a **clickable, touch-driven prototype** that the owner will try on a real phone. Their test is whether it feels ergonomic, smooth and native.

## The current flow (the baseline you're trying to beat)

Home (list of 4 halls + cafés) → tap a hall → hall menu: meal tabs, a long station-grouped dish list, a right-edge station scrubber, `+` buttons that become steppers → plate bar at the bottom → plate sheet → Log.

Here is the benchmark task, with today's step count:
- **Task:** "At Worcester lunch, log Beef Brisket Noodle Bowl ×1 and Golden BBQ Chicken Thigh ×2."
- **Today:** about 5 taps plus scrolling past roughly 20 dishes to find them.
- **Pain the owner named:** it feels empty and generic, sheets feel janky, and the hall menu scroll/swipe is awkward.

Other features that exist and must still have a home somewhere (you don't have to prototype them, but your flow mustn't make them impossible):
- dietary filters and favorites
- half servings
- the bowl composer for build-your-own stations
- search plus custom foods for off-menu items
- Beli-style head-to-head dish ranking, which also derives favorite halls
- cafés
- events and newsletter
- the You pane: today's totals, logs, data export

## Product constraints (non-negotiable)

- **Health data stays on the device.** The consumption log, macro history, rankings and comparisons never leave the device. Don't design any flow that implies uploading them. For example, don't write "friends see what you ate".
- **Anonymous first.** Everything in the core loop works without an account.
- **The menu is source of truth.** Use the real data in `menu-2026-10-08.json`, Thursday Oct 8 2026: all 4 halls, every meal, real stations, dishes and macros. Embed whatever subset you need. Assume it's **Thursday 12:40 PM** and all four halls are serving lunch.
- **No explanatory captions in the UI.** No "tap to…", "swipe to…", "this shows…", coach marks, legends or rationale text. If a gesture needs explaining, the interaction isn't done. Real end-user copy is fine: an empty-state message, a button label. Rationale goes in NOTES.md only.
- **Minimum 44px touch targets, AA contrast,** and `prefers-reduced-motion` respected.

## Visual baseline

So the owner compares flows rather than skins, use **D3's tokens** (`../directions/D3/NOTES.md`, rendered example `../directions/D3/*.png`) as the neutral baseline: iOS-style, system font with Inter fallback, maroon tint #881c1c. Deviate only where your flow needs a component that doesn't exist yet, and note it.

## Deliverable

In `flows/<F>/`:

1. **`index.html`**, a single self-contained file.
   - Vanilla JS and CSS. Google Fonts is the only external resource. No frameworks, no CDNs.
   - The UI lives in a 390×844 frame centered on desktop. On a phone (viewport ≤ 500px wide) it fills the screen edge to edge and uses safe-area insets.
   - **Make it feel real.**
     - Use pointer events for drags and swipes, with real momentum and snap.
     - Sheets drag between detents and rubber-band at their limits.
     - Press states respond within 100ms.
     - Transitions use spring-like cubic-beziers, with no layout jank (transform and opacity only).
     - Call `navigator.vibrate(…)` at haptic moments, guarded so it's a no-op where unsupported.
   - **The whole benchmark task must be completable end to end,** through to a "logged" confirmation and the updated daily total. Secondary paths can be shallow but must not dead-end; at minimum a non-broken screen is required.
   - Keep state in memory only. localStorage is fine, wrapped in try/catch.
   - Target size is under 150KB including embedded data.
2. **`NOTES.md`**, covering:
   - (a) the flow in 5–8 lines, with an ASCII flow diagram;
   - (b) the benchmark task step by step, with tap, drag and scroll counts compared with today's;
   - (c) where each "must still have a home" feature lives in your flow;
   - (d) what's genuinely different from the current flow and why it should feel better;
   - (e) risks and open questions;
   - (f) what in React Native would implement the key interactions: native sheet versus a custom one, which gesture and list primitives, and anything that's hard to make feel native.

## Self-test (required)

Use the headless shell to screenshot key states:

```
~/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell --headless --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=4000 --screenshot=<out>.png file://<abs path>
```

Add a `?state=<name>` URL param that boots into a given state so you can capture each one. Also drive the benchmark task with a small script to prove it completes. Node is available; Playwright's chromium is in `~/.cache/ms-playwright/chromium-1234`, and `playwright-core` may be resolvable from `/home/tavern/Projects/js/UDine/node_modules`. If you can't drive it, at least check every state renders. Save 3–6 key-state PNGs as `flows/<F>/shot-<state>.png`. Look at them and fix what's off, with at least two passes.
