import React from 'react';
import '../styles/retro.css';

// Simple retro-styled modal matching arcade theme
export function RetroModal({ title, children, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel, isBusy = false, showFooter = true, confirmVisible = false, confirmDisabled = false, leftActions = null }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 1000 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-70" onClick={onCancel}></div>

      {/* Panel */}
      <div className="relative w-[92%] max-w-md border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] p-6 phone-port:p-4 text-white shadow-xl max-h-[92vh] overflow-y-auto">
        {title && (
          <h3 className="text-[var(--nes-yellow)] text-sm mb-4" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            {title}
          </h3>
        )}

        <div className="text-xs leading-relaxed">
          {children}
        </div>

        {showFooter && (
          <div className="mt-6 flex gap-3 justify-end flex-wrap phone-port:flex-col-reverse phone-port:[&>button]:w-full phone-port:[&>button]:min-h-[44px]">
            {leftActions}
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={isBusy}
                className="retro-button border-[var(--nes-gray)] text-white bg-transparent px-4 py-2"
                style={{ fontFamily: "'Press Start 2P', cursive" }}
              >
                {cancelLabel}
              </button>
            )}
            {(confirmVisible || onConfirm) && (
              <button
                onClick={onConfirm}
                disabled={isBusy || confirmDisabled || !onConfirm}
                className={
                  (isBusy || confirmDisabled || !onConfirm)
                    ? "retro-button border-[var(--nes-gray)] text-[var(--nes-gray)] bg-transparent px-4 py-2 opacity-60 cursor-not-allowed"
                    : "retro-button border-[var(--nes-yellow)] text-[var(--nes-yellow)] bg-transparent px-4 py-2 hover:bg-[var(--nes-yellow)] hover:text-black"
                }
                style={{ fontFamily: "'Press Start 2P', cursive" }}
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
