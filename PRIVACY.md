# Privacy Policy

## Zero Data Collection

**Brain Arcade collects ZERO data. Period.**

This document explains our privacy policy, data handling practices, and the technical guarantees we provide to protect your neural data.

---

## Our Commitment

Your thoughts are **deeply personal**. We believe neural data deserves the highest level of privacy protection. That's why Brain Arcade is built with a **zero data collection** architecture:

- ✅ **All processing happens locally** in your browser
- ✅ **No data is ever saved** to disk
- ✅ **No data is ever transmitted** to servers
- ✅ **No analytics or tracking** of neural signals
- ✅ **No third-party data sharing**

When you close the browser, all neural data is destroyed. Your thoughts stay yours.

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

### Non-Neural Data

The **only** persistent data is:

- **Game scores** (optional, stored in browser LocalStorage)
  - No neural data attached
  - Anonymized (no personal info)
  - Can be cleared at any time

---

## Technical Guarantees

### Architecture

Brain Arcade's architecture **prevents data collection by design**:

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
│  ❌ No Disk Storage                 │
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

### No Persistent Storage

Neural data is **never written to disk**:

- ❌ No `localStorage.setItem()` for neural data
- ❌ No `indexedDB` writes
- ❌ No file downloads
- ❌ No cookies containing biomarker values

The only persistent data is **anonymized game scores** (if you choose to save them).

### Open Source Verification

Brain Arcade is **fully open source** (MIT License):

- All code is public and auditable
- You can inspect every line
- Community code review
- No hidden telemetry

**Inspect the code yourself:** [GitHub Repository](https://github.com/yourusername/brain-arcade)

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
- 30 seconds of data is **temporarily stored** in React context
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

## Your Rights

Even though we collect **zero data**, here are your rights:

### Right to Transparency

- All code is open source
- Processing algorithms are documented
- You can audit everything

### Right to Control

- **You control the connection** — Connect/disconnect anytime
- **You control the data** — Exists only while you allow it
- **You control the experience** — Use mock mode without a device

### Right to Deletion

- Close the browser → Data is destroyed
- Disconnect → Data is cleared
- No "deletion request" needed (there's nothing to delete!)

---

## Contributor Guidelines

If you're contributing to Brain Arcade, **you must respect the zero data collection policy**:

### ✅ Allowed

- Processing data **in-memory** (React state/context)
- Displaying data on screen
- Using data for game logic
- Saving **anonymized game scores** (no neural data)

### ❌ Prohibited

- Saving neural data to `localStorage`, `indexedDB`, files
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

---

## Questions About Privacy

### "Can I use Brain Arcade offline?"

**Yes!** After the initial page load, Brain Arcade works **completely offline**. The app is a static site with no backend.

### "Can I inspect the code?"

**Absolutely!** Brain Arcade is open source (MIT License). Inspect every line:
- [GitHub Repository](https://github.com/yourusername/brain-arcade)
- All processing logic is in `/src/contexts/`
- All games are in `/src/games/`

### "What about browser extensions?"

Brain Arcade can't control browser extensions. If you have extensions that log network traffic or capture DOM content, they might see rendered biomarker values (e.g., "Control: 78%").

For maximum privacy, use a clean browser profile without extensions.

### "Is Web Bluetooth secure?"

Web Bluetooth requires:
- **User permission** for each connection
- **HTTPS** (encrypted page load)
- **Same-origin policy** (no cross-site access)

Brain Arcade uses Web Bluetooth according to W3C specifications. Learn more: [Web Bluetooth Security](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#security_and_permissions)

---

## Contact

If you have privacy concerns or questions:

1. **Open an issue:** [GitHub Issues](https://github.com/yourusername/brain-arcade/issues)
2. **Start a discussion:** [GitHub Discussions](https://github.com/yourusername/brain-arcade/discussions)

We take privacy seriously and will respond promptly.

---

## Changes to This Policy

If we ever change this policy (we won't — zero data collection is a core principle), we will:

1. Update this document
2. Increment the version number below
3. Announce in the repository README

**Version:** 1.0
**Last Updated:** November 2024

---

## Summary

**Brain Arcade collects ZERO data.**

Your neural data:
- ✅ Stays in your browser
- ✅ Processes locally
- ✅ Never saved
- ✅ Never transmitted
- ✅ Destroyed on disconnect

Your thoughts are yours. Always.

---

**Questions?** Open an issue or discussion on GitHub.

**Want to verify?** The code is open source. Audit it yourself.

**Trust, but verify.** That's the hacker way. 🧠🕹️
