import React, { useEffect, useId, useRef } from 'react';
import '../styles/retro.css';

// Simple retro-styled modal matching arcade theme
export function RetroModal({ title, children, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel, isBusy = false, showFooter = true, confirmVisible = false, confirmDisabled = false, leftActions = null, actionsAlign = 'end' }) {
  const titleId = useId();
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const panelRef = useRef(null);

  // Focus the primary button on open; restore previous focus on close
  useEffect(() => {
    const previous = document.activeElement;
    const target = (confirmRef.current && !confirmRef.current.disabled) ? confirmRef.current : (cancelRef.current || panelRef.current);
    target?.focus?.();
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 1000 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-70" onClick={onCancel}></div>

      {/* Panel */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} className="relative w-[92%] max-w-md border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] p-6 phone-port:p-4 text-white shadow-xl max-h-[92vh] overflow-y-auto">
        {title && (
          <h3 id={titleId} className="text-[var(--nes-yellow)] text-sm mb-4" style={{ fontFamily: 'var(--font-retro)' }}>
            {title}
          </h3>
        )}

        <div className="text-xs leading-relaxed">
          {children}
        </div>

        {showFooter && (
          <div className={`mt-6 flex gap-3 ${actionsAlign === 'center' ? 'justify-center' : 'justify-end'} flex-wrap phone-port:flex-col-reverse phone-port:[&>button]:w-full phone-port:[&>button]:min-h-[44px]`}>
            {leftActions}
            {onCancel && (
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={isBusy}
                className="retro-button border-[var(--nes-gray)] text-white bg-transparent px-4 py-2"
                style={{ fontFamily: 'var(--font-retro)' }}
              >
                {cancelLabel}
              </button>
            )}
            {(confirmVisible || onConfirm) && (
              <button
                ref={confirmRef}
                onClick={onConfirm}
                disabled={isBusy || confirmDisabled || !onConfirm}
                className={
                  (isBusy || confirmDisabled || !onConfirm)
                    ? "retro-button border-[var(--nes-gray)] text-[var(--nes-gray)] bg-transparent px-4 py-2 opacity-60 cursor-not-allowed"
                    : "retro-button border-[var(--nes-yellow)] text-[var(--nes-yellow)] bg-transparent px-4 py-2 hover:bg-[var(--nes-yellow)] hover:text-black"
                }
                style={{ fontFamily: 'var(--font-retro)' }}
              >
                {isBusy ? 'WORKING…' : confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
