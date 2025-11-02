import { useState, useEffect, useRef } from 'react';

/**
 * Reusable health system hook for games
 *
 * @param {Object} config - Configuration object
 * @param {number} config.initialHealth - Starting health (default: 100)
 * @param {number} config.maxHealth - Maximum health (default: 100)
 * @param {boolean} config.drainWhen - Condition that triggers health drain
 * @param {number} config.drainRate - Health points drained per second when condition is true (default: 5)
 * @param {boolean} config.regenWhen - Optional condition that triggers health regeneration
 * @param {number} config.regenRate - Health points regenerated per second when condition is true (default: 2)
 *
 * @returns {Object} { health, isDead, reset }
 */
export function useGameHealth({
  initialHealth = 100,
  maxHealth = 100,
  drainWhen = false,
  drainRate = 5,
  regenWhen = false,
  regenRate = 2,
} = {}) {
  const [health, setHealth] = useState(initialHealth);
  const lastUpdateRef = useRef(Date.now());

  // Health drain/regen logic
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const deltaSeconds = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setHealth((currentHealth) => {
        let newHealth = currentHealth;

        // Drain health if condition is met
        if (drainWhen && currentHealth > 0) {
          newHealth = currentHealth - drainRate * deltaSeconds;
        }

        // Regenerate health if condition is met
        if (regenWhen && currentHealth < maxHealth) {
          newHealth = currentHealth + regenRate * deltaSeconds;
        }

        // Clamp between 0 and maxHealth
        return Math.max(0, Math.min(maxHealth, newHealth));
      });
    }, 100); // Update 10 times per second for smooth drain/regen

    return () => clearInterval(interval);
  }, [drainWhen, drainRate, regenWhen, regenRate, maxHealth]);

  const reset = () => {
    setHealth(initialHealth);
    lastUpdateRef.current = Date.now();
  };

  const isDead = health <= 0;

  // Apply immediate damage or healing in absolute health points
  const damage = (amount = 0) => {
    if (!amount) return;
    setHealth((current) => Math.max(0, Math.min(maxHealth, current - amount)));
  };

  const heal = (amount = 0) => {
    if (!amount) return;
    setHealth((current) => Math.max(0, Math.min(maxHealth, current + amount)));
  };

  return { health, isDead, reset, damage, heal };
}
