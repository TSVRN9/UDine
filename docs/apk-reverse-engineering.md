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
| af-foodpro1.campus.ads.umass.edu | GET/POST | `/foodpro.net/{location,shortmenu,search,label}.aspx` | none | **CONFIRMED** (2026-09-13). CBORD's public Web INA nutrition-lookup tool — see its own section below for the full writeup (this is not linked from anywhere in the official app's own strings; found via `umassdining.com/nutrition/nutrient-analysis`). |

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

## CBORD Web INA (public nutrition-lookup tool) — CONFIRMED (2026-09-13)

The small printed code on UMass Dining's physical nutrition table-tents (e.g. Blue Cheese Crumbles:
`181086 9.1.26`; Pumpkin Seeds: `186046`) is a **FoodPro `RecNum`** (recipe/item ID), and it's directly
usable as a public lookup key against CBORD's "Web INA" (Ingredient/Nutrition Analysis) tool, which
`umassdining.com/nutrition/nutrient-analysis` links to:

- **Base:** `https://af-foodpro1.campus.ads.umass.edu/foodpro.net/` (128.119.167.180) — a plain
  public IIS/.NET site, no auth, no API key.
- `location.aspx` — lists ~50+ FoodPro `locationNum`s: the same 4 residential halls as
  `foodpro-menu-ajax`'s `tid`s (01–04, same order) **plus** retail/café spots the `tid` system doesn't
  reach at all (Whitmore Cafe=08, Worcester Cafe=13, Bluewall Grill=14, Bluewall Deli Delish=20,
  Courtside Cafe=21, Bluewall Tavola=22, Harvest=23, and more).
- `shortmenu.aspx?sName=%60&locationNum=NN&locationName=...&naFlag=1` — per-location menu. Needs a
  session cookie primed by first hitting `location.aspx` (a cold direct fetch 500s without one).
- `search.aspx` (POST, `Action=SEARCH&strCurKeywords=<name>`) — full-text dish search across every
  location and future date. Each hit links to
  `label.aspx?...&RecNumAndPort=<recnum>*<portion>`.
- `label.aspx?locationNum=NN&locationName=...&dtdate=M%2fD%2fYYYY&RecNumAndPort=<recnum>*<portion>` —
  the actual Nutrition Facts label. **Fully stateless and public** — verified from a completely fresh
  cookie jar, no prior request needed.

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
`data-*` attributes for whatever's on the visible ~2-week menu): micronutrient %DV (calcium, iron,
potassium, vitamin D — absent from the ajax feed's attributes), coverage of the ~50 retail/café
`locationNum`s the 4-hall `tid` system can't reach, name-based search across dates outside the ajax
feed's rolling window, and a stable numeric recipe ID that doesn't depend on matching display-name
strings day to day. It does **not** beat the ajax feed for a dish already on today's/this-week's menu
at one of the 4 halls — same nutrition data, just less of it per dish.

Implementation-wise this is the same HTML-attribute/table scraping style as the existing
`foodpro-menu-ajax` parser (`shared/src/umassDining.ts`) — no new technique needed. `shortmenu.aspx`
needs a cookie jar primed by one prior `location.aspx` GET; `search.aspx`/`label.aspx` are stateless.
No rate limiting or auth encountered across ~15 real requests during this research pass.

## Gaps / what we couldn't determine

- **POST bodies** for the `mobileapp.umassdining.com/umassapi2/public/...` account endpoints — out of
  scope for UDine anyway (see CLAUDE.md: we don't replicate UMass Dining's own account system).
- **AndroidManifest.xml permissions/meta-data** — it's binary XML and no `aapt`/`aapt2`/`apktool` was available on this machine to decode it, so we could not get a definitive permissions list or OneSignal/Maps app-id meta-data values. Worth running `apktool d` once installed if the permission list matters (e.g. confirming calendar/contacts/camera access).
- **`ambassador.umassdining.com/login`** purpose is unclear — could be a separate SSO/ambassador-program login, not necessarily relevant to core account auth.
- Whether `user_token` is a long-lived token or session-scoped, and how it's obtained (no explicit `/login` or `/authenticate` path was found under `mobileapp.umassdining.com` — auth may happen through `ambassador.umassdining.com/login` and hand off a token).
