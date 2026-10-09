import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { MuseProvider } from './contexts/MuseContext';
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
import { MobileBlock } from './components/MobileBlock.jsx';
import { GameTimelineCollector } from './components/GameTimelineCollector.jsx';

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
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024; // desktop threshold
  });

  useEffect(() => {
    const onResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // `?mobile=1` lets phones in (Athena pairing works on Android Chrome); remembered per browser
  // Installed app / Android TWA (Bubblewrap) is let in automatically
  const isInstalledApp = (() => {
    try {
      return (
        document.referrer.startsWith('android-app://') ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches
      );
    } catch {
      return false;
    }
  })();
  const allowMobile = isInstalledApp || (() => {
    try {
      if (new URLSearchParams(window.location.search).get('mobile') === '1') {
        localStorage.setItem('allowMobile', '1');
      }
      return localStorage.getItem('allowMobile') === '1';
    } catch {
      return new URLSearchParams(window.location.search).get('mobile') === '1';
    }
  })();

  if (!isDesktop && !allowMobile) {
    return <MobileBlock />;
  }

  return (
    <MuseProvider>
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
    </MuseProvider>
  );
}

export default App;
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
