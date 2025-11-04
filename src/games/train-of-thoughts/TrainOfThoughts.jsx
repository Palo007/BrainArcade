import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { PixelHearts } from '../../components/PixelHearts.jsx';
import { RetroModal } from '../../components/RetroModal.jsx';
import { GameOverScreen } from '../../components/GameOverScreen.jsx';
import { GameHint } from '../../components/GameHint.jsx';
import '../../styles/retro.css';

import train1 from './assets/train1.png';
import train2 from './assets/train2.png';
import train3 from './assets/train3.png';
import villainTrain from './assets/villain.png';
import cityBackground from './assets/city-background.png';

export function TrainOfThoughts() {
  const { ensureBaseline, isBaselineReady } = useBaseline();

  // Joystick: stress (0..1), normalized vs baseline with adaptive centering
  const { value01: stress01 } = useJoystick('stress', {
    range: 0.4,
    baselineCenter: 1.0,
    autoAdjustBaseline: true,
  });

  // Lives & score
  const MAX_LIVES = 3;
  const [lives, setLives] = useState(MAX_LIVES);
  const [scoreMs, setScoreMs] = useState(0); // cumulative across rounds

  // Train state
  const [trainX, setTrainX] = useState(-600); // px from left (off-screen start)
  const [roundRunning, setRoundRunning] = useState(true);
  const [showLostLife, setShowLostLife] = useState(false);

  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const charRef = useRef(null);
  const trainRef = useRef(null);

  // Character sprite based on stress level
  const characterImg = useMemo(() => {
    if (stress01 < 0.33) return train1;
    if (stress01 < 0.66) return train2;
    return train3;
  }, [stress01]);

  // Require baseline before playing
  useEffect(() => {
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

  // Game loop: update train position and time-based score
  useEffect(() => {
    // Pause when modal is open or after game over
    if (!roundRunning || showLostLife || lives <= 0) return;

    // Width is measured for collision separately; keep logic focused here
    const BASE_SPEED = 40; // px/s minimal speed when fully calm (slower)
    const EXTRA_SPEED = 140; // px/s gained as stress rises to 1 (slower)

    const step = (ts) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000; // seconds
      lastTsRef.current = ts;

      // More stress -> faster train
      const speed = BASE_SPEED + stress01 * EXTRA_SPEED; // px/s

      setTrainX((x) => x + speed * dt);
      setScoreMs((s) => s + dt * 1000);

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [roundRunning, showLostLife, stress01, lives]);

  // Detect collision (train reaches character on right)
  useEffect(() => {
    if (!roundRunning || showLostLife) return;
    const stage = document.getElementById('train-stage');
    if (!stage || !charRef.current) return;

    const stageRect = stage.getBoundingClientRect();
    const charRect = charRef.current.getBoundingClientRect();
    const CHARACTER_X = charRect.left - stageRect.left; // character left edge inside stage
    const trainWidth = trainRef.current?.getBoundingClientRect().width || 310;
    const TRAIN_NOSE_X = trainX + trainWidth; // use measured image width

    if (TRAIN_NOSE_X >= CHARACTER_X) {
      setRoundRunning(false);
      setShowLostLife(true);
      lastTsRef.current = null;
    }
  }, [trainX, roundRunning, showLostLife]);

  // Retry (next round) after life loss
  const handleNextRound = () => {
    setShowLostLife(false);
    setLives((l) => l - 1);
    setTrainX(-600);
    lastTsRef.current = null;
    // If still have lives, keep playing
    setRoundRunning(true);
  };

  // Full game over
  if (lives <= 0) {
    const handleRetry = () => {
      setLives(MAX_LIVES);
      setScoreMs(0);
      setTrainX(-600);
      lastTsRef.current = null;
      setRoundRunning(true);
    };
    return (
      <GameOverScreen
        finalScore={Math.round(scoreMs / 1000)}
        gameName="train-of-thoughts"
        joystickAxis="stress"
        joystickOptions={{ range: 0.4, baselineCenter: 1.0, autoAdjustBaseline: true }}
        onRetry={handleRetry}
      />
    );
  }

  const seconds = Math.round(scoreMs / 1000);
  const heartsHealthPct = Math.max(0, Math.min(100, (lives / MAX_LIVES) * 100));

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden" id="train-stage">
        {/* Background image */}
        <img
          src={cityBackground}
          alt="city background"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* Local styles for stage, sky, clouds and train */}
        <style>{`
          :root { --red: #e04f60; --yellow: #ffc928; }
          body.stage-bg-override { background-color: #cce6fd; animation: dayTime 40s linear infinite; }
          @keyframes dayTime { 0%{background-color:#cce6fd;} 50%{background-color:#252645;} 100%{background-color:#cce6fd;} }

          .stage { position: absolute; inset: 0; }
          .stage:after { content:''; position:absolute; left:0; right:0; bottom:0; border-top:3px solid #205c6b; border-bottom:3px dashed #205c6b; }
          .sky { position: absolute; inset: 0; }
          .cloud { margin: 5% 0 0 100%; position: relative; }
          .cloud, .cloud:before, .cloud:after { background:#fff; border-radius:50%; border:25px solid #fff; width:0.5%; overflow:visible; }
          .cloud:before, .cloud:after { position:absolute; content:''; }
          .cloud:before { top:-35px; right:-60px; border-width:30px; }
          .cloud:after { bottom:-25px; right:-95px; border-width:28px; }
          .sky .cloud:nth-child(1) { animation: wind 80s infinite linear; }
          .sky .cloud:nth-child(2) { animation: wind 150s infinite linear; }
          @keyframes wind { 0%{ right:0; } 100%{ right:110%; } }

          .train { position:absolute; bottom:10px; z-index:1; }
          .wagon, .cabin, .chimney { border-radius:4px 4px 0 0; border-top:4px solid var(--yellow); }
          .wagon, .motor { border-bottom:2px solid var(--yellow); }
          .wagon, .locomotive { display:inline-block; width:70px; height:55px; background-color: var(--red); position:relative; }

          .wagon:before, .wagon:after, .motor:before, .motor:after, .cabin:after {
            content:''; color:#fff; padding:6px; position:absolute; border-radius:46%; border:6px solid #333; bottom:-10px; background-color:#666; animation: spin 4s linear infinite;
          }
          .wagon:before { left:6px; }
          .wagon:after { right:6px; }
          .motor:before { left:32px; }
          .motor:after { right:4px; }
          .cabin:after { bottom:-50px; padding:8px; left:3px; }

          .locomotive { background-color:transparent; }
          .locomotive .cabin { width:58px; height:35px; background-color:var(--red); position:relative; z-index:1; border-radius:8px 8px 0 0; }
          .locomotive .cabin:before { content:''; width:25px; height:18px; position:absolute; top:10px; left:15px; border-radius:3px; border:3px solid pink; background-color:#f1f1f1; }
          .locomotive .motor { display:inline-block; width:85px; height:40px; background-color:var(--red); position:relative; border-radius:0 8px 0 0; }
          .locomotive .chimney { position:absolute; width:15px; height:15px; background-color:var(--red); right:-6px; bottom:10px; animation:puf 4s 2; }
          .locomotive .light { position:absolute; right:-10px; bottom:0; border-radius:50%; border:3px solid pink; }
          @keyframes puf { 0%{bottom:0} 25%{bottom:-1px} 100%{bottom:5px} }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>

        {/* Background day/night is handled by page bg; keep minimal tint */}
        {!isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              Waiting for baseline…
            </div>
          </div>
        )}

        {/* Title */}
        <div className="absolute top-6 left-6 w-[min(520px,60vw)]">
          <h2 className="text-2xl text-[var(--nes-yellow)]">TRAIN OF THOUGHTS</h2>
          <p className="text-xs text-gray-300 mt-2">Stay composed to delay the train. Time survived equals score.</p>
        </div>

        {/* Stage with clouds and track */}
        <section className="stage">
          <div className="sky">
            <div className="cloud"></div>
            <div className="cloud"></div>
          </div>

          {/* Villain train sprite */}
          <img
            ref={trainRef}
            src={villainTrain}
            alt="villain train"
            className="train"
            style={{ left: `${trainX}px`, bottom: '-2px', width: 'min(360px, 36vw)', imageRendering: 'pixelated' }}
            draggable={false}
          />
        </section>

        {/* Character at the right side, sitting by the track */}
        <div
          ref={charRef}
          className="flex flex-col items-center"
          style={{ position: 'absolute', bottom: '-19px', right: '280px', pointerEvents: 'none', zIndex: 2 }}
        >
          <img
            src={characterImg}
            alt="character"
            draggable={false}
            style={{ width: 'min(140px, 14vmin)', height: 'auto', imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }}
          />
          <div className="text-[8px] text-gray-400 mt-2" style={{ fontFamily: "'Press Start 2P', cursive" }}>YOU</div>
        </div>

        {/* HUD */}
        <div className="absolute bottom-4 right-4 flex gap-6 text-white items-end" style={{ fontFamily: "'Press Start 2P', cursive" }}>
          <div className="text-right">
            <div className="text-[8px] opacity-60">LIVES</div>
            <div className="mt-2"><PixelHearts health={heartsHealthPct} maxHearts={MAX_LIVES} size={20} /></div>
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">SCORE (SEC)</div>
            <div className="text-xl text-[var(--nes-yellow)]">{seconds.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">STRESS</div>
            <div className="text-xl">{Math.round(stress01 * 100)}</div>
          </div>
        </div>

        {/* Hint */}
        <GameHint
          position="bottom-left"
          offset={8}
          scheme="dark"
          align="left"
          primary={"More stress speeds the train"}
          secondary={"Survive as long as you can"}
        />
      </div>

      {/* Lost life modal */}
      {showLostLife && (
        <RetroModal
          title="WHOOSH!"
          cancelLabel="PLAY"
          onCancel={handleNextRound}
          confirmVisible={false}
        >
          <p className="mb-3">You got swept away by your train of thoughts.</p>
          <p className="text-[var(--nes-gray)]">{lives - 1} lives left. Try to continue your scoring!</p>
        </RetroModal>
      )}
    </div>
  );
}
/* SPDX-License-Identifier: CC-BY-SA-4.0
   Copyright (c) 2025 Itay Inbar and contributors
*/
