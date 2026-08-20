# Device verification — one pass

Prepared to run the moment `adb devices` shows a phone. Nothing here needs an
AVD; every step is against the signed release APK already built.

**Setup, once:**

```sh
export ANDROID_HOME=/c/Users/dalit/AppData/Local/Android/Sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices          # expect: <serial>  device
```

If the serial shows `unauthorized`, accept the RSA prompt on the phone.

---

## 1. Install the signed APK

```sh
cd /c/Users/dalit/lane-math
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell monkey -p com.nadavw.lanemath -c android.intent.category.LAUNCHER 1
```

Expect `Success`. A `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means a debug build of
the same id is installed — `adb uninstall com.nadavw.lanemath` first. That is
worth noticing rather than working around: it would mean the release signature
differs from what is already on the device.

## 2. Portrait lock holds

```sh
adb shell settings put system accelerometer_rotation 1
adb shell content insert --uri content://settings/system \
  --bind name:s:user_rotation --bind value:i:1     # force landscape
sleep 2
adb shell dumpsys window | grep -E "mCurrentRotation|mLastOrientation" | head -3
adb shell dumpsys activity activities | grep -i "orientation" | head -3
```

**Pass:** the activity stays portrait regardless of device rotation. The
manifest sets `android:screenOrientation="portrait"`, so this is confirming it
survives, not hoping.

Restore afterwards:
```sh
adb shell content insert --uri content://settings/system \
  --bind name:s:user_rotation --bind value:i:0
```

## 3. Safe-area insets — the highest-risk item

The layout anchors the column **12px from the bottom** (§9.1 anchor-low), and
that is exactly where a gesture bar lives. The status band carries `restart`,
the mode selector and the `map` button, so anything lost here is interactive,
not decorative.

```sh
adb shell dumpsys window displays | grep -E "cutout|insets|DisplayFrames" | head -12
```

Then, on the device, with the board open:
- the `restart` chip is fully tappable, not half under the gesture bar
- the `map` chip likewise, once 1-10 is cleared
- the star reading at the top right is not under a punch-hole or notch
- the lane's top edge is not clipped by a cutout

**If it fails:** the fix is a safe-area inset read into `DESIGN`, not nudging
the 12px constant — the constant is derived (§9.1) and hand-tuning it would put
a magic number back into the one file that has none.

## 4. Tap latency on device vs the browser harness

Browser harness baseline, post-fix: **median 0.5ms** over 600 taps with the
flight bound in place.

```sh
adb shell am start -n com.nadavw.lanemath/.MainActivity
adb forward tcp:9222 localabstract:chrome_devtools_remote
```
Then attach `chrome://inspect` and run in the WebView console:

```js
laneMath.load('1-01');
const t = laneMath.state().tiles.find(x => !x.consumed);
const a = [];
for (let i = 0; i < 600; i++) {
  const t0 = performance.now();
  laneMath.send({ type: 'tapTile', id: t.id });
  a.push(performance.now() - t0);
  laneMath.send({ type: 'tapSlot', index: 0 });
}
a.sort((x, y) => x - y);
console.log('median', a[300], 'p90', a[540], 'max', a[599]);
console.log(laneMath.diagnostics());   // flights must be 1, not 1200
```

**Pass:** median within a few ms of the harness, and **flat** — the shape
matters more than the absolute number, since a mid-range phone is legitimately
slower. `flights` staying at 1 is the frame-dependence fix holding on hardware
under thermal conditions a desktop never sees (CLAUDE.md 8).

## 5. AdMob — all three outcomes

Test ids are already in place, so this exercises the real SDK against Google's
test server.

```js
laneMath.ads();                    // { available: true } on device, false on web
await laneMath.watchAdForLife();   // watch fully  -> "rewarded"
await laneMath.watchAdForLife();   // dismiss early -> "dismissed"
```
Then with the device in aeroplane mode:
```js
await laneMath.watchAdForLife();   // -> "unavailable"
```

**Pass:** `rewarded` grants exactly one life and only when watched to the end;
`dismissed` and `unavailable` grant nothing **and cost nothing**. Check lives
before and after each with `laneMath.economy().lives`.

## 6. Brightness gate assumptions on a real panel

The paper backgrounds were tuned on a desktop monitor. The gate asserts 3:1 at
the worst point; measured margins are 3.46–4.05:1, so there is little headroom
for a panel that renders the cream lighter or the navy blacker.

On the device, at **minimum** brightness and again in **direct sunlight** if
available, one level per world:
- the digits on every token are readable
- dimmed tiles are still legible as numbers, not just as shapes
- the ghost outlines in spent slots are still visible
- the gold accent still reads as gold rather than as white

**If it fails:** the fix is the background, not the threshold (§9.1) — report
which world, which zone, which lighting.

## 7. One screenshot per world

```sh
for L in 1-01 2-04 3-04 4-09; do
  echo "load $L on the device, then:"
  adb exec-out screencap -p > "docs/review/device-$L.png"
done
```

Capture with a level open, mid-board. These are the first images of the game as
an app rather than as a canvas in a desktop browser.

---

## What a pass looks like

All seven green means the build is ready for a real playtest. The two most
likely failures, in order: **safe-area at the bottom** (item 3), because the
12px anchor is deliberately tight; and **the brightness gate under sunlight**
(item 6), because the margins are thin and were never measured on a phone.
