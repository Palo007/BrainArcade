# Brain Arcade 🧠🕹️

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Games: CC BY-SA 4.0](https://img.shields.io/badge/Games-CC_BY--SA_4.0-lightgrey.svg)](./GAMES-LICENSING.md)
[![Contributing](https://img.shields.io/badge/Contributing-CLA-green.svg)](./CLA.md)

<p align="center">
  <img src="./src/assets/startscreeen_gif.gif" alt="Brain Arcade Start Screen" width="600">
</p>

> **A retro arcade of thought-controlled minigames — proving neurotechnology is already here, accessible, and ready to hack.**

[Brain Arcade](https://brain-arcade.io/) is an open-source platform that connects consumer-grade EEG devices to playable minigames in your browser. Built with the cheapest available headset (Muse), this project demonstrates that neurotechnology isn't just deep-tech anymore — there's a layer that's **usable, accessible, and waiting for builders**.

## License

- **Core (this repo except `/src/games`)**: **AGPL-3.0-or-later**
- **Games (everything under `/src/games`)**: **CC BY-SA 4.0** ([details](./GAMES-LICENSING.md))

Commercial licenses are available for closed-source integrations. See **COMMERCIAL.md**.

**Curation & Deployment Policy:**  
Community games are welcome, but inclusion in the official arcade and hosted deployments
is curated. Submissions may be accepted, modified, or declined at the maintainer’s discretion.

**Unregistered Mark Notice:**  
“Brain Arcade” is an unregistered mark used to identify the original project and official deployments.
Forks and derivatives should use distinct naming and branding.

## The Vision

This project serves **two audiences simultaneously**:

1. **Users** 👾 — Experience what's possible with neurotechnology _today_. See that brain-computer interfaces aren't science fiction — they're in your browser.

2. **Builders & Hackers** 🛠️ — Discover that building with neurotechnology doesn't require a PhD. Use pre-processed biomarkers as simple joystick controls (normalized 0-1 values) or dive deeper into signal processing pipelines.

The arcade setting makes it **playful and approachable** while the modular architecture makes it **serious and extensible**. Neurotechnology for everyone.

---

## Try It Now (No Hardware Needed!)

You can explore the entire platform using **mock mode** with real pre-recorded EEG data:

```bash
npm install
npm run dev
```

When connecting, choose **"Mock Mode"** to try all games without a Muse device. The mock data is real neural signals, so you'll get authentic behavior.

---

## Features

🧠 **Consumer-Grade EEG** — Uses Muse headbands (cheapest consumer EEG available) via Web Bluetooth

🎮 **Plug-and-Play Games** — Add new games without touching core files

🕹️ **Four Contribution Levels** — From joystick-only games to raw EEG pipelines

🔒 **Zero Data Collection** — Local-only processing, no neural data is ever saved or transmitted

🧪 **Mock Mode** — Develop and play with real pre-recorded EEG data (no device required)

🕹️ **Retro Aesthetic** — NES-style UI with 8-bit vibes

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/itayinbarr/brain-arcade.git
cd brain-arcade

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173/` in a Web Bluetooth-compatible browser (Chrome, Edge, or Opera).

### Browser Requirements

- Chrome, Edge, or Opera (Web Bluetooth support required)
- Safari and iOS devices are **not supported** (no Web Bluetooth API)

### Connecting Your Brain

**Option 1: With a Muse Device**

1. Power on your Muse headband
2. Click "Connect Muse" in the app
3. Select your device from the browser's Bluetooth dialog
4. Start playing!

**Option 2: Mock Mode (No Device)**

1. Click "Connect Muse"
2. Select "Mock Mode"
3. Experience real pre-recorded EEG data
4. Perfect for development and demos

---

## Contribution Levels

Brain Arcade is designed for **modularity and scalability**. Contribute at any of four levels — pick what matches your skills and needs:

### Level 1: Joystick-Only Games (No Neuroscience)

Use pre-built **cognitive joysticks** — simple 0–1 values (map to 0–100%) that represent states like focus, engagement, or relaxation. You do not need to touch biomarkers or signal processing.

```jsx
import { useJoystick } from "../../contexts/JoystickContext.jsx";

export function MyGame() {
  // Choose an axis like 'engagement', 'focus', or 'relaxation'
  const { value01 } = useJoystick("engagement", {
    range: 0.4,
    autoAdjustBaseline: true,
  });

  const power = Math.round(value01 * 100); // 0..100
  return <div>ENGINE POWER: {power}%</div>;
}
```

Notes

- Joysticks auto-normalize against a session baseline and gate on signal quality.
- You can rely on the built-in calibration flow in the UI, or call `useBaseline().ensureBaseline({ seconds: 30 })` if your game needs to force calibration.

### Level 2: Biomarker Users/Builders (Basic Neuroscience)

Use or add **biomarkers** that joysticks are based on. Biomarkers expose raw values plus normalized helpers.

```jsx
import { useBiomarker } from "../../contexts/BiomarkerContext.jsx";

export function MyGame() {
  const { norm01, value, baseline } = useBiomarker("frontal-midline-theta");
  return <div>FOCUS: {Math.round((norm01 ?? 0.5) * 100)}%</div>;
}
```

Common biomarkers

- `frontal-midline-theta` (focus/control)
- `engagement-index` (beta/(alpha+theta))
- `relaxation-index` ((alpha+theta)/beta)
- Ratios and bands: `beta-alpha-ratio`, `theta-alpha-ratio`, `alpha`, `beta`, `theta`, etc.

### Level 3: Preprocessed EEG Users

Use **preprocessed features** like band powers directly from the processing pipeline.

```jsx
import { useProcessing } from "../../contexts/ProcessingContext.jsx";

export function MyTool() {
  const { bandPowers } = useProcessing();
  // bandPowers[ch].alpha, .beta, .theta, .delta, .gamma
  return <SpectrumBars data={bandPowers} />;
}
```

### Level 4: Raw EEG & Custom Pipelines

Access **raw EEG** and design your own DSP pipeline.

```jsx
import { useEEG } from "../../contexts/MuseContext.jsx";

export function MyDSP() {
  const { rawEEG } = useEEG(); // [TP9, AF7, AF8, TP10] @ 256 Hz
  const metric = myCustomDSPFunction(rawEEG);
  return <Metric value={metric} />;
}
```

**Full Processing Stack:**

1. **MuseContext** → Raw EEG data (256 Hz, 4 channels)

2. **ProcessingContext** → Welch PSD + band powers (~4 Hz updates)

3. **BaselineContext** → Session normalization (30s calibration)

4. **BiomarkerContext** → Cognitive markers (derived features)

5. **JoystickContext** → Game-ready 0-1 controls

---

## Adding a New Game

Games are **completely modular** — add yours without touching core files:

### 1. Create Your Game Folder

```bash
mkdir src/games/my-game
```

### 2. Build Your Game Component

Create `src/games/my-game/MyGame.jsx`:

```jsx
import { useJoystick } from "../../contexts/JoystickContext.jsx";

export function MyGame() {
  // Use joystick axes like 'engagement', 'focus', or 'relaxation'
  const { value01 } = useJoystick("relaxation", {
    range: 0.4,
    autoAdjustBaseline: true,
  });
  return (
    <div>
      <h2>MY BRAIN GAME</h2>
      <p>Relaxation: {Math.round(value01 * 100)}%</p>
      {/* Your game logic here */}
    </div>
  );
}
```

Tip: The app provides a built-in calibration flow. If your game needs to force calibration at start, you may call `useBaseline().ensureBaseline({ seconds: 30 })`.

### 3. Register Your Game

Add to `src/games/games.config.js`:

```javascript
import { MyGame } from "./my-game/MyGame";

export const games = [
  // ... existing games
  {
    id: "my-game",
    name: "MY BRAIN GAME",
    description: "Control the game with your thoughts",
    component: MyGame,
  },
];
```

**That's it!** Your game appears in the arcade menu automatically.

For detailed contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Privacy & Data Policy

🔒 **Zero Data Collection. Period.**

- **No neural data is ever saved** to disk
- **No data is transmitted** to any server
- **All processing happens locally** in your browser
- **Data exists only in memory** during your session

This is a hard rule for the project. Games that attempt to save or transmit neural data will not be accepted.

When you close the browser, all neural data is destroyed. Your thoughts stay yours.

**Read our full privacy policy:** [PRIVACY.md](./PRIVACY.md)

---

## Project Structure

```
/src
  /components
    - Layout.jsx              # Main UI layout
    - MuseConnector.jsx       # Device connection UI
    - BiomarkerJoystick.jsx   # Visual joystick component
    - StartScreen.jsx         # Retro start screen
    - NavBar.jsx              # Game navigation
  /contexts
    - MuseContext.jsx         # Raw EEG streaming (256 Hz)
    - ProcessingContext.jsx   # PSD + band powers
    - BaselineContext.jsx     # Session normalization
    - BiomarkerContext.jsx    # Derived cognitive markers
    - JoystickContext.jsx     # Game controls
    - QualityContext.jsx      # Signal quality monitoring
  /games
    /example-game            # Visualization demo
    /sweet-spot              # Relaxation floating game
    - games.config.js        # Central game registry
  /lib
    - signalProcessing.js    # DSP utilities
  /styles
    - retro.css              # 8-bit aesthetic
  - App.jsx                  # Main app + routing
```

---

## API Reference

### Hooks

#### `useJoystick(axis, options)` — Cognitive Joysticks

```javascript
const { value01 } = useJoystick("engagement", {
  range: 0.4,
  autoAdjustBaseline: true,
});
```

- `axis`: one of the documented joystick axes (see below)
- `value01`: normalized 0–1 control (map to 0–100%)
- `range` (optional): sensitivity around baseline (default ~0.4)
- `autoAdjustBaseline` (optional): gently shifts center if user sits at extremes

#### `useEEG()` — Raw EEG Data

```javascript
const { rawEEG, isConnected, isMock, connectMuse, disconnectEEG } = useEEG();
```

- `rawEEG`: `[TP9, AF7, AF8, TP10]` in microvolts
- `isConnected`: Boolean device status
- `isMock`: Boolean indicating mock mode
- `connectMuse(options)`: Connect to device (`{ mock: true }` for mock mode)
- `disconnectEEG()`: Disconnect device

#### `useProcessing()` — Band Powers

```javascript
const { bandPowers, psd } = useProcessing();
```

- `bandPowers`: `Array(4)` of per-channel objects: `bandPowers[ch].alpha|beta|theta|delta|gamma`
- `psd`: Power spectral density (Welch method, 2s window, 1s overlap)

#### `useBaseline()` — Calibration

```javascript
const { ensureBaseline, isBaselineReady, baseline } = useBaseline();
```

- `ensureBaseline({ seconds })`: Start calibration (default 30s)
- `isBaselineReady`: Boolean indicating baseline captured
- `baseline`: Baseline band power values

#### `useBiomarker(name, options)` — Cognitive Markers

```javascript
const { value, norm01, baseline } = useBiomarker("frontal-midline-theta", {
  range: 0.4,
});
```

- `value`: Current biomarker value
- `norm01`: Normalized 0-1 (0.5 = baseline)
- `baseline`: Baseline reference value
- `range`: Sensitivity parameter (default 0.4)

### Biomarkers & Joysticks (Updated)

Games should prefer joystick axes as the primary control surface. Biomarkers remain available for Level 2+.

- Biomarkers (BiomarkerContext `getBiomarker(name)`)

  - `frontal-midline-theta` — AF7/AF8 theta average (focus)
  - `frontal-alpha-asymmetry` — Alpha L-R difference (valence/approach)
  - `frontal-delta` — AF7/AF8 delta average (drowsiness)
  - `beta-alpha-ratio` — Beta/Alpha (frontal; stress proxy)
  - `theta-alpha-ratio` — Theta/Alpha (frontal; workload)
  - `theta-beta-ratio` — Theta/Beta (frontal; engagement inverse / fatigue)
  - `engagement-index` — Beta/(Alpha+Theta) (frontal; attention)
  - `relaxation-index` — (Alpha+Theta)/Beta (frontal; calm state)

- Joystick axes (JoystickContext `useJoystick(axis)` → `{ value01 }`)
  - `focus` — From `frontal-midline-theta` vs baseline
  - `alertness` — Inverse of `frontal-delta` increase (0=drowsy → 1=alert)
  - `drowsiness` — `frontal-delta` increase vs baseline
  - `stress` — `beta-alpha-ratio` (higher ⇒ more stressed)
  - `workload` — `theta-alpha-ratio` (higher ⇒ more load)
  - `engagement` — `engagement-index` (beta/(alpha+theta))
  - `relaxation` — `relaxation-index` ((alpha+theta)/beta)
  - `flow` — Composite of engagement, moderate beta, low delta, non-excessive theta
  - `frustration` — Composite of theta↑ + beta↑ with right-leaning theta asymmetry

Notes

- All axes gate on frontal signal quality to avoid artifacts.
- Most axes normalize against the session baseline (30s by default).
- Games can enable `autoAdjustBaseline` to adapt when users stick at extremes.

---

## Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

---

## Tech Stack

- **React 19** — UI framework
- **Vite** — Build tool & dev server
- **React Router** — Client-side routing
- **Tailwind CSS v4** — Utility-first styling
- **web-muse** — Muse EEG device library (bundled)

---

## Resources

- [Contributing Guidelines](./CONTRIBUTING.md)
- [Privacy Policy](./PRIVACY.md)
- [Curation & Deployment Policy](./DEPLOYMENT.md)
- [web-muse Documentation](https://github.com/itayinbarr/web-muse)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Muse Headband](https://choosemuse.com/)

---
