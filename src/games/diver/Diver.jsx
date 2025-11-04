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

  // Baseline and joystick
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { value01: frustration } = useJoystick('frustration', {
    range: 0.6,
    autoAdjustBaseline: true
  });

  // Game mechanics
  const { score: gameScore, reset: resetScore } = useGameScore({
    joystickValue: frustration,
    baseRate: 20,
    minThreshold: 0.3,
    maxVelocity: 5,
    velocityBuildRate: 0.15,
  });

  const { health, isDead, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    maxHealth: 100,
    drainWhen: frustration < 0.2,
    drainRate: 16.67, // Lose 1 heart (33.33 HP) in 2 seconds
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

  // Initialize and animate canvas
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
    const diverSpeed = 3;
    const visionRadius = 70;
    const avoidanceRadius = 40;
    const predatorAvoidanceRadius = 150;

    // Fish class (small prey fish)
    class Fish {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 5;
        this.color = 'rgba(0, 200, 255, 0.9)';
        this.angle = Math.random() * Math.PI * 2;
        this.speed = fishSpeed;
        this.velocityX = Math.cos(this.angle) * this.speed;
        this.velocityY = Math.sin(this.angle) * this.speed;
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.beginPath();
        ctx.moveTo(-this.size, -this.size / 2);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(-this.size, this.size / 2);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
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
      constructor(x, y, images, getFrustration) {
        this.x = x;
        this.y = y;
        this.size = 40; // Base size for sprite
        this.angle = Math.random() * Math.PI * 2;
        this.speed = diverSpeed;
        this.images = images;
        this.getFrustration = getFrustration;
      }

      draw() {
        const frustrationLevel = this.getFrustration();
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

        if (nearestFish) {
          let dx = nearestFish.x - this.x;
          let dy = nearestFish.y - this.y;
          this.angle = Math.atan2(dy, dx);
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
      () => frustration
    );

    // Animation loop
    const animate = () => {
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
    };
  }, [isBaselineReady, imagesLoaded, isDead, frustration]);

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
          <h2 className="text-2xl text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>DIVER</h2>
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
          secondary="Stay calm too long and you'll lose health"
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
