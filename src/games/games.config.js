/**
 * GAMES REGISTRY
 *
 * This is the central configuration file for all minigames.
 *
 * HOW TO ADD A NEW GAME:
 * 1. Create a new folder in /src/games/ with your game name (e.g., /src/games/my-game/)
 * 2. Create your game component (e.g., MyGame.jsx)
 * 3. Import your game component here
 * 4. Add your game to the games array below
 *
 * Game Configuration Object:
 * {
 *   id: string           - Unique identifier (use kebab-case)
 *   name: string         - Display name
 *   description: string  - Short description (1-2 sentences)
 *   icon: string         - Emoji or text icon
 *   component: Component - Your game's React component
 * }
 */

import { ExampleGame } from "./example-game/ExampleGame";
import { SweetSpot } from "./sweet-spot/SweetSpot.jsx";

export const games = [
  {
    id: "example-game",
    name: "BRAINWAVE VISUALIZER",
    description: "See your brainwaves in real-time with EEG visualization",
    icon: "🧠",
    component: ExampleGame,
  },
  {
    id: "sweet-spot",
    name: "SWEET SPOT",
    description: "Float the character by staying relaxed",
    icon: "🟡",
    component: SweetSpot,
  },
  // Add more games here!
  // {
  //   id: 'my-awesome-game',
  //   name: 'MY AWESOME GAME',
  //   description: 'Description of what your game does',
  //   icon: '🎮',
  //   component: MyAwesomeGame,
  // },
];
