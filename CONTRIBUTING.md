# Contributing to Brain Arcade

Thank you for your interest in contributing to Brain Arcade! This project is built on the principle that **neurotechnology should be accessible to everyone** — from game developers to neuroscience researchers.

This guide will help you understand how to contribute effectively while respecting the project's architecture and values.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Types of Contributions](#types-of-contributions)
3. [Zero Data Collection Policy](#zero-data-collection-policy)
4. [How to Contribute](#how-to-contribute)
5. [Adding a New Game](#adding-a-new-game)
6. [Core Contributions](#core-contributions)
7. [Code Standards](#code-standards)
8. [Pull Request Process](#pull-request-process)
9. [Testing Guidelines](#testing-guidelines)

---

## Code of Conduct

Brain Arcade is a welcoming, inclusive project. We expect all contributors to:

- Be respectful and constructive in discussions
- Welcome newcomers and help them learn
- Focus on what's best for the community
- Show empathy towards other contributors

Harassment, trolling, or discriminatory behavior will not be tolerated.

---

## Types of Contributions

We welcome contributions at **three levels of complexity**:

### 1. Game Developers (No Neuroscience Required)

**What you contribute:** New minigames using pre-built biomarker joysticks

**What you need to know:**
- React & JavaScript
- How to use hooks (`useBiomarker`, `useBaseline`)
- Basic game logic

**Examples:**
- Add a new minigame (Pong, Snake, Tetris, etc.)
- Improve existing games
- Create tutorials or game templates

👉 **Start here:** [Adding a New Game](#adding-a-new-game)

---

### 2. Neuroscience Experts & Biomarker Builders

**What you contribute:** New biomarkers, improved signal processing, or validation of existing markers

**What you need to know:**
- EEG signal processing (FFT, band powers, etc.)
- Cognitive neuroscience (what markers represent)
- JavaScript/React for implementation

**Examples:**
- Propose a new biomarker (e.g., `P300-amplitude`, `mu-rhythm-suppression`)
- Improve existing biomarker calculations
- Add validation studies or references
- Optimize processing algorithms

👉 **Start here:** [Core Contributions - Biomarkers](#adding-a-biomarker)

---

### 3. Pipeline Builders & Infrastructure

**What you contribute:** Core processing infrastructure, new contexts, optimization

**What you need to know:**
- Advanced signal processing (DSP)
- React context architecture
- Performance optimization
- Web Bluetooth API (optional)

**Examples:**
- Add new processing contexts
- Optimize Welch PSD performance
- Improve baseline calibration algorithms
- Add artifact rejection pipelines

👉 **Start here:** [Core Contributions - Infrastructure](#core-infrastructure)

---

## Zero Data Collection Policy

**This is a hard rule for the project.**

Brain Arcade has a **zero data collection policy**. This means:

### ✅ Allowed:
- Processing neural data **in memory** during a session
- Displaying data in real-time
- Using data for game logic
- Temporary storage in browser state (React state, context)

### ❌ Prohibited:
- Saving neural data to disk (LocalStorage, IndexedDB, files)
- Transmitting neural data to any server
- Logging neural data to console in production builds
- Any form of persistent neural data storage
- Third-party analytics that capture neural data

### Why This Matters

Users' neural data is **deeply personal**. By enforcing local-only processing, we:
- Protect user privacy
- Build trust in neurotechnology
- Set an ethical standard for the field
- Keep the platform accessible and transparent

### Code Review

All pull requests will be reviewed for compliance. PRs that violate this policy will be rejected, even if technically excellent.

If your game/feature requires data persistence for legitimate reasons (e.g., game scores), use anonymized, non-neural data only.

---

## How to Contribute

### First-Time Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/brain-arcade.git
   cd brain-arcade
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Create a branch for your contribution:**
   ```bash
   git checkout -b feature/my-awesome-game
   # or
   git checkout -b biomarker/new-marker
   # or
   git checkout -b fix/bug-description
   ```

5. **Start the dev server:**
   ```bash
   npm run dev
   ```

6. **Make your changes** (see specific guides below)

7. **Test your changes** thoroughly using both real and mock data

8. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Add: my awesome brain game"
   ```

9. **Push to your fork:**
   ```bash
   git push origin feature/my-awesome-game
   ```

10. **Open a Pull Request** on GitHub

---

## Adding a New Game

Games are **completely isolated** from core code. You should **never need to modify core files** to add a game.

### Step 1: Create Your Game Folder

```bash
mkdir src/games/my-game
cd src/games/my-game
```

### Step 2: Create Your Game Component

Create `MyGame.jsx` in your game folder:

```jsx
import { useBiomarker } from '../../contexts/BiomarkerContext';
import { useBaseline } from '../../contexts/BaselineContext';
import { useEffect } from 'react';

export function MyGame() {
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { norm01 } = useBiomarker('frontal-midline-theta');

  useEffect(() => {
    ensureBaseline({ seconds: 30 }); // Request 30s calibration
  }, [ensureBaseline]);

  if (!isBaselineReady) {
    return (
      <div className="p-8 text-center">
        <p>Calibrating your baseline...</p>
        <p>Relax for 30 seconds...</p>
      </div>
    );
  }

  return (
    <div className="game-container">
      <h1>My Awesome Brain Game</h1>
      <p>Control: {Math.round(norm01 * 100)}%</p>
      {/* Your game logic here */}
    </div>
  );
}
```

### Step 3: Register Your Game

Edit `src/games/games.config.js`:

```javascript
import { MyGame } from './my-game/MyGame';

export const games = [
  // ... existing games ...
  {
    id: 'my-game',                    // Unique ID (kebab-case)
    name: 'MY AWESOME GAME',          // Display name (UPPERCASE for retro style)
    description: 'Short description', // 1-2 sentences
    component: MyGame,                // Your component
  },
];
```

### Step 4: Test Your Game

1. **With Mock Data:**
   - Start the app (`npm run dev`)
   - Connect using "Mock Mode"
   - Test all game features

2. **With Real Device (if available):**
   - Connect your Muse headband
   - Test real-time responsiveness
   - Check that baseline calibration works

### Step 5: Document Your Game

Add a `README.md` in your game folder explaining:
- How the game works
- Which biomarkers it uses
- Controls and objectives
- Any special features

Example: `src/games/my-game/README.md`

```markdown
# My Awesome Game

A brain-controlled [type of game] where you [objective].

## How It Works

- **Control:** Frontal midline theta (cognitive control)
- **Objective:** [What you're trying to do]
- **Scoring:** [How scoring works]

## Biomarkers Used

- `frontal-midline-theta`: Controls [aspect of game]

## Tips for Players

- Stay relaxed during baseline calibration
- [Other helpful tips]
```

### What NOT to Do

❌ **Don't modify core files:**
- Don't edit `App.jsx`
- Don't modify context files
- Don't change routing logic

❌ **Don't violate data policy:**
- Don't save neural data
- Don't transmit data to servers
- Don't use external analytics that capture biomarker values

❌ **Don't add large dependencies:**
- Keep bundle size reasonable
- Avoid heavy game engines unless necessary
- Prefer lightweight libraries

---

## Core Contributions

Core contributions require more planning and discussion. **Open an issue first** to discuss your idea before writing code.

### Adding a Biomarker

New biomarkers go in `src/contexts/BiomarkerContext.jsx`.

**Process:**

1. **Open an issue** proposing the biomarker
   - What it measures (cognitive state)
   - How it's calculated (formula/algorithm)
   - References (research papers, if available)
   - Use cases (what games could use it)

2. **Wait for discussion & approval**

3. **Implement the biomarker:**

```javascript
// In BiomarkerContext.jsx, add to biomarkerDefinitions:

'my-new-marker': {
  compute: (bandPowers) => {
    // Your calculation here
    // bandPowers = { alpha: [4], beta: [4], theta: [4], delta: [4], gamma: [4] }
    const value = /* your formula */;
    return value;
  },
  label: 'My New Marker',
  description: 'What this biomarker represents',
},
```

4. **Document the biomarker** in README and code comments

5. **Test thoroughly:**
   - Verify calculations
   - Test with mock data
   - Test with real device
   - Check normalization works correctly

6. **Submit PR with:**
   - Implementation
   - Documentation
   - Example game (optional but recommended)

### Core Infrastructure

Changes to core processing (contexts, pipelines, optimization) require:

1. **Issue discussion first** — Explain why the change is needed
2. **Architecture review** — Ensure it fits the modular design
3. **Performance testing** — Measure impact on processing speed
4. **Backward compatibility** — Don't break existing games

**Examples of core contributions:**
- Artifact rejection algorithms
- Improved baseline normalization
- Performance optimizations
- New processing contexts
- Signal quality improvements

---

## Code Standards

### General Guidelines

- **ES6+ JavaScript** with modern React patterns
- **Functional components** with hooks (no class components)
- **Clear variable names** that explain purpose
- **Comments for complex logic** (especially DSP algorithms)

### File Organization

```
src/games/my-game/
  ├── MyGame.jsx          # Main component
  ├── README.md           # Game documentation
  ├── components/         # Game-specific components (optional)
  │   ├── Player.jsx
  │   └── Obstacles.jsx
  └── utils.js            # Game-specific utilities (optional)
```

### Naming Conventions

- **Components:** PascalCase (`MyGame.jsx`)
- **Hooks:** camelCase starting with `use` (`useBiomarker`)
- **Files:** PascalCase for components, camelCase for utilities
- **Game IDs:** kebab-case (`my-awesome-game`)
- **Game names:** UPPERCASE for retro style (`MY AWESOME GAME`)

### Styling

- Use **Tailwind CSS** utility classes
- Use **retro.css** classes for 8-bit aesthetic
- Avoid inline styles unless necessary
- Keep consistent with arcade theme

Example:
```jsx
<div className="arcade-cabinet pixel-border">
  <h1 className="text-nes-green font-pixel">MY GAME</h1>
  <button className="retro-button">START</button>
</div>
```

### Comments

```javascript
// Good: Explain WHY, not WHAT
const threshold = 0.6; // Higher threshold reduces false positives

// Bad: Obvious comment
const threshold = 0.6; // Set threshold to 0.6
```

For DSP code, **explain the algorithm**:
```javascript
// Apply Welch's method for PSD estimation
// 2-second windows with 1-second overlap (50%)
// Reduces variance while maintaining frequency resolution
const psd = welchPSD(signal, sampleRate, windowSize, overlap);
```

---

## Pull Request Process

### Before Submitting

- [ ] Test with **mock data**
- [ ] Test with **real device** (if available)
- [ ] Check **no data collection violations**
- [ ] Run `npm run lint` (fix any errors)
- [ ] Update documentation if needed
- [ ] Add game README (for game contributions)

### PR Title Format

Use conventional commit style:

```
Add: new brain pong game
Fix: baseline calibration timing issue
Improve: alpha asymmetry calculation
Docs: update biomarker examples
Refactor: optimize PSD computation
```

### PR Description Template

```markdown
## What does this PR do?

Brief description of changes.

## Type of Contribution

- [ ] New game
- [ ] Biomarker/processing improvement
- [ ] Core infrastructure
- [ ] Bug fix
- [ ] Documentation

## Testing

- [ ] Tested with mock data
- [ ] Tested with real Muse device
- [ ] No data collection violations

## Screenshots/Demo

(Optional: Add screenshots or GIFs of your game)

## Additional Notes

Any special considerations or dependencies.
```

### Review Process

1. **Automated checks** run (linting, build)
2. **Maintainer review** for:
   - Code quality
   - Data policy compliance
   - Architecture fit
   - Documentation completeness
3. **Feedback & iteration** if needed
4. **Merge** when approved

We aim to review PRs within **1 week**.

---

## Testing Guidelines

### Manual Testing

**For Games:**
1. Test with mock data first
2. Test all game mechanics
3. Test baseline calibration flow
4. Test connection/disconnection handling
5. Test with real device (if available)

**For Core Contributions:**
1. Test with multiple biomarkers
2. Test edge cases (no signal, poor quality)
3. Measure performance impact
4. Test backward compatibility

### Mock Mode Testing

Always test with mock data:

```javascript
// In your browser console or component
const { connectMuse } = useEEG();

// Enable mock mode
await connectMuse({ mock: true });

// Mock data loops every ~60 seconds
// Perfect for rapid testing
```

### Console Testing

```javascript
// Check biomarker values in console
const { value, norm01 } = useBiomarker('frontal-midline-theta');
console.log('FMT value:', value, 'Normalized:', norm01);

// Check band powers
const { bandPowers } = useProcessing();
console.log('Alpha:', bandPowers.alpha);
```

**Note:** Console logging is fine for development, but remove or guard it for production.

---

## Questions?

- **General questions:** Open a [GitHub Discussion](https://github.com/yourusername/brain-arcade/discussions)
- **Bug reports:** Open a [GitHub Issue](https://github.com/yourusername/brain-arcade/issues)
- **Feature proposals:** Open an issue with the "enhancement" label

---

## Thank You!

Every contribution helps make neurotechnology more accessible. Whether you're adding a simple game or proposing a new biomarker, you're helping prove that **brain-computer interfaces are ready for builders today**.

Let's build the future of human-computer interaction together.

**Welcome to the arcade. 🧠🕹️**
