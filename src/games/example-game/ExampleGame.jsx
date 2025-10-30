import { useState, useEffect } from 'react';
import { useEEG } from '../../contexts/MuseContext';
import '../../styles/retro.css';

/**
 * ExampleGame - Demo game showing how to access Muse EEG data
 * This serves as a template for developers creating new games
 */
export function ExampleGame() {
  const { rawEEG, isConnected } = useEEG();
  const [eegHistory, setEegHistory] = useState([]);
  const [maxValue, setMaxValue] = useState(100);

  // Channel names for the 4 EEG electrodes
  const channels = ['TP9', 'AF7', 'AF8', 'TP10'];

  // Update EEG history whenever new data arrives
  useEffect(() => {
    if (rawEEG && rawEEG.length > 0) {
      setEegHistory((prev) => {
        const newHistory = [...prev, rawEEG];
        // Keep last 50 samples for visualization
        return newHistory.slice(-50);
      });

      // Update max value for scaling
      const currentMax = Math.max(...rawEEG.map(Math.abs));
      setMaxValue((prev) => Math.max(prev, currentMax));
    }
  }, [rawEEG]);

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-[var(--nes-red)] mb-2">MUSE NOT CONNECTED</p>
        <p className="text-xs text-gray-400">Please return to home and connect your device</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Game Title */}
      <div className="text-center mb-6">
        <h2 className="text-2xl text-[var(--nes-blue)] mb-2">BRAINWAVE DEMO</h2>
        <p className="text-xs text-gray-400">
          Real-time EEG visualization from your Muse device
        </p>
      </div>

      {/* Current EEG Values */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {rawEEG && rawEEG.map((value, idx) => (
          <div
            key={idx}
            className="border-4 border-[var(--nes-purple)] p-4 bg-[var(--nes-dark)]"
          >
            <div className="text-[10px] text-[var(--nes-purple)] mb-2">
              {channels[idx]}
            </div>
            <div className="text-2xl font-mono">
              {value ? value.toFixed(2) : '---'}
            </div>
            <div className="text-[8px] text-gray-500 mt-1">μV</div>
          </div>
        ))}
      </div>

      {/* EEG Waveform Visualization */}
      <div className="border-4 border-[var(--nes-blue)] p-4 bg-black">
        <div className="text-xs text-[var(--nes-blue)] mb-2">WAVEFORM</div>
        <div className="space-y-4">
          {channels.map((channel, channelIdx) => (
            <div key={channel} className="relative h-12">
              {/* Channel Label */}
              <div className="absolute left-0 top-0 text-[8px] text-gray-500">
                {channel}
              </div>

              {/* Waveform */}
              <svg className="w-full h-full" viewBox="0 0 400 48">
                {/* Center line */}
                <line
                  x1="0"
                  y1="24"
                  x2="400"
                  y2="24"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />

                {/* EEG Signal */}
                {eegHistory.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={
                      channelIdx === 0 ? 'var(--nes-red)' :
                      channelIdx === 1 ? 'var(--nes-yellow)' :
                      channelIdx === 2 ? 'var(--nes-blue)' :
                      'var(--nes-green)'
                    }
                    strokeWidth="2"
                    points={eegHistory
                      .map((sample, idx) => {
                        const x = (idx / eegHistory.length) * 400;
                        const value = sample[channelIdx] || 0;
                        const y = 24 - (value / maxValue) * 20; // Scale to fit
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                )}
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="border-4 border-[var(--nes-green)] p-4 bg-[var(--nes-dark)]">
        <div className="text-xs text-[var(--nes-green)] mb-2">💡 HOW TO USE THIS DATA</div>
        <ul className="text-[10px] text-gray-300 space-y-2 leading-relaxed">
          <li>• Access raw EEG data using the <code className="text-[var(--nes-yellow)]">useEEG()</code> hook</li>
          <li>• <code className="text-[var(--nes-yellow)]">rawEEG</code> returns array of 4 channel values</li>
          <li>• Data updates at ~256Hz (samples per second)</li>
          <li>• Use this data to control your game mechanics!</li>
        </ul>
      </div>

      {/* Code Example */}
      <div className="border-4 border-[var(--nes-yellow)] p-4 bg-black">
        <div className="text-xs text-[var(--nes-yellow)] mb-2">📝 CODE EXAMPLE</div>
        <pre className="text-[10px] text-green-400 overflow-x-auto leading-relaxed">
{`import { useEEG } from '../../contexts/MuseContext';

export function MyGame() {
  const { rawEEG, isConnected } = useEEG();

  // Use rawEEG[0-3] for game logic
  const brainActivity = rawEEG[0];

  return <div>Your game here</div>;
}`}
        </pre>
      </div>
    </div>
  );
}
