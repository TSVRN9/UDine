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
| umassdining.com | GET | `/uapp/get_infov2` | none | General app config/info blob. |
| umassdining.com | GET | `/uapp/get_updates` | none | App update notices. |
| umassdining.com | GET | `/uapp/get_notice` | none | Notices/alerts (possibly `get_noticeEvent`, uncertain suffix). |
| umassdining.com | GET | `/uapp/get_new_faq` | none | FAQ (possibly `get_new_faqDetail`, uncertain suffix). |
| umassdining.com | GET | `/uapp/get_about` | none | About page content. |
| umassdining.com | GET | `/uapp/get_press` | none | **Press releases** (uncertain suffix, e.g. `get_pressReleases`) — maps directly to the requested press-release feature. |
| umassdining.com | GET | `/uapp/get_staff` | none | Staff directory (possibly `get_staffName`). |
| umassdining.com | GET | `/uapp/get_newsletter` | none | Newsletter content/subscribe status. |
| umassdining.com | GET | `/uapp/get_galleries` | none | Photo galleries. |
| umassdining.com | GET | `/uapp/get_videos` | none | Video content. |
| umassdining.com | GET | `/uapp/get_online_ordering` | none | Online ordering info/links. |
| umassdining.com | GET | `/uapp/get_beacons_events` | none | **Events tied to BLE beacons** — see beacon feature below; likely dining-hall event feed. |
| umassdining.com | POST | `/uapp/save_coordinateForPoint` | none observed | Geolocation/beacon check-in — logs a coordinate against a point of interest. |
| ambassador.umassdining.com | ? | `/login` | ? | Separate login-adjacent host from the main content host; purpose (student ambassador program? alternate auth?) not determined. |
| mobileapp.umassdining.com | GET | `/umassapi2/public/get_employee?user_token=` | `user_token` query param | Fetch logged-in user's profile. "Employee" naming suggests this system was originally built for dining-hall staff, then reused for the general user account. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/editEmployee` | `user_token` (assumed) | Update user profile. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/saveEmployeePhone` | `user_token` (assumed) | Save phone number. |
| mobileapp.umassdining.com | POST | `/umassapi2/public/saveEmployeeSMS` | `user_token` (assumed) | Likely SMS-OTP verification step (an unused `READ_SMS`-shaped permission string also appears in the bundle, consistent with SMS auto-fill). |
| mobileapp.umassdining.com | GET/POST | `/umassapi2/public/favorite...` | `user_token` (assumed) | Favorites CRUD — see favorites system below. |
| mobileapp.umassdining.com | GET/POST | `/umassapi2/public/preference...` | `user_token` (assumed) | User preferences (likely dietary/allergen selections — see below). |
| onesignal.com | POST | `/api/v1/notifications` | OneSignal REST API key | **Push notifications confirmed via OneSignal**, not raw FCM. |

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

## Gaps / what we couldn't determine

- **Exact query params and POST bodies** for every endpoint above — Hermes string-table entries can't be reliably delimited with `strings`; would need a proper Hermes bytecode string-table parse (function/string index tables) or a live traffic capture (mitmproxy + the real app) to get exact param names, types, and auth header format.
- **AndroidManifest.xml permissions/meta-data** — it's binary XML and no `aapt`/`aapt2`/`apktool` was available on this machine to decode it, so we could not get a definitive permissions list or OneSignal/Maps app-id meta-data values. Worth running `apktool d` once installed if the permission list matters (e.g. confirming calendar/contacts/camera access).
- **`ambassador.umassdining.com/login`** purpose is unclear — could be a separate SSO/ambassador-program login, not necessarily relevant to core account auth.
- Whether `user_token` is a long-lived token or session-scoped, and how it's obtained (no explicit `/login` or `/authenticate` path was found under `mobileapp.umassdining.com` — auth may happen through `ambassador.umassdining.com/login` and hand off a token).
