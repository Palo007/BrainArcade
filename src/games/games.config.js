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
 *   category: string     - Menu section id (see `categories` below)
 *   thumb?: string       - Imported image for the menu card background
 *   sprite?: string      - Imported image drawn on top of the card background
 *   badge?: string       - Short label on the card (e.g. required hardware)
 *   kind?: "game" | "page" - Default "game". "page" opens in one click (no launch modal,
 *                           countdown, baseline or device/quality guards); for non-game pages
 *                           that only read local data.
 *   signal?: "fnirs"     - Game runs on the fNIRS optics, not EEG. Weak EEG electrode contact must
 *                           not pause it: Layout hides the EEG quality pause overlay for it and the
 *                           game pauses itself on fNIRS problems only.
 * }
 */

import { ExampleGame } from "./example-game/ExampleGame";
import { SweetSpot } from "./sweet-spot/SweetSpot.jsx";
import { BrainCommandCenter } from "./joystick-visualizer/JoystickVisualizer.jsx";
import { Sailor } from "./sailor/Sailor.jsx";
import { BlinkingContest } from "./blinking-contest/BlinkingContest.jsx";
import { Diver } from "./diver/Diver.jsx";
import { TrainOfThoughts } from "./train-of-thoughts/TrainOfThoughts.jsx";
import { GlowOrb } from "./glow-orb/GlowOrb.jsx";
import { FocusBall } from "./focus-ball/FocusBall.jsx";
import { TrainingJournal } from "./training-journal/TrainingJournal.jsx";

// Menu card art: `thumb` = background image, `sprite` = optional character drawn on top
import commandCenterThumb from "./joystick-visualizer/assets/brain_command_center.png";
import glowOrbThumb from "./glow-orb/assets/thumb.svg";
import focusBallThumb from "./focus-ball/assets/thumb.svg";
import journalThumb from "./training-journal/assets/thumb.svg";
import sweetSpotSprite from "./sweet-spot/assets/chill.png";
import sailorThumb from "./sailor/assets/scene.jpg";
import blinkThumb from "./blinking-contest/assets/thumb.svg";
import diverThumb from "./diver/assets/background-sea.jpg";
import diverSprite from "./diver/assets/diver-happy.png";
import trainThumb from "./train-of-thoughts/assets/city-background.jpg";
import trainSprite from "./train-of-thoughts/assets/train1.png";
import visualizerThumb from "./example-game/assets/thumb.svg";

// Menu sections, in display order
export const categories = [
  { id: "fnirs", name: "fNIRS TRAINING", color: "var(--nes-yellow)" },
  { id: "calm", name: "CALM & FOCUS", color: "var(--nes-blue)" },
  { id: "challenge", name: "CHALLENGES", color: "var(--nes-red)" },
  { id: "tools", name: "BRAIN TOOLS", color: "var(--nes-green)" },
];

export const games = [
  {
    id: "brain-command-center",
    name: "BRAIN COMMAND CENTER",
    description: "Monitor all of your cognitive traits in real time",
    component: BrainCommandCenter,
    category: "tools",
    thumb: commandCenterThumb,
  },
  {
    id: "glow-orb",
    signal: "fnirs",
    name: "GLOW ORB",
    description: "Think hard to make the orb fly! Uses the fNIRS light sensors of the Muse S Athena.",
    component: GlowOrb,
    category: "fnirs",
    thumb: glowOrbThumb,
    badge: "ATHENA",
  },
  {
    id: "focus-ball",
    signal: "fnirs",
    name: "FOCUS BALL",
    description: "Keep the ball above the line with steady focus. Mendi-style training with a session report. Needs Muse S Athena (fNIRS).",
    component: FocusBall,
    category: "fnirs",
    thumb: focusBallThumb,
    badge: "ATHENA",
  },
  {
    id: "training-journal",
    name: "TRAINING JOURNAL",
    description: "Your Focus Ball history: score over time, day streak and check-ins.",
    component: TrainingJournal,
    category: "fnirs",
    thumb: journalThumb,
    badge: "JOURNAL",
    kind: "page",
  },
  {
    id: "sweet-spot",
    name: "SWEET SPOT",
    description: "Keep calm to keep your brain on a cloud. Your brain is chilling on a cloud and will fall if you aren't relaxed.",
    component: SweetSpot,
    category: "calm",
    sprite: sweetSpotSprite,
  },
  {
    id: "sailor",
    name: "SEA OF THOUGHTS",
    description: "Navigate the ocean of your mind and recollect your lost train of thought by staying engaged",
    component: Sailor,
    category: "calm",
    thumb: sailorThumb,
  },
  {
    id: "blinking-contest",
    name: "BLINKING CONTEST",
    description: "Keep your eyes open! You have 3 blinks before losing. Try to last as long as possible.",
    component: BlinkingContest,
    category: "challenge",
    thumb: blinkThumb,
  },
  {
    id: "diver",
    name: "BAD DIVER",
    description: "Frustration fuels your catch! The more frustrated you get, the better the fish hunt goes.",
    component: Diver,
    category: "challenge",
    thumb: diverThumb,
    sprite: diverSprite,
  },
  {
    id: "train-of-thoughts",
    name: "TRAIN OF THOUGHTS",
    description: "Stay calm to slow down the train. Don't get swept away by your racing thoughts!",
    component: TrainOfThoughts,
    category: "calm",
    thumb: trainThumb,
    sprite: trainSprite,
  },
  {
    id: "example-game",
    name: "BRAINWAVE VISUALIZER",
    description: "See your brainwaves in real-time with EEG visualization",
    component: ExampleGame,
    category: "tools",
    thumb: visualizerThumb,
  },
  // Add more games here!
  // {
  //   id: 'my-awesome-game',
  //   name: 'MY AWESOME GAME',
  //   description: 'Description of what your game does',
  //   component: MyAwesomeGame,
  // },
];
/* SPDX-License-Identifier: CC-BY-SA-4.0
   Copyright (c) 2025 Itay Inbar and contributors
*/

// True for routes of `kind: "page"` entries (e.g. /game/training-journal): no device/baseline/quality gating.
export const isPageRoute = (pathname = "") => {
  const id = pathname.startsWith("/game/") ? pathname.slice(6).split("/")[0] : null;
  return !!id && games.some((g) => g.id === id && g.kind === "page");
};

const gameForPath = (pathname = "") => {
  const id = pathname.startsWith("/game/") ? pathname.slice(6).split("/")[0] : null;
  return id ? games.find((g) => g.id === id) || null : null;
};

// True for games that run on fNIRS (`signal: "fnirs"`): EEG-quality pauses/modals are suppressed there.
export const isFnirsRoute = (pathname = "") => gameForPath(pathname)?.signal === "fnirs";
