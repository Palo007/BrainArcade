import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import '../styles/retro.css';

export function LostBrainModal({ redirectSeconds = 5 }) {
  const { lostZero6s } = useQuality();
  const [show, setShow] = useState(false);
  const [count, setCount] = useState(redirectSeconds);
  const navigate = useNavigate();
  const location = useLocation();

  // When condition triggers, show modal and start countdown
  useEffect(() => {
    if (lostZero6s) {
      setShow(true);
      setCount(redirectSeconds);
    } else {
      setShow(false);
    }
  }, [lostZero6s, redirectSeconds]);

  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          // Redirect to start screen unless already there
          if (location.pathname !== '/') navigate('/', { replace: true });
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [show, navigate, location.pathname]);

  if (!show) return null;

  return (
    <RetroModal
      title="SIGNAL LOST"
      showFooter={false}
    >
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        <p className="text-[10px] text-[var(--nes-red)] mb-3">We lost your brain.</p>
        <p className="text-[10px] mb-4">Redirecting in {count}…</p>
        <div className="w-full bg-black border border-[var(--nes-gray)] h-3 relative">
          <div
            className="bg-[var(--nes-red)] h-full transition-all"
            style={{ width: `${((redirectSeconds - count) / Math.max(1, redirectSeconds)) * 100}%` }}
          />
        </div>
      </div>
    </RetroModal>
  );
}

