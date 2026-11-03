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
        <div className="c-overlay" role="dialog" aria-modal="true">
          <div className="c-dialog">
            <div className="c-header">
              <h3>{state.options.title}</h3>
            </div>
            <div className="c-body">
              <p>{state.options.message}</p>
            </div>
            <div className="c-actions">
              <button className="c-btn" data-confirm="cancel" data-tour="confirm-cancel" onClick={() => close(false)}>
                {state.options.cancelText} {/* cancelled*/}
              </button>
              <button
                className={`c-btn`}
                style={{ backgroundColor: state.options.confirmText == "حفظ" ? '#d94fd2ff' : (state.options.confirmText == "نعم" ? '#09d802ff': (state.options.confirmText == "حذف" ? '#f53615ff': '')), color: 'black' }}
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
