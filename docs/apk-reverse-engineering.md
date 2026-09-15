# UMass Dining APK — Reverse Engineering Notes

Source: `UMassDining_com.ionicframework.androidumassdining468431_60_-y2zv.apk` (package id is legacy — the app was originally Ionic/Cordova and was later rebuilt on **React Native + Hermes**; the old package id was kept). `libhermes.so` + `libreactnative.so` are present and `assets/index.android.bundle` (4.1MB) has the Hermes bytecode magic (`c6 1f bc 03 c1 03 19 1f`, version 96) — it is **not** readable JS source, so `jadx`/Fernflower (Java-only) are not useful here. All findings below come from `strings -n 6` over the raw Hermes bundle plus grep, not full bytecode disassembly.

**Important caveat on path names**: Hermes packs its string table with no separators between entries, so `strings` frequently merges an app string with the next unrelated string (an RN prop name, an icon name, etc.) into one printable run. Where a path below ends in something that reads as a plausible real word/camelCase phrase, confidence is high; where it trails into obvious UI/CSS garbage, the trailing part has been cut and the exact end of the real path is uncertain (flagged per-row). Getting exact query-parameter names/bodies for POST calls will need either a full Hermes string-table parse or a live mitmproxy capture against the real app — not attempted here.

## Two backend hosts

- `umassdining.com` — public content: menus, nutrition, events, news, FAQ, staff, campus info. No auth observed on any of these paths.
- `mobileapp.umassdining.com/umassapi2/public/...` — account features: employee/user profile, phone/SMS, favorites, preferences. Auth via `user_token` query param (not a Bearer header) — this is the account system UDine's Supabase auth needs to sit alongside/replace.

Also present: `ambassador.umassdining.com` (separate login-related host, purpose unclear — see gaps), OneSignal (push), and `portal.touchwork.com` (digital signage slide JSON — irrelevant to a mobile/web app, ignore).

## Tier 1 — endpoint inventory

| Host | Method | Path | Auth | Purpose (inferred) |
|---|---|---|---|---|
| umassdining.com | GET | `/foodpro-menu-ajax` | none | **Menu/nutrition data — the core endpoint.** High confidence on the path itself; params not recoverable from strings (likely location/date/meal query params based on nearby `getMealsByLocationIdandDate`, `meal_period`, `location_id`-shaped identifiers found elsewhere in the bundle). |
| umassdining.com | GET | `/main-location-foodpro...` | none | Location/menu listing; exact suffix uncertain, trails into garbage. |
| umassdining.com | GET | `/uapp/get_infov2` | none | **CONFIRMED** (2026-08-17, `curl -L` through the www redirect — all `/uapp/*` 301 from bare `umassdining.com` to `www.umassdining.com`, then 200 JSON). Array of 40 objects, one per dining location: `opening_hours`, `closing_hours`, `location_title`, `breakfast/lunch/dinner_open_time`/`close_time`/`menu`, `latenight_menu`, `locations` (HTML blob of full hours table). Hours/status, not menu content — lower priority than `foodpro-menu-ajax`. |
| umassdining.com | GET | `/uapp/get_updates` | none | **CONFIRMED**. Array of `{title, url, image, date}`. Data returned is stale (dated 2020) — likely an unmaintained feed, deprioritize. |
| umassdining.com | GET | `/uapp/get_notice` | none | **CONFIRMED**. Shape is `{"value": ""}` — single string field, currently empty. Not an array; don't assume list semantics. |
| umassdining.com | GET | `/uapp/get_new_faq` | none | **CONFIRMED**, exact suffix is just `get_new_faq` (no `Detail`). Shape: object keyed by category name (e.g. `"General"`) → array of `{title, content}`, `content` is an HTML string. |
| umassdining.com | GET | `/uapp/get_about` | none | Not independently verified this pass; same host/auth pattern as the confirmed siblings, low risk. |
| umassdining.com | GET | `/uapp/get_press` | none | **CONFIRMED**, exact path is just `/uapp/get_press` (no `Releases` suffix). Array of `{title, url, image, date}` — maps directly to the requested press-release feature. |
| umassdining.com | GET | `/uapp/get_staff` | none | **CONFIRMED** (2026-08-18, `curl -L` through the www redirect). Array of `{name, bio (HTML), title, department, email, profile_image, order}` — `order` is a string and missing on ~5 of 31 real entries, so it's not usable as a reliable sort key; the array itself already comes back in display order. `email` is also occasionally absent (e.g. "Student Ambassadors"). |
| umassdining.com | GET | `/uapp/get_newsletter` | none | **CONFIRMED** (2026-08-18, `curl -L` through the www redirect). Array of `{content (HTML, usually empty), period, link}` — a list of links to externally-hosted newsletter issues (mostly Mailchimp/campaign-archive), not in-app content. |
| umassdining.com | GET | `/uapp/get_galleries` | none | Not independently verified this pass. |
| umassdining.com | GET | `/uapp/get_videos` | none | Not independently verified this pass. |
| umassdining.com | GET | `/uapp/get_online_ordering` | none | Not independently verified this pass. |
| umassdining.com | GET | `/uapp/get_beacons_events` | none | **CONFIRMED**. Shape: `{"beacons": [{id, uuid, major, minor}], "events": [{title, featured_image, pdf_link, external_link, expiration_date (unix seconds), is_featured}]}`. The `events` array is exactly the dining-hall-events feature the user asked for and needs **no beacon involvement at all** — ignore `beacons` (BLE check-ins are an explicit non-goal, see CLAUDE.md) and just consume `events`. |
| umassdining.com | POST | `/uapp/save_coordinateForPoint` | none observed | Geolocation/beacon check-in — logs a coordinate against a point of interest. |
| ambassador.umassdining.com | ? | `/login` | ? | Separate login-adjacent host from the main content host; purpose (student ambassador program? alternate auth?) not determined. |
| mobileapp.umassdining.com | GET | `/umassapi2/public/get_employee?user_token=` | `user_token` query param | Fetch logged-in user's profile. "Employee" naming suggests this system was originally built for dining-hall staff, then reused for the general user account. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/editEmployee` | `user_token` (assumed) | Update user profile. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/saveEmployeePhone` | `user_token` (assumed) | Save phone number. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/saveEmployeeSMS` | `user_token` (assumed) | Likely SMS-OTP verification step (an unused `READ_SMS`-shaped permission string also appears in the bundle, consistent with SMS auto-fill). |
| mobileapp.umassdining.com | GET/POST | `/umassapi2/public/favorite...` | `user_token` (assumed) | Favorites CRUD — see favorites system below. |
| mobileapp.umassdining.com | GET/POST | `/umassapi2/public/preference...` | `user_token` (assumed) | User preferences (likely dietary/allergen selections — see below). |
| onesignal.com | POST | `/api/v1/notifications` | OneSignal REST API key | **Push notifications confirmed via OneSignal**, not raw FCM. |
| af-foodpro1.campus.ads.umass.edu | GET/POST | `/foodpro.net/{location,shortmenu,longmenu,search,label,pic}.aspx` | none | **CONFIRMED** (2026-09-13). Public "Web INA" nutrition-lookup tool (vendor: Aurora Information Systems per page SSI comments, not confirmed CBORD) — see its own section below for the full writeup (this is not linked from anywhere in the official app's own strings; found via `umassdining.com/nutrition/nutrient-analysis`). |

## Existing favorites / dietary system (found as JS action-name strings, not endpoints — but tells us the client-side data model)

The bundle contains what look like Redux/action-type constants and function names for a **favorites system that already covers both dishes and locations**, and a **full allergen/diet filter system**:

- Dishes: `getFavoriteDishes`, `addFavoriteDish`, `deleteFavoriteDish`
- Locations: `GET_FAVORITES`, `getFavoriteLocations`, `addFavoriteLocation`, `setFavoriteLocation`, `removeFavoriteLocation`, `REMOVE_FAVORITE_LOCATION`
- Preferences: `getPreferencesFromServer`
- Allergens/diet: `allergens`, `ADD_ALLERGEN`, `getAllergens`, `IntroAllergensScreen`, `DietScreenContext`, `selected_allergens`, `dietary`
- Nutrition: `nutrition`, `nutritional`, `calories_from_fat`, `getMealsByLocationIdandDate` (name strongly implies the menu endpoint takes a location id + date)
- Newsletter: `subscribe_newsletter`, `subscribe_to_newsletter`
- Local notifications: `getScheduledLocalNotification`, `cancelAllLocalNotifications` — the app schedules its own local reminders in addition to OneSignal push.

This is the existing app's version of "favorite foods/locations" and "dietary filters" the user asked for — it's **binary favorite, not a beli-style ranking**. There's no rating/score/leaderboard string anywhere in the bundle (searched for `rank`, `rating`, `review`, `beli` — only generic UI strings like "Rating" component names from a UI library, no app-specific ranking feature). Beli-style ranking is a genuinely new feature UDine needs to build, not something to port.

## Feature inventory (from strings, manifest not decoded — see gaps)

- Push notifications: OneSignal (confirmed)
- Local/scheduled notifications: yes (separate from push)
- BLE beacons: yes (`get_beacons_events`, `save_coordinateForPoint` — likely Estimote/iBeacon-style dining-hall proximity check-ins tied to events)
- Geolocation: yes (coordinate saving)
- SMS: likely OTP/phone verification flow
- Social share links: Instagram, Twitter/X, TikTok, YouTube, Facebook links present (marketing, not API integration)
- No Google Maps API key or Firebase config secret found in the bundle (searched for `AIza...` and firebase/google-services strings — none matched as embedded credentials, only generic library code)

## `foodpro-menu-ajax` — CONFIRMED via live browser network capture (2026-08-17)

The strings-only pass above couldn't recover query params for the core menu endpoint. Verified by
loading `www.umassdining.com/locations-menus/hampshire/menu` in a real browser and triggering the
"Upcoming Menus" date `<select>` (`#upcoming-foodpro`), which fires exactly this request:

```
GET https://www.umassdining.com/foodpro-menu-ajax?tid=<drupal_taxonomy_term_id>&date=MM%2FDD%2FYYYY
```

- `tid` is the Drupal taxonomy term ID for the dining location — **not** a FoodPro location number.
  Confirmed for all four residential dining commons via `data-drupal-link-system-path="taxonomy/term/N"`
  on the location nav links: **Worcester=1, Franklin=2, Hampshire=3, Berkshire=4**. (Other tids exist
  for Campus Center=5, Around Campus=6, Grab 'N Go=53, Student Businesses=54, Off-Campus=46 — lower
  priority, not verified against live menu data.)
- `date` is `MM/DD/YYYY`, URL-encoded (`/` → `%2F`).
- No auth required.
- Response shape: `{ "breakfast": { "<category name>": "<html fragment>", ... }, "lunch": {...},
  "dinner": {...} }` — meal periods missing from the day (e.g. no breakfast served) are simply absent
  as keys, not present-with-empty-array. **Correction (2026-08-21, #117):** there's a 4th possible
  key, `"late night"` (a literal space, not `"latenight"`) — confirmed live (Worcester, tid=1,
  08/21/2026: `{"lunch":...,"dinner":...,"late night":...}`). `shared/src/umassDining.ts`'s
  `fetchMenu` previously only ever looked up `breakfast`/`lunch`/`dinner`, silently dropping this
  period's dishes; it now maps the `"late night"` wire key to `MealPeriod` `"latenight"`. Each HTML
  fragment is a `<li class="lightbox-nutrition">` list;
  parse it, don't treat it as structured JSON. Each `<li><a data-*=... >Item Name</a></li>` carries the
  full nutrition panel as data attributes on the `<a>` tag:
  `data-serving-size`, `data-calories`, `data-calories-from-fat`, `data-total-fat[-dv]`, `data-sat-fat[-dv]`,
  `data-trans-fat`, `data-cholesterol[_dv]`, `data-sodium[-dv]`, `data-total-carb[-dv]`, `data-dietary-fiber[-dv]`,
  `data-sugars[-dv]`, `data-protein[-dv]`, `data-allergens`, `data-ingredient-list`, `data-clean-diet-str`
  (e.g. "Halal, Local, Sustainable, Plant Based, Whole Grain"), `data-healthfulness`, `data-carbon-list`,
  `data-recipe-webcode`, `data-dish-name`. The link text is the display name; `data-dish-name` is the
  canonical name to key on. **Correction (2026-09-13):** an earlier version of this note treated
  `data-recipe-webcode` as a candidate nutrition/ID field (its name suggests one). Live samples show
  it's actually the diet/allergen **legend string** — space-separated codes like `"H VGN H4 CR1"`
  (Halal, Vegan, Healthfulness=4, Carbon rating=1) or `"LPR SUS VGT H3 CR2"` (Local, Sustainable,
  Vegetarian, Healthfulness=3, Carbon rating=2) — unrelated to the numeric ID printed on physical
  nutrition cards. See the Web INA section below for what that numeric ID actually is and where it's
  looked up.
- Requesting a day with no live data returns `[]` (empty array) with HTTP 200 — not an error, and not
  `{}`. **Correction (2026-08-19):** an earlier note here guessed `[]` was the "malformed request" shape
  and `{}` the "no menu" shape; live probing valid `tid`+`date` pairs outside the data window (past dates,
  +14 days, +1 year) shows they all return `[]`. Treat any non-object response as "no menu available".
- **Future dates — CONFIRMED (2026-08-19), same endpoint, rolling ~2-week window.** The official app's
  upcoming-menu support is this same endpoint with a future `date` param, not a separate API: the Hermes
  bundle carries the literal string `https://umassdining.com/foodpro-menu-ajax` alongside
  `getMealsByLocationIdandDate` and an `MM/DD/YYYY` format string, and the website's "Upcoming Menus"
  `<select>` fires it (capture above). Live probe from 2026-08-19 (tid=3): every day from **today through
  +13 days** returned full menus (~200–250KB); **+14 days and beyond returned `[]`**, and **all past dates
  (even yesterday) returned `[]`** — no history, forward-only. The exact horizon presumably rolls with
  UMass's menu-publishing cycle (observed boundary landed on 09/01 vs 09/02); clients should treat the
  window as "today plus roughly two weeks, discovered empirically per request" rather than hardcoding 13.
- The current redesigned website (`umass_dining_new` Drupal theme) does **not** call this endpoint on
  initial page load — the day's default menu is server-rendered directly into the page HTML using the
  same data-attribute format. `foodpro-menu-ajax` only fires client-side when switching days via the
  date picker. Either source (initial HTML scrape or the ajax endpoint with an explicit date) works;
  the ajax endpoint is more directly usable as an API since it returns clean JSON instead of a full page.

## FoodPro "Web INA" (public nutrition-lookup tool) — CONFIRMED (2026-09-13)

The small printed code on UMass Dining's physical nutrition table-tents (e.g. Blue Cheese Crumbles:
`181086 9.1.26`; Pumpkin Seeds: `186046`) is a **FoodPro `RecNum`** (recipe/item ID), and it's directly
usable as a public lookup key against a "Web INA" (Ingredient/Nutrition Analysis) tool, which
`umassdining.com/nutrition/nutrient-analysis` links to. **Vendor correction:** an earlier pass of this
note called this "CBORD Web INA" on the assumption that it's the same CBORD FoodPro system behind
`foodpro-menu-ajax`; the page's own server-side-include comments actually attribute it to **Aurora
Information Systems**, not CBORD. Treat "CBORD" as unconfirmed for this specific tool — the two may
still share a database (same `RecNum` scheme, same UMass FoodPro deployment), but the web front-end
itself is a different vendor's product.

- **Base:** `https://af-foodpro1.campus.ads.umass.edu/foodpro.net/` (128.119.167.180) — a plain
  public IIS/.NET site, no auth, no API key.
- `location.aspx` — lists **28** FoodPro `locationNum`s (corrected from an earlier "~50+" estimate):
  the same 4 residential halls as `foodpro-menu-ajax`'s `tid`s (01–04, same order) **plus 24**
  retail/café spots the `tid` system doesn't reach at all (Whitmore Cafe=08, Worcester Cafe=13,
  Bluewall Grill=14, Bluewall Deli Delish=20, Courtside Cafe=21, Bluewall Tavola=22, Harvest=23, and
  others).
- `shortmenu.aspx?sName=%60&locationNum=NN&locationName=...&naFlag=1` — per-location menu, dish names
  only. Needs a session cookie primed by first hitting `location.aspx` (a cold direct fetch 500s
  without one). **Does not embed `RecNum`/`label.aspx` links per dish** — verified live (Worcester,
  today): zero `RecNumAndPort` occurrences in the response. Use `longmenu.aspx` instead when you need
  per-dish IDs in bulk (below).
- `longmenu.aspx?sName=%60&locationNum=NN&locationName=...&naFlag=1&WeeksMenus=...` — bulk per-location
  menu that, unlike `shortmenu.aspx`, embeds a `label.aspx?...&RecNumAndPort=<recnum>&dtdate=...` link
  on every dish row. Confirmed live: 31 dishes for Worcester (locationNum=01) today, each carrying its
  own `RecNum` — this is the actual "list every dish + its ID for one location" endpoint, not
  `shortmenu.aspx`. **Caveat:** 31 rows is well short of the same hall/day's ~131-144 total dish count
  from `shortmenu.aspx`/`foodpro-menu-ajax`; one request appears scoped to one meal period, not the
  whole day (the exact meal-selector param wasn't isolated). Budget roughly one `longmenu.aspx`
  request per (location, meal period), not per (location, day).
- `search.aspx` (POST, `Action=SEARCH&strCurKeywords=<name>`) — full-text (substring, not just exact)
  dish search across every location and future date. Each hit links to
  `label.aspx?...&RecNumAndPort=<recnum>*<portion>`. **`RecNum` is per-hall-recipe, not a global ID for
  a dish name**: searching "Bacon" returns 6 distinct `RecNum`s across just Franklin and Worcester —
  the same display name can be a different FoodPro recipe at every location that serves it. A
  name-only search on a common dish is ambiguous; disambiguate by cross-referencing the result's own
  `locationName` against whichever hall you already know the dish came from.
- `label.aspx?locationNum=NN&locationName=...&dtdate=M%2fD%2fYYYY&RecNumAndPort=<recnum>*<portion>` —
  the actual Nutrition Facts label. **Fully stateless and public** — verified from a completely fresh
  cookie jar, no prior request needed.
- `pic.aspx?PicPath=/FoodPro/Pictures/<num>.jpg&RecName=<name>&Width=&Height=&Fit=0` — dish-photo
  popup. The embedded picture number **is** the dish's own `RecNum` (confirmed: `163019` →
  `label.aspx` correctly returns "Whole Grain Penne"), so it's a free incidental cross-check when
  present — but coverage is sparse (2 of 144 dish rows had a photo in the Worcester sample), not
  viable as a primary bulk source.
- `allergenfilter.aspx?strcurlocationnum=NN` — UI-only JS popup for filtering by allergen; returns an
  interactive form, not data. Irrelevant to scraping.
- `allergenfilterinc.aspx`, `date.aspx`, `fieldfilt.aspx`, `head.aspx`, `nauserdata.aspx` — **not
  independently-fetchable endpoints.** Every occurrence found is inside an HTML comment
  (`<!-- fieldfilt.aspx, Version 2.6.0 -->`) marking an internal ASP.NET server-side-include boundary
  (page header, the date-picker widget, a field-filter dropdown, the allergen-filter list, and a
  nutrition-session/user-tracking include, respectively). Nothing to call here.
- Generic CBORD/vendor-convention guesses tried and cleanly 404'd: `default.aspx`, `welcome.aspx`,
  `menu.aspx`, `printmenu.aspx`, `NutrientCalcSummary.aspx`.

**Verified directly against the two physical-card examples:** searching "Pumpkin Seeds" returns
`RecNumAndPort=186046*1/2` (Berkshire) — matches the card's `186046` exactly, and `label.aspx` for it
reports Calories 71 / Total Fat 4.3g / Sodium 7.1mg / Protein 2.8g, identical to the same dish's
`data-calories`/`data-total-fat`/etc. already served by `foodpro-menu-ajax`. Searching "Blue Cheese
Crumbles" returns `RecNumAndPort=181086*1` (Harvest) — matches the card's `181086` exactly.

The `9.1.26`-shaped date suffix on the Blue Cheese Crumbles card did **not** reproduce anywhere on the
`label.aspx` page — no date field there. That part of the ID theory is unconfirmed; it's most likely a
print-batch/verified-date stamp specific to whatever internal report template drives the physical
table-tent printouts, not something this public tool exposes. Don't assume it's independently
fetchable.

**What this adds over `foodpro-menu-ajax`** (which already carries full macro nutrition per dish via
`data-*` attributes for whatever's on the visible ~2-week menu at the 4 halls): micronutrient %DV
(calcium, iron, potassium, vitamin D — absent from the ajax feed's attributes), coverage of the 24
retail/café `locationNum`s the 4-hall `tid` system can't reach, name-based search across dates outside
the ajax feed's rolling window, and a stable-per-hall numeric recipe ID that doesn't depend on
matching display-name strings day to day. It does **not** beat the ajax feed for a dish already on
today's/this-week's menu at one of the 4 halls — same nutrition data, just less of it per dish, and
`RecNum` resolution for a common name needs the location-disambiguation step above.

Implementation-wise this is the same HTML-attribute/table scraping style as the existing
`foodpro-menu-ajax` parser (`shared/src/umassDining.ts`) — no new technique needed. `shortmenu.aspx`/
`longmenu.aspx`/`search.aspx` need a cookie jar primed by one prior `location.aspx` GET; `label.aspx`
is stateless. No rate limiting or auth encountered across the ~40 real requests made during this
research pass (2026-09-13) — be a polite scraper anyway, this is UMass IT infrastructure, not a CDN.

See `docs/decisions-log.md` → "Web INA: mirror vs. on-demand, and the `populate-dishes` cron"
(2026-09-13) for the architecture evaluation this research fed into.

**Follow-up, confirmed live during implementation (2026-09-14) -- see `docs/decisions-log.md`'s
`populate-retail-dishes` entry for the full writeup:**
- `longmenu.aspx` takes a `mealName` query param -- exactly `Breakfast`, `Lunch`, `Dinner`, or
  `Late Night` (literal space, exact casing). This is the meal-period selector this section's
  "Caveat" paragraph above flagged as unisolated -- found and confirmed. Omitting it silently
  defaults to a single period (not reliably "today's current period" -- default counts varied
  unpredictably by location), so it must always be passed explicitly; one `longmenu.aspx` request
  per (location, meal period) is the real unit of work, i.e. 4 requests per location per day, not 1.
  `mealName=All` is invalid (0 results). `WeeksMenus=` was tested and has no effect on scope.
- No bulk `RecNum` enumeration shortcut exists: no sitemap/export endpoint, and `search.aspx`
  can't be repurposed as a wildcard scan either (an empty query returns "No Result", a single-
  character query 500s). `longmenu.aspx` walked per (location, meal period) remains the only known
  bulk-discovery mechanism.
- `label.aspx`'s Nutrition Facts table markup, precisely: every field except Calories/Calories from
  Fat is two adjacent `<font>` tags -- `<font ...>(?:<b>)?Label&nbsp;(?:</b>)?</font><font
  ...>Value</font>` (the label tag may or may not be bold, and may carry leading `&nbsp;` padding,
  e.g. "Sat. Fat"). Calories and Calories from Fat are inline in one tag instead:
  `<b>Calories&nbsp;348</b>` / `Calories from Fat&nbsp;2` (no separate value tag). Allergens are a
  distinct `<span class="labelallergensvalue">Milk, Gluten, ...</span>` line elsewhere on the page.
  No diet-tag equivalent (nothing matching `foodpro-menu-ajax`'s Local/Vegetarian/Sustainable-style
  tags) was found anywhere on this page.

**Retail-menu-browsing research pass (2026-09-14) -- endpoint hardening for the question "could this
tool back a retail 'browse the menu' screen, not just a nutrition catalog?" (see
`docs/decisions-log.md`'s "RecNum storage and retail-menu-browsing architecture" entry for the
architecture recommendation this fed into):**

- **`longmenu.aspx` DOES group dishes by station/category, confirmed live.** Each response
  interleaves `<td><div class='longmenucolmenucat'>-- CategoryName --</div></td>` marker rows among
  the `longmenucoldispname` dish rows -- e.g. Bluewall Grill's Lunch (`locationNum=14`) grouped 28
  dishes under 2 categories (`-- Entrees --`, `-- Add-ons --`); Bluewall Tavola's Lunch
  (`locationNum=22`) grouped 17 dishes under 5 (`-- Pasta --`, `-- Salad --`, `-- Pizza --`,
  `-- Brkfst Salad --`, `-- Bowls --`). Structurally the same idea as `foodpro-menu-ajax`'s
  meal→category grouping, just a sibling marker row instead of a nested JSON key -- a retail
  "browse this location's menu" screen built on `longmenu.aspx` *could* mirror `HallMenu`'s
  station-grouped layout rather than needing a flat list. **Not currently parsed anywhere**:
  `populate-retail-dishes/index.ts`'s `parseLongMenuDishes` (`supabase/functions/populate-retail-dishes/index.ts:158-168`)
  is deliberately scoped to `longmenucoldispname` only and silently drops every `longmenucolmenucat`
  marker -- correct for that function's nutrition-catalog-only job, but the category context is
  gone by the time a dish reaches `public.dishes`.
- **`location.aspx` carries no hours/type/address metadata for retail locations** -- confirmed by
  direct inspection of a live `location.aspx` fetch (2026-09-14): every retail entry is exactly
  `<a href='shortmenu.aspx?...&locationNum=NN&locationName=...'>DisplayName</a>`, nothing else.
  **That metadata already exists in this codebase, from a completely different UMass source**:
  `umassdining.com/uapp/get_infov2` (`shared/src/hours.ts`, already wired up and consumed by
  `mobile/src/lib/cafeMenu.ts` -- see the decisions-log entry) returns, per location,
  `location_title`, `opening_hours`/`closing_hours`, per-meal open/close times, `address`,
  `map_address` (lat/long), `accepted_payment`, and `breakfast_menu`/`lunch_menu`/`dinner_menu` HTML
  blobs -- plus a `location_id`. Confirmed live (2026-09-14): `get_infov2` returns 40 locations (more
  than Web INA's 28), and **`location_id` is a completely different numbering from Web INA's
  `locationNum`, with different display-name spellings too** -- e.g. Web INA's `locationNum=14`
  ("Bluewall - Grill") is `get_infov2`'s `location_id=4696` ("The Grill"); Web INA's `locationNum=23`
  ("Harvest") is `location_id=4306` ("Harvest Market"). No cross-reference between the two id/name
  spaces exists anywhere in the codebase today -- name-matching would be the only option, and isn't
  safe to automate given spelling drift like the two examples above.
- **Re-verified live 2026-09-14 (~24h after the original pass):** `mealName` behavior unchanged
  (`Breakfast`/`Lunch`/`Dinner`/`Late Night` still required exactly as documented); the
  `location.aspx` → cookie → `longmenu.aspx` flow still needs the cookie. Across roughly 45 real
  requests this pass (a full 28-location `location.aspx` fetch, `longmenu.aspx` for ~24 distinct
  retail locations at `mealName=Lunch`, plus a handful of `label.aspx` fetches), **no rate limiting
  was encountered** -- every request returned 200. Separately, queried this project's
  (`ubogyqskqzvkcqboqbhw`) `cron.job_run_details` for the `populate-retail-dishes-weekly` job
  (schedule `0 7 * * 0`) live via the Supabase MCP tools: it is **empty** -- the job hasn't fired for
  real yet (created 2026-09-14, after that week's Sunday 07:00 UTC slot already passed; first real
  run is 2026-09-20). `public.dishes` has exactly one retail-sourced row (`last_seen_hall_tid < 0`),
  `updated_at` 2026-09-14 09:19 UTC, consistent with the "manually invoked once" test the
  `populate-retail-dishes` decisions-log entry describes, not a cron run. **Whether rate limiting
  appears under real weekly-cron load is still unverified** -- there's no live-cron evidence yet
  either way; recheck after the first real run.
- **No cheaper "what's on location X's menu right now" shortcut found**, re-confirming the
  2026-09-14 follow-up above (`longmenu.aspx` per (location, meal period) remains the only bulk path,
  no sitemap/export/wildcard-search shortcut). One partial mitigation worth noting: `get_infov2`
  already reports, per location, which meal periods have real hours/menu content (null vs. populated
  `breakfast_open_time` etc.), so a caller could skip crawling `longmenu.aspx` for a meal period a
  location doesn't serve at all (e.g. a coffee-only café has no dinner) -- but this is only usable
  once the `location_id`↔`locationNum` cross-reference gap above is solved, since that's what would
  tell a Web INA crawler which `get_infov2` entry corresponds to which `locationNum`.
- **Sharpens the existing "394 unique dish names / 415 unique `RecNum`s" finding in the
  `populate-retail-dishes` entry above with a per-location breakdown, and confirms it's common, not
  rare:** live-sampled `longmenu.aspx` at `mealName=Lunch` across 24 retail locations (2026-09-14)
  surfaced 358 unique dish names, of which **17 (~4.7%) had more than one distinct `RecNum` across
  locations**. Cross-checked against live `public.dishes` (2026-09-14, via the Supabase MCP tools):
  **9 of those 17 turn out to already be hall dish names** (e.g. "French Fries", "Cheese Pizza",
  "Tuna Salad" -- all `last_seen_hall_tid` 1-4) -- `fetchExistingDishNames`'s skip-list means the
  retail crawler never attempts a `label.aspx` fetch for these at all, so they're permanently routed
  to hall nutrition and never actually reach the retail-vs-retail conflation path described below.
  **The remaining 8 are genuinely retail-exclusive** (not in `public.dishes` at all yet, confirmed by
  the same query) -- e.g. "Guacamole" is `RecNum 040132` at Bluewall Deli Delish (`locationNum=20`,
  Calories 37, Sodium 211.5mg, Serving Size "1 oz") vs. `RecNum 042123` at Roots Cafe
  (`locationNum=45`, Calories 43, Sodium 85.1mg, same serving size) -- a genuinely different recipe
  under the same display name, not a rounding artifact. These 8 are the ones where the conflation
  risk described in `docs/decisions-log.md`'s "RecNum storage and retail-menu-browsing architecture"
  entry is real and not-yet-manifested: once the crawler writes one location's version, the other's
  is discarded permanently under the current upsert-by-name logic.

**Retail nutrition-gap enumeration (2026-09-14) -- which retail locations have ZERO FoodPro
nutrition source (neither `foodpro-menu-ajax` nor Web INA), and what's actually at each one. Feeds
`docs/decisions-log.md`'s "Retail nutrition gap: enumeration and path forward" entry:**

- **Full `get_infov2` enumeration, live (2026-09-14):** `curl -sL https://www.umassdining.com/uapp/get_infov2`
  returns exactly **40 locations** -- the 4 halls plus **36 retail entries** (a bare `umassdining.com`
  host, no `www.`, doesn't redirect the same way for this path in every environment; use the `www.`
  host directly and `-L` to be safe, matching `shared/src/hours.ts:4`'s own `BASE`). No headers/auth
  needed, GET only, confirming `shared/src/hours.ts:146-151`'s `fetchDiningHours` implementation
  exactly.
- **Tested every one of the 36 retail `location_id`s against `foodpro-menu-ajax?tid=<id>&date=...`**
  across today + 1/3/7/13 days out (the full rolling window documented above). **28 have a real feed**
  (non-`[]` on at least one sampled date) -- including **Terrace** (`location_id=11150`), which
  returned `[]` on 2 of the 5 sampled dates and full menus (47-88KB) on the other 3: a real,
  intermittent/low-frequency "integrated" location, not a zero-feed one -- a correction to an
  assumption this research task started with (only Argo Tea/UMass Store/Paciugo were previously
  spot-checked; Terrace hadn't been). **The remaining 8 returned `[]` on every one of the 5 sampled
  dates** -- see next bullet. Full per-location result, live 2026-09-14 (`resp_len` = bytes of the
  day-0 `foodpro-menu-ajax` response; `2` means literal `[]`):

  | `location_id` | Name | day-0 `resp_len` | Tier |
  |---|---|---|---|
  | 647 | Worcester Café | 132194 | integrated |
  | 1724 | Roots Café | 280277 | integrated |
  | 5991 | Paciugo | 2 | **gap** |
  | 32 | People's Organic Coffee | 34489 | integrated |
  | 4306 | Harvest Market | 260726 | integrated |
  | 4661 | Tavola | 144046 | integrated |
  | 4666 | Yum! Bakery | 2 | **gap** |
  | 4671 | Green Fields | 163214 | integrated |
  | 4676 | Tamales | 176932 | integrated |
  | 4681 | Wasabi | 133904 | integrated |
  | 4686 | Deli Delish | 44084 | integrated |
  | 4691 | Star Ginger | 103757 | integrated |
  | 4696 | The Grill | 112724 | integrated |
  | 9605 | Argo Tea | 2 | **gap** |
  | 10666 | Berkshire Grab 'N Go | 49040 | integrated |
  | 10667 | Worcester Grab 'N Go | 38150 | integrated |
  | 10716 | Franklin Grab 'N Go | 33369 | integrated |
  | 10715 | Hampshire Grab 'N Go | 18686 | integrated |
  | 14 | Whitmore Café | 96965 | integrated |
  | 17 | Procrastination Station | 55317 | integrated |
  | 18 | Courtside Café | 62225 | integrated |
  | 883 | ISB Café | 43302 | integrated |
  | 1723 | Hampshire Café | 42034 | integrated |
  | 4311 | Peet's Coffee & Tea | 36376 | integrated |
  | 61 | babyBerk | 2 | **gap** |
  | 884 | babyBerk 2 | 2 | **gap** |
  | 2061 | Morrill Café | 28167 | integrated |
  | 9150 | The Hub | 44381 | integrated |
  | 9980 | Newman Café | 113910 | integrated |
  | 9981 | Snack Overflow | 2 | **gap** |
  | 9967 | UMass Store | 2 | **gap** |
  | 10293 | Post & Bean Café | 42064 | integrated |
  | 10372 | Charles River Campus of UMass Amherst | 218300 | integrated |
  | 10392 | Carney Café | 77239 | integrated |
  | 10709 | The Commonwealth Restaurant | 2 | **gap** |
  | 11150 | Terrace | 2 (day-0; 47750/87911 on +3/+7) | integrated (intermittent) |

  28 integrated + 8 gap = 36, the full retail set.
- **Cross-referenced those 9 against Web INA's 24 retail `locationNum`s** (`location.aspx`, re-fetched
  live 2026-09-14, same 24 names as already documented above) by fuzzy name match. **8 have zero
  presence in either system** -- these are the actual "standing-menu-only, genuinely zero nutrition
  source" set this research task asked to enumerate:

  | `get_infov2` name | `location_id` | Vendor type |
  |---|---|---|
  | Paciugo | 5991 | Real, currently-operating international gelato chain |
  | Argo Tea | 9605 | Formerly a real national café chain; company shut down its physical cafés nationally (see below) |
  | UMass Store | 9967 | UMass's own campus merchandise/gift store, not primarily a dining venue |
  | Yum! Bakery | 4666 | UMass Dining's own in-house bakery brand |
  | babyBerk | 61 | UMass Dining's own food-truck brand |
  | babyBerk 2 | 884 | UMass Dining's own food-truck brand (second truck) |
  | Snack Overflow | 9981 | UMass Dining's own in-house café brand (inside the CS building) |
  | The Commonwealth Restaurant | 10709 | UMass's own student-run, reservation-based fine-dining restaurant (Isenberg hospitality program) |

  (Full 36-location resp-length table and the fuzzy-match working notes are in this research pass's
  scratch output, not reproduced here -- the 8-row table above is the actionable result.)
- **The other 2 "extra" Web INA names this task's brief flagged for disambiguation resolve cleanly,
  for completeness:** `locationNum=23` "Harvest" = `get_infov2`'s "Harvest Market" (`location_id=4306`,
  already noted above); `locationNum=40` "People's Organic Cafe" = `get_infov2`'s "People's Organic
  Coffee" (`location_id=32`) -- confirmed **integrated** (`foodpro-menu-ajax?tid=32` returned 34KB
  live), so it's not part of the gap despite the "Cafe"/"Coffee" name drift.
- **2 Web INA `locationNum`s don't correspond to anything in the current 40-location `get_infov2` set
  at all: `locationNum=52` "Marcus Cafe" and `locationNum=54` "OIT Cafe".** Neither name appears
  anywhere in a live `get_infov2` fetch (checked by substring search over the raw JSON), and both
  return **zero dish rows on `longmenu.aspx` for all four `mealName` values** (Breakfast/Lunch/Dinner/
  Late Night), unlike every real retail `locationNum` sampled elsewhere in this doc. Read together,
  this looks like a stale/decommissioned pair of directory entries Web INA never pruned, not a live
  gap location -- there's no current standing-menu content anywhere to even attempt to source
  nutrition for. Not counted in the 8-location gap table above; flagged here so a future pass doesn't
  waste time trying to resolve them as real locations.
- **Paciugo (`location_id=5991`) currently has no item list at all, not just no nutrition**:
  `get_infov2`'s entry for it carries only a `short_description_v2` -- no `breakfast_menu`/
  `lunch_menu`/`dinner_menu` field is populated (live JSON, 2026-09-14). `pickCafeMenuHtml`
  (`mobile/src/lib/cafeMenu.ts:139-141`) therefore returns `null`, `parseRetailMenuHtml(null)`
  (`shared/src/content.ts:113`) returns `{ kind: "empty" }`, and `resolveCafeMenuState`
  (`cafeMenu.ts:86-95`) falls through to `{ kind: "info", pdf: null }` -- hours/address/directions
  only, the same as a location with literally nothing published. This is the most acute case in the
  gap table: Paciugo shows *no menu at all* today, not a name-only standing menu waiting on a
  nutrition match.
- **`get_infov2`'s own data has a copy/paste bug for Yum! Bakery**: its `breakfast_menu` field is
  `<p>Paciugo Gelato</p><p>Homemade cookies, pastries, and cakes</p>` (live JSON, 2026-09-14) --
  Paciugo's own description text, not a real Yum! Bakery item list (the two are physically adjacent
  concepts in the Blue Wall, consistent with a UMass CMS content mixup). `parseRetailMenuHtml` would
  parse this into 2 name-only "items" ("Paciugo Gelato", "Homemade cookies, pastries, and cakes"),
  neither of which is a real orderable dish name -- upstream UMass data quality, not something
  fixable from this codebase.
- **UMass's own public website was checked for content beyond the APIs already reverse-engineered,
  for all 8 gap locations -- both each location's `/locations-menus/...` landing page AND its
  dedicated `/menu/...` page, live 2026-09-14, every fetch below is a real WebFetch/curl made this
  pass:**
  - **`umassdining.com/menu/<slug>` renders every one of the 8 gap locations through the exact same
    menu-item template a real hall/integrated-café page uses -- and for all 8, every nutrition field
    on that template is an unfilled placeholder token**, confirmed live for: Paciugo
    (`/menu/paciugo-dining-menu` -- `#serving_size#`, `#calories#`, `#fat_cal#`, `#allergens#`,
    `#ingredient#`, no real flavor names at all), Argo Tea (`/menu/argo-tea-menu` -- the same 18-item
    sample list already known from `get_infov2`, but `#calories#`/`#allergens#`/`#ingredient#` still
    literal placeholder text, never filled in), babyBerk and babyBerk 2 (`/menu/baby-berk`,
    `/menu/baby-berk-2` -- same empty-placeholder template, PDF link present but not the nutrition
    fields), Snack Overflow (`/menu/snack-overflow-menu` -- `#calories#`, `#fat_cal#`,
    `#healthfulness_single#/7` all literal, unfilled), The Commonwealth Restaurant
    (`/menu/commonwealth-menu` -- `Serving Size #serving_size#`, `Calories #calories#`, `Total Fat
    #total_fat#`, `#allergens#` all literal), and Yum! Bakery (`/menu/um-bakery-blue-wall-menu` --
    reports "This location is closed at this time" and shows the same unfilled-placeholder template
    underneath). **This is strong, directly-cited confirmation that UMass's own website carries no
    hidden nutrition source for any of these 8 -- it's driven by the identical backend template as
    `foodpro-menu-ajax`/Web INA, just with nothing behind it for these locations, not a separate,
    richer content system.**
  - **UMass Store**'s `/locations-menus/campus-center/umass-store` page (fetched live) shows no
    menu/nutrition content and no "today's menu" link at all -- only hours/address/payment info,
    consistent with it not really being a dining venue (see vendor-type table above).
  - **The one genuinely new (non-nutrition) content this turned up**: `get_infov2`'s `breakfast_menu`
    field for **babyBerk**/**babyBerk 2** and **The Commonwealth Restaurant** links to a UMass-hosted
    PDF (already the PDF-link case `parseRetailMenuHtml` handles,
    `shared/src/content.ts:113-120`) -- babyBerk's at
    `umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf` (and the
    `...2 FA25...` sibling), Commonwealth's 4 PDFs (Lunch, Dinner, Lite Fare, Dessert). Fetched all
    live 2026-09-14: **every one is item name + description + price only, zero nutrition figures,
    zero allergen table** -- the same conclusion as the `/menu/` pages, just via a different
    document. The Commonwealth Restaurant's PDFs are explicitly season-coded in their filenames
    ("Summer 26"), i.e. a rotating seasonal menu, not a stable one.
- **Vendor-nutrition-page check for the 2 real branded chains in the gap table (2026-09-14):**
  - **Paciugo**: official page `paciugo.com/nutrition/` is live and real, but only publishes 2 coarse
    comparison rows (Vanilla Gelato: 150 cal/4.5g fat per 100g; Sorbet: 90 cal/0g fat per 100g) versus
    competitor products -- not a per-flavor breakdown, and UMass's own description says flavors rotate
    "on a daily basis" with no published rotation list anywhere. Third-party aggregators (Nutritionix,
    MyNetDiary, SparkPeople, CarbManager) carry more granular per-flavor numbers (e.g. mint chocolate
    chip 170 cal, pistachio 343 cal/cup) but with no stated provenance tying them to UMass's specific
    rotation, and no way to know which flavors are even on offer on a given day without a source that
    doesn't exist.
  - **Argo Tea**: the company closed its café locations nationally around 2020 and pivoted to
    bottled-tea retail under new ownership (Golden Fleece Beverages); its official site,
    `argotea.com/pages/nutrition`, returned **HTTP 402 Payment Required** on a live fetch (2026-09-14,
    both via WebFetch and a direct `curl`) -- consistent with a lapsed/unmaintained storefront, not a
    live nutrition source. Third-party aggregators (MyFitnessPal, FatSecret, Nutritionix, MyFoodDiary)
    still carry old Argo Tea café-menu nutrition data, and some item names overlap with what UMass's
    own `get_infov2` standing-menu text still lists today (e.g. "Mate Latte" / "Teappuccino") -- the
    UMass campus location appears to have kept running the original café-menu concept independent of
    the parent company's current (near-defunct) state, but the only available nutrition numbers are
    third-party mirrors of a chain that no longer maintains this data itself.
- **OpenFoodFacts spot-check (2026-09-14), against real item names pulled from this pass's own
  standing-menu/PDF fetches, not hypothetical ones.** The legacy `cgi/search.pl` endpoint 503'd
  intermittently through this session (a generic "Page temporarily unavailable" response, not a
  per-query rate limit -- one early query against it did succeed: "Dasani water" returned 76 hits with
  real `nutriments` data); the current `search.openfoodfacts.org/search` endpoint was used for the
  rest and worked reliably. Results:
  - A genuinely packaged/branded name (**"Dasani water"**, which appears on both the babyBerk PDF and
    Snack Overflow's own price list) hits real, correct products with nutrition data -- as expected.
  - **"Teappuccino"** (Argo Tea's own branded drink name, verbatim from its standing-menu text) --
    **zero hits.**
  - **"Matcha Vanilla Latte"** (also verbatim from Argo Tea's menu) and **"Golden BBQ Chicken
    sandwich"** (from babyBerk's PDF) each returned thousands of loosely name-matched but *wrong*
    packaged products -- powdered matcha-latte mixes from unrelated brands (Jade Leaf, Twinings,
    Organic Traditions), and frozen/fast-food chain sandwiches (Lean Cuisine, KFC's Tower Original) --
    none of which is the actual campus item. **This is a sharper finding than "no coverage": a naive
    name-match against OpenFoodFacts for a made-to-order item wouldn't just miss, it would actively
    attach a wrong product's nutrition to a real menu item** (the same conflation risk already
    documented for cross-location `RecNum` matching above, one layer further out).
  - **"Black Bean Burger"** (babyBerk's actual sandwich name) returned only frozen retail veggie-burger
    patties (Sol Cuisine, Migros, generic store brands) -- again a real product, wrong product.

  Net: this matches and sharpens CLAUDE.md's existing framing of OpenFoodFacts as useful for barcoded
  packaged goods, not made-to-order items. None of the 8 gap locations' actual food (burgers,
  teas/lattes, gelato scoops, pastries, fine-dining entrees) should be auto-matched against
  OpenFoodFacts by name -- the risk isn't just a miss, it's a wrong nutrition value attached with
  false confidence. The one place it's genuinely safe is an exact, deliberately-curated match against
  a specific packaged SKU (e.g. "Dasani water" as a literal bottled product), not a fuzzy name search
  over a made-to-order item list. UMass doesn't publish a SKU list for UMass Store (the one location
  where packaged goods are the primary product), so there's nothing to curate that match against
  there either.

## Gaps / what we couldn't determine

- **POST bodies** for the `mobileapp.umassdining.com/umassapi2/public/...` account endpoints — out of
  scope for UDine anyway (see CLAUDE.md: we don't replicate UMass Dining's own account system).
- **AndroidManifest.xml permissions/meta-data** — it's binary XML and no `aapt`/`aapt2`/`apktool` was available on this machine to decode it, so we could not get a definitive permissions list or OneSignal/Maps app-id meta-data values. Worth running `apktool d` once installed if the permission list matters (e.g. confirming calendar/contacts/camera access).
- **`ambassador.umassdining.com/login`** purpose is unclear — could be a separate SSO/ambassador-program login, not necessarily relevant to core account auth.
- Whether `user_token` is a long-lived token or session-scoped, and how it's obtained (no explicit `/login` or `/authenticate` path was found under `mobileapp.umassdining.com` — auth may happen through `ambassador.umassdining.com/login` and hand off a token).
