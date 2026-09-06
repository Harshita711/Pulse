'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal: the app works fine without the shell cache, it just
        // won't feel as instant on a flaky connection.
      });
    }
  }, []);
  return null;
}
