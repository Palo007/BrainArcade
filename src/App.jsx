import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MuseProvider } from './contexts/MuseContext';
import { ProcessingProvider } from './contexts/ProcessingContext.jsx';
import { BaselineProvider } from './contexts/BaselineContext.jsx';
import { BiomarkerProvider } from './contexts/BiomarkerContext.jsx';
import { JoystickProvider } from './contexts/JoystickContext.jsx';
import { Layout } from './components/Layout';
import { StartScreen } from './components/StartScreen';
import { NavBar } from './components/NavBar';
import { Credits } from './components/Credits';
import { games } from './games/games.config';
import './styles/retro.css';
import { BaselineModal } from './components/BaselineModal.jsx';

/**
 * GamesPage - Main games listing and selection page
 */
function GamesPage() {
  return (
    <div>
      <NavBar />
    </div>
  );
}

/**
 * GamePage - Individual game page wrapper
 */
function GamePage({ gameId }) {
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
        <GameComponent />
      </div>
    </div>
  );
}

/**
 * App - Main application component with routing
 */
function App() {
  return (
    <MuseProvider>
      <ProcessingProvider>
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

            {/* Individual Game Routes */}
            <Route
              path="/game/:gameId"
              element={
                <RouteWrapper>
                  {({ gameId }) => <GamePage gameId={gameId} />}
                </RouteWrapper>
              }
            />

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                {/* Global baseline modal */}
                <BaselineModal />
                </Layout>
              </Router>
            </JoystickProvider>
          </BiomarkerProvider>
        </BaselineProvider>
      </ProcessingProvider>
    </MuseProvider>
  );
}

/**
 * RouteWrapper - Helper to extract route params
 */
function RouteWrapper({ children }) {
  const params = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/');
  const gameId = pathParts[pathParts.length - 1];

  return children({ gameId, params });
}

export default App;
