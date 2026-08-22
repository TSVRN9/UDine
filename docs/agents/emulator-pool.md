# UDine Android emulator pool

Three AVDs so multiple agents can verify mobile UI in parallel instead of queuing on one device.
All three share the single installed system image: `system-images;android-35;google_apis;x86_64`
(Android 15 / API 35, x86_64, Google APIs, no Play Store). No new image was downloaded.

## Devices

| AVD name | Serial | Port | Resolution | Density | Effective dp (portrait) | v2 scale `min(1, w/390)` | Lock path |
|---|---|---|---|---|---|---|---|
| `Agent_Emulator` (pre-existing) | `emulator-5554` | 5554 | 320x640 | 160 (mdpi) | **320dp** x 640dp | 0.821 | `/tmp/udine-emulator-lock` |
| `Agent_Emulator_Narrow` | `emulator-5556` | 5556 | 1080x1920 | 480 (xxhdpi) | **360dp** x 640dp | 0.923 | `/tmp/udine-emulator-lock-Agent_Emulator_Narrow` |
| `Agent_Emulator_Wide` | `emulator-5558` | 5558 | 1200x1920 | 320 (xhdpi) | **600dp** x 960dp | 1.0 (clamped) | `/tmp/udine-emulator-lock-Agent_Emulator_Wide` |

Base device profiles: `Agent_Emulator` = emulator default (no profile), Narrow = `Nexus 5`,
Wide = `Nexus 7 2013`.

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

**`/tmp` is tmpfs on this host** — this document and every lock directory vanish on reboot. The
locks disappearing is harmless (a fresh boot has no emulators running anyway); losing this doc is
not. Worth mirroring into `docs/agents/` in the repo if the pool outlives this session.

## Targeting a specific device — required

There are three devices attached. A bare `adb` command is ambiguous and will fail or, worse, hit
the wrong device.

```bash
adb -s emulator-5556 shell ...          # every adb call needs -s
export ANDROID_SERIAL=emulator-5556     # expo / gradle / react-native installs read this
```

`ANDROID_SERIAL` is what `expo run:android` and the Gradle `installDebug` task honour. Set it for
the whole shell before building, not just the adb calls.

Android native builds still need JDK 17 (see repo `CLAUDE.md`):

```bash
export ANDROID_SERIAL=emulator-5556
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk \
PATH="/usr/lib/jvm/java-17-temurin-jdk/bin:$PATH" \
npx expo run:android
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
