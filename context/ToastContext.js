'use client';

import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((title, message, type = 'info') => {
    const normalized = type === 'error' ? 'danger' : type;
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, message, type: normalized }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i className={`fa-solid ${t.type === 'success' ? 'fa-circle-check' : t.type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info'}`} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.message}</div>
            </div>
            <button type="button" className="toast-close-btn" onClick={() => remove(t.id)}>&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
