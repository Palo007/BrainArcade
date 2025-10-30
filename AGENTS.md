# Repository Guidelines

## Project Structure & Module Organization
- `src/components/` UI (e.g., `Layout.jsx`, `MuseConnector.jsx`).
- `src/contexts/` EEG state (`MuseContext.jsx`, `useEEG`).
- `src/games/` one folder per game; register in `src/games/games.config.js`.
  - Example: `src/games/my-game/MyGame.jsx` (folder id = `my-game`).
- `src/styles/` shared CSS (retro theme), `assets/` images, `public/` static.
- Root: `index.html`, `vite.config.js`, `eslint.config.js`, `web-muse/` local dependency.

## Build, Test, and Development Commands
- `npm run dev` — start Vite dev server at `http://localhost:5173`.
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built app locally.
- `npm run lint` — run ESLint. Use `npm run lint -- --fix` to autofix.

## Coding Style & Naming Conventions
- Language: React + JSX (ES modules). Prefer functional components and hooks.
- Indentation: 2 spaces; line-based imports; avoid default exports for components.
- Naming: Components `PascalCase` (e.g., `MyGame.jsx`), variables `camelCase`, constants `UPPER_SNAKE`.
- Games: folder and `id` use `kebab-case` (e.g., `my-game`). Register in `games.config.js`.
- Linting: ESLint with React Hooks rules; unused vars error (uppercase ignored for globals).

## Testing Guidelines
- No test framework is configured yet. For logic-heavy games, add Vitest + React Testing Library.
- Suggested layout: `src/games/<id>/__tests__/<Component>.test.jsx`.
- Keep tests fast and deterministic; no Bluetooth device dependency (mock EEG via context).

## Commit & Pull Request Guidelines
- Commits: clear, imperative subject (≤72 chars). Example: `feat(game): add concentration demo`.
- PRs: include description, linked issues, testing steps, screenshots/GIF of gameplay, and browser notes (Web Bluetooth tested on Chrome/Edge).
- Keep diffs focused; update `README.md` when adding a new game or EEG APIs.

## Security & Configuration Tips
- Web Bluetooth works on HTTPS or `localhost`; prefer Chrome-based browsers.
- Do not commit `dist/` or `node_modules/`. Environment vars must be prefixed `VITE_` and accessed via `import.meta.env`.
- Avoid storing PII; do not persist raw EEG beyond runtime state.

