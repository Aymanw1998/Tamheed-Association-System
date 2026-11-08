import React, { useEffect, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import './ConfirmContext.css';
import { setGlobalAsk, setGlobalCancel } from './confirmBus';
import { subscribeDemo } from '../../journey/demoMode';

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const resolverRef = useRef(null);
  const [state, setState] = useState({
    open: false,
    options: {
      title: 'تأكيد العملية',
      message: 'هل تريد تنفيذ هذه العملية؟',
      confirmText: 'تأكيد',
      cancelText: 'إلغاء',
      danger: false,
    },
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      // A newer question replaces an unanswered one, which counts as cancelled.
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = resolve;
      setState((s) => ({
        open: true,
        options: { ...s.options, ...options },
      }));
    });
  }, []);

  const close = useCallback((answer) => {
    if (resolverRef.current) resolverRef.current(!!answer);
    resolverRef.current = null;
    setState((s) => (s.open ? { ...s, open: false } : s));
  }, []);

  // Training mode starting or stopping (the journey paused or ended) cancels an
  // open dialog: its focused confirm button must never act on the other mode's
  // data. cancelOpenConfirm() (confirmBus) does the same on demand.
  useEffect(() => {
    setGlobalCancel(() => close(false));
    const unsubscribe = subscribeDemo(() => close(false));
    return () => {
      unsubscribe();
      setGlobalCancel(null);
    };
  }, [close]);

  // ملاحظة عربية
  useEffect(() => {
    setGlobalAsk((opts) => confirm(opts));
    return () => setGlobalAsk(null);
  }, [confirm]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmCtx.Provider value={value}>
      {children}

      {state.open && (
        <div className="c-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(false); } }}>
          <div className={`c-dialog ${state.options.danger ? "c-dialog-danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="c-dialog-title" aria-describedby="c-dialog-message">
            <div className="c-header">
              <h3 id="c-dialog-title">{state.options.title}</h3>
            </div>
            <div className="c-body">
              <p id="c-dialog-message">{state.options.message}</p>
            </div>
            <div className="c-actions">
              <button className="c-btn" data-confirm="cancel" data-tour="confirm-cancel" onClick={() => close(false)}>
                {state.options.cancelText} {/* cancelled*/}
              </button>
              {/* The confirm button's color follows the action (danger for a delete), not its text. */}
              <button
                className={`c-btn ${state.options.danger ? "c-btn-danger" : "c-btn-primary"}`}
                data-tour="confirm-ok"
                onClick={() => close(true)}
                autoFocus
              >
                {state.options.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}
