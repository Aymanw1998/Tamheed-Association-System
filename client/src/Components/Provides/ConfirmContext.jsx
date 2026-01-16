import React, { useEffect, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import './ConfirmContext.css';
import { setGlobalAsk } from './confirmBus';

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const resolverRef = useRef(null);
  const [state, setState] = useState({
    open: false,
    options: {
      title: 'אישור פעולה',
      message: 'האם לבצע את הפעולה?',
      confirmText: 'אישור',
      cancelText: 'ביטול',
      danger: false,
    },
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
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
    setState((s) => ({ ...s, open: false }));
  }, []);

  // 👇 חיבור ה-bus כאן – מובטח שבתוך ה-Provider
  useEffect(() => {
    setGlobalAsk((opts) => confirm(opts));
    return () => setGlobalAsk(null);
  }, [confirm]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmCtx.Provider value={value}>
      {children}

      {state.open && (
        <div className="c-overlay" role="dialog" aria-modal="true">
          <div className="c-dialog">
            <div className="c-header">
              <h3>{state.options.title}</h3>
            </div>
            <div className="c-body">
              <p>{state.options.message}</p>
            </div>
            <div className="c-actions">
              <button className="c-btn" onClick={() => close(false)}>
                {state.options.cancelText} {/* cancelled*/}
              </button>
              <button
                className={`c-btn`}
                style={{ backgroundColor: state.options.confirmText == "שמור" ? '#d94fd2ff' : (state.options.confirmText == "צור" ? '#09d802ff': (state.options.confirmText == "מחק" ? '#f53615ff': '')), color: 'black' }}
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
