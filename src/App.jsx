import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { MuseProvider } from './contexts/MuseContext';
import { ProcessingProvider } from './contexts/ProcessingContext.jsx';
import { QualityProvider } from './contexts/QualityContext.jsx';
import { BaselineProvider } from './contexts/BaselineContext.jsx';
import { BiomarkerProvider } from './contexts/BiomarkerContext.jsx';
import { JoystickProvider } from './contexts/JoystickContext.jsx';
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

  if (!isDesktop) {
    return <MobileBlock />;
  }

  return (
    <MuseProvider>
      <ProcessingProvider>
        <QualityProvider>
        <BaselineProvider>
          <BiomarkerProvider>
            <JoystickProvider>
              <Router>
                <Layout>
                  <Routes>
            {/* Home / Start Screen */}
            <Route path="/" element={<StartScreen />} />

            {/* Games List */}
            <Route path="/games" element={<GamesPage />} />

            {/* Credits */}
            <Route path="/credits" element={<Credits />} />

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
                </Layout>
              </Router>
            </JoystickProvider>
          </BiomarkerProvider>
        </BaselineProvider>
        </QualityProvider>
      </ProcessingProvider>
    </MuseProvider>
  );
}

export default App;
