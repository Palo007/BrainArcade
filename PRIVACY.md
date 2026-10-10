# Privacy Policy

## Nothing Leaves Your Device

**Brain Arcade sends no data anywhere. We collect nothing.** Some things are kept on your own device so the app can work (see "What is stored on this device" below), and you can delete all of it.

This document explains our privacy policy, data handling practices, and the technical guarantees we provide to protect your neural data.

---

## Our Commitment

Your thoughts are **deeply personal**. We believe neural data deserves the highest level of privacy protection. That's why Brain Arcade is built with a **zero data collection** architecture:

- ✅ **All processing happens locally** in your browser
- ✅ **Nothing is stored on our side**; the only copies live on your device (see below)
- ✅ **No data is ever transmitted** to servers
- ✅ **No analytics or tracking** of neural signals
- ✅ **No third-party data sharing**

Live neural signals are destroyed when you disconnect or close the page, unless you switch on recording. Your thoughts stay yours.

---

## What Data We Process (Locally Only)

Brain Arcade processes the following data **exclusively in your browser's memory**:

### Neural Data (In-Memory Only)

1. **Raw EEG signals** (4 channels at 256 Hz)

   - Temporary storage in React state
   - Used for real-time processing
   - Destroyed on disconnect or page close

2. **Processed features** (band powers, biomarkers)

   - Computed from raw EEG
   - Stored in React context
   - Cleared on disconnect

3. **Baseline calibration data**
   - 30-second recording for normalization
   - Stored only during session
   - Cleared on device disconnect

### Optional Session Recording (opt-in, local only)

Brain Arcade can save a session as a Mind Monitor compatible CSV file (raw EEG, band powers, fNIRS optics, blinks, signal quality, game start/end markers). This is **OFF by default** and starts only when you switch on "Record this session".

- The file is written only on the device you are using (browser private storage / OPFS, in chunks), never sent anywhere. It stays there until you save it, share it or delete it.
- When you stop, you choose to save it, share it yourself, or delete it. If one is left unsaved, the app offers it back next time; starting a new recording deletes older leftover files except that one.
- Nothing from a recording is uploaded.
- The Recording Viewer (`/viewer`) opens a CSV file you choose and reads it in your browser. The file is not uploaded. Only your view settings are saved on the device.
- Treat a saved file like any other personal neural data: it is yours to keep or delete.

### What is stored on this device

Everything below lives only in your browser on this device. You can delete it (see "How to delete" at the end of this section):

- **Opt-in recording** (OPFS, see above) and files you download or share yourself (recordings, CSV export)

- **Game scores** (optional, stored in browser LocalStorage)
  - No neural data attached
  - Anonymized (no personal info)
  - Can be cleared at any time
- **Session history and child nicknames** (stored in browser LocalStorage on this device only)
  - One summary row per session. Every stored field: id, date, childId (which nickname it belongs to), game, durationSec, playedSec, okSec (seconds with good signal), outcome (win/lose where a game has one), cue, points, score, stars, energy, flow, flowSec, increase, avgRecoverySec, timeAbovePct (time in focus), meanFocus, paf (peak alpha frequency), alphaReactivity, calibDate (when the calibration used was made), qualityPct (signal quality), fnirsUsed, checkIn, feeling (1-5 mood tap), insight (short text summary)
  - Calibration (peak alpha frequency, alpha reactivity, personal bands, date, device type) is stored per child under the child's id, so one child's calibration is never applied to another
  - Summaries only: no raw EEG, no signal samples
  - Profiles are a nickname only (no real name, age, or contact details is requested)
  - Nothing is sent anywhere; the data never leaves this device unless you export it
  - Export and import are user-triggered: the Training Journal's "Export CSV" downloads a file you keep, "Import CSV" reads a file you choose
  - "Clear history" in the Training Journal deletes only the selected child's sessions (other children are untouched); clearing site data removes everything
  - How to delete: "Clear history" in the Training Journal (one child's sessions), delete a profile (nickname, and by default sessions and calibration), delete or discard a recording in the recording panel, or clear this site's data in your browser settings (removes everything). Demo (mock) mode saves nothing.
  - Deleting a profile removes the nickname. By default it also removes that child's sessions and stored calibration. If you untick "also delete their sessions", the sessions stay in storage (hidden, still included in a full CSV export) and are never reassigned to another child

---

## Technical Guarantees

### Architecture

Brain Arcade's architecture **prevents data collection by design** (data stays on your device):

```
┌─────────────────────────────────────┐
│       Your Browser (Local)          │
│                                     │
│  Muse Device (Bluetooth)            │
│         ↓                           │
│  MuseContext (React State)          │
│         ↓                           │
│  ProcessingContext (In-Memory)      │
│         ↓                           │
│  BiomarkerContext (In-Memory)       │
│         ↓                           │
│  Game Components (Render Only)      │
│                                     │
│  💾 Local storage only (your device)│
│  ❌ No Network Requests             │
│  ❌ No External Services            │
└─────────────────────────────────────┘
```

### No Network Requests

Brain Arcade **does not make any network requests** after the initial page load:

- No API calls
- No WebSocket connections
- No telemetry or analytics
- No third-party services

You can verify this by opening your browser's Network tab (F12 → Network) while using the app.

### Local Storage Only

Live neural signals are not written to disk unless you opt in. What is stored on the device:

- `localStorage`: child nicknames, per-session summaries (no raw signals), per-child calibration, game scores
- OPFS (browser private file storage): the opt-in raw EEG/fNIRS recording (Mind Monitor CSV), until you save or delete it
- Files you trigger yourself: downloads, shares and the CSV export
- ❌ No cookies containing biomarker values, nothing sent to a server

Delete it with "Clear history" per child, deleting a profile, deleting a recording, or clearing site data.

### Open Source Verification

Brain Arcade is **fully open source** (MIT License):

- All code is public and auditable
- You can inspect every line
- Community code review
- No hidden telemetry

**Inspect the code yourself:** [GitHub Repository](https://github.com/itayinbarr/brain-arcade)

---

## Data Lifecycle

Here's exactly what happens to your neural data:

### 1. Connection

When you connect your Muse device:

- Web Bluetooth API establishes a **local** connection
- No intermediary servers
- Direct browser ↔ device communication

### 2. Streaming

While connected:

- EEG data streams **only to your browser**
- Processed in **React state** (in-memory)
- Displayed in real-time
- **Never written to disk**

### 3. Calibration (Baseline)

During baseline calibration:

- 30 seconds of data is **temporarily stored** in React context; the resulting calibration (peak alpha frequency etc.) is saved per child in `localStorage`
- Used to compute normalization parameters
- **Cleared immediately** on disconnect

### 4. Gameplay

During games:

- Biomarker values (0-1 normalized) drive game logic
- Rendered to screen
- **Not logged, saved, or transmitted**

### 5. Disconnection

When you disconnect or close the browser:

- All neural data is **immediately destroyed**
- React state is cleared
- No traces remain

**Your thoughts are gone. Forever.**

---

## What We Don't Do

### ❌ No Cloud Processing

- We don't send data to servers
- We don't use cloud APIs
- We don't offer "cloud sync"

### ❌ No Machine Learning Training

- We don't collect training data
- We don't build user profiles
- We don't train models on your data

### ❌ No Third-Party Services

- No Google Analytics
- No Facebook Pixel
- No advertising networks
- No error tracking that captures neural data

### ❌ No Data Sales

- We don't sell data (we don't collect it!)
- We don't share data with partners
- We don't monetize user information

---

## Contributor Guidelines

If you're contributing to Brain Arcade, **you must respect the zero data collection policy**:

### ✅ Allowed

- Processing data **in-memory** (React state/context)
- Displaying data on screen
- Using data for game logic
- Saving **anonymized game scores** (no neural data)

### ❌ Prohibited

- Saving raw neural data anywhere without the user's explicit opt-in (the recording feature)
- Transmitting neural data via `fetch()`, `XMLHttpRequest`, WebSockets
- Logging biomarker values to console in production
- Using third-party analytics that capture neural signals

**Code Review:** All pull requests are reviewed for compliance. Violations will be rejected.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Mock Mode Privacy

When using **Mock Mode** (no device required):

- Uses **pre-recorded EEG data** from the `web-muse` library
- Data is read from a **local CSV file** bundled with the app
- Same privacy guarantees apply
- No data is transmitted

Mock mode is perfect for:

- Trying the app without hardware
- Development and testing
- Demos and education
