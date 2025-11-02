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
 *   component: Component - Your game's React component
 * }
 */

import { ExampleGame } from "./example-game/ExampleGame";
import { SweetSpot } from "./sweet-spot/SweetSpot.jsx";
import { BrainCommandCenter } from "./joystick-visualizer/JoystickVisualizer.jsx";
import { Sailor } from "./sailor/Sailor.jsx";

export const games = [
  {
    id: "brain-command-center",
    name: "BRAIN COMMAND CENTER",
    description: "Monitor all of your cognitive traits in real time",
    component: BrainCommandCenter,
  },
  {
    id: "example-game",
    name: "BRAINWAVE VISUALIZER",
    description: "See your brainwaves in real-time with EEG visualization",
    component: ExampleGame,
  },
  {
    id: "sweet-spot",
    name: "SWEET SPOT",
    description: "Keep calm to keep your brain on a cloud. Your brain is chilling on a cloud and will fall if you aren't relaxed.",
    component: SweetSpot,
  },
  {
    id: "sailor",
    name: "SEA OF THOUGHTS",
    description: "Navigate the ocean of your mind and recollect your lost train of thought by staying engaged",
    component: Sailor,
  },
  // Add more games here!
  // {
  //   id: 'my-awesome-game',
  //   name: 'MY AWESOME GAME',
  //   description: 'Description of what your game does',
  //   component: MyAwesomeGame,
  // },
];
