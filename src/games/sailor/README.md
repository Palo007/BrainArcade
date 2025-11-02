# Sea of Thoughts

> A brain-controlled sailing adventure where you navigate the ocean of your mind to recollect your lost train of thought.

## 🎮 Game Overview

In **Sea of Thoughts**, you control a sailor who has accidentally lost their trail of thought in a vast mental ocean. Your mission is to stay engaged and focused to sail toward the barrel representing your thoughts before they drift away forever.

## 🧠 How It Works

This game uses the **engagement joystick**, which measures your cognitive engagement level through EEG signals:

- **Engagement** = β / (α + θ) ratio from frontal channels
- Higher beta activity + lower alpha/theta = more engaged
- The game reads your engagement level in real-time (0-100%)

## 🎯 Game Mechanics

### Engagement Zones

Your engagement level affects how the sailor moves:

| Engagement Level | Effect | What Happens |
|-----------------|--------|-------------|
| **< 30%** (Too Low) | ⚠️ Very Slow | Sailor barely moves (1% speed). The barrel drifts away! |
| **30-70%** (Good!) | ✅ Optimal | Sailor moves at good speed (10% speed). Score increases! |
| **> 70%** (Too High) | ⚠️ Over-engaged | Sailor moves but loses health (5 HP/sec). You're too stressed! |

### Objectives

1. **Catch the Barrel**: Sail toward the barrel to collect your train of thought
2. **Stay Engaged**: Keep your engagement in the 30-70% range for best results
3. **Maintain Health**: Avoid over-engagement (>70%) or you'll lose hearts
4. **Score Points**: Accumulate points by staying engaged while sailing

### Challenge

- The barrel slowly drifts to the right (2% per second)
- You must reach it before it drifts too far away
- Each successful collection resets positions and continues the game
- Game ends when you lose all health (3 hearts)

## 🎨 Visual Elements

### Main Game Objects
- **Sailor**: Your character (sailor-right.png) - bobs on the waves
- **Barrel**: Your lost train of thought - floats and drifts right
- **Background**: Deep sea scene with gradient ocean

### Decorative Animations
- **Birds** (3x): Flying overhead with flapping wings
- **Clouds** (3x): Drifting across the sky (made of 3 white circles each)
- **Fish** (2x): Swimming beneath the waves (fish1.png, fish2.png)

## 🎓 Tips for Success

1. **Find Your Sweet Spot**: Aim for 40-60% engagement for stable performance
2. **Avoid Over-Thinking**: Too much focus (>70%) will drain your health
3. **Stay Present**: If your mind wanders (<30%), the barrel drifts away
4. **Breathe**: Relaxed focus works better than forced concentration
5. **Practice**: Your baseline improves over time as you learn your engagement patterns

## 🏆 Scoring

- **Base Score**: 10 points per second when engaged (30-70%)
- **Velocity Multiplier**: Builds up to 5x with sustained engagement
- **Collection Bonus**: Points awarded for each barrel collected
- **Final Score**: Total points accumulated before game over

## 🔧 Technical Details

### Joystick Configuration
```javascript
useJoystick('engagement', {
  range: 0.4,
  autoAdjustBaseline: true
})
```

### Health System
- Initial Health: 100 HP
- Max Hearts: 3
- Drain Rate: 5 HP/sec when over-engaged (>70%)
- Game Over: 0 HP

### Assets Used
- `sailor-right.png` - Main character
- `barrel.png` - Target object
- `scene.png` - Background scene
- `fish1.png`, `fish2.png` - Decorative fish

## 🎯 Cognitive Benefits

Playing **Sea of Thoughts** helps you:
- **Practice Sustained Attention**: Maintain focus over time
- **Learn Self-Regulation**: Find your optimal engagement level
- **Develop Awareness**: Notice when you're under or over-engaged
- **Train Mental Flexibility**: Balance focus without overthinking

## 📖 Story

> *"In the vast ocean of consciousness, thoughts drift like barrels on gentle waves. When you lose your train of thought, it floats away into the depths of your mind. Only by maintaining the right level of engagement—not too little, not too much—can you navigate these mental waters and reclaim what was lost."*

---

**Game ID**: `sailor`
**Joystick**: Engagement (β/(α+θ) frontal)
**Difficulty**: Medium
**Duration**: Endless (until health depleted)
