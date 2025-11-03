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

We welcome contributions at **four levels**:

### 1. Joystick-Only Games (No Neuroscience)

**What you contribute:** New minigames using pre-built cognitive joysticks (0–100%).

**What you need to know:**

- React & JavaScript
- How to use `useJoystick(axis, options)`
- Basic game logic

**Examples:**

- Add a new minigame (Pong, Snake, Tetris, etc.)
- Improve existing games
- Create tutorials or game templates

👉 **Start here:** [Adding a New Game](#adding-a-new-game)

---

### 2. Biomarker Users/Builders (Basic Neuroscience)

**What you contribute:** New biomarkers, tweaks to existing ones, or games that directly use biomarkers.

**What you need to know:**

- EEG basics and cognitive markers
- Band powers and ratios
- JavaScript/React for implementation

**Examples:**

- Propose a new biomarker (e.g., `theta-beta-ratio` variant)
- Improve existing biomarker calculations
- Add validation notes/references

👉 **Start here:** [Core Contributions - Biomarkers](#adding-a-biomarker)

---

### 3. Preprocessed EEG Users

**What you contribute:** Tools or games that consume preprocessed EEG outputs (e.g., band powers) via `ProcessingContext`.

**What you need to know:**

- Band power interpretation (alpha/beta/theta/delta/gamma)
- React hooks for accessing processing outputs

**Examples:**

- Visualizations of band powers or PSD
- Experimental game mechanics based on specific bands

---

### 4. Raw EEG & Pipelines (Advanced)

**What you contribute:** Core processing infrastructure or custom pipelines built from raw EEG.

**What you need to know:**

- DSP (filters, PSD, feature extraction)
- React context architecture and performance
- Web Bluetooth API (optional)

**Examples:**

- New processing contexts or feature extractors
- Artifact rejection pipelines
- Baseline and normalization improvements

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
import { useJoystick } from "../../contexts/JoystickContext.jsx";

export function MyGame() {
  // Use joystick axes like 'engagement', 'focus', or 'relaxation'
  const { value01 } = useJoystick('engagement', { range: 0.4, autoAdjustBaseline: true });

  return (
    <div className="game-container">
      <h1>MY AWESOME BRAIN GAME</h1>
      <p>ENGAGEMENT: {Math.round(value01 * 100)}%</p>
      {/* Your game logic here */}
    </div>
  );
}
```

Tip: The app includes a built-in calibration flow. If your game must force calibration, call `useBaseline().ensureBaseline({ seconds: 30 })` at start.

### Step 3: Register Your Game

Edit `src/games/games.config.js`:

```javascript
import { MyGame } from "./my-game/MyGame";

export const games = [
  // ... existing games ...
  {
    id: "my-game", // Unique ID (kebab-case)
    name: "MY AWESOME GAME", // Display name (UPPERCASE for retro style)
    description: "Short description", // 1-2 sentences
    component: MyGame, // Your component
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
- Which joystick axis it uses (and optional biomarker if relevant)
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

## Controls

- Joystick axis: `engagement` (0–100%)
  - Underlying biomarker: `engagement-index` (beta/(alpha+theta))

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
// Level 1: Joystick value (0..1)
const { value01 } = useJoystick('engagement', { range: 0.4 });
console.log('Engagement (0-100):', Math.round(value01 * 100));

// Level 2: Biomarker value and normalized helper
const { value, norm01 } = useBiomarker('frontal-midline-theta');
console.log('FMT value:', value, 'Normalized:', norm01);

// Level 3: Band powers
const { bandPowers } = useProcessing();
console.log('Alpha (AF7):', bandPowers?.[1]?.alpha);
```

**Note:** Console logging is fine for development, but remove or guard it for production.

---

## Thank You!

Every contribution helps make neurotechnology more accessible. Whether you're adding a simple game or proposing a new biomarker, you're helping prove that **brain-computer interfaces are ready for builders today**.

Let's build the future of human-computer interaction together.

**Welcome to the arcade. 🧠🕹️**
