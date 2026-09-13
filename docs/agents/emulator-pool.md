# UDine Android emulator pool

Three AVDs so multiple agents can verify mobile UI in parallel instead of queuing on one device.
All three share the single installed system image: `system-images;android-35;google_apis;x86_64`
(Android 15 / API 35, x86_64, Google APIs, no Play Store). No new image was downloaded.

## Devices

| AVD name | Serial | Port | Metro port | Resolution | Density | Effective dp (portrait) | v2 scale `min(1, w/390)` | Lock path |
|---|---|---|---|---|---|---|---|---|
| `Agent_Emulator` (pre-existing) | `emulator-5554` | 5554 | 8081 | 320x640 | 160 (mdpi) | **320dp** x 640dp | 0.821 | `/tmp/udine-emulator-lock` |
| `Agent_Emulator_Narrow` | `emulator-5556` | 5556 | 8082 | 1080x1920 | 480 (xxhdpi) | **360dp** x 640dp | 0.923 | `/tmp/udine-emulator-lock-Agent_Emulator_Narrow` |
| `Agent_Emulator_Wide` | `emulator-5558` | 5558 | 8083 | 1200x1920 | 320 (xhdpi) | **600dp** x 960dp | 1.0 (clamped) | `/tmp/udine-emulator-lock-Agent_Emulator_Wide` |

**Metro port is per-device (fixed 2026-09-12), not a shared 8081.** `screenshot.sh` used to hardcode
port 8081 for every device and `pkill -f "expo start"` host-wide before every run -- Metro was a
de facto host-wide singleton even though the emulator lock was already per-device, so two
`screenshot.sh` calls for two *different* devices would fight over port 8081 and each one's restart
would kill the other's in-flight Metro. Each device now gets its own fixed port (table above) and
the script only ever kills whatever is bound to *its own* port; the existing per-device lock is
sufficient on its own to serialize the rest of the flow (Metro included) for that device, so no
second lock was added. Live-verified 2026-09-12: two concurrent `screenshot.sh` invocations on
Narrow (8082) and Wide (8083) both completed, both captured their own correct route, and a third,
unrelated agent's Metro already running on 8081 was untouched throughout.

**Transitional risk until every worktree has this fix -- affects ALL THREE devices, not just
8081.** An unpatched copy of `screenshot.sh` (an older worktree that hasn't picked up this change)
still hardcodes port 8081 for every device, AND still runs `pkill -f "expo start"` with no port
filter at all -- that pattern matches the full command line of *every* `expo start` process on the
host, including ones on 8082/8083, not just 8081. Until every active worktree is on the patched
script, a live unpatched sibling can still kill a patched Narrow or Wide run's Metro mid-capture,
same as it always could; the per-device port only protects two patched scripts from each other, not
a patched script from an unpatched one. Confirmed by reading a live sibling worktree's still-old
`screenshot.sh` during this fix's own review (2026-09-12) -- don't assume Narrow/Wide are safe just
because this doc says they have their own port.

Base device profiles: `Agent_Emulator` = emulator default (no profile), Narrow = `Nexus 5`,
Wide = `Nexus 7 2013`.

> **Pool state as of 2026-09-05 23:51 UTC:** only **Narrow (5556)** is booted and attached.
> `Agent_Emulator` (5554) and `Wide` (5558) are NOT running, and no lock directories exist for
> any device (`/tmp` is tmpfs — see below; they don't survive a host reboot). Verify with
> `adb devices` before planning around any device in this table; a booted pool is not guaranteed.
>
> **Root-caused and fixed 2026-09-05: `Agent_Emulator_Narrow` was found squatting on port 5554**
> (i.e. `adb devices` showed it as `emulator-5554`, misidentifiable as `Agent_Emulator`) — a qemu
> process launched 2026-09-03 21:45:47 with `-avd Agent_Emulator_Narrow` and **no `-port` flag**,
> so it took the first free default port instead of its documented 5556. This is exactly the "always
> pass `-port` explicitly" failure mode this doc already warns about, just never previously observed
> live. Confirmed stale before touching it (same three-signal check as the log below): no holder
> process on any lock path (none existed), no `gradle`/`metro`/`expo run`/`expo start` process
> running, and `com.udinetogether.udine`'s `lastUpdateTime` (2026-09-03 21:49:42) matched the
> emulator's own boot timestamp to the minute — i.e. one build installed right after cold boot, then
> two days of total silence, not an agent mid-task. Killed cleanly (`adb -s emulator-5554 emu kill`)
> and relaunched correctly (`-avd Agent_Emulator_Narrow -port 5556 -gpu swangle_indirect`, per the
> restart recipe below) — confirmed live afterward: `emulator-5556`, `wm size` 1080x1920, `wm
> density` 480, matching this table's Narrow row exactly. **This was NOT the protected pre-existing
> `Agent_Emulator`** (that device is a distinct AVD/disk image reserved for port 5554 specifically,
> and per the note below is not to be restarted/killed by an agent) — the "do not restart or kill
> it" rule never applied here; what was actually running was one of this pool's own three AVDs,
> mislabeled by `adb`'s port-based serial naming, which is squarely this doc's own to fix.

`Agent_Emulator`'s numbers are read from its `hardware-qemu.ini`, **not** queried live — it is
owned by another agent and was deliberately not touched. Narrow and Wide were verified live
(`wm size` / `wm density`, see Verification below).

### Why these three widths

Mobile v2 lays out at a 390dp artboard and scales down via `min(1, width / 390)`.

- **320dp** (`Agent_Emulator`) — the extreme downscale end, already covered by the existing AVD.
  Note this is a *very* small mdpi screen, not a realistic modern phone; it is a stress case.
- **360dp** (`Narrow`) — scale 0.923. The most common real-world Android width, and the
  downscaling path at a ratio you can actually see. Deliberately **not** Nexus 4 (384dp): that
  lands at scale 0.985, a visually invisible 1.5% shrink that proves nothing.
- **600dp** (`Wide`) — the Android tablet breakpoint. Scale clamps to 1.0, so this is the device
  that shows how the fixed-width 390dp layouts sit inside a much larger viewport (gutters,
  centering, stretched backgrounds). Deliberately **not** Pixel 7 Pro (411dp): that also clamps
  to 1.0 and is only 21dp wider than the artboard, so it reveals nothing the other two don't.

## Locking

Same mkdir-to-acquire / rmdir-to-release semantics on all three. `mkdir` is atomic, so it is the
lock; the directory existing means the device is held.

```bash
# acquire (blocking)
until mkdir /tmp/udine-emulator-lock-Agent_Emulator_Narrow 2>/dev/null; do sleep 30; done

# release
rmdir /tmp/udine-emulator-lock-Agent_Emulator_Narrow
```

`/tmp/udine-emulator-lock` stays the lock for `Agent_Emulator` — unchanged, for back-compat with
agents already blocking on that exact path. Do not rename it.

**Prefer a free device over queuing.** Check all three before you block:

```bash
for d in Agent_Emulator:5554:/tmp/udine-emulator-lock \
         Agent_Emulator_Narrow:5556:/tmp/udine-emulator-lock-Agent_Emulator_Narrow \
         Agent_Emulator_Wide:5558:/tmp/udine-emulator-lock-Agent_Emulator_Wide; do
  n=${d%%:*}; rest=${d#*:}; p=${rest%%:*}; l=${rest#*:}
  if mkdir "$l" 2>/dev/null; then
    echo "ACQUIRED $n"; export ANDROID_SERIAL=emulator-$p; export LOCK="$l"; break
  fi
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
```

Release in a trap so a killed session doesn't leave the pool permanently held.

If a lock directory looks stale (held with no matching work in flight), confirm the device is
actually idle before stealing it — `rmdir` on someone else's lock hands two agents the same
emulator. To tell stale from live, compare the lock's mtime against the device's process start
time and look for a holder process:

```bash
ls -ld --time-style=full-iso /tmp/udine-emulator-lock*
ps -eo lstart,args | grep 'qemu-system.*-avd Agent_Emulator_Wide' | grep -v grep
ps -eo pid,args | grep udine-emulator-lock | grep -v grep
```

A lock older than the emulator it names, with no holder process, is stale. One such lock was
already found and cleared during setup: `Agent_Emulator_Wide`'s lock had been acquired at
10:42:31 while the device was still crash-looping, ~6 minutes before the working device came up
at 10:48:22 — an agent grabbed a device that did not exist and died without releasing.

**Second stale lock, cleared 2026-08-25 10:17.** `Agent_Emulator_Narrow`'s lock had been held
since 2026-08-24 13:59 (~20h) by an agent whose session was killed by a usage limit — the `trap`
release never ran, which is the failure mode `trap` cannot cover. Note the lock's mtime was
*4 seconds older* than the emulator process it named, so the doc's "older than the emulator"
heuristic alone reads as normal acquire-then-launch. What actually settled it was three
independent signals, and this is the check worth copying:

```bash
ps -eo pid,args | grep udine-emulator-lock | grep -v grep          # no holder process
ps -eo pid,etime,args | grep -E 'gradle|metro|expo run' | grep -v grep   # no build targeting it
adb -s emulator-5556 shell dumpsys activity activities | grep topResumedActivity
adb -s emulator-5556 shell dumpsys package com.udinetogether.udine | grep lastUpdateTime
```

The device was sitting on Chrome's `FirstRunActivity` with a UDine `lastUpdateTime` from the
previous day — i.e. idle, nothing installed to it recently, no build in flight. The contrast is
what makes it safe: `Agent_Emulator_Wide` at the same moment had a live `expo run:android
--device Agent_Emulator_Wide` process, a `lastUpdateTime` 6 minutes old, and
`com.udinetogether.udine/.MainActivity` resumed — obviously held, left alone.

**Check the top activity and `lastUpdateTime`, not just the lock's age.** A killed agent leaves
no holder process but also leaves no fresh app install, and that pair is the reliable tell.

**`/tmp` is tmpfs on this host** — this document and every lock directory vanish on reboot. The
locks disappearing is harmless (a fresh boot has no emulators running anyway); losing this doc is
not. Worth mirroring into `docs/agents/` in the repo if the pool outlives this session.

## Targeting a specific device — required

There are three devices attached. A bare `adb` command is ambiguous and will fail or, worse, hit
the wrong device.

```bash
adb -s emulator-5556 shell ...          # every adb call needs -s
```

**`ANDROID_SERIAL` does NOT steer `expo run:android`'s device pick — corrected 2026-08-23 (issue
#142), superseding the old claim in this section.** PR #140 hit this live: with
`ANDROID_SERIAL=emulator-5556` exported for the whole shell and no `--device` flag, `expo run:android`
built and installed onto **emulator-5554** instead. Root-caused by reading the installed
`@expo/cli@57.0.16` source (`mobile/node_modules/.pnpm/@expo+cli@.../build/src/...`), not just
inferred from the symptom:

- No `--device` flag → `run/android/resolveDevice.js` calls
  `AndroidDeviceManager.resolveAsync()` with no arguments.
- `start/platforms/android/AndroidDeviceManager.js`'s `resolveAsync` then does
  `const _device = shouldPrompt ? await promptForDeviceAsync(devices) : devices[0]` — it picks
  **`devices[0]`**, full stop. `ANDROID_SERIAL` is never read anywhere on this path.
- `devices[0]` comes from `getDevices.js` → `adb.js`'s `getAttachedDevicesAsync()`, which runs a
  plain `adb devices -l` (no `-s`, so it always lists every attached device) and returns them in
  whatever order that command prints them — `ANDROID_SERIAL` has no effect on `adb devices` either,
  since that command isn't scoped to one device in the first place. In practice this pool's `adb`
  consistently lists `emulator-5554` first, which is exactly what PR #140 observed.
- The *install* itself, once a device is resolved, correctly targets it explicitly
  (`installAppAsync` → `adb.js`'s `installAsync` passes `-s <resolved-pid>`) — the bug is purely in
  which device gets resolved up front, not in how the resolved device is used afterward.

**Reliable mechanism: pass `--device <AVD name>` explicitly.** This routes through
`resolveDeviceAsync`'s other branch, `AndroidDeviceManager.resolveFromNameAsync(name)`, which
matches by **AVD name, not serial** — a bare serial errors here (confirmed by PR #140), so use the
name from the Devices table above:

```bash
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk \
PATH="/usr/lib/jvm/java-17-temurin-jdk/bin:$PATH" \
npx expo run:android --device Agent_Emulator_Narrow
```

Still worth a post-install sanity check if the build's target matters (as PR #140 did):
`adb -s emulator-5556 shell dumpsys package <applicationId> | grep lastUpdateTime` should jump to
the just-finished build's timestamp on the serial you intended, not a neighbor's.

Keep exporting/using `-s <serial>` for every direct `adb` call you make yourself (shell, install,
logcat, etc.) — those genuinely need it, and `ANDROID_SERIAL` still works fine for scoping your own
`adb` commands. It just doesn't reach into `expo run:android`'s own device selection.

**Not independently re-verified with a live boot this session** — no pool device was running at
investigation time (all three idle, no lock held), and source-level tracing through the exact
installed `@expo/cli` version already gives a definitive, code-level answer that matches PR #140's
own live observation, so a fresh cold boot (40-50s+ under swangle, plus a real Gradle build) wasn't
spent re-confirming it. If a future agent wants to re-verify live: acquire a free device via the
locking protocol above, run `expo run:android` with `ANDROID_SERIAL` set to a *different* device
than the one you locked, and confirm the resolved device is `devices[0]` (typically 5554)
regardless.

Android native builds still need JDK 17 (see repo `CLAUDE.md`):

```bash
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk \
PATH="/usr/lib/jvm/java-17-temurin-jdk/bin:$PATH" \
npx expo run:android --device Agent_Emulator_Narrow
```

## Restarting a pool device — `-gpu swangle_indirect` is mandatory

`Agent_Emulator` is managed separately — **do not restart or kill it.**

> **The default GPU mode segfaults on this host.** Any new emulator launched with the default
> renderer (or with `-gpu swiftshader_indirect`, `-gpu guest`, or `-gpu off`) dies with SIGSEGV a
> few seconds into cold boot, inside SwiftShader's JIT
> (`emulator/lib64/gles_swiftshader/libGLESv2.so`, confirmed from the core dump backtrace).
> `-gpu swangle_indirect` (ANGLE over Vulkan/lavapipe) is the only mode that survives. It is not
> optional — omit it and the device will never reach `sys.boot_completed`.

```bash
~/Android/sdk/emulator/emulator -avd Agent_Emulator_Narrow -port 5556 \
  -no-window -no-audio -no-snapshot-save -no-boot-anim -gpu swangle_indirect &

~/Android/sdk/emulator/emulator -avd Agent_Emulator_Wide -port 5558 \
  -no-window -no-audio -no-snapshot-save -no-boot-anim -gpu swangle_indirect &
```

Always pass `-port` explicitly so serials stay deterministic and match this document. Wait on the
property, not on a fixed sleep:

```bash
adb -s emulator-5556 wait-for-device
until [ "$(adb -s emulator-5556 shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 5; done
```

With `swangle_indirect` both devices reached `sys.boot_completed` in about 40-50 seconds from
launch, not the 5-15 minutes a cold boot would otherwise suggest.

**Caveat, so you don't have to re-derive this:** SwANGLE is confirmed to boot the device and
render the *system UI* (a pulled screencap shows the launcher, wallpaper and icons drawing
correctly). A **React Native app's GL surface has not been exercised under it** — no Gradle build
was run, deliberately, because the host has ~10GB available and zero swap. If an RN app renders
black or crashes the surface on these two devices, the renderer is the first place to look, not
your app code.

Both AVDs were configured with 2048MB RAM, 256MB VM heap, 2 cores, and a 6GB userdata partition.
The `disk.dataPartition.path=<temp>` default was removed from both, so installed APKs and app
state survive an emulator restart.

## Host capacity — read before starting a build

Measured on this host (8 cores, 31GB RAM) with **all three emulators running**:

| | |
|---|---|
| `Agent_Emulator` RSS | ~2.7GB |
| `Agent_Emulator_Narrow` RSS | ~3.1GB |
| `Agent_Emulator_Wide` RSS | ~3.1GB |
| MemAvailable with all three up | **~10.1GB** |
| Swap free | **~2MB of 8GB — exhausted** |

Emulators cost ~3GB each (more than the ~2GB nominal, because ANGLE/Vulkan software rendering
adds overhead). **Gradle is the expensive part** — a React Native build runs a Gradle daemon plus
a Kotlin daemon plus Metro, 3-4GB per build.

> **Run at most 1 concurrent Gradle build while all three emulators are up.**
> A 2nd concurrent build is only safe if at least one emulator is shut down first.

There is **no swap runway left**, so memory pressure becomes an OOM kill rather than a slowdown,
and the kernel may pick a running emulator or another agent's build as the victim. That is why
this is tighter than a naive "2 builds is fine".

A separate **8GB libvirt/QEMU `kali` VM** is also running and is by far the largest reclaimable
chunk on the box. Shutting it down would roughly double the build headroom, but that is the
owner's call, not an agent's.

## Verification (2026-08-21)

```
$ adb devices
emulator-5554   device      <- Agent_Emulator (pre-existing, untouched)
emulator-5556   device      <- Agent_Emulator_Narrow
emulator-5558   device      <- Agent_Emulator_Wide

$ adb -s emulator-5556 shell wm size    -> Physical size: 1080x1920
$ adb -s emulator-5556 shell wm density -> Physical density: 480      => 360dp
$ adb -s emulator-5558 shell wm size    -> Physical size: 1200x1920
$ adb -s emulator-5558 shell wm density -> Physical density: 320      => 600dp
```

Screencaps pulled via `adb -s <serial> exec-out screencap -p`, PNG magic bytes and IHDR
dimensions decoded and checked against `wm size` (not just "file is non-empty"):

- `pool-emulator-5556.png` — 1,225,643 bytes, IHDR 1080x1920 ✓
- `pool-emulator-5558.png` — 1,845,063 bytes, IHDR 1200x1920 ✓

Both under
`/tmp/claude-1000/-home-tavern-Projects-js-UDine/88502525-1ee8-4edc-ade0-f41cf058bd3f/scratchpad/`.

## Working rebuild recipe (2026-08-26, resolves #232's "three failed attempts")

#232's three prior attempts never got a usable client on `Agent_Emulator_Narrow` because of an
APK/bundle mismatch, not a broken rebuild path. This session did a clean `expo run:android
--device Agent_Emulator_Narrow` rebuild (#281) and it worked end-to-end on the first try:

```bash
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk \
PATH="/usr/lib/jvm/java-17-temurin-jdk/bin:$PATH" \
npx expo run:android --device Agent_Emulator_Narrow
```

`BUILD SUCCESSFUL in 1m 32s` (362 actionable tasks, 201 executed / 161 from cache — warm Gradle
cache from a prior agent's build on a different device). Confirmed the *new* APK actually landed
on 5556, not a stale one: `adb -s emulator-5556 shell dumpsys package com.udinetogether.udine |
grep lastUpdateTime` jumped to the build's own timestamp.

**A second, unrelated blocker showed up immediately after install, and it's worth recording
separately so it doesn't get misread as another bundle-mismatch:** the dev client crashed on
launch with `Uncaught Error: supabaseUrl is required` (thrown at `src/lib/supabase.ts:14`'s
module-scope `createClient(...)` call, so it fires on *any* screen whose import graph reaches
`supabase.ts` — in practice, most of the app). Root cause: `mobile/.env` doesn't exist in a fresh
checkout/worktree — only `mobile/.env.example` is committed (`.env` is gitignored) — so
`process.env.EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are both `undefined`
under Metro. This is orthogonal to the native build and to the packaged-vs-Metro bundle mismatch
#232 diagnosed; a worktree/checkout that has never had `mobile/.env` populated will hit this even
with a perfectly fresh rebuild. Fix: populate `mobile/.env` (gitignored, safe to write per-worktree)
with the project's public URL and publishable key — both are non-secret, meant to ship in a client
bundle — fetched via the Supabase MCP tools rather than guessed or committed:

```
EXPO_PUBLIC_SUPABASE_URL=<mcp__plugin_supabase_supabase__get_project_url project_id=ubogyqskqzvkcqboqbhw>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the "publishable" (sb_publishable_...) entry from
  mcp__plugin_supabase_supabase__get_publishable_keys project_id=ubogyqskqzvkcqboqbhw>
```

After writing `.env`, a full `expo run:android` isn't needed again — env vars are inlined by
Metro at bundle time, so kill any running `expo run:android`/`expo start` process and start a
fresh `npx expo start --dev-client` (same JDK/PATH prefix), then re-point the already-installed
dev client at it without reinstalling:

```bash
adb -s emulator-5556 shell am force-stop com.udinetogether.udine
adb -s emulator-5556 shell am start -a android.intent.action.VIEW \
  -d "udine://expo-development-client/?url=http%3A%2F%2F192.168.122.1%3A8081"
```

(That IP is this host's bridge address for the emulator's outbound route to the Metro server on
the host — confirm with the URL `expo run:android` itself printed on the original install, e.g.
`› Opening udine://expo-development-client/?url=http%3A%2F%2F<host-ip>%3A8081`, since it can differ
per host/network setup.)

**Fast iteration once installed:** the dev client understands the app's own `udine://` scheme for
deep links, which is much quicker than tapping through the UI to reach a specific screen for a
screenshot — `adb shell am start -a android.intent.action.VIEW -d "udine://add-friends"` (or any
other route name from `mobile/src/app/`) jumps straight there. Force-stop + relaunch the same
`expo-development-client/?url=...` intent above to force a fresh JS bundle fetch after editing
source (e.g. to compare a screen before/after a JS-only change without a native rebuild).

## Metro can serve a stale graph in a worktree — restart it before trusting an "after" tap (#229)

Seen live 2026-08-26 on `Agent_Emulator_Narrow`: after editing `mobile/src/app/index.tsx`, force-stop
+ relaunch of the dev client twice still ran the **old** JS (proved with an on-screen marker Text
that never appeared), even though `curl`ing the same route's lazy split from Metro returned the new
code. No `watchman` on this host, so Metro relies on node's fs watcher, and in a
`.claude/worktrees/...` checkout the device's already-built graph never got the change event —
Metro's log even printed a `Bundled … (1 module)` line for the relaunch, which looks like a
successful rebuild and isn't. A fresh `curl` with different bundle options builds a *new* graph
from disk, which is why the split looked correct while the device stayed stale.

Before recording any after-fix device result, **kill and restart `expo start`** (a new process =
a new graph), relaunch the dev client, and confirm the change is actually on screen (a temporary
marker string that `uiautomator dump` can see is the cheapest proof). This is very likely what
#220 recorded as a "dead-Metro window" that broke `Link` navigation app-wide.

## The `expo-development-client/?url=...` deep link does NOT reliably switch Metro ports (found 2026-09-12)

Cost three separate on-device verification passes across two agents (a real single-expand fix
looked broken twice on-device before this was found) — a false negative, not a code bug. When
this device's installed dev client is already bonded to a Metro instance (which on a shared,
multi-agent host is almost always port **8081**, since that's the default every `expo start`
reaches for first), sending `am start -d "udine://expo-development-client/?url=http://10.0.2.2:<a
different port>"` does **not** redirect it. The app silently keeps talking to whatever it's
already connected to and shows that bundle instead — no error, no obvious sign beyond the
rendered content itself not matching the worktree you think you're testing (the giveaway that
caught this: a sibling agent's in-progress scrollbar UI appearing on a screen from a worktree
that never had that code). `pm clear com.udinetogether.udine` does **not** reset this either — it
survived clearing all app data, so treat it as a build-time default baked into the dev client,
not a runtime preference an agent can casually clear.

**Verify which Metro you're actually bundling from before trusting anything you see:**
1. Confirm your own `expo start` log actually printed an `Android Bundled …` line *after* your
   navigation/tap sequence — not just "Waiting on http://localhost:<port>" the whole time. No
   `Bundled` line at all means the device never even asked your Metro for anything.
2. If you must run on a non-8081 port (e.g. 8081 is already held by another agent's worktree and
   you don't want to kill it — do not kill another agent's Metro process), use the **RN dev
   menu's "Change Bundle Location"**, not the deep link:
   ```bash
   adb -s emulator-5556 shell input keyevent 82   # opens the dev menu on the current screen
   # tap "Change Bundle Location", clear the field, type e.g. 10.0.2.2:<your port>, Apply Changes
   ```
   Confirm the field was actually showing something else first (that's your proof the deep link
   alone would have silently failed you), and confirm `Android Bundled` appears in your Metro log
   right after tapping Apply.
3. A visual tell that you're on the wrong bundle: anything on screen that isn't in your own
   worktree's diff (another agent's in-progress feature, old copy/layout you already changed).
   Don't rationalize it as "the emulator is just showing something stale" — go verify via the dev
   menu instead of proceeding.

## `uiautomator dump` sees no RN content on the current dev client — `--wait-for` always times out (2026-09-12)

Seen live on `Agent_Emulator_Narrow` with a dev client built that evening from `main` (1a2af49):
with the Worcester hall menu fully rendered on screen (verified by `screencap`), `uiautomator dump`
returned a 2KB hierarchy of **6 nodes**, none with any text — so `screenshot.sh --wait-for TEXT`
can never match and exits after 45s no matter how long the screen has been up. Two agents
independently looped on this the same evening, each re-queuing captures and killing the other's
Metro on every retry (see the Metro-singleton section above, fixed separately). The one lead at the
time was `MealTabPager.tsx`'s `importantForAccessibility="no-hide-descendants"` on inactive panes.

**Investigated 2026-09-12, not an app bug.** The lead doesn't hold up: `active ? "auto" :
"no-hide-descendants"` only hides the *inactive* panes, and `MealTabPager.test.tsx` already asserts
exactly one pane gets `"auto"` (the active one). Live-verified on a real device instead of trusting
that read: a fresh `uiautomator dump` against `halls/worcester` on both Narrow and Wide, each after
a full cold Metro restart + dev-client relaunch (the same recipe `screenshot.sh` itself uses),
returned 241 nodes including the dish names and the `WORCESTER` header text — nothing like the "6
nodes, none with text" originally seen. `screenshot.sh --wait-for WORCESTER` against
`halls/worcester` also succeeded end-to-end on the first try on Narrow. Could not reproduce the
original failure after real effort, so it's treated as a platform-level flake (uiautomator's
accessibility-service connection slow to bind to the current window after a fresh app launch), not
a fixable app bug — nothing in `mobile/src` changed.

`wait_for_text` (in `screenshot.sh`) already retries the dump every 2s for the full timeout, which
should absorb a one-off flaky dump; what it didn't do is tell a "tree never populated at all"
timeout apart from a "tree populated, but this text genuinely never appeared" timeout. It now
tracks the max `<node>` count seen across all attempts and, on timeout, adds a specific message
when that max stayed under 15 nodes -- well below what a correctly-rendered screen measures even
when sparse (26 nodes on an empty-state `favorites` screen, 241 on a content-heavy hall-menu one,
both live-measured 2026-09-12) -- naming this known flakiness class instead of just the generic
"screen is likely still loading or on the wrong route" message. Still a hard failure (never
silently captures a stale frame), just a more actionable one.
If you hit this again: retry the capture once before assuming the screen is actually wrong, and
confirm by eye from the PNG either way.

Same evening, a related leak, **fixed 2026-09-12**: wrapping `screenshot.sh` in `timeout N` used to
leak the device lock. `timeout` kills bash with SIGTERM, and bash does not run its `EXIT`-only trap
when killed by an untrapped signal, so the device lock the script took was never `rmdir`ed. One such
kill left Narrow's lock held with no holder process for 12+ minutes while three agents queued on it;
it was cleared with the three-signal check above. The script now also traps `INT`/`TERM` (calling
the same idempotent cleanup and exiting `128+signal`), live-verified by running `timeout 5 bash
screenshot.sh ...` and confirming the lock directory was gone immediately after the timeout fired.
The script still has its own internal timeouts on every wait regardless.
