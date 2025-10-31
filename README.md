# Muse Games - Brainwave Powered Minigames

A modular platform for creating EEG-controlled minigames using the Muse headband and Web Bluetooth API.

## Features

- 🧠 **Muse EEG Integration** - Direct browser connection to Muse devices via Web Bluetooth
- 🎮 **Modular Game System** - Easy-to-extend architecture for adding new games
- 🕹️ **Retro 8-bit Aesthetic** - NES-style UI with scanlines, pixel fonts, and arcade vibes
- ⚛️ **React + Vite** - Modern development stack with hot module replacement
- 🎨 **Tailwind CSS** - Utility-first styling with custom retro theme

## Project Structure

```
/src
  /components
    - Layout.jsx              # Main layout with Muse status indicator
    - MuseConnector.jsx       # Muse connection UI
    - StartScreen.jsx         # Retro start screen
    - NavBar.jsx              # Game navigation menu
  /contexts
    - MuseContext.jsx         # Muse/EEG state management
  /games
    /example-game
      - ExampleGame.jsx       # Demo game component
    - games.config.js         # Central game registry
  /styles
    - retro.css               # 8-bit styling and effects
  - App.jsx                   # Main app with routing
  - index.css                 # Global styles + Tailwind
```

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173/`

### Browser Requirements

- Chrome, Edge, or Opera (Web Bluetooth support required)
- Safari and iOS devices are not currently supported

## Adding a New Game

### 1. Create Your Game Folder

Create a new folder in `/src/games/` with your game name:

```bash
mkdir src/games/my-game
```

### 2. Create Your Game Component

Create a React component in your game folder (`MyGame.jsx`):

```jsx
import { useEEG } from '../../contexts/MuseContext';

export function MyGame() {
  const { rawEEG, isConnected } = useEEG();

  // rawEEG is an array of 4 channel values: [TP9, AF7, AF8, TP10]
  // Values are in microvolts (μV), typically in range [-1000, 1000]

  if (!isConnected) {
    return <div>Please connect your Muse device</div>;
  }

  return (
    <div>
      <h2>My Awesome Game</h2>
      <p>Channel 1: {rawEEG[0]}</p>
      {/* Your game logic here */}
    </div>
  );
}
```

### 3. Register Your Game

Add your game to `/src/games/games.config.js`:

```javascript
import { MyGame } from './my-game/MyGame';

export const games = [
  // ... existing games
  {
    id: 'my-game',
    name: 'MY AWESOME GAME',
    description: 'Description of what your game does',
    icon: '🎮',
    component: MyGame,
  },
];
```

That's it! Your game will automatically appear in the navigation menu.

## Using EEG Data

### Available Hook

```javascript
import { useEEG } from '../contexts/MuseContext';

const { rawEEG, isConnected, muse, connectMuse, disconnectEEG } = useEEG();
```

### Hook Returns

- `rawEEG`: Array of 4 EEG channel values `[TP9, AF7, AF8, TP10]`
- `isConnected`: Boolean indicating Muse connection status
- `muse`: Raw Muse device object with buffers and properties
- `connectMuse()`: Function to initiate Muse connection
- `disconnectEEG()`: Function to disconnect from Muse

### EEG Data Details

- **Sampling Rate**: 256 Hz (256 samples per second)
- **Channels**: 4 electrodes (TP9, AF7, AF8, TP10)
- **Value Range**: Typically -1000 to 1000 microvolts (μV)
- **Update Frequency**: Real-time updates via React state

### Example: Using EEG for Game Logic

```javascript
import { useState, useEffect } from 'react';
import { useEEG } from '../../contexts/MuseContext';

export function ConcentrationGame() {
  const { rawEEG, isConnected } = useEEG();
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (isConnected) {
      // Calculate average brain activity
      const avgActivity = rawEEG.reduce((sum, val) => sum + Math.abs(val), 0) / 4;

      // Increase score based on activity
      if (avgActivity > 500) {
        setScore((prev) => prev + 1);
      }
    }
  }, [rawEEG, isConnected]);

  return (
    <div>
      <h2>Concentration Challenge</h2>
      <p>Score: {score}</p>
      <p>Keep your brain activity high!</p>
    </div>
  );
}
```

## Styling

### Retro Theme

The app includes pre-built retro styling classes:

- `.retro-button` - 8-bit style button
- `.pixel-border` - Pixelated borders
- `.scanlines` - CRT scanline effect
- `.blink` - Blinking animation
- `.arcade-cabinet` - Arcade machine style container

### Custom CSS Variables

```css
--nes-red: #FC8080
--nes-blue: #40C0FF
--nes-purple: #8040FF
--nes-green: #00C020
--nes-yellow: #FCC060
--nes-dark: #282828
--nes-gray: #505050
```

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## EEG Processing Infrastructure

Reusable building blocks for EEG-driven games are included:

- Processing: `ProcessingProvider` computes Welch PSD (2s window, 1s overlap) and band powers for each channel at ~4Hz. Access via `useProcessing()`.
- Baseline: `BaselineProvider` records a session baseline of band powers for a configurable duration (default 30s). Trigger via `useBaseline().ensureBaseline({ seconds })`. Baseline persists until device disconnect.
- Biomarkers: `BiomarkerProvider` exposes derived markers and normalized values vs baseline. Use `useBiomarker(name)` or `useBiomarkers()`.
- Joystick: `BiomarkerJoystick` renders a normalized 0–1 control stream from a biomarker to plug into gameplay.

Biomarker keys:

- `frontal-midline-theta` — avg theta across AF7/AF8 (approximation)
- `frontal-alpha-asymmetry` — alpha(AF7) − alpha(AF8)
- Bands (avg): `alpha`, `beta`, `theta`, `delta`, `gamma`
- Bands (per-side): `alpha-left|right`, `beta-left|right`, `theta-left|right`, `delta-left|right`, `gamma-left|right`

Usage in a game component:

```jsx
import React, { useEffect } from 'react';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { useBiomarker } from '../contexts/BiomarkerContext.jsx';
import { BiomarkerJoystick } from '../components/BiomarkerJoystick.jsx';

export function MyGame() {
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { norm01 } = useBiomarker('frontal-midline-theta', { range: 0.4 });

  useEffect(() => {
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

  // Use norm01 (0..1, 0.5 at baseline) to drive gameplay
  return (
    <div>
      {!isBaselineReady && <div>Waiting for baseline…</div>}
      <BiomarkerJoystick
        biomarker="frontal-midline-theta"
        label="Focus"
        hintDown="relaxation"
        hintUp="cognitive control"
      />
      <div>Control value: {Math.round(norm01 * 100)}</div>
    </div>
  );
}
```

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS v4** - Utility-first CSS
- **web-muse** - Muse EEG device library

## Resources

- [web-muse Documentation](./web-muse/README.md)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Muse Headband](https://choosemuse.com/)

## License

MIT

## Contributing

1. Fork the repository
2. Create your game in a new folder
3. Register it in `games.config.js`
4. Submit a pull request!

---

Built with 🧠 and powered by brainwaves
# brain-minigames
