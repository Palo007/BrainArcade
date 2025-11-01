import { useState, useEffect, useRef } from 'react';

/**
 * Reusable scoring system hook with velocity-based accumulation
 *
 * @param {Object} config - Configuration object
 * @param {number} config.joystickValue - Current joystick value (0-1) to monitor
 * @param {number} config.baseRate - Base points per second when accumulating (default: 10)
 * @param {number} config.minThreshold - Minimum joystick value to accumulate (default: 0.4)
 * @param {number} config.dropThreshold - Joystick drop amount that stops accumulation (default: 0.1)
 * @param {number} config.maxVelocity - Maximum velocity multiplier (default: 5)
 * @param {number} config.velocityBuildRate - How fast velocity builds per second (default: 0.1)
 *
 * @returns {Object} { score, velocity, isAccumulating, reset }
 */
export function useGameScore({
  joystickValue = 0.5,
  baseRate = 10,
  minThreshold = 0.4,
  dropThreshold = 0.1,
  maxVelocity = 5,
  velocityBuildRate = 0.1,
} = {}) {
  const [score, setScore] = useState(0);
  const [velocity, setVelocity] = useState(1);
  const [isAccumulating, setIsAccumulating] = useState(false);

  const prevJoystickValueRef = useRef(joystickValue);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    const currentValue = joystickValue;
    const prevValue = prevJoystickValueRef.current;

    // Detect significant drop (>0.1)
    const hasDropped = (prevValue - currentValue) > dropThreshold;

    // Determine if we should be accumulating
    // We accumulate if above threshold AND haven't just dropped
    const shouldAccumulate = currentValue >= minThreshold && !hasDropped;

    setIsAccumulating(shouldAccumulate);

    // Store current value for next comparison
    prevJoystickValueRef.current = currentValue;
  }, [joystickValue, minThreshold, dropThreshold]);

  // Score accumulation and velocity management
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      if (isAccumulating) {
        // Build velocity over time (sustained focus reward)
        setVelocity((v) => Math.min(maxVelocity, v + velocityBuildRate * deltaSeconds));

        // Accumulate score with current velocity multiplier
        setScore((s) => s + baseRate * velocity * deltaSeconds);
      } else {
        // Reset velocity when not accumulating
        setVelocity(1);
      }
    }, 100); // Update 10 times per second

    return () => clearInterval(interval);
  }, [isAccumulating, velocity, baseRate, maxVelocity, velocityBuildRate]);

  const reset = () => {
    setScore(0);
    setVelocity(1);
    setIsAccumulating(false);
    lastUpdateRef.current = Date.now();
    prevJoystickValueRef.current = joystickValue;
  };

  return {
    score: Math.round(score),
    velocity,
    isAccumulating,
    reset,
  };
}
