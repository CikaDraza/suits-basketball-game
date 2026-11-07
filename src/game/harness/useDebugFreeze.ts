import { useEffect, useState } from 'react';

/** Preserve the existing screenshot harness contract without polling the whole game store. */
export function useDebugFreeze(): boolean {
  const [frozen, setFrozen] = useState(() => window.__PAUSED__ === true);

  useEffect(() => {
    const timer = window.setInterval(() => setFrozen(window.__PAUSED__ === true), 100);
    return () => window.clearInterval(timer);
  }, []);

  return frozen;
}
