# Signal mechanics: what we changed and why

This page explains how Brain Arcade turns raw headband data into a game control and a parent report. It lists every mechanic that we changed, the reason for the change, and how this fork compares with the [original project](https://github.com/itayinbarr/brain-arcade) (upstream commit `9ab8b19`, November 2025).

**Short version:** a player had two complete Focus Ball sessions where the ball never left the floor. The report said "0 % in focus" and gave no warning. The cause was not the player. The cause was a pattern that is in many places in the code:

1. The app measures a "normal" level **one time**, at the start, and never updates it.
2. The live value is **clamped** (held between a fixed minimum and maximum). If the signal drifts, the value sits at the edge, and no error shows.
3. Nothing checks for **"stuck" or "bad" data** before a score, a report or a comparison is shown.

We fixed this pattern in the fNIRS games, in the EEG joystick that all original games use, in the pause logic, in the reports, and in the recorder. When we replayed the real session through the code, the ball went from **0 %** above the line (stuck at the floor 99 % of the time) to **27 %** above the line.

Words used on this page:

- **Baseline:** the player's resting level. The app measures it during calibration.
- **Drift:** a slow change of the signal over minutes that is not caused by the brain. Examples: the headband settles, the skin warms, the electrode gel dries.
- **Clamp:** to hold a value between a minimum and a maximum, for example 0 and 1.
- **Ratchet:** a value that can only go up (or only down).
- **fNIRS:** the forehead light sensor of the Muse S Athena. It measures blood oxygen (HbO = oxygen-rich, HbR = oxygen-poor). It reacts 3–6 s after the brain does.
- **EEG:** the electrical brain-wave sensors (TP9 and TP10 at the ears, AF7 and AF8 on the forehead).

---

## 1. Overview

| # | Mechanic | Original project | Problem | This fork now | Commit |
|---|---|---|---|---|---|
| 1 | fNIRS baseline in Focus Ball / Glow Orb | (no fNIRS) | Fixed 30 s baseline. ΔHbO drifted by −5 µM in 8 min, responses are only 0.5–1 µM. The ball stayed on the floor. | `driftFloor()` follows drops in ~8 s and rises in ~90 s | `3f3dc82` |
| 2 | fNIRS scale (how many µM move the ball to the top) | (no fNIRS) | Ratchet: one spike made the top unreachable for the rest of the round | Grows with upswings, relaxes back over ~30 s | `b460310` |
| 3 | EEG joystick baseline | Fixed for the whole session | Electrode contact settles for minutes. At 0.55× theta, "focus" = 0 for the rest of the round | Each ratio is divided by its own slow running level | `b460310` |
| 4 | `autoAdjustBaseline` | Moves the centre by ±0.05 at most (≤ 0.06 output change). Ignored by frustration and drowsiness. Wrong sign on alertness | Could not rescue a stuck axis | Replaced by #3. Stuck for 10 s → it catches up faster | `b460310` |
| 5 | "PAUSED: CHECK ELECTRODES" | Overlay only. No game read it | Score kept building, or health kept draining, behind the overlay | Games freeze score, health, penalties and timers | `84f18cd` |
| 6 | Score after a freeze | `lastUpdateRef` not reset | First tick after START added the whole wait (Diver: ~600–800 free points) | Clock reset when scoring starts. Delta capped at 0.25 s | `84f18cd` |
| 7 | Baseline validity | Any baseline accepted (`ticks` never checked) | An all-zero baseline gave a constant 0.5. The player scored with no brain input | Needs enough ticks and non-zero AF7/AF8 power, else "try again" | `d6253eb` |
| 8 | No samples in the last second | Counted as **not bad** | A data stall looked like perfect contact | `'none'`, counts as bad while connected | `d6253eb` |
| 9 | All-channel band averages | Averaged all 4 channels | A loose ear sensor skewed flow and frustration | Bad channels are left out | `d6253eb` |
| 10 | Jump detection | Compared \|v\| with \|prev\| | A −300 → +300 µV jump counted as 0 | Compares signed values | `8db2f48` |
| 11 | Reports and comparisons | (fork feature) | A stuck session gave a confident "0 %" and spoiled the next 5 comparisons | Stuck/insufficient sessions marked invalid and excluded | `84f18cd` |
| 12 | Report wording, head map, bands | (fork features) | Over-claimed ("time in focus"); 21 % vs 24 % looked like blue vs red; frequency gaps | Says what is measured; honest colour scale; no gaps | `8db2f48`, `27836cd` |
| 13 | ΔHbO line in the report | (fork feature) | Showed raw drift, which hid the real responses | Slow drift removed at draw time | `27836cd` |
| 14 | Recorder optics | (fork feature) | Kept ~15 of 64 samples/s | Every sample kept | `c7103f8` |
| 15 | Optics sample rate | (no fNIRS) | Assumed 64 Hz | Measured (safety net, see §8) | `efb4576` |

---

## 2. fNIRS games (Focus Ball, Glow Orb)

The original project had no fNIRS. These games are new in this fork, so the "before" here is our own first version.

### 2.1 Drift (the main bug)

**How it worked:** `FnirsProcessor` (`src/lib/fnirs.js`) averages 30 s of resting light as the zero point. All later HbO/HbR values are changes against that zero point. The game moved the ball with
`ballY = clamp(REST + 0.7 × oxy / scale, 0.03, 0.97)`.

**What went wrong:** in a real session the oxygenation index fell from −0.5 to −5.6 µM over 3 minutes. Over 8 minutes of the headband test it fell by 5.5 µM. A real response to "count back by 3s" is only about 0.5–1 µM. So the index stayed below zero all round, the ball sat at the 0.03 clamp, the score stayed at 0, and nothing warned the player.

**Fix:** `driftFloor()` (end of `src/lib/fnirs.js`) keeps a moving "floor" and subtracts it:

- If the signal is **below** the floor, the floor follows it quickly (time constant 8 s). A drift down is forgiven in about 10 s.
- If the signal is **above** the floor, the floor follows it slowly (90 s). A real rise of 5–30 s still lifts the ball.
- While the signal is paused (bad quality), the floor does not move.

**Trade-off:** a rise that lasts several minutes slowly becomes the new normal. For a game this is fine: the goal is repeated short efforts.

### 2.2 Scale ratchet

**Before:** `scale = max(scale, oxy × 0.9)`. The scale could only grow, so one artifact spike (for example a small headband shift) made the top unreachable for the rest of the round.
**Now:** the scale grows with real upswings and relaxes back to the start value over about 30 s. Glow Orb already did this, and Focus Ball and the joystick fNIRS axis now do it too.

### 2.3 Real pause, "signal lost", and round time (Glow Orb)

- Glow Orb had no "signal lost" check. On a disconnect the orb idled, the clock ran, and a 0-point round was saved. It now uses the same check as Focus Ball.
- Glow Orb's clock kept running during a pause, so "time above the line" was divided by time that included bad signal. Now the clock only runs on good signal.

---

## 3. EEG joystick (all original games)

Diver, Sweet Spot, Sailor and Train of Thoughts come from the original project. They read a "joystick" value from 0 to 1 (`src/contexts/JoystickContext.jsx`).

### 3.1 Fixed baseline + narrow clamp

**Original:**
`value = clamp(0.5 + 0.5 × (current / baseline − 1) / range)`, with `range` = 0.4–0.6.
The baseline is the band power from calibration and stays the same for the whole session.

**Problem:** dry electrodes settle for 5–10 minutes. If theta falls to 0.55× of the baseline, `(0.55 − 1) / 0.4 = −1.1`, so the value is clamped to 0. The "focus" axis then stays at 0 for the rest of the session. The same happens on the other axes in either direction.

**Original rescue (`autoAdjustBaseline`):** after 10 s at an edge, it moved the centre towards ±0.05. With a range of 0.4 that changes the output by at most 0.06, so a stuck axis stayed stuck. The frustration axis (Diver) and the drowsiness axis ignored the offset completely, and the alertness axis added it with the wrong sign.

**Fix:** `rel(key, value, baseline)` divides every ratio by its own slow running level (an average in log space):

- Normal time constant: **90 s**. Slow drift fades out, and a change over seconds still shows.
- If an axis has been at 0 or 1 for **10 s**, the time constant drops to **20 s**, so the axis cannot stay stuck.
- A new baseline (recalibration) resets the running level.
- `autoAdjustBaseline` is still accepted so the game code does not break, but it now does nothing.

**Simulation** (theta drifting to 0.55× over 5 min, one 20 s effort of +30 %): the old value was 0.00 from about minute 4 on. The new value stays at about 0.25, and the effort shows as 0.60 (old: 0.36).

**Trade-off:** a state held for many minutes slowly counts as the new normal. For example, in Diver, frustration held for over 2 minutes counts less and less.

### 3.2 The pause overlay did not pause

**Original:** `FrontalPauseOverlay` shows "PAUSED: CHECK ELECTRODES" when the forehead sensors are bad. No game read this state. During artifacts the joystick returns its last value, frozen. So behind the overlay the score kept building (if the frozen value was high), or health kept draining (if it was low). In the original, `frozen` was only `isDead` (Diver, Sweet Spot) or `isDead || hasWon` (Sailor).

**Fix:** `useSignalPause()` (`src/hooks/useSignalPause.js`) is true exactly when the overlay is visible: the same 1.5 s delay, the same route rules, and hidden during the baseline modal. Diver, Sweet Spot, Sailor and Train of Thoughts add it to `frozen`, and they also stop health drain, penalty timers, movement and round timers. Blinking Contest stops scoring when it is paused or disconnected.

### 3.3 Free points after a freeze

**Original:** `useGameScore` sets `lastUpdateRef` once, and its interval does not run while frozen. The first tick after unfreezing therefore credited the whole frozen time (start screen + 30 s calibration) at full rate. Diver gave about 600–800 free points, and those also counted for the best score.
**Fix:** the clock resets when the interval starts, and one tick can add at most 0.25 s.

### 3.4 Silent fallbacks

| Case | Original | Now |
|---|---|---|
| Baseline with too few or all-zero ticks (all rejected, SKIP right after connect, spectrum buffer not full yet) | Accepted. `normalizeRatio` returned a constant 0.5, so the player scored with no brain input | Rejected. The modal asks the player to try again. SKIP waits up to 10 s for a usable spectrum |
| No EEG samples in the last second | Channel counted as not bad | `'none'`, counts as bad while connected (the game pauses) |
| A flat (dead) Athena channel | The electrode display rounded the RMS and showed grey "waiting" | Red "bad" |
| A bad ear channel (TP9/TP10) | Still averaged into flow/frustration | Left out. If all channels are bad, the axis holds its last value |
| Jump from −300 to +300 µV | Compared absolute values, so it was not seen | Compares signed values, so it triggers "adjusting" |

### 3.5 Command Center review fixes (2026-10-22)

Source: `REVIEW-command-center-metrics.html` (outside the repo).

- **Detrend before the spectrum** (`src/lib/signal.js`): each 2 s segment loses its straight-line trend before the Hann window. A 20 µV DC offset used to make delta 3.7× too big on classic Muse.
- **Half-open band edges**: a bin on a shared edge counts in the upper band only. An 8 Hz bin used to count fully in theta and alpha.
- **Blink segments skipped** (`src/contexts/ProcessingContext.jsx`): the processing layer runs its own `BlinkDetector`, marks ±0.4 s around each blink, and Welch skips segments that touch a mark. Recordings showed 2–2.7× forehead delta in blink segments.
- **Per-axis drift state** (`src/contexts/JoystickContext.jsx`, `src/lib/axisMath.js`): two tiles no longer share one drift tracker. One-sided axes (`restsAt` 0 or 1: alertness, drowsiness, frustration) never use the 20 s fast mode; they used to trigger it just by resting.
- **Options** `driftTauS` (default 90 s) and `mapping` (`'linear'` default, `'log'`). The Command Center uses log mapping with range 1.5 (edges at ×2.5 / ÷2.5) and the default 90 s drift, so ×k and ÷k move a tile equally. Games are unchanged.
- **Why not a slow drift for the Command Center**: a 600 s drift was tried to show change since the baseline. A replay of the demo recording (`web-muse/assets/resting-state.csv`) showed band power falling to 35–45 % of the baseline as the electrodes settle, and the tiles then sat at 0 or 100 up to 74 % of the time (old code: 18–31 %; log 1.5 with 90 s: 17–26 %). Change since baseline cannot be told apart from electrode settling with these sensors.
- **Frontal bad channel**: a flagged-bad AF7 or AF8 drops out of frontal values (live and baseline); both bad → the axis holds.
- **Tests**: `node tools/test-signal.mjs`, `node tools/test-axisMath.mjs`. Measurement: `node tools/measure-blink-leak.mjs <recording.csv> athena`.

### 3.6 Fast signal and fair gate for the calm games (2026-10-23)

Train of Thoughts and Bubble Hippo do not use the joystick. They share a fast signal and a set of rules. The original project had none of this.

- **Fast signal** (`src/lib/fastSignal.js`): made from raw EEG, not from `ProcessingContext`. A sliding 1 s window gives a frame every 125 ms (8 per second), about 0.5 s delay. A frame older than 400 ms is not used; the game holds its value.
- **Checks, not penalties**: the frame carries flags for blink, eye move (slow AF7 − AF8), muscle (30–45 Hz above 2× its slow level), tense jaw, sleepy (theta and delta 60 % above baseline for 5 s) and eyes closed. No flag rewards or punishes. Each game's `gate.js` turns them into hold, hint or freeze.
- **Each game makes its own number**: Train of Thoughts uses a "busy" value against the child's baseline. Bubble Hippo uses a calm value averaged over 8 frames (about 1 s) and keeps its own sleepy rule without delta.
- **Progress rules** (`src/lib/progressRules.js`): the goal moves one step between rounds to keep success at 75–85 %. A safety net acts once per round (after 45 s, with at least 10 s of usable signal). The last 20 s of the day is one step easier. Level unlocks need good rounds on at least 2 play days. Daily limit for the whole arcade: 3 rounds per game, 15 min per day.
- **Round record** (`src/lib/roundRecord.js`): one record per round for every brain game (game, level, play setup, raw and z per minute, goal, success %, longest streak, held % and frozen %, stars). The parent report and the Training Journal read it.
- **Play setup** (`src/lib/playSetup.js`, `src/contexts/PlaySetupContext.jsx`): phone in hands, on a stand, or computer, per child and device. A guess is not stored as a fact: a session saves the setup only when the child chose it.
- **All numbers are start values.** Headband test-day recordings will set the real thresholds.
- **Tests**: `node tools/test-fastSignal.mjs`, `node tools/test-progressRules.mjs`.

---

## 4. Reports and history (fork features)

### 4.1 "Not enough signal" could never fire (Focus Ball)

Samples were only written while the game was not paused, so every sample had `ok: true`. The check `okSec < 30 % of the round` could therefore never be true. Now:

- Paused time is counted, and paused samples are stored with `ok: false`.
- A round ends after 60 s of continuous pause.
- **Stuck detection:** if more than 80 % of the good time is within 0.02 of the 0.03 or 0.97 clamp, the session is `degenerate`.
- Such sessions are saved with `valid: false` and `invalidReason` (`stuck`, `too-little-signal` or `bad-quality`). They do not update the best score.
- EEG games mark a round invalid if more than 70 % of it was paused, counted from START.

### 4.2 Comparisons

"Lower/higher than the last 5 sessions" used to include broken sessions, so one stuck session spoiled the next five comparisons. Invalid sessions are now left out on both sides. For an invalid session the report says: *"The signal was not usable in this session (for example stuck or too weak), so its numbers do not show focus. Check the headband fit."*

### 4.3 Wording

| Before | Now | Why |
|---|---|---|
| "Time in focus: X % of the session" | "Ball above the line: X % of the playable time (Y of Z)" | The number is the ball height (fNIRS) during good-signal time, not "focus" |
| Fallback that applied Focus Ball's 0.62 goal line to the EEG focus value | Removed (no number is better than a wrong one) | Different signal, different scale |
| "The forehead light sensor was on" (always) | "…signal was poor" when its data was unusable | Avoids a false sense of quality |
| INCREASE = 0 for both "never above the line" and "never recovered" | "n/a" when it does not apply | Two different meanings |
| Training journal "best" and "7-day average" over all games | Hidden on "all" when games with different score scales are mixed | The scales cannot be compared |

### 4.4 Head map ("Where the alpha waves were strongest")

**Before:** the colours stretched from the minimum to the maximum value. With alpha at 21 % and 24 %, the map showed deep blue against red.
**Now:** if the sensors differ by less than 5 points, the map uses **pale** colours over the real range and says *"Only small differences between sensors (under 5 points)."* If they differ by more, it uses full colours over a span of at least 10 points. A missing sensor shows "–", not "0 %".

### 4.5 ΔHbO line in the report

The line showed HbO against the fixed calibration baseline, so minutes of drift filled the strip and hid the real responses. The chart now subtracts a local straight-line fit over a centred 2-minute window when it draws. The drift goes, and responses of 5–30 s stay. The stored data stays raw. Seconds that the light sensor itself flags (movement, no light, too bright) are not stored.

---

## 5. Smaller signal-processing fixes

- **Personal frequency bands** (`src/lib/paf.js`): with a low alpha peak (PAF < 11 Hz), alpha ended at PAF + 2, but beta started at a fixed 13 Hz, so 9–13 Hz could fall into no band. Delta and theta had the same gap problem. Now each band starts where the one below it ends.
- **Blink detector** (`src/lib/blinkDetector.js`): jaw or ear muscle tension can hold the detection threshold at its 150 µV cap. Real blinks (60–150 µV) are then not counted. The detector now reports `saturated`, and Blinking Contest shows "Relax your jaw — blinks can't be seen."
- **Recorder** (`src/lib/mmRecorder.js`): optics samples arrive in Bluetooth bursts of about 4 at once. The recorder held only the latest value per EEG row, so recordings kept about 15 of 64 samples/s. Samples are now queued, and each row takes one. A 30 s simulation kept 1920 of 1920 samples, in order.

---

## 6. What the headband tests proved

These tests used recordings from 2026-10-10, made on a PC with the Muse S Athena connected through a phone relay.

| Question | Test | Result |
|---|---|---|
| Are forehead and ear channels in the right order? | Jaw clench (muscle signal at the ears), eye movements (signal on the forehead) | **Yes.** Jaw: TP10 rose from 4.6 to 22.5 µV and TP9 from 7.1 to 11.2 µV, with AF7/AF8 unchanged. Eyes: AF7/AF8 rose from 7.5 to 24–28 µV, with TP9 unchanged |
| Are the two light colours (730/850 nm) assigned correctly? | The heartbeat must show mainly in HbO | **Yes, both sides.** Pulse HbO/HbR = 5.6 (left) and 3.1 (right), against 0.37/0.62 if swapped |
| Does fNIRS react to the player? | Breath-hold, then mental arithmetic | **Yes.** HbO rose and HbR fell around the breath-holds and during arithmetic |
| How large is the drift? | 8 min recording | HbO −5.5 µM, which is 5–10× larger than the responses. This confirms §2.1 |
| Do the fixes help in a real session? | Replay of a real Focus Ball session (21:37) through the processor and the game logic | Old: 0 % above the line, stuck at the floor 99 %. New: 27 % above the line |
| Left vs right (AF7 vs AF8)? | Eyes left/right | **Not proven.** The adapter's 1 Hz high-pass removes the slow eye signal |

---

## 7. Open points and tuning

- **Ball range:** in the 21:37 session the new ball touched an edge 32 % of the time. The start scale (0.35 µM from rest to the top) is small against normal swings of ±0.5–1 µM. A larger start scale would make the ball calmer, but harder to lift. This needs more sessions to decide.
- **Sudden steps:** a −3 µM step within 10 s (probably a small headband shift) is too slow for the motion check. `driftFloor` forgives it within about 10 s.
- **Left/right order:** needs a test without the 1 Hz high-pass.
- **Long sustained states** fade into the new normal (§2.1, §3.1). This is a deliberate trade-off.

---

## 8. A note on the optics sample rate

One recording seemed to show only 16.5 optics samples/s. We added `_measureRate()` to `FnirsProcessor`: it counts samples against wall time in 4 s windows (a window with a gap over 1 s is skipped). If the rate differs by more than 15 %, it adopts the measured rate and rebuilds the low-pass filter. The settle, baseline and motion timing are in seconds.

A later recording showed that the headband sends the full **64 Hz**. The low count came from a browser tab that still ran the old recorder (§5). The measurement stays as a safety net: at 64 Hz it changes nothing (baseline ready after 35 s). At a real 16.5 Hz input, the baseline would be ready after 38 s, not 2 min 16 s.

**Lesson for testing:** after a rebuild, reload the browser tab (Ctrl+F5) before you record. A recording from the new recorder has most optics changes in rows next to each other.

---

## 8b. Heart rate from the optics

`src/lib/heartRate.js` (`HeartRateEstimator`) finds the pulse in the infrared optics. It is used live (`muse.fnirs.hr.value`), in the recording (`Heart_Rate` column) and in the viewer.

- **Channels:** the inner IR channels 6 (LI_IR) and 7 (RI_IR). The 4-channel p1035 has no inner pair, so it uses the outer IR channels 2 and 3. Each channel is divided by its own slow level, then they are summed.
- **Filter:** band-pass 0.7 to 3.5 Hz. The window is 10 s and the value updates about once per second.
- **Two methods:** autocorrelation and peak detection. The value is kept only if both agree (within 12 %).
- **No value (null)** when the signal is flat, there is no contact, the pulse is weak or irregular, the methods disagree, or the result is outside 40 to 200 BPM. The recorder then writes an empty `Heart_Rate`.
- **Sample rate:** the estimator measures the real optics rate (for example 16 Hz through the phone relay) and rebuilds its filters.

Limits: tested on 4 real recordings (52 to 92 BPM), and some files were only partly covered. It has not been checked against a chest strap or a pulse oximeter. The Athena optics differ from the Muse 2 PPG, so Mind Monitor may treat the column differently. Do not use it for medical purposes. Test with `node tools/test-heartRate.mjs`.

---

## 8c. Breathing rate and HRV from the optics (viewer, estimated)

`src/lib/pulseAnalysis.js` works on a whole recording (viewer worker, **Breathing & HRV** panel). It is pure, so live use can follow later. Nothing is written to the CSV.

- **Beat timing:** the same pulse channels and biquads as 8b, run forward and backward (0.5 to 4 Hz). Peaks get parabolic sub-sample interpolation. Beat times come from **sample index ÷ measured optics rate**, not from row timestamps: optics arrive in BLE bursts of about 4 samples, so row times jitter by −121 to +61 ms.
- **Artifacts:** an interval is dropped if it is outside 0.33 to 1.5 s or more than 20 % from the median of its 11 neighbours.
- **HRV:** RMSSD, SDNN, pNN50 and mean HR on the clean intervals, plus RMSSD in 60 s windows. LF/HF only for 5 min or more, and only meaningful at rest.
- **Gate:** HRV is shown as unavailable when the file has fewer than 30 unique optics samples/s. Recordings made before the recorder fix (§8) keep only about 15 to 16, at irregular times.
- **Breathing:** 60 s windows every 15 s, spectral peak 6 to 36 /min. Beat-interval rhythm (RIFV) and pulse amplitude (RIAV) must agree within 3 /min. The slow IR baseline (RIIV) and head pitch (Gyro_X) only vote. Head pitch can also rescue a window by matching one of the two. Other windows are rejected. Breathing also works at 16 Hz.

Results on the real files: 21-37-54 (64 Hz): 248 beats, 2.8 % artifacts, HR 57.8, RMSSD 51.5 ms, SDNN 66.8 ms, pNN50 32 %, breathing median 16.3 /min. 21-08-42 and 10-29-33 (15 to 16 Hz): HRV unavailable, breathing median 12.4 and 11.4 /min.

Limits: forehead pulse-rate variability reads a little higher than ECG HRV. Breathing is about ±2 to 3 /min when the estimators agree, and weak during movement or talking. Nothing has been checked against a chest strap. Test with `node tools/test-pulseAnalysis.mjs`.

---

## 9. How to check these mechanics yourself

- **Mock mode:** on the start screen, tap **EXPLORE WITHOUT A DEVICE**, then **USE SIMULATED REAL-TIME DATA**. All games run on synthetic EEG and fNIRS data.
- **Recordings:** tick **RECORD THIS SESSION** before you connect. The CSV is Mind Monitor compatible: one row per EEG sample (256 Hz), with optics in `Optics1..8`. A `/Marker/1` event marks the moment a game opens.
- **Replay:** extract the optics columns with their timestamps, then feed them into `FnirsProcessor.push(sample, timeMs)` and copy the game's ball logic. This is how we got the 0 % vs 27 % comparison.
- **Commits:** `3f3dc82`, `84f18cd`, `b460310`, `d6253eb`, `8db2f48`, `c7103f8`, `efb4576` and `27836cd` on `main`. Each commit message explains its change.
