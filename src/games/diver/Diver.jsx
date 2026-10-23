import { useEffect, useRef, useState } from 'react';
import { useJoystick } from '../../contexts/JoystickContext';
import { useBaseline } from '../../contexts/BaselineContext';
import { useGameScore } from '../../hooks/useGameScore';
import { useGameHealth } from '../../hooks/useGameHealth';
import { useSignalPause } from '../../hooks/useSignalPause';
import { PixelHearts } from '../../components/PixelHearts';
import { GameHint } from '../../components/GameHint';
import { GameOverScreen } from '../../components/GameOverScreen';
import { GameStartPanel } from '../../components/GameStartPanel';
import { useT } from '../../lib/i18n.js';
import happyDiverImg from './assets/diver-happy.png';
import sadDiverImg from './assets/diver-sad.png';
import backgroundSeaImg from './assets/background-sea.jpg';

export function Diver() {
  const t = useT();
  const canvasRef = useRef(null);
  const roundStartRef = useRef(Date.now()); // for history: seconds played this round
  const animationFrameRef = useRef(null);
  const fishSchoolRef = useRef([]);
  const diverRef = useRef(null);
  const imagesRef = useRef({});
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const floatingTextsRef = useRef([]); // transient text effects like "+1" and warnings
  const lastTimestampRef = useRef(null);
  const prevFloorScoreRef = useRef(0);
  const lowFrustrationTimerRef = useRef(0); // seconds spent below threshold
  const warnLevelRef = useRef(0); // 0..3 for !, !!, !!!
  const [drainActive, setDrainActive] = useState(false); // more permissive drain gate
  const drainActiveRef = useRef(false);
  const scoreHappyUntilRef = useRef(0); // force diver happy until timestamp (ms)

  // Baseline and joystick
  const { ensureBaseline, resetBaseline, isBaselineReady } = useBaseline();
  const [started, setStarted] = useState(false); // START screen gate
  const paused = useSignalPause(started); // electrode-check overlay is up
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const { value01: frustration } = useJoystick('frustration', {
    range: 0.6,
    autoAdjustBaseline: true
  });

  // Game mechanics - health first since score depends on isDead
  const { health, isDead, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    maxHealth: 100,
    // Be more permissive: only drain after grace period handled below
    drainWhen: drainActive && !paused,
    drainRate: 16.67, // Lose 1 heart (33.33 HP) in 2 seconds once draining
  });

  const { score: gameScore, reset: resetScore } = useGameScore({
    joystickValue: frustration,
    baseRate: 20,
    minThreshold: 0.3,
    maxVelocity: 5,
    velocityBuildRate: 0.15,
    frozen: isDead || !started || !isBaselineReady || paused, // Freeze score on game over and before START
  });

  // Initialize baseline
  useEffect(() => {
    if (started) ensureBaseline({ seconds: 30 });
  }, [started, ensureBaseline]);

  // Load images
  useEffect(() => {
    const images = {
      happy: new Image(),
      sad: new Image(),
      background: new Image(),
    };

    let loadedCount = 0;
    const totalImages = 3;

    const onLoad = () => {
      loadedCount++;
      if (loadedCount === totalImages) {
        imagesRef.current = images;
        setImagesLoaded(true);
      }
    };

    // A flaky phone connection can drop one request: retry twice, then start anyway (draw calls skip broken images)
    const load = (img, src) => {
      let tries = 0;
      img.onload = onLoad;
      img.onerror = () => {
        if (++tries <= 2) setTimeout(() => { img.src = `${src}?retry=${tries}`; }, 800);
        else onLoad();
      };
      img.src = src;
    };
    load(images.happy, happyDiverImg);
    load(images.sad, sadDiverImg);
    load(images.background, backgroundSeaImg);

    return () => {
      for (const img of Object.values(images)) img.onload = img.onerror = null;
    };
  }, []);

  // Store frustration in a ref to avoid animation reinitialization
  const frustrationRef = useRef(frustration);
  useEffect(() => {
    frustrationRef.current = frustration;
  }, [frustration]);

  useEffect(() => {
    if (started && isBaselineReady && imagesLoaded) roundStartRef.current = Date.now();
  }, [started, isBaselineReady, imagesLoaded]);

  // Initialize and animate canvas (only once when ready)
  useEffect(() => {
    if (!started || !isBaselineReady || !imagesLoaded || isDead) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Animation parameters
    const numFish = 200;
    const fishSpeed = 2;
    const diverSpeed = 2; // Reduced from 3 for smoother movement
    // Base radii; will be dynamically adjusted by frustration each frame
    const baseVisionRadius = 70;
    const successVisionMax = 110;
    const lossVisionMin = 50;
    const baseAvoidanceRadiusMin = 10;
    const baseAvoidanceRadiusMax = 50; // default ~40
    const lossAvoidanceRadiusMax = 120;
    const basePredatorAvoidMin = 40; // allow tighter approach on success
    const basePredatorAvoidMax = 200; // default ~150
    const lossPredatorAvoidMax = 320;

    // Build a pixelated retro fish sprite (shared by all fish)
    const fishSpriteCanvas = (() => {
      const c = document.createElement('canvas');
      // base pixel art grid
      c.width = 8; // pixels
      c.height = 6; // pixels
      const ictx = c.getContext('2d');
      ictx.imageSmoothingEnabled = false;
      // Colors
      const red = '#ff3b3b';
      const dark = '#8b0000';
      // Helper to plot a pixel
      const p = (x, y, color) => {
        ictx.fillStyle = color;
        ictx.fillRect(x, y, 1, 1);
      };
      // Simple fish profile facing right (8x6)
      // Body
      const bodyPixels = [
        [1,2],[2,2],[3,2],[4,2],[5,2],
        [1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
        [1,4],[2,4],[3,4],[4,4],[5,4],
      ];
      bodyPixels.forEach(([x,y]) => p(x,y,red));
      // Tail
      [[6,2],[7,3],[6,4]].forEach(([x,y]) => p(x,y,red));
      // Eye (darker pixel)
      p(2,2,dark);
      return c;
    })();

    // Fish class (small prey fish)
    class Fish {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.pixelScale = 4; // bigger than before (8x6)*4 = 32x24
        this.size = this.pixelScale * 4; // used for separation heuristics if needed
        this.color = '#ff3b3b';
        this.angle = Math.random() * Math.PI * 2;
        this.speed = fishSpeed;
        this.velocityX = Math.cos(this.angle) * this.speed;
        this.velocityY = Math.sin(this.angle) * this.speed;
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        // Ensure crisp pixel edges
        const prevSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const spriteW = 8 * this.pixelScale;
        const spriteH = 6 * this.pixelScale;
        ctx.drawImage(fishSpriteCanvas, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
        ctx.imageSmoothingEnabled = prevSmoothing;
        ctx.restore();
      }

      flock(fishSchool, diver, radii = { visionRadius: baseVisionRadius, avoidanceRadius: baseAvoidanceRadiusMax, predatorAvoidanceRadius: basePredatorAvoidMax }) {
        let alignment = { x: 0, y: 0 };
        let cohesion = { x: 0, y: 0 };
        let separation = { x: 0, y: 0 };
        let total = 0;

        fishSchool.forEach(otherFish => {
          let dx = otherFish.x - this.x;
          let dy = otherFish.y - this.y;
          let distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < radii.visionRadius && otherFish !== this) {
            alignment.x += otherFish.velocityX;
            alignment.y += otherFish.velocityY;

            cohesion.x += otherFish.x;
            cohesion.y += otherFish.y;

            if (distance < radii.avoidanceRadius) {
              separation.x -= dx;
              separation.y -= dy;
            }

            total++;
          }
        });

        if (total > 0) {
          alignment.x /= total;
          alignment.y /= total;
          this.velocityX += (alignment.x - this.velocityX) * 0.05;
          this.velocityY += (alignment.y - this.velocityY) * 0.05;

          cohesion.x /= total;
          cohesion.y /= total;
          this.velocityX += (cohesion.x - this.x) * 0.01;
          this.velocityY += (cohesion.y - this.y) * 0.01;

          this.velocityX += separation.x * 0.1;
          this.velocityY += separation.y * 0.1;
        }

        // Avoid diver
        if (diver) {
          let dx = diver.x - this.x;
          let dy = diver.y - this.y;
          let distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < radii.predatorAvoidanceRadius) {
            this.velocityX -= dx * 0.2;
            this.velocityY -= dy * 0.2;
          }
        }

        // Limit speed
        const maxSpeed = fishSpeed * 2;
        const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
        if (speed > maxSpeed) {
          this.velocityX = (this.velocityX / speed) * maxSpeed;
          this.velocityY = (this.velocityY / speed) * maxSpeed;
        }

        this.x += this.velocityX;
        this.y += this.velocityY;
        this.angle = Math.atan2(this.velocityY, this.velocityX);

        // Wrap at edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      }
    }

    // Diver class (predator with sprite)
    class Diver {
      constructor(x, y, images, frustrationRef, happyBoostUntilRef) {
        this.x = x;
        this.y = y;
        this.size = 100; // Much bigger sprite
        this.angle = Math.random() * Math.PI * 2;
        this.speed = diverSpeed;
        this.images = images;
        this.frustrationRef = frustrationRef;
        this.happyBoostUntilRef = happyBoostUntilRef;
        this.targetFish = null; // Track current target
        this.targetChangeTimer = 0; // Timer to reduce target switching
        this.targetChangeInterval = 60; // Change target every ~60 frames (1 second at 60fps)
      }

      draw() {
        const frustrationLevel = this.frustrationRef.current;
        const forcedHappy = this.happyBoostUntilRef && performance.now() < this.happyBoostUntilRef.current;
        const currentImage = (frustrationLevel > 0.45 || forcedHappy) ? this.images.happy : this.images.sad;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Flip horizontally if moving left
        const angleDeg = (this.angle * 180) / Math.PI;
        const normalizedAngle = ((angleDeg % 360) + 360) % 360;
        const facingLeft = normalizedAngle > 90 && normalizedAngle < 270;

        if (facingLeft) {
          ctx.scale(-1, 1);
        }

        // Draw sprite centered
        const spriteWidth = this.size * 2;
        const spriteHeight = this.size * 1.5;
        if (currentImage.naturalWidth) ctx.drawImage(
          currentImage,
          -spriteWidth / 2,
          -spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );

        ctx.restore();
      }

      chase(fishSchool) {
        this.targetChangeTimer++;

        // Only find a new target if we don't have one, or it's time to change, or target is too far
        if (!this.targetFish || this.targetChangeTimer >= this.targetChangeInterval) {
          let nearestFish = null;
          let minDist = Infinity;

          fishSchool.forEach(fish => {
            let dx = fish.x - this.x;
            let dy = fish.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist) {
              minDist = dist;
              nearestFish = fish;
            }
          });

          this.targetFish = nearestFish;
          this.targetChangeTimer = 0;
        }

        if (this.targetFish) {
          let dx = this.targetFish.x - this.x;
          let dy = this.targetFish.y - this.y;

          // Calculate target angle
          const targetAngle = Math.atan2(dy, dx);

          // Smooth angle interpolation (slower turning)
          let angleDiff = targetAngle - this.angle;

          // Normalize angle difference to [-PI, PI]
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          // Apply smooth turning (0.05 = turn rate)
          this.angle += angleDiff * 0.05;

          // Move in current direction
          this.x += Math.cos(this.angle) * this.speed;
          this.y += Math.sin(this.angle) * this.speed;
        }

        // Wrap at edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      }
    }

    // Initialize fish school
    fishSchoolRef.current = [];
    for (let i = 0; i < numFish; i++) {
      fishSchoolRef.current.push(
        new Fish(Math.random() * canvas.width, Math.random() * canvas.height)
      );
    }

    // Initialize diver
    diverRef.current = new Diver(
      canvas.width / 2,
      canvas.height / 2,
      imagesRef.current,
      frustrationRef,
      scoreHappyUntilRef
    );

    // Utilities for transient text effects
    const pushFloatingText = ({ x, y, text, color = '#FFFFFF', shadow = 'rgba(0,0,0,0.9)',
      font = "18px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace", life = 0.9, vy = -60, vx = 0 }) => {
      floatingTextsRef.current.push({ x, y, text, color, shadow, font, life, age: 0, vy, vx, opacity: 1 });
    };

    // Animation loop
    const animate = () => {
      const now = performance.now();
      if (lastTimestampRef.current == null) lastTimestampRef.current = now;
      const dt = Math.min(0.05, (now - lastTimestampRef.current) / 1000); // clamp delta to 50ms
      lastTimestampRef.current = now;

      // Draw background
      if (imagesRef.current.background.naturalWidth) ctx.drawImage(imagesRef.current.background, 0, 0, canvas.width, canvas.height);

      // Update and draw fish
      // Dynamically adjust radii by frustration: closer on success, further on loss
      const f = Math.min(1, Math.max(0, frustrationRef.current));
      const success = Math.max(0, Math.min(1, (f - 0.25) / 0.75));
      const badThreshold = 0.2;
      const isBad = f < badThreshold;
      const lossIntensity = isBad ? Math.max(0, Math.min(1, (badThreshold - f) / badThreshold)) : 0;

      const currentAvoidance = isBad
        ? baseAvoidanceRadiusMax + lossIntensity * (lossAvoidanceRadiusMax - baseAvoidanceRadiusMax)
        : baseAvoidanceRadiusMax - success * (baseAvoidanceRadiusMax - baseAvoidanceRadiusMin);

      const currentPredatorAvoid = isBad
        ? basePredatorAvoidMax + lossIntensity * (lossPredatorAvoidMax - basePredatorAvoidMax)
        : basePredatorAvoidMax - success * (basePredatorAvoidMax - basePredatorAvoidMin);

      const currentVision = isBad
        ? baseVisionRadius - lossIntensity * (baseVisionRadius - lossVisionMin)
        : baseVisionRadius + success * (successVisionMax - baseVisionRadius);
      fishSchoolRef.current.forEach(fish => {
        fish.flock(
          fishSchoolRef.current,
          diverRef.current,
          {
            visionRadius: currentVision,
            avoidanceRadius: currentAvoidance,
            predatorAvoidanceRadius: currentPredatorAvoid,
          }
        );
        fish.draw();
      });

      // Update and draw diver
      diverRef.current.chase(fishSchoolRef.current);
      diverRef.current.draw();

      // Catch fish near the diver: trigger +1 and temporary happiness
      if (diverRef.current) {
        const catchRadius = diverRef.current.size * 0.6;
        for (const fish of fishSchoolRef.current) {
          const dx = fish.x - diverRef.current.x;
          const dy = fish.y - diverRef.current.y;
          const dist = Math.hypot(dx, dy);
          if (dist < catchRadius) {
            // Respawn fish at a new random location and random direction
            fish.x = Math.random() * canvas.width;
            fish.y = Math.random() * canvas.height;
            fish.angle = Math.random() * Math.PI * 2;
            fish.velocityX = Math.cos(fish.angle) * fish.speed;
            fish.velocityY = Math.sin(fish.angle) * fish.speed;
            // Visual +1
            pushFloatingText({
              x: diverRef.current.x,
              y: diverRef.current.y - 60,
              text: '+ 1',
              color: '#7CFC00',
              shadow: 'rgba(0,0,0,0.95)',
              font: "18px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace",
              life: 0.8,
              vy: -80,
            });
            // Happy boost for 0.5s
            const nowMs = performance.now();
            const remaining = Math.max(0, scoreHappyUntilRef.current - nowMs);
            scoreHappyUntilRef.current = nowMs + remaining + 500;
          }
        }
      }

      // Update permissive drain logic and warnings (reuse isBad from above)
      if (pausedRef.current) {
        // signal lost: hold the warning timer, no new drain
      } else if (isBad) {
        lowFrustrationTimerRef.current += dt;
        const t = lowFrustrationTimerRef.current;
        // Show stepwise warnings !, !!, !!! before draining
        const newLevel = t >= 3 ? 3 : t >= 2 ? 2 : t >= 1 ? 1 : 0;
        if (newLevel > warnLevelRef.current && diverRef.current) {
          const marks = '!'.repeat(newLevel);
          pushFloatingText({
            x: diverRef.current.x,
            y: diverRef.current.y - 40,
            text: marks,
            color: newLevel === 3 ? '#ff3b3b' : '#ffd23f',
            font: `16px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace`,
            life: 0.8,
            vy: -40,
          });
          warnLevelRef.current = newLevel;
        }
        if (t >= 3 && !drainActiveRef.current) {
          drainActiveRef.current = true;
          setDrainActive(true);
        }
      } else {
        lowFrustrationTimerRef.current = 0;
        if (warnLevelRef.current !== 0) warnLevelRef.current = 0;
        if (drainActiveRef.current) {
          drainActiveRef.current = false;
          setDrainActive(false);
        }
      }

      // Update and draw floating texts
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const remaining = [];
      for (const ft of floatingTextsRef.current) {
        ft.age += dt;
        if (ft.age < ft.life) {
          ft.x += (ft.vx || 0) * dt;
          ft.y += (ft.vy || -60) * dt;
          ft.opacity = 1 - ft.age / ft.life;
          ctx.font = ft.font || "18px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace";
          // Shadow
          ctx.fillStyle = ft.shadow || 'rgba(0,0,0,0.9)';
          ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
          // Text
          ctx.fillStyle = `rgba(${ft.color.startsWith('#') ? parseInt(ft.color.slice(1,3),16)+','+parseInt(ft.color.slice(3,5),16)+','+parseInt(ft.color.slice(5,7),16) : ft.color},${ft.opacity.toFixed(3)})`;
          // If color was not hex, fallback to global alpha approach
          if (!ft.color.startsWith('#')) {
            ctx.globalAlpha = ft.opacity;
          }
          ctx.fillText(ft.text, ft.x, ft.y);
          if (!ft.color.startsWith('#')) ctx.globalAlpha = 1;
          remaining.push(ft);
        }
      }
      floatingTextsRef.current = remaining;
      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      lastTimestampRef.current = null;
    };
  }, [started, isBaselineReady, imagesLoaded, isDead]); // Removed frustration to prevent reinitialization

  // Show +1 when the visible fish count (score) increases
  useEffect(() => {
    const floor = Math.floor(gameScore);
    if (prevFloorScoreRef.current === 0) prevFloorScoreRef.current = floor;
    const diff = floor - prevFloorScoreRef.current;
    if (diff > 0) {
      const x = diverRef.current ? diverRef.current.x : window.innerWidth / 2;
      const y = diverRef.current ? diverRef.current.y : window.innerHeight / 2;
      for (let i = 0; i < diff; i++) {
        const yOffset = -60 - i * 6;
        floatingTextsRef.current.push({
          x,
          y: y + yOffset,
          text: '+ 1',
          color: '#7CFC00',
          shadow: 'rgba(0,0,0,0.95)',
          font: "18px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace",
          life: 0.8,
          age: 0,
          vy: -70,
          vx: 0,
          opacity: 1,
        });
      }
    }
    prevFloorScoreRef.current = floor;
  }, [gameScore]);

  // Retry handler
  const handleRetry = () => {
    resetScore();
    resetHealth();
    roundStartRef.current = Date.now();
    setStarted(false);
  };

  const best = parseInt(localStorage.getItem('highscore_diver') || '0', 10);
  const recal = () => {
    resetBaseline({ forceFull: true });
    setStarted(true);
    ensureBaseline({ seconds: 30, force: true });
  };

  // START screen
  if (!started) {
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-blue-900 to-blue-950">
        <GameStartPanel title={t('games.diver.title')} onStart={() => setStarted(true)} best={best} onRecalibrate={recal}>
          <p className="text-[10px] text-gray-200 leading-relaxed mb-2">
            {t('games.diver.intro1')}
          </p>
          <p className="text-[10px] text-gray-200 leading-relaxed mb-4">{t('games.diver.intro2')}</p>
        </GameStartPanel>
      </div>
    );
  }

  // Show waiting screen during baseline
  if (!isBaselineReady) {
    return (
      <div className="w-screen h-screen phone-port:w-full phone-port:h-full flex items-center justify-center bg-gradient-to-b from-blue-900 to-blue-950">
        <div className="text-center px-8">
          <div className="text-2xl text-blue-300 mb-4">{t('games.diver.calibrating')}</div>
          <div className="text-sm text-blue-400">
            {t('games.diver.calibratingNote')}
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while images load
  if (!imagesLoaded) {
    return (
      <div className="w-screen h-screen phone-port:w-full phone-port:h-full flex items-center justify-center bg-gradient-to-b from-blue-900 to-blue-950">
        <div className="text-center px-8">
          <div className="text-2xl text-blue-300 mb-4">{t('games.diver.loading')}</div>
          <div className="text-sm text-blue-400">{t('games.diver.loadingNote')}</div>
        </div>
      </div>
    );
  }

  // Show game over screen
  if (isDead) {
    return (
      <GameOverScreen
        finalScore={Math.floor(gameScore)}
        gameName="diver"
        joystickAxis="frustration"
        joystickOptions={{ range: 0.6, autoAdjustBaseline: true }}
        onRetry={handleRetry}
        playedSec={Math.round((Date.now() - roundStartRef.current) / 1000)}
        customMessage={t('games.diver.gameOver')}
      />
    );
  }

  // Main game UI
  return (
    <div className="absolute inset-0">
      {/* Main stage - full screen */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Canvas for animation - positioned absolutely to fill container */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block' }}
        />

        {/* Title & Subtitle */}
        <div className="absolute top-6 left-6 w-[min(480px,60vw)] z-10" style={{ fontFamily: 'var(--font-retro)' }}>
          <h2 className="text-2xl text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>{t('games.diver.title')}</h2>
          <p className="text-xs text-gray-300 mt-2" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}>
            {t('games.diver.subtitle')}
          </p>
        </div>

        {/* Game Hint */}
        <GameHint
          position="bottom-left"
          offset={8}
          scheme="dark"
          align="left"
          primary={t('games.diver.hintPrimary')}
          secondary={t('games.diver.hintSecondary')}
        />

        {/* HUD */}
        <div className="absolute bottom-8 right-8 z-10" style={{ fontFamily: 'var(--font-retro)' }}>
          <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] text-white px-4 py-3">
            <div className="flex gap-6 items-end">
              {/* Frustration */}
              <div className="text-right">
                <div className="text-[8px] opacity-70">{t('games.diver.frustration')}</div>
                <div className="text-sm text-[var(--nes-yellow)] mt-1">{frustration.toFixed(2)}</div>
              </div>

              {/* Health */}
              <div className="text-right">
                <div className="text-[8px] opacity-70">{t('games.diver.health')}</div>
                <div className="mt-2">
                  <PixelHearts health={health} maxHearts={3} size={20} />
                </div>
              </div>

              {/* Fish Count */}
              <div className="text-right">
                <div className="text-[8px] opacity-70">{t('games.diver.fishCount')}</div>
                <div className="text-xl text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
                  {Math.floor(gameScore).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
