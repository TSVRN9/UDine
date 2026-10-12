# Hall Menu Bake-off Implementation Plan

> **For agentic workers:** in this repo, each task is dispatched to `issue-solver` with this plan's
> path and the task number, then gated by `pr-reviewer` (see `docs/agents/orchestration.md`). Steps use
> checkbox (`- [ ]`) syntax for tracking. Red-green TDD is mandatory: show the red.

**Goal:** two builds of M2's core loop, one in React Native and one in Flutter (Android), for the owner
to judge. Then pick the stack the whole app is rebuilt on.

**Architecture:**
- **M2 is the spec,** finished in a design round (Task 1). It also exports test vectors from its own
  functions, so both builds are checked against the prototype's behaviour, not a re-derivation.
- **The fixture:** one compact `fixture.json`, made from the recorded UMass snapshots, feeds both
  builds. A fixed clock (Thu 2026-10-08 12:41 PM America/New_York) means no network.
- **React Native:** lives in the existing Expo app as an `app/bakeoff/` route group. With
  `EXPO_PUBLIC_BAKEOFF=1` the app opens straight into it.
- **Flutter:** a standalone app in `flutter/udine_bakeoff/` with its own package id, installed side by
  side.

**Tech Stack:**
- RN: Expo SDK 57, RN 0.86, Reanimated 4.5, RNGH 2.32, `@gorhom/bottom-sheet` v5, `@shopify/flash-list`,
  `expo-haptics`, `react-native-svg` (installed).
- Flutter: the stable SDK at `~/flutter`; `flutter_test` golden tests; `integration_test` for screenshots.

**Spec:** `docs/briefs/hall-menu-bakeoff.md`. Read it first; this plan argues from it.

## Global Constraints

- **Spec source:** M2 in `docs/design/explorations/2026-10-ui-overhaul/flows/M2/` (`src.html`,
  `CONCEPT.md` "Motion vocabulary", `NOTES.md`). Its rendered reference (screenshots and strips) is in the
  gitignored `local/flows/M2/` on the owner's machine. Match M2; don't redesign.
- **Navigation model:**
  - container transform for hall bands and pinned cafés only;
  - push from the right with an interactive edge swipe for everything else that opens a page;
  - dish detail is a bottom sheet;
  - tabs fade through; meal tabs use a shared axis.
- **No explanatory captions or legends in the UI** (CLAUDE.md). Never blur or alter photos.
- **RN motion values** live only in `mobile/src/lib/motion.ts` (`pr-gate.sh` enforces this); M2 colour
  and type tokens live in `mobile/src/lib/theme.ts` under an `m2` namespace. Shipped tokens and screens
  stay untouched.
- **Never merge into `main`.** Branches are `bakeoff/rn` and `bakeoff/flutter`, each a draft PR for
  review only.
- **Fixed clock:** `2026-10-08T12:41:00-04:00`. Fixture days are 2026-10-08 to 2026-10-22, from
  `flows/menus-2026-10-08-to-22.json` (4 halls and 16 cafés; Oct 10 is empty, as are most café weekends and Oct 19 on).
- **Places:** a place key is a hall letter (`W F H B`) or a café key (`c<i>`, as in `vectors.json`'s `places`). A café
  plate never joins a hall plate. Price shows on the dish sheet for café servings only.
- **Score rule:**
  - healthfulness counts as scored only when `recipe-webcode` contains `H0`…`H7`, and `H0` is a real 0;
  - carbon counts as scored only when `carbon-list` is one of `A`–`E`;
  - when a dish is unscored, nothing renders.
- **Meal windows:** real per-hall windows from `get_infov2` via `@udine/shared`'s `mapInfoV2` and
  `effectiveMealWindow`, not M2's old `MEALWIN` guess (Task 1 switches M2 over).
- **Host memory budget:** one heavy job at a time (Gradle, emulator, or Flutter build); jest
  `--maxWorkers=2`.
- **Device widths:** 390×844 is the reference; also check 360.

## Review Focus

1. **A dish served at several halls, added from one hall's menu, then opened from another.** The plate
   item's macros must come from the plate's hall, not the hall you opened it in (M2 `macroOf`). Test it
   in Task 2.
2. **A dish whose only remaining serving today has already ended.** Where-served must skip ended
   windows and fall through to "later" or "tomorrow", never "now". Test it in Task 2 with the clock at
   4:31 PM (lunch ends at 4:30 with the real windows).
3. **The stepper at ½ going down.** The item is removed, and an empty plate is removed with it. `front`
   must stay in range. Test it in Task 2.
4. **An interrupted container transform.** A quick back-swipe mid-open, or a second tap during the
   close, must land in a consistent state: no orphaned overlay, no hidden band. Covered in Task 4 (RN)
   and Task 11 (Flutter).
5. **A dish with a healthfulness number but no H code, and a dish with no carbon letter.** No badge
   and no empty slot; the row's layout must not shift. Covered in Task 2 (logic) and Tasks 5 and 12
   (rows).

---

### Task 1: M2 round 9 design and behaviour vectors (owner-approved 2026-10-12 with 9b and 9c; commits 1b27b11, 457f87c, e0a39c3)

Design work in the prototype, run like previous rounds: critique, then one concept, then build, then
the orchestrator reviews frames. No app code.

**Files:**
- Modify: `docs/design/explorations/2026-10-ui-overhaul/flows/M2/src.html`, `build.py`, `test.js`,
  `NOTES.md`, `CONCEPT.md`
- Create: `.../flows/M2/vectors.js` (Playwright, loads the built page and evaluates M2's own functions)
- Create: `.../flows/M2/vectors.json` (committed; consumed by Tasks 2 and 10)

**Interfaces:**
- Produces: `vectors.json` shaped like this:

```json
{
  "clock": "2026-10-08T12:41:00-04:00",
  "where": [ { "dish": "Golden BBQ Chicken Thigh", "clock": "2026-10-08T12:41:00-04:00",
               "answer": [ { "st": "now", "meal": "lunch", "open": "11:00 AM", "close": "4:30 PM", "halls": ["W"] } ],
               "text": ["Lunch now, until 4:30 PM"] } ],
  "plate": [ { "ops": [["add","lunch","Beef Brisket Noodle Bowl",["W","B"]],["add","lunch","Golden BBQ Chicken Thigh",["W"]],["add","lunch","Golden BBQ Chicken Thigh",["W"]]],
               "plates": [ { "meal": "lunch", "halls": ["W"], "label": "Worcester lunch",
                             "items": [["Beef Brisket Noodle Bowl",1],["Golden BBQ Chicken Thigh",2]],
                             "totals": { "cal": 404, "p": 38.9 } } ] } ],
  "scores": [ { "dish": "Local Roasted Sweet Potatoes", "health": 5, "carbon": "A" } ]
}
```

- [ ] **Step 1: Switch M2 to the real meal windows.** In `build.py`, embed per-hall
  `breakfast/lunch/dinner/latenight/general` windows from `../locations-2026-10-08.json`, using the same
  rules as `shared/src/hours.ts` `mapInfoV2` and `effectiveMealWindow`, including the
  `STANDARD_MEAL_WINDOWS` fallback clamped to `general`. Replace `MEALWIN`/`mealWin` in `src.html`.
  Add a `test.js` check that Worcester's lunch window equals the one `effectiveMealWindow` returns for
  the same JSON. Get it with a one-off `node -e` that requires the built `shared` package; paste the
  value into the test.
- [ ] **Step 2: Write `CRITIQUE-r9.md` and append "Round 9" to `CONCEPT.md`.** The concept covers how
  these fit the hall header and You:
  - the day control (across the feed's roughly two-week window, alongside meal tabs);
  - today's full hours and directions (from the hall header);
  - allergens in Dietary preferences, with the "Show all" line covering hidden allergen dishes too;
  - loading, offline-with-cache and failed-fetch states for the Halls tab and the hall menu;
  - price on the dish sheet when present.

  Follow `docs/briefs/hall-menu-bakeoff.md` "Owner decisions".
- [ ] **Step 3: Build them,** with tests in `test.js` for:
  - day change re-renders the meal tabs for that day;
  - hours sheet lists every window;
  - an allergen hides dishes and "Show all" reveals them;
  - each network state is reachable via `?net=slow|offline|fail`.
- [ ] **Step 4: Write `vectors.js`.** It loads `index.html` and calls `wherePlan`/`whereAnswer`/
  `whenText` for at least 20 dishes at the clocks 12:41 PM, 4:31 PM and 9:30 PM. It drives
  `addDish`/`stepItem`/`plateLabel`/`totals` through at least 8 op sequences: the benchmark plate, a
  conflicting-hall second plate, ½ removal, an emptied plate, and a custom item. It reads the embedded
  dish data for every scored and unscored case, including all 16 "number but no H code" dishes. It
  writes `vectors.json`.
- [ ] **Step 5: Run `node test.js` and `RM=1 node test.js`.** Expected: all pass.
- [ ] **Step 6: Orchestrator review.** Screenshots of every new state at 390 and 360, plus frame strips
  for the day change and the hours sheet. Send flaws back until clean, then the owner approves on
  Flow Lab.
- [ ] **Step 7: Commit** the M2 sources and `vectors.json`, and sync the local outputs as in earlier
  rounds:

```bash
git add docs/design/explorations/2026-10-ui-overhaul/flows/M2
git commit -m "docs(design): M2 round 9 (days, hours, allergens, states) + behaviour vectors"
```

---

### Task 2: RN fixture and domain logic

> **Shapes after round 9:** `vectors.json` is authoritative. Its header in `M2/vectors.js` documents place keys,
> `day`, `"all"` meals and price. Where this task's interfaces say `HallKey` for a serving place (refs, `halls`,
> `plateHalls`, `totals`'s hall, `Fixture.days`/`hours`), read `PlaceKey`.

**Files:**
- Create: `mobile/scripts/bakeoff-fixture.mjs`. It reads `docs/design/explorations/2026-10-ui-overhaul/flows/{menus-2026-10-08-to-22,locations-2026-10-08,locations-2026-10-11,events-2026-10-08}.json` (hours and busy from Oct 8, addresses and `map_address` from Oct 11) and writes the fixture. Place keys, allergen normalisation and the café list must match M2's `build.py`.
- Create: `mobile/src/bakeoff/fixture.json` (generated, committed)
- Create: `mobile/src/bakeoff/logic/types.ts`, `fixture.ts`, `where.ts`, `plate.ts`
- Create: `mobile/src/bakeoff/logic/vectors.json`, a copy of Task 1's file (the fixture script copies it)
- Test: `mobile/src/bakeoff/logic/where.test.ts`, `plate.test.ts`, `fixture.test.ts`

**Interfaces:**
- Consumes: Task 1's `vectors.json`; `@udine/shared` `mapInfoV2`, `effectiveMealWindow`,
  `formatTimeOfDay`.
- Produces (exact):

```ts
// types.ts
export type HallKey = "W" | "F" | "H" | "B";
export type PlaceKey = HallKey | `c${number}`;
export type MealKey = "breakfast" | "lunch" | "dinner" | "late" | "grab" | "all";
export type Carbon = "A" | "B" | "C" | "D" | "E";
export interface Nutrition { fatCal: number|null; fat: number|null; fatDv: number|null; sat: number|null; satDv: number|null;
  trans: number|null; chol: number|null; sod: number|null; sodDv: number|null; carb: number|null; carbDv: number|null;
  fiber: number|null; fiberDv: number|null; sugar: number|null; protein: number|null; proteinDv: number|null }
export interface Dish { key: string; name: string; station: string; cal: number; p: number; c: number; f: number;
  diet: number /* 1 veg, 2 plant, 4 halal, 8 local, 16 sustainable */; serving: string; nutrition: Nutrition;
  ingredients: string; allergens: string[]; health: number | null; carbon: Carbon | null; price: number | null }
export interface Station { name: string; dishes: Dish[] }
export interface Fixture { clock: string; days: Record<string, Record<HallKey, Partial<Record<MealKey, Station[]>>>>;
  hours: Record<HallKey, import("@udine/shared").DiningHallHours>; events: unknown[]; cafes: unknown[] }
// fixture.ts
export function loadFixture(): Fixture;
export function dishKey(name: string): string; // lower-case, collapsed whitespace: M2's norm()
// where.ts
export type WhereState = "now" | "later" | "tomorrow";
export interface WhereGroup { st: WhereState; meal: MealKey; open: string; close: string; halls: HallKey[] }
export function whereAnswer(fx: Fixture, dish: string, now: Date): WhereGroup[]; // at most 2 groups
export function whenText(g: WhereGroup, prev?: WhereGroup): string;
// plate.ts
export interface PlateItem { key: string; name: string; qty: number; refs: Partial<Record<HallKey, Dish>>; custom?: Pick<Dish,"cal"|"p"|"c"|"f"> }
export interface Plate { id: number; meal: MealKey; items: PlateItem[] }
export interface PlateState { plates: Plate[]; front: number; nextId: number }
export const emptyPlates: PlateState;
export function addDish(s: PlateState, meal: MealKey, name: string, refs: Partial<Record<HallKey, Dish>>): PlateState;
export function stepItem(s: PlateState, plateId: number, key: string, dir: 1 | -1): PlateState;
export function plateHalls(p: Plate): HallKey[] | null;
export function plateLabel(p: Plate): string;
export function totals(p: Plate, hall?: HallKey): { cal: number; p: number; c: number; f: number; n: number };
```

- [ ] **Step 1: Write the failing vector tests.**

```ts
// where.test.ts
import vectors from "./vectors.json";
import { loadFixture } from "./fixture";
import { whereAnswer, whenText } from "./where";

const fx = loadFixture();
describe("whereAnswer matches M2", () => {
  for (const v of vectors.where) {
    it(`${v.dish} @ ${v.clock}`, () => {
      const got = whereAnswer(fx, v.dish, new Date(v.clock));
      expect(got).toEqual(v.answer);
      expect(got.map((g, i) => whenText(g, got[i - 1]))).toEqual(v.text);
    });
  }
  it("skips a window that ended a minute ago (Review Focus 2)", () => {
    const got = whereAnswer(fx, "Golden BBQ Chicken Thigh", new Date("2026-10-08T15:31:00-04:00"));
    expect(got.every((g) => g.st !== "now")).toBe(true);
  });
});
```

```ts
// plate.test.ts
import vectors from "./vectors.json";
import { loadFixture, dishKey } from "./fixture";
import { emptyPlates, addDish, stepItem, plateHalls, plateLabel, totals, type PlateState } from "./plate";

const fx = loadFixture();
const refsFor = (meal: string, name: string, halls: string[]) =>
  Object.fromEntries(halls.map((h) => [h, fx.days["2026-10-08"][h as "W"][meal as "lunch"]!
    .flatMap((s) => s.dishes).find((d) => d.key === dishKey(name))!]));

describe("plate ops match M2", () => {
  for (const v of vectors.plate) {
    it(JSON.stringify(v.ops.map((o) => o.slice(0, 3))), () => {
      let s: PlateState = emptyPlates;
      for (const [op, meal, name, halls] of v.ops as [string, any, string, string[]][]) {
        if (op === "add") s = addDish(s, meal, name, refsFor(meal, name, halls));
        else s = stepItem(s, s.plates[s.front].id, dishKey(name), op === "inc" ? 1 : -1);
      }
      expect(s.plates.map((p) => ({ meal: p.meal, halls: plateHalls(p), label: plateLabel(p),
        items: p.items.map((i) => [i.name, i.qty]),
        totals: (({ cal, p: pr }) => ({ cal: Math.round(cal), p: Math.round(pr * 10) / 10 }))(totals(p)) }))).toEqual(v.plates);
    });
  }
  it("½ then down removes the item, the empty plate, and keeps front in range (Review Focus 3)", () => {
    let s = addDish(emptyPlates, "lunch", "Golden BBQ Chicken Thigh", refsFor("lunch", "Golden BBQ Chicken Thigh", ["W"]));
    const id = s.plates[0].id, k = dishKey("Golden BBQ Chicken Thigh");
    s = stepItem(s, id, k, -1); expect(s.plates[0].items[0].qty).toBe(0.5);
    s = stepItem(s, id, k, -1); expect(s.plates).toEqual([]); expect(s.front).toBe(0);
  });
  it("macros come from the plate's hall (Review Focus 1)", () => {
    // Brisket is served at W and B; Golden BBQ only at W, so the plate narrows to W and every macro is W's.
    const brisket = refsFor("lunch", "Beef Brisket Noodle Bowl", ["W", "B"]);
    const bbq = refsFor("lunch", "Golden BBQ Chicken Thigh", ["W"]);
    let s = addDish(emptyPlates, "lunch", "Beef Brisket Noodle Bowl", brisket);
    s = addDish(s, "lunch", "Golden BBQ Chicken Thigh", bbq);
    expect(plateHalls(s.plates[0])).toEqual(["W"]);
    expect(totals(s.plates[0]).cal).toBeCloseTo(brisket.W!.cal + bbq.W!.cal);
  });
});
```

```ts
// fixture.test.ts
import vectors from "./vectors.json";
import { loadFixture, dishKey } from "./fixture";

const fx = loadFixture();
const find = (name: string) => Object.values(fx.days["2026-10-08"]).flatMap((h) => Object.values(h).flat())
  .flatMap((s) => s!.dishes).find((d) => d.key === dishKey(name));
it.each(vectors.scores)("scores for $dish", ({ dish, health, carbon }) => {
  const d = find(dish)!;
  expect(d.health).toBe(health);   // null when the H code is absent, even if data-healthfulness has a number
  expect(d.carbon).toBe(carbon);
});
it("benchmark plate dishes exist at Worcester lunch", () => {
  const w = fx.days["2026-10-08"].W.lunch!.flatMap((s) => s.dishes).map((d) => d.name);
  expect(w).toEqual(expect.arrayContaining(["Beef Brisket Noodle Bowl", "Golden BBQ Chicken Thigh"]));
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `cd mobile && TZ=America/New_York npx jest src/bakeoff/logic --maxWorkers=2`.
  Expected: FAIL with "Cannot find module './fixture'".
- [ ] **Step 3: Write `bakeoff-fixture.mjs`.** Port `build.py`'s `diet`, `station`, `num`, `dv` and `dish`
  rules exactly, including the H-code rule. Add a `price` from `data-price` when present, otherwise
  null. Hours come from `mapInfoV2` over the locations JSON. Run it:
  `node mobile/scripts/bakeoff-fixture.mjs`, then commit the generated `fixture.json` and the copied
  `vectors.json`.
- [ ] **Step 4: Implement `fixture.ts`, `where.ts` and `plate.ts`** as direct ports of M2's `wherePlan`/
  `whereAnswer`/`whenText` and its plate model (`plateHalls`, `canJoin`, `addDish`, `stepItem`,
  `macroOf`, `totals`, `hallLabel`, `plateLabel`), made pure: state in, state out, no mutation. Use
  `effectiveMealWindow(fx.hours[h], key, now)` for each window.
- [ ] **Step 5: Run the tests and confirm they pass.** Same command. Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add mobile/scripts/bakeoff-fixture.mjs mobile/src/bakeoff
git commit -m "bakeoff(rn): fixture + where-served/plate logic ported from M2 with M2 vectors"
```

---

### Task 3: RN tokens, kit, lint rule and shell

**Files:**
- Modify: `mobile/src/lib/theme.ts`. Append `export const m2 = { color: {...}, font: {...}, space: [4,8,12,16,20,24,32], radius: {...} }`, with values copied from M2's `:root` CSS variables in `src.html` (`--dm`, `--vm`, `--gold`, `--chalk`, `--ink`, `--slate`, `--hair`, the badge ramps `CRC`/`HFC`).
- Modify: `mobile/src/lib/motion.ts`. Append `export const m2Motion`, with values copied from M2's `MO`, `SPRING` and `PUSH_E`.
- Modify: `mobile/eslint.config.js`. Add the bake-off literal ban (below).
- Create: `mobile/src/bakeoff/ui/` containing `Band.tsx`, `ListRow.tsx`, `Badge.tsx` (diet patch), `ScoreBadge.tsx`, `HallLetter.tsx`, `Chip.tsx`, `Stepper.tsx`, `Sheet.tsx` (wraps gorhom), `Header.tsx`, `TabBar.tsx`, `Text.tsx` (type scale), `index.ts`.
- Create: `mobile/src/app/bakeoff/_layout.tsx` (tabs: Halls, Search, You) and `mobile/src/app/bakeoff/index.tsx`.
- Modify: `mobile/src/app/_layout.tsx`. When `process.env.EXPO_PUBLIC_BAKEOFF === "1"`, redirect the initial route to `/bakeoff`.
- Modify: `mobile/eas.json`. Add a `bakeoff` profile (extends production; `env.EXPO_PUBLIC_BAKEOFF=1`; `ios.bundleIdentifier` override not needed, it's TestFlight-only).
- Install: `npx expo install @gorhom/bottom-sheet @shopify/flash-list expo-haptics`.
- Test: `mobile/src/bakeoff/lint.test.ts`, `mobile/src/bakeoff/ui/ScoreBadge.test.tsx`

**Interfaces:**
- Produces:
  - `ScoreBadge({ kind: "health" | "carbon", value: number | Carbon | null, size: "row" | "sheet" })` returns
    null when the value is null. It renders M2's `tileSVG` geometry and has
    `accessibilityLabel` `"Healthfulness 5 of 7"` or `"Carbon rating A"`.
  - `m2`, `m2Motion`, and the kit exports used by Tasks 4–8.

- [ ] **Step 1: Write the failing lint test.**

```ts
// lint.test.ts
import { ESLint } from "eslint";
const eslint = new ESLint({ cwd: __dirname + "/../.." });
const lint = async (code: string, file: string) => (await eslint.lintText(code, { filePath: file }))[0].messages
  .filter((m) => m.ruleId === "no-restricted-syntax");

it("rejects a raw colour in a bakeoff screen", async () => {
  expect(await lint(`export const s = { color: "#881c1c" };`, "src/app/bakeoff/x.tsx")).toHaveLength(1);
});
it("rejects a raw duration in a bakeoff screen", async () => {
  expect(await lint(`withTiming(1, { duration: 240 });`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
});
it("allows literals inside the kit", async () => {
  expect(await lint(`export const s = { color: "#881c1c" };`, "src/bakeoff/ui/x.tsx")).toHaveLength(0);
});
```

```tsx
// ui/ScoreBadge.test.tsx
import { render } from "@testing-library/react-native";
import { ScoreBadge } from "./ScoreBadge";
it("renders nothing for an unscored dish", () => {
  expect(render(<ScoreBadge kind="health" value={null} size="row" />).toJSON()).toBeNull();
});
it("labels the score for screen readers", () => {
  const { getByLabelText } = render(<ScoreBadge kind="carbon" value="A" size="row" />);
  getByLabelText("Carbon rating A");
});
```

  (If `@testing-library/react-native` isn't installed, use `react-test-renderer` as the existing
  `*.test.tsx` files do. Check `src/lib/cafeScreen.test.tsx` for the house pattern.)
- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `cd mobile && npx jest src/bakeoff/lint.test.ts src/bakeoff/ui --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Add the lint block to `eslint.config.js`.**

```js
{
  files: ["src/app/bakeoff/**/*.{ts,tsx}", "src/bakeoff/**/*.{ts,tsx}"],
  ignores: ["src/bakeoff/ui/**", "src/bakeoff/logic/**", "**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]", message: "Bake-off: colours come from m2.color via the kit." },
      { selector: "Literal[value=/^rgba?\\(/]", message: "Bake-off: colours come from m2.color via the kit." },
      { selector: "Property[key.name=/^(duration|delay|stiffness|damping|mass)$/] > Literal", message: "Bake-off: motion comes from m2Motion." },
      { selector: "Property[key.name=/^(fontSize|lineHeight|letterSpacing)$/] > Literal", message: "Bake-off: type comes from the kit's Text." },
    ],
  },
},
```

- [ ] **Step 4: Implement the tokens, kit, layout and redirect.** The tab bar matches M2's (Halls,
  Search, You). Search has no content in this build; its tab is `accessibilityState={{ disabled: true }}`,
  at reduced opacity, with no caption. You holds only Dietary preferences (incl. allergens) and "Show on
  dishes", as round 9 designs them (Task 7 fills it).
- [ ] **Step 5: Run the tests and `npx eslint src/bakeoff src/app/bakeoff`.** Expected: PASS, 0 errors.
- [ ] **Step 6: Rebuild the dev client** (new native deps; see memory "Emulator dev-client staleness"):
  `JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk PATH="$JAVA_HOME/bin:$PATH" npx expo run:android`. Then
  `mobile/scripts/screenshot.sh bakeoff` shows the tab shell.
- [ ] **Step 7: Commit.**

---

### Task 4: RN Halls tab and the hall container transform

**Files:**
- Create: `mobile/src/app/bakeoff/index.tsx` (Halls), `mobile/src/bakeoff/screens/HallsList.tsx`, `mobile/src/bakeoff/screens/HallHeader.tsx`, `mobile/src/bakeoff/motion/useContainerTransform.ts`, `mobile/src/bakeoff/motion/useEdgeSwipeBack.ts`
- Test: `mobile/src/bakeoff/motion/useContainerTransform.test.ts`

**Interfaces:**
- Consumes: kit `Band`, `HallLetter`, `Header`; `m2Motion.cont`/`contBack`; `loadFixture().hours`;
  `@udine/shared` `openStatus`.
- Produces:

```ts
useContainerTransform(): {
  progress: SharedValue<number>; // 0 = band, 1 = menu
  open(fromRect: Rect): void;
  close(): void;
  dragBack: GestureType;         // drag down and edge swipe, interactive, reversible
  style: { container; photo; outgoing; incoming };
}
```

  The photo is the only shared element. Outgoing content fades early, and incoming content fades in
  place (CONCEPT.md).

- [ ] **Step 1: Write the failing test** for the pure interpolation helpers this hook uses. Move them to
  `motion/containerMath.ts`:
  - `rectAt(from, to, p)` is monotonic in p;
  - `outgoingOpacity(p)` reaches 0 by M2's early-fade fraction;
  - `incomingOpacity(p)` is 0 before it;
  - `settleTarget(velocity, p)` returns open or closed, matching M2's thresholds;
  - for Review Focus 4, `open()` called during a running `close()` resolves to open with no stale
    state. Model it as a reducer `transition(state, event)` and test it.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement the Halls list.**
  - Four bands use the real photos. Photos are gitignored: load them from `local/flows/M2/assets/` via a
    `bakeoff-assets` script that copies them into `mobile/assets/bakeoff/`, which is gitignored too
    (add it to `.gitignore`).
  - Pinned café bands at ¾ scale come from a hard-coded pin list `["Wasabi","Tamales"]`. Pinning UI is
    out of scope.
  - The "Cafés & markets" rows are inert in this build.
  - The header collapses into the maroon bar on scroll.
- [ ] **Step 4: Implement the transform** with one Reanimated shared value driving every animated
  style. `dragBack` composes vertical drag-down and a left-edge pan (`Gesture.Pan().activeOffsetX`
  from the edge 0–20 px), both following the finger.
- [ ] **Step 5: Run the tests and confirm they pass. Record and look:**
  `mobile/scripts/screenshot.sh bakeoff --record` with a tap on Hampshire, then back, then drag-back and
  edge swipe. Compare frame by frame with `local/flows/M2/compare-open.png`, `compare-close.png`,
  `compare-dragback.png` and `compare-edgeswipe.png` (M2 rows). Fix any divergence.
- [ ] **Step 6: Commit.**

---

### Task 5: RN hall menu

**Files:**
- Create: `mobile/src/app/bakeoff/hall/[h].tsx`, `mobile/src/bakeoff/screens/HallMenu.tsx`, `MealPager.tsx`, `StationSwitcher.tsx`, `DayControl.tsx`, `HoursSheet.tsx`, `DishRow.tsx`, `DietLine.tsx`
- Create: `mobile/src/bakeoff/logic/menuView.ts` (pure: sections for a hall, day and meal after diet and allergen filtering, plus the hidden count)
- Test: `mobile/src/bakeoff/logic/menuView.test.ts`

**Interfaces:**
- Consumes: Task 2 `Fixture` and `Dish`; Task 3 kit; round 9's day-control and hours-sheet design.
- Produces:

```ts
export interface Prefs { veg: boolean; plant: boolean; halal: boolean; avoid: string[] /* allergen names as in Dish.allergens */ }
export function menuView(fx: Fixture, day: string, h: HallKey, meal: MealKey, prefs: Prefs, showAll: boolean):
  { sections: Station[]; hidden: number };
```

- [ ] **Step 1: Write the failing tests.**
  - With `prefs.avoid=["Peanuts"]`, no returned dish lists Peanuts, and `hidden` equals the number
    removed.
  - With `showAll=true`, everything returns and `hidden` is 0.
  - With veg on, plant-based dishes still show (plant implies veg, as in M2).
  - Station order matches `@udine/shared` `sortStationNames`.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement `menuView`, then the screen:**
  - FlashList rows with name, diet patch, cal/protein, and ScoreBadges gated by the You toggles;
  - the shared-axis meal pager;
  - the station switcher row and sheet (the jump runs on the UI thread via `scrollToIndex` from a
    worklet-safe handler, with no `runOnJS` per frame);
  - the day control and hours sheet per round 9;
  - `DietLine` with "Show all";
  - an empty-meal state per round 9.
- [ ] **Step 4: Run the tests and confirm they pass.** Screenshots at 390 and 360 of: top; collapsed;
  each meal tab; switcher open; another day; hours open; the diet line; badges in all four toggle
  combinations. Compare each with M2's same state. Record a meal swipe and a station jump against
  `compare-mealtab.png` and `compare-station.png`.
- [ ] **Step 5: Commit.**

---

### Task 6: RN dish sheet

**Files:**
- Create: `mobile/src/bakeoff/screens/DishSheet.tsx`, `WhereServed.tsx`, `NutritionLabel.tsx`, `RatingsPanel.tsx`
- Test: `mobile/src/bakeoff/screens/dishSheetLayout.test.ts`. This tests the pure resting snap point:
  `restingSnap(contentOffsets)` ends just under the label's Calories row, as M2 does per dish.

**Interfaces:**
- Consumes: kit `Sheet`, `ScoreBadge`, `Badge`; Task 2 `whereAnswer`/`whenText`; Task 4's push for the
  sheet → hall route.
- Produces: `openDish(dish: Dish, ctx: { from: "hall" | "plate"; hall?: HallKey; meal: MealKey })`.

- [ ] **Step 1: Write the failing test for `restingSnap`,** including that an unscored dish's patch row
  has no empty slot (Review Focus 5): the badge row's measured width equals the sum of the badges
  present.
- [ ] **Step 2: Run the test and confirm it fails.**
- [ ] **Step 3: Implement the sheet.**
  - It holds the name pinned with a scroll edge, serving, diet patches, score badges, Contains, the
    price when present, Add/stepper, where-served buttons, the FDA label (computed %DV as in M2
    `labelHTML`), the ratings panel and ingredients with "Show all" only when truncated.
  - The backdrop dims, and tapping it dismisses.
  - Dragging down follows the finger.
  - Where-served from the hall pushes the target hall scrolled to the dish (sheet down first, per
    round 7).
- [ ] **Step 4: Run the test and confirm it passes.** Record open, drag, dismiss, scroll and
  sheet → hall, and compare with `compare-detail.png`, `compare-searchdetaildrag.png` and
  `compare-servinghall.png` (the "now" rows).
- [ ] **Step 5: Commit.**

---

### Task 7: RN plate, logging and You toggles

**Files:**
- Create: `mobile/src/bakeoff/screens/PlateBar.tsx`, `PlateSheet.tsx`, `LogReceipt.tsx`, `mobile/src/app/bakeoff/you.tsx`
- Create: `mobile/src/bakeoff/state/store.ts`. A tiny `useSyncExternalStore` store holding `PlateState`,
  `prefs`, `show {health, carbon}` and `log`, persisted to AsyncStorage the same way M2 persists to
  localStorage.
- Test: `mobile/src/bakeoff/state/store.test.ts`

**Interfaces:**
- Consumes: Task 2's plate functions; Task 3's `Sheet` with the bar as the handle (NOTES "Native port").
- Produces: `useBakeoff()` returning `{ plates, add, step, log, undo, prefs, setPrefs, show, setShow }`.

- [ ] **Step 1: Write the failing store tests:**
  - `log` moves the front plate into `log` and `undo` restores it at the same index;
  - `show` and `prefs` survive a reload (mock AsyncStorage as `src/lib/*.test.ts` already do);
  - adding a conflicting-hall dish creates a second plate and sets `front` to it.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement the plate UI.**
  - The bar is the sheet handle, sitting above the tab bar.
  - Detents: bar, mid and large.
  - A horizontal swipe on the bar switches plates.
  - Log, then a receipt crossfades in place with Undo.
  - Haptics follow M2: selection for detents, Light for add, Rigid for remove, Success for Log.
  - The You screen has Dietary preferences (veg, plant, halal, allergens) and "Show on dishes"
    toggles, laid out as round 9 designed.
- [ ] **Step 4: Run the tests and confirm they pass.** Record add, stepper, ½, remove, the sheet drag
  and Log/Undo against `compare-add.png`, `compare-qty.png`, `compare-sheetdrag.png`, `compare-log.png`
  and `compare-undo.png`.
- [ ] **Step 5: Commit.**

---

### Task 8: RN network states

**Carried from Task 5 (orchestrator, 2026-10-12).** Task 5 did not build these, and Task 8 must:
- cafés with only a standing names list, which keep it (brief, "Cafés get real dishes");
- the Oct 12 "Indigenous Peoples Day Hours" note row atop Monday's list (M2 `compare-evnote.png`).

**Files:**
- Modify: `mobile/src/bakeoff/logic/fixture.ts`. Add `loadFixtureAsync(mode: "ok" | "slow" | "offline" | "fail")`, with the mode from `EXPO_PUBLIC_BAKEOFF_NET`. It defaults to `ok`; `slow` adds a 1500 ms delay; `offline` returns the fixture flagged `{ cached: true, asOf }`; `fail` rejects.
- Create: the state components round 9 designs (names follow round 9's NOTES).
- Test: `mobile/src/bakeoff/logic/fixtureAsync.test.ts`

- [ ] **Step 1: Write a failing test for each mode's contract,** e.g. `fail` rejects with an error the
  retry path can catch, and retrying in `ok` mode resolves.
- [ ] **Step 2: Run the tests and confirm they fail. Step 3: Implement. Step 4: Confirm they pass.**
  Screenshot each state on the Halls tab and the hall menu, and compare with round 9's M2 shots.
- [ ] **Step 5: Commit.**

---

### Task 9: RN review, iOS checklist and devices

**Files:**
- Create: `docs/agents/ios-checklist.md`, with plain tester steps for this slice:
  - open a hall and close it three ways (back, drag down, edge swipe);
  - swipe meals;
  - jump stations;
  - change day;
  - open hours;
  - open a dish, drag it, dismiss it;
  - add, step to ½ and remove;
  - drag the plate sheet through its detents;
  - Log, then Undo.

  For each step: what correct looks like, and what to report (screen recording).

- [ ] **Step 1: Open the draft PR** `bakeoff/rn` against `main` with screenshots and recordings for
  every state and motion in the spec. Dispatch `pr-reviewer` with this plan, the spec and M2's local
  references. Iterate REWORK rounds, counting them for the scorecard.
- [ ] **Step 2: Android on the owner's phone:**
  `EXPO_PUBLIC_BAKEOFF=1 pnpm build:internal-android -- --install` from `mobile/` (side by side with the
  Play build).
- [ ] **Step 3: iOS:** `eas build -p ios --profile bakeoff`, then `eas submit -p ios --latest`. The
  tester runs `ios-checklist.md` and reports.
- [ ] **Step 4: Measure dropped frames** during each recorded motion (Android perf monitor or
  `adb shell dumpsys gfxinfo com.udinetogether.udine.internal framestats`) and save the numbers for
  Task 15.

---

### Task 10: Flutter scaffold, fixture and logic port

**Files:**
- Create: `flutter/udine_bakeoff/` (`flutter create --org com.udinetogether --project-name udine_bakeoff --platforms android flutter/udine_bakeoff`)
- Create: `flutter/udine_bakeoff/assets/fixture.json`, copied from `mobile/src/bakeoff/fixture.json` by `flutter/udine_bakeoff/tool/sync_fixture.sh`, which also copies `vectors.json` into `test/`
- Create: `lib/logic/{types,fixture,where,plate,menu_view}.dart`, plus `lib/logic/hours.dart` porting only `effectiveMealWindow`, `openStatus`, `formatTimeOfDay` and `sortStationNames` from `shared/src`
- Test: `test/logic/{where,plate,fixture,menu_view}_test.dart`, driven by the same `vectors.json`

**Interfaces:** Dart mirrors of Task 2's TS signatures, with the same names in lowerCamelCase:
`whereAnswer(Fixture, String dish, DateTime now) → List<WhereGroup>`, `addDish`, `stepItem`,
`plateHalls`, `plateLabel`, `totals`, `menuView`.

- [ ] **Step 1: Write the failing vector tests,** mirroring Task 2's tests and Task 5's `menuView`
  tests one for one.

```dart
// test/logic/where_test.dart
import 'dart:convert'; import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'package:udine_bakeoff/logic/where.dart';
void main() {
  final fx = Fixture.fromJson(jsonDecode(File('assets/fixture.json').readAsStringSync()));
  final v = jsonDecode(File('test/vectors.json').readAsStringSync());
  for (final w in v['where']) {
    test('${w['dish']} @ ${w['clock']}', () {
      final got = whereAnswer(fx, w['dish'], DateTime.parse(w['clock']));
      expect(got.map((g) => g.toJson()).toList(), w['answer']);
    });
  }
}
```

- [ ] **Step 2: Run them and confirm they fail:** `cd flutter/udine_bakeoff && flutter test test/logic`.
- [ ] **Step 3: Port the logic.** Handle time zones carefully: the fixture clock is America/New_York.
  Parse it to a fixed-offset `DateTime`, and do window maths in minutes since local midnight, as M2
  does.
- [ ] **Step 4: Run the tests and confirm they pass. Step 5: Commit.**

---

### Task 11: Flutter tokens, Halls and the container transform

**Files:** `lib/theme/tokens.dart` (values identical to Task 3's `m2`/`m2Motion`, copied from M2), `lib/ui/*` (the same kit names as RN), `lib/screens/halls.dart`, `lib/motion/container_transform.dart`, `test/motion/container_math_test.dart`, goldens in `test/goldens/`.

- [ ] **Step 1: Write a failing test** for the same `containerMath` contract as Task 4, including the
  interruption reducer (Review Focus 4).
- [ ] **Step 2: Run it and confirm it fails. Step 3: Implement** with one `AnimationController` driving
  every animated property. The photo is the shared element; drag-back and the edge swipe are
  interactive. Don't use the `animations` package's `OpenContainer`, which can't express M2's
  early-fade split. Write the transform by hand.
- [ ] **Step 4: Confirm the test passes.** Add golden tests for the Halls tab at rest and with 0/2/5
  pins. Record on the emulator (`flutter drive` with `integration_test` screenshots every 16 ms, or
  `adb shell screenrecord`) and compare with the same M2 strips as Task 4.
- [ ] **Step 5: Commit.**

---

### Task 12: Flutter hall menu, dish sheet and plate

**Files:** `lib/screens/{hall_menu,meal_pager,station_switcher,day_control,hours_sheet,dish_row,dish_sheet,plate_bar,plate_sheet,you}.dart`, `lib/state/store.dart` (`ChangeNotifier` and `shared_preferences`), `test/state/store_test.dart`, goldens.

- [ ] **Step 1: Write failing tests:**
  - Task 7's store contract in Dart;
  - golden tests for each spec state;
  - row widths with and without scores (Review Focus 5).
- [ ] **Step 2: Run them and confirm they fail. Step 3: Implement,** matching Tasks 5–7 behaviour for
  behaviour:
  - the dish sheet is a `DraggableScrollableSheet` with M2's resting snap;
  - the plate bar is the sheet's handle;
  - haptics use `HapticFeedback.selectionClick`/`lightImpact`/`heavyImpact`/`mediumImpact`.
- [ ] **Step 4: Confirm the tests pass.** Record against the same M2 strips as Tasks 5–7.
  **Step 5: Commit.**

---

### Task 13: Flutter network states

Mirror Task 8: `loadFixture(mode)` with `--dart-define=BAKEOFF_NET=slow|offline|fail`, the same tests and
the round-9 states. Compare screenshots with M2's.

---

### Task 14: Flutter review and device

- [ ] Open the draft PR `bakeoff/flutter`, dispatch `pr-reviewer` as in Task 9 Step 1, and count the
  REWORK rounds.
- [ ] Build and install: `flutter build apk --release` (package `com.udinetogether.udine_bakeoff`), then
  `adb install -r build/app/outputs/flutter-apk/app-release.apk` on the owner's phone.
- [ ] Measure dropped frames with `flutter run --profile` and the DevTools frame chart for the same
  motions as Task 9 Step 4.

---

### Task 15: Scorecard and verdict

**Files:** `docs/decisions-log.md` (new entry)

- [ ] Fill in the spec's five criteria with the evidence from Tasks 9 and 14:
  - the owner's feel ratings;
  - the dropped-frame table;
  - REWORK counts and the owner-found defects the reviewer missed;
  - iOS-only defects (RN);
  - lines of code and a port estimate.
- [ ] The owner records the verdict. If RN adherence was poor, run the NativeWind/Uniwind variant first
  (spec).
- [ ] Commit `docs(decisions): hall-menu bake-off verdict`.

---

**Findings so far (fill the scorecard from these):**
- **RN, Task 4:** on Android gesture navigation, the OS takes left-edge swipes (about 24 dp), so the hall's edge swipe
  arrives as system back with the 400 ms close and no finger tracking. RN/Expo SDK 57 exposes no predictive-back
  progress for a custom overlay. Drag-down tracks. iOS is untested (needs the tester).
- **RN, Task 4:** REWORK once. The busy rows and board were missing because the fixture dropped them (a Task 2 miss
  the reviewer didn't catch); the orchestrator caught it by eye.
- **RN, Task 2:** REWORK once (the plate-hall macro rule was untested, and departures from the plan were undocumented).
- **RN, Task 5:** MERGE after four REWORK rounds.
  - Round 3 introduced a regression: the schedule opened at the top again. The implementer reported having viewed
    every frame; the reviewer flagged the frame and the orchestrator confirmed it.
  - The final schedule opening fights gorhom's scroll lock: it caps the viewport and retries `scrollTo` up to 12 ×
    80 ms while a wrapped gorhom scroll hook records instead of resetting. It works but is fragile, and depends on
    gorhom internals. A Flutter `DraggableScrollableSheet` with an initial offset has no such lock; Task 12 will
    show whether that holds.
  - Round 4 made the opening scroll's `reached` flag sticky (5b8874d), so a user's scroll is never snapped back.
  - Earlier rounds:
  - Round 2 came from the orchestrator's frames: labels lagged the list, and the scroll fix had broken drag-to-dismiss.
  - Round 3 came from the reviewer's code read, with no screenshot showing it:
    - the descender fix's margin was overridden by callers, a layout regression;
    - a day change interleaved with a meal change could strand the labels at opacity 0;
    - the old-label layer was exposed to screen readers.
  - The labels need a held copy because RN commits on JS while the fade runs on the UI thread; M2's synchronous DOM
    swap has no such seam.
  - Round 1's three defects were all found by the orchestrator's frame review; the reviewer confirmed them:
  - The day change blanked the bars and list for about 400 ms while JS rendered.
  - Android clipped Oswald descenders when line height equals size.
  - The schedule sheet scrolled to the chosen day after presenting.
- **RN, Task 5:** in the Metro dev build there is a 400–600 ms JS stall between a meal or day tap and the commit.
  The cause is the shape of the work: the whole FlashList remounts, and the fixture is filtered on the JS thread.
  Some of it is likely to survive Hermes release, so Task 9 must measure it on a phone. Flutter has no equivalent
  to watch for yet.

### Task 16: M2 round 10: bowl builder, onboarding, past logs, Health sync (design; doesn't block the verdict)

Design round in M2, run like Task 1 Steps 2–7, after round 9c lands (same files):
- critique how today's `CompositeDishComposer.tsx` works;
- write one concept for composing a bowl inside the dish sheet/plate model;
- design the first-run onboarding, tracking off (a pure menu app), past logs with edit/delete/Undo, and the Health
  Connect / Apple Health toggle, per the brief's owner decisions of 2026-10-12. Each is one concept with You, not a
  bolted-on screen;
- build it in M2;
- the orchestrator reviews the frames;
- the owner approves.

No app code.
