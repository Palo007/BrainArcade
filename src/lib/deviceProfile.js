/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Per-headband signal tuning. The device object sets `profile` ('classic' | 'athena');
// MuseContext exposes the matching entry so quality, blink and band-power code can read it.
//
// classic = the original Brain Arcade values (Muse 2016 / 2 / S Gen 1-2, raw µV with DC offset).
// athena  = Muse S Athena via athenaAdapter: 1 Hz high-pass + mains notch already applied,
//           muse-jsx scale 0.0885 µV/LSB (1450 µV / 16383, same as OpenMuse), dry silicone
//           electrodes. Clean EEG sits around 5-40 µV here, so the classic 300 µV gate never
//           fired, and the high-pass turns a railed (saturated) channel into a flat line.

export const DEVICE_PROFILES = {
  classic: {
    name: 'classic',
    quality: {
      spikeUv: 300, // |sample| above this counts as artifact
      hugeUv: 600, // |sample| (or jump > hugeUv/1.5) → "evaluating setup..."
      maxBadRatio: 0.01, // >1% of samples above spikeUv in 1 s → channel bad
      flatRmsUv: 0, // 0 = no flat-line check (raw classic data is never flat while worn)
    },
    blink: {
      mode: 'any', // original rule: peak-to-peak >= minRangeUv on any channel
      windowMs: 400,
      minRangeUv: 150,
      debounceMs: 500,
      lowpassHz: 0,
    },
    bandSmoothing: 1, // EMA weight of the newest band-power frame (1 = no smoothing)
  },
  athena: {
    name: 'athena',
    quality: {
      spikeUv: 200, // ~5-10x clean EEG; blinks (100-200 µV) stay mostly below
      hugeUv: 450, // contact moving / headband being adjusted
      maxBadRatio: 0.02, // dry electrodes: tolerate brief pops
      flatRmsUv: 0.5, // 1 s RMS below this = railed or open input (flattened by the high-pass)
    },
    blink: {
      // Measured on the real headband 2026-10-09 (lib/blinkDetector.js has the why):
      // blink = both ears 60-150 µV in step after a 6 Hz low-pass, forehead <= ~0.3x the ears.
      mode: 'ears',
      windowMs: 400,
      lowpassHz: 6, // a blink is a slow wave; drops alpha, muscle and mains noise
      minRangeUv: 45, // smallest real blink seen: 61
      maxRangeUv: 150,
      rangeFactor: 4, // limit = 4x the quiet ear level (quiet ~8-15 µV), clamped to min/max
      earAgreement: 0.6, // weaker ear must reach 60% of the stronger one (else a one-sensor pop)
      frontalMaxRatio: 0.3, // forehead swing > 30% of ear swing = head/body movement (real blinks: <= 0.29)
      decideMs: 150, // watch the event this long before deciding
      refractoryMs: 800, // a blink has a ~0.5 s rebound; never count it twice
    },
    bandSmoothing: 0.4, // calms frame-to-frame jitter of band ratios (~0.6 s time constant at 4 Hz)
  },
};

export const getDeviceProfile = (name) => DEVICE_PROFILES[name] || DEVICE_PROFILES.classic;
