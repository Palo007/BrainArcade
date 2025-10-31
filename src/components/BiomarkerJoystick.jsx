import React from 'react';
import { Joystick } from './Joystick.jsx';
import '../styles/retro.css';

// Backward-compatible wrapper: previously took a biomarker, now accepts cognitive axis
export function BiomarkerJoystick({ biomarker, label, range = 0.4, hintUp, hintDown }) {
  // Treat 'biomarker' prop as axis key for cognitive joystick
  return (
    <Joystick axis={biomarker} label={label} range={range} hintLow={hintDown} hintHigh={hintUp} />
  );
}
