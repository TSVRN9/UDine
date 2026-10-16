# Flutter port: write meals to Health Connect and Apple Health

Goal: a user who tracks meals can choose to have each logged meal written to Health Connect (Android) or
Apple Health (iOS). Editing the meal rewrites its record, and deleting it deletes the record. UDine never
reads anything back.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`): CONCEPT R10 §5, NOTES "Round 10"
("Health (simulated)"); `healthWrite` around 950; `?os=ios|android`, `?health=allow|deny|revoked`.
- **The row:** on You, directly under Track what I eat, and only while tracking is on. It's a check row
  named for the platform: "Write to Health Connect" or "Write to Apple Health", with the second line "Each
  meal you log".
- **Tapping it** raises the OS permission sheet straight away, with no interstitial.
- **Allowed:** the check fills. Each meal logged from then on is written, an edit rewrites its record,
  and a delete deletes it. Undo writes it back. No backfill of earlier meals (owner, round 10).
- **Denied:** the check stays empty. The second line reads "Health Connect didn't allow it", with an
  outlined Open Health Connect (or Open Settings) button.
- **Revoked** in system settings: checked when You is shown or the app resumes. It shows the denied state,
  with "Not allowed in Health Connect any more".

Annotations: none.
States:
- off;
- allowed;
- denied;
- revoked (found on resume);
- Health Connect not installed or not supported on the device (Android 13 and below without the app);
- tracking off (row absent).

Routes: `/you`. Run each state on the A53 with Health Connect's own app: grant, deny, then revoke in its
settings and resume UDine.

Backend: none.
Residency: this sends health data to another app on the same device, at the user's explicit opt-in, write
only. It doesn't leave the device through UDine. **It needs its own row in CLAUDE.md's residency table**
("Meals written to Health Connect / Apple Health: device OS health store, opt-in per device, write
only"). **Owner-merged.**
Rationale:
- **Write only, one record per meal.** M2's model is one record per meal: time, name, and the
  nutrients the platform accepts. Fields map from the label's calories, fat, saturated and trans fat,
  cholesterol, sodium, carbohydrate, fibre, sugars and protein. Which of these each platform takes is
  verified here, against Health Connect's `NutritionRecord` and HealthKit's dietary types, and recorded
  in this brief.
- **Record ids are kept on the device.** A `health_writes(meal_id, platform, record_ids_json)` table
  (migration `user_version` 3 to 4: saved_foods took 2, favorite alerts 3) lets an edit or delete find its record without reading Health. It's
  exported like every other table.
- **Package:** the `health` pub package if it supports writing nutrition records with client ids on both
  platforms. Otherwise, a minimal platform channel per OS. Name the choice and the reason in the PR.
- **Package decision (Task 1): a platform channel, not `health` 13.3.2.** The package's iOS `writeMeal` takes no client id and
  returns no ids (its Android side does take `clientRecordId`), and it has no iOS delete by id; it also needs its own read-leaning
  permission plumbing. The channel is `udine/health`: `MainActivity.kt` (Health Connect 1.1.0 client, `clientRecordId` upsert) and
  `AppDelegate.swift` (HealthKit food correlation). Dart side `app/lib/core/health/`.
- **Field mapping, verified against the sources** (HC `NutritionRecord` properties; HealthKit `HKQuantityTypeIdentifier`):

  | Label field | Health Connect `NutritionRecord` | Apple Health type | Unit |
  |---|---|---|---|
  | calories | `energy` | `dietaryEnergyConsumed` | kcal |
  | total fat | `totalFat` | `dietaryFatTotal` | g |
  | saturated fat | `saturatedFat` | `dietaryFatSaturated` | g |
  | trans fat | `transFat` | none (HealthKit has no trans-fat type; iOS skips it) | g |
  | cholesterol | `cholesterol` | `dietaryCholesterol` | mg |
  | sodium | `sodium` | `dietarySodium` | mg |
  | carbohydrate | `totalCarbohydrate` | `dietaryCarbohydrates` | g |
  | fibre | `dietaryFiber` | `dietaryFiber` | g |
  | sugars | `sugar` | `dietarySugar` | g |
  | protein | `protein` | `dietaryProtein` | g |

  Calories from fat is not written. Values are the meal's rows times servings, rounded to 2 places. Name = the meal's title; time =
  loggedAt (the meal id), a one-minute span because Health Connect needs start before end.
- **Ids:** Android keeps `udine-<loggedAt>` as the record's client id (an edit writes the same id with a higher version, which
  replaces it in place); iOS keeps the correlation's and its samples' UUIDs (objects are immutable: an edit deletes them, then saves).
- iOS can't be seen until store builds are allowed. The HealthKit entitlement and usage strings are set
  up here, and the iOS check goes on `docs/agents/ios-checklist.md` for the tester.

## Acceptance

- [ ] Allowed: logging a meal writes one record with the mapped fields; editing rewrites it; deleting
  deletes it; Undo restores it — evidence: test (fake health client) + the A53 run, shown in Health
  Connect's data view
- [ ] Denied and revoked show M2's states, and the button opens Health Connect or Settings — evidence:
  screenshot on the A53
- [ ] Nothing is read from Health: the requested permissions are write only — evidence: test on the
  permission list + the manifest diff
- [ ] Turning the row off stops new writes and leaves existing records alone — evidence: test
- [ ] `health_writes` is exported as JSON and CSV — evidence: test
- [ ] The CLAUDE.md residency row is added — evidence: diff

## Tasks

1. **Health client, mapping and ids** — the package or channel, the field mapping per platform, the
   `health_writes` migration and export, the residency row — files: `app/lib/core/health/`,
   `app/lib/core/store/`, `app/android/`, `app/ios/`, `CLAUDE.md` — lanes: flutter — blocked by:
   device-data 2 — PR:
2. **The You row and its states** — the row, permission flow, denied and revoked, the resume check,
   writes from Log, edit, delete and Undo — files: `app/lib/screens/you/health_row.dart` — lanes: flutter,
   the A53 run — blocked by: 1, you 1 — PR:
