// Curated catalog of "always-available" station dishes -- Salad Bar / Yogurt Bar / Pizza -- per
// residential hall. See docs/design/canvas.json's "unlisted-station-logic" annotation and
// docs/briefs/foodpro-menu-expansion.md task 1 for the full design rationale.
//
// Why this exists as a hand-curated static file, not a discovered/generated one: these stations
// are NEVER itemized on foodpro-menu-ajax (the daily tid-keyed feed populate-dishes reads) at all
// -- confirmed live 2026-09-14 across all 4 halls, all 4 meal periods: the daily feed carries no
// "Salad Bar", "Yogurt Bar", or "Pizza" category for any hall. The only place the real item lists
// exist is af-foodpro1.campus.ads.umass.edu's longmenu.aspx (the same "Web INA" source
// supabase/functions/populate-retail-dishes/index.ts already established as this codebase's
// precedent for non-tid-fed public.dishes rows), so this list was curated from that source by hand
// rather than crawled -- there's no reliable machine signal that ties a longmenu.aspx category name
// to "this is one of the fixed all-day stations" vs. an ordinary meal-varying station that just
// happens to share a name.
//
// Curated from real longmenu.aspx category data captured live 2026-09-14 (Breakfast/Lunch/Dinner/
// Late Night, all 4 halls): dish names are exact, in the real page's own display order (which is
// alphabetical within each station on the live site).
//
// Yogurt Bar is deliberately OMITTED: checked every hall x every meal period, on both
// longmenu.aspx and the daily foodpro-menu-ajax feed, and found no itemized "Yogurt Bar" (or
// equivalent) station anywhere -- only stray individual grab-n-go yogurt cups under unrelated
// categories, not a station. Per the unlisted-station-logic annotation's own "blank = doesn't
// exist" convention (already how a hall lacking pizza is meant to behave), this file simply
// contains no Yogurt Bar entries rather than inventing placeholder ones. Re-curate by hand
// (see this file's own header) if UMass ever stands up a real one.
//
// Salad Bar exists (as "Salad Bar/Dressings" on longmenu.aspx) only at Worcester (tid 1) and
// Berkshire (tid 4) -- Franklin (tid 2) and Hampshire (tid 3) have no salad bar station at all,
// confirmed the same way. Pizza exists at all 4 halls.
//
// This is the single source of truth both the seeder
// (supabase/functions/populate-always-available-dishes/index.ts) and mobile's always-available
// station UI (task 3) read from. The Edge Function CANNOT import this file directly -- Deno can't
// resolve a local workspace package like @udine/shared (see populate-dishes/index.ts's own header
// comment for the established precedent) -- so it keeps its own literal copy, with a comment
// pointing back here, kept in sync by hand: this is a small curated list, not a generated one.

export interface AlwaysAvailableStation {
  station: string; // "Salad Bar" | "Yogurt Bar" | "Pizza"
  hallTid: number; // 1-4
  dishNames: string[]; // exact public.dishes.dish_name values, in display order
}

export const ALWAYS_AVAILABLE_STATIONS: AlwaysAvailableStation[] = [
  {
    station: "Salad Bar",
    hallTid: 1, // Worcester
    dishNames: [
      "American Cheese",
      "Broccoli Flowerettes",
      "Carrots Sticks",
      "Celery Sticks",
      "Cucumbers",
      "Grape Tomatoes",
      "Hard Boiled Egg",
      "Hummus",
      "Ketchup",
      "Lentils",
      "Lettuce",
      "Little Leaf Spring Mix",
      "Local Pickle Chips",
      "Mayonnaise",
      "Mixed Peppers",
      "Pulmuone Tofu",
      "Quinoa",
      "Red Onions",
      "Shredded Cheddar Cheese",
      "Tomato Slices",
    ],
  },
  {
    station: "Pizza",
    hallTid: 1, // Worcester
    dishNames: ["Cheese Pizza", "Meat Lover's Pizza", "Pepperoni Pizza", "Vegetable Pizza", "White Cheese Pizza"],
  },
  {
    station: "Pizza",
    hallTid: 2, // Franklin -- no Salad Bar station exists here (confirmed live, see header)
    dishNames: ["Cheese Pizza", "Pepperoni Pizza"],
  },
  {
    station: "Pizza",
    hallTid: 3, // Hampshire -- no Salad Bar station exists here (confirmed live, see header)
    dishNames: ["Cheese Pizza", "Pepperoni Pizza", "Vegetable Pizza"],
  },
  {
    station: "Salad Bar",
    hallTid: 4, // Berkshire
    dishNames: [
      "Alfalfa Sprouts",
      "Artichoke Spinach Pasta Salad",
      "Beans Black",
      "Carrots Sticks",
      "Celery Sticks",
      "Cheddar Cheese",
      "Chickpea Salad w/Teardrop Peppers & Artichoke Hearts",
      "Cucumbers",
      "Fat Free Cottage Cheese",
      "Golden Raisins",
      "Grape Tomatoes",
      "Green Peppers",
      "Homemade Red Pepper Hummus",
      "Italian Tuna Salad",
      "Kidney Beans",
      "Marinated Artichoke Hearts",
      "Onions",
      "Pepperoncini",
      "Peppers Red Roasted",
      "Pita Chips",
      "Pulmuone Tofu",
      "Pumpkin Seeds",
      "Roasted Pepper, Olive & Feta Salad",
      "Romaine Lettuce",
      "Sliced Eggs",
      "Sliced Mushrooms",
      "Sliced Olives Black",
      "Spinach Leaves",
      "Sunflower Seeds",
    ],
  },
  {
    station: "Pizza",
    hallTid: 4, // Berkshire
    dishNames: ["Cheese Pizza", "Pepperoni Pizza", "Vegetable Pizza"],
  },
];
