'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import DataLoader from '../components/DataLoader';
import { subscribeApiLoading } from '../lib/apiLoadingBridge';

const ApiLoadingContext = createContext({ active: false, label: 'Please wait…' });

export function ApiLoadingProvider({ children }) {
  const [state, setState] = useState({ active: false, label: 'Please wait…', pending: 0 });

  useEffect(() => subscribeApiLoading(setState), []);

  const value = useMemo(
    () => ({ active: state.active, label: state.label, pending: state.pending }),
    [state]
  );

  return (
    <ApiLoadingContext.Provider value={value}>
      {children}
      {state.active ? (
        <div className="api-loading-overlay" role="alert" aria-busy="true" aria-live="assertive">
          <div className="api-loading-overlay__card">
            <DataLoader variant="block" label={state.label || 'Please wait…'} />
          </div>
        </div>
      ) : null}
    </ApiLoadingContext.Provider>
  );
}

export function useApiLoading() {
  return useContext(ApiLoadingContext);
}
