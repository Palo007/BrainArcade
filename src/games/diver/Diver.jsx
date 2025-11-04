import { useEffect, useRef, useState } from 'react';
import { useJoystick } from '../../contexts/JoystickContext';
import { useBaseline } from '../../contexts/BaselineContext';
import { useGameScore } from '../../hooks/useGameScore';
import { useGameHealth } from '../../hooks/useGameHealth';
import { PixelHearts } from '../../components/PixelHearts';
import { GameHint } from '../../components/GameHint';
import { GameOverScreen } from '../../components/GameOverScreen';
import happyDiverImg from './assets/diver-happy.png';
import sadDiverImg from './assets/diver-sad.png';
import backgroundSeaImg from './assets/background-sea.png';

export function Diver() {
  const canvasRef = useRef(null);
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

  // Baseline and joystick
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { value01: frustration } = useJoystick('frustration', {
    range: 0.6,
    autoAdjustBaseline: true
  });

  // Game mechanics - health first since score depends on isDead
  const { health, isDead, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    maxHealth: 100,
    // Be more permissive: only drain after grace period handled below
    drainWhen: drainActive,
    drainRate: 16.67, // Lose 1 heart (33.33 HP) in 2 seconds once draining
  });

  const { score: gameScore, reset: resetScore } = useGameScore({
    joystickValue: frustration,
    baseRate: 20,
    minThreshold: 0.3,
    maxVelocity: 5,
    velocityBuildRate: 0.15,
    frozen: isDead, // Freeze score when game is over
  });

  // Initialize baseline
  useEffect(() => {
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

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

    images.happy.src = happyDiverImg;
    images.happy.onload = onLoad;

    images.sad.src = sadDiverImg;
    images.sad.onload = onLoad;

    images.background.src = backgroundSeaImg;
    images.background.onload = onLoad;

    return () => {
      images.happy.onload = null;
      images.sad.onload = null;
      images.background.onload = null;
    };
  }, []);

  // Store frustration in a ref to avoid animation reinitialization
  const frustrationRef = useRef(frustration);
  useEffect(() => {
    frustrationRef.current = frustration;
  }, [frustration]);

  // Initialize and animate canvas (only once when ready)
  useEffect(() => {
    if (!isBaselineReady || !imagesLoaded || isDead) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Animation parameters
    const numFish = 200;
    const fishSpeed = 2;
    const diverSpeed = 2; // Reduced from 3 for smoother movement
    const visionRadius = 70;
    const avoidanceRadius = 40;
    const predatorAvoidanceRadius = 150;

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

      flock(fishSchool, diver) {
        let alignment = { x: 0, y: 0 };
        let cohesion = { x: 0, y: 0 };
        let separation = { x: 0, y: 0 };
        let total = 0;

        fishSchool.forEach(otherFish => {
          let dx = otherFish.x - this.x;
          let dy = otherFish.y - this.y;
          let distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < visionRadius && otherFish !== this) {
            alignment.x += otherFish.velocityX;
            alignment.y += otherFish.velocityY;

            cohesion.x += otherFish.x;
            cohesion.y += otherFish.y;

            if (distance < avoidanceRadius) {
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

          if (distance < predatorAvoidanceRadius) {
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
      constructor(x, y, images, frustrationRef) {
        this.x = x;
        this.y = y;
        this.size = 100; // Much bigger sprite
        this.angle = Math.random() * Math.PI * 2;
        this.speed = diverSpeed;
        this.images = images;
        this.frustrationRef = frustrationRef;
        this.targetFish = null; // Track current target
        this.targetChangeTimer = 0; // Timer to reduce target switching
        this.targetChangeInterval = 60; // Change target every ~60 frames (1 second at 60fps)
      }

      draw() {
        const frustrationLevel = this.frustrationRef.current;
        const currentImage = frustrationLevel > 0.5 ? this.images.happy : this.images.sad;

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
        ctx.drawImage(
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
      frustrationRef
    );

    // Utilities for transient text effects
    const pushFloatingText = ({ x, y, text, color = '#FFFFFF', shadow = 'rgba(0,0,0,0.9)',
      font = "18px 'Press Start 2P', cursive", life = 0.9, vy = -60, vx = 0 }) => {
      floatingTextsRef.current.push({ x, y, text, color, shadow, font, life, age: 0, vy, vx, opacity: 1 });
    };

    // Animation loop
    const animate = () => {
      const now = performance.now();
      if (lastTimestampRef.current == null) lastTimestampRef.current = now;
      const dt = Math.min(0.05, (now - lastTimestampRef.current) / 1000); // clamp delta to 50ms
      lastTimestampRef.current = now;

      // Draw background
      ctx.drawImage(imagesRef.current.background, 0, 0, canvas.width, canvas.height);

      // Update and draw fish
      fishSchoolRef.current.forEach(fish => {
        fish.flock(fishSchoolRef.current, diverRef.current);
        fish.draw();
      });

      // Update and draw diver
      diverRef.current.chase(fishSchoolRef.current);
      diverRef.current.draw();

      // Update permissive drain logic and warnings
      const badThreshold = 0.2;
      const isBad = frustrationRef.current < badThreshold;
      if (isBad) {
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
            font: `16px 'Press Start 2P', cursive`,
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
          ctx.font = ft.font || "18px 'Press Start 2P', cursive";
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
  }, [isBaselineReady, imagesLoaded, isDead]); // Removed frustration to prevent reinitialization

  // Spawn +1 retro text each time the integer score increases
  useEffect(() => {
    const floor = Math.floor(gameScore);
    if (prevFloorScoreRef.current === 0) prevFloorScoreRef.current = Math.floor(gameScore);
    const diff = floor - prevFloorScoreRef.current;
    if (diff > 0 && diverRef.current) {
      for (let i = 0; i < diff; i++) {
        // Stagger slight vertical offset for bursts
        const yOffset = -60 - i * 6;
        floatingTextsRef.current.push({
          x: diverRef.current.x,
          y: diverRef.current.y + yOffset,
          text: '+ 1',
          color: '#7CFC00', // retro green
          shadow: 'rgba(0,0,0,0.95)',
          font: "18px 'Press Start 2P', cursive",
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
  };

  // Show waiting screen during baseline
  if (!isBaselineReady) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-blue-900 to-blue-950">
        <div className="text-center px-8">
          <div className="text-2xl text-blue-300 mb-4">CALIBRATING...</div>
          <div className="text-sm text-blue-400">
            Establishing your baseline frustration levels
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while images load
  if (!imagesLoaded) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-blue-900 to-blue-950">
        <div className="text-center px-8">
          <div className="text-2xl text-blue-300 mb-4">LOADING...</div>
          <div className="text-sm text-blue-400">Preparing underwater scene</div>
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
        customMessage="You stayed too calm for too long!"
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
        <div className="absolute top-6 left-6 w-[min(480px,60vw)] z-10" style={{ fontFamily: "'Press Start 2P', cursive" }}>
          <h2 className="text-2xl text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>BAD DIVER</h2>
          <p className="text-xs text-gray-300 mt-2" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}>
            Frustration fuels your catch!
          </p>
        </div>

        {/* Game Hint */}
        <GameHint
          position="bottom-left"
          offset={8}
          scheme="dark"
          align="left"
          primary="Get frustrated to catch more fish!"
          secondary="Stay satisfied for too long and you'll lose your catch"
        />

        {/* HUD */}
        <div className="absolute bottom-8 right-8 flex gap-6 items-end z-10" style={{ fontFamily: "'Press Start 2P', cursive" }}>
          <div className="text-right">
            <div className="text-[8px] text-gray-300 opacity-60">HEALTH</div>
            <div className="mt-2">
              <PixelHearts health={health} maxHearts={3} size={20} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-gray-300 opacity-60">FISH COUNT</div>
            <div className="text-xl text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
              {Math.floor(gameScore).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
