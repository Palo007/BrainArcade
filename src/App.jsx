import React, { Suspense, lazy, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ProfileProvider } from './contexts/ProfileContext.jsx';
import { PlaySetupProvider } from './contexts/PlaySetupContext.jsx';
import { MuseProvider } from './contexts/MuseContext';
import { MotionProvider } from './contexts/MotionContext.jsx';
import { ProcessingProvider } from './contexts/ProcessingContext.jsx';
import { QualityProvider } from './contexts/QualityContext.jsx';
import { BaselineProvider } from './contexts/BaselineContext.jsx';
import { BiomarkerProvider } from './contexts/BiomarkerContext.jsx';
import { JoystickProvider } from './contexts/JoystickContext.jsx';
import { BlinkProvider } from './contexts/BlinkContext.jsx';
import { RecordingProvider } from './contexts/RecordingContext.jsx';
import { RecordingControl } from './components/RecordingControl.jsx';
import { Layout } from './components/Layout';
import { StartScreen } from './components/StartScreen';
import { NavBar } from './components/NavBar';
import { GameLaunchModal } from './components/GameLaunchModal.jsx';
import { Credits } from './components/Credits';
import { Privacy } from './components/Privacy';
import { games } from './games/games.config';
import './styles/retro.css';
import { BaselineModal } from './components/BaselineModal.jsx';
import { LostBrainModal } from './components/LostBrainModal.jsx';
import { GameTimelineCollector } from './components/GameTimelineCollector.jsx';

// Recording viewer (Mind Monitor CSV) - loaded on demand, it is not needed for playing
const ViewerPage = lazy(() => import('./viewer/ViewerPage.jsx'));

/**
 * GamesPage - Main games listing and selection page
 */
function GamesPage() {
  const [selectedGame, setSelectedGame] = useState(null);
  return (
    <div>
      <NavBar onActiveGameClick={(game) => setSelectedGame(game)} />
      {selectedGame && (
        <GameLaunchModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  );
}

/**
 * GamePage - Individual game page wrapper
 */
function GamePage() {
  const { gameId } = useParams();
  const game = games.find((g) => g.id === gameId);

  if (!game) {
    return (
      <div>
        <NavBar />
        <div className="text-center py-12">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-[var(--nes-red)] mb-2">GAME NOT FOUND</p>
          <p className="text-xs text-gray-400">The requested game does not exist</p>
        </div>
      </div>
    );
  }

  const GameComponent = game.component;

  return (
    <div>
      <div className="mt-0">
        {/* Key by game id to force remount on game change */}
        <GameComponent key={game.id} />
        <GameTimelineCollector key={`tl-${game.id}`} />
      </div>
    </div>
  );
}

/**
 * App - Main application component with routing
 */
function App() {
  return (
    <ProfileProvider>
    <PlaySetupProvider>
    <MuseProvider>
    <MotionProvider>
      <ProcessingProvider>
        <QualityProvider>
        <BaselineProvider>
          <BiomarkerProvider>
            <JoystickProvider>
              <BlinkProvider>
                <RecordingProvider>
                <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
                  <Layout>
                    <Routes>
              {/* Home / Start Screen */}
              <Route path="/" element={<StartScreen />} />

              {/* Games List */}
              <Route path="/games" element={<GamesPage />} />

              {/* About */}
              <Route path="/about" element={<Credits />} />

              {/* Privacy Policy */}
              <Route path="/privacy" element={<Privacy />} />

              {/* Recording viewer (Mind Monitor CSV) */}
              <Route
                path="/viewer"
                element={<Suspense fallback={<p className="text-xs text-gray-400">LOADING VIEWER…</p>}><ViewerPage /></Suspense>}
              />

              {/* Individual Game Routes */}
              <Route path="/game/:gameId" element={<GamePage />} />

              {/* Catch all - redirect to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  {/* Global baseline modal */}
                  <BaselineModal />
                  {/* Global lost-brain modal */}
                  <LostBrainModal />
                  {/* Opt-in session recording (Mind Monitor CSV) */}
                  <RecordingControl />
                  </Layout>
                </Router>
                </RecordingProvider>
              </BlinkProvider>
            </JoystickProvider>
          </BiomarkerProvider>
        </BaselineProvider>
        </QualityProvider>
      </ProcessingProvider>
    </MotionProvider>
    </MuseProvider>
    </PlaySetupProvider>
    </ProfileProvider>
  );
}

export default App;
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
