'use client';

import { useEffect, useRef } from 'react';
import type { SnapshotUpdate } from './eventBus';

/**
 * Subscribes to /api/stream for instant per-tick updates. This is purely an
 * enhancement -- callers should keep their existing polling loop running
 * unconditionally as the safety net (Addendum 2 Section B: "real-time is an
 * enhancement, never a dependency"). Native EventSource already auto-retries
 * on transient network errors; the one case that needs explicit handling is
 * a backgrounded mobile tab, where the browser may fully tear down the
 * connection without EventSource noticing until the tab is foregrounded
 * again (Section D5) -- so on visibilitychange we force a reconnect and let
 * the caller re-fetch fresh state rather than trusting missed events to
 * replay.
 */
export function useLiveUpdates(onUpdate: (update: SnapshotUpdate) => void, onReconnect?: () => void) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      es?.close();
      es = new EventSource('/api/stream');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'snapshot') onUpdateRef.current(data as SnapshotUpdate);
        } catch {
          // malformed frame -- ignore, the next tick will correct state anyway
        }
      };
      // No manual retry on generic error: native EventSource already
      // auto-reconnects with backoff. Manual reconnect is reserved for the
      // visibilitychange case below, which EventSource can't detect on its own.
    }

    connect();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        connect();
        onReconnectRef.current?.();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      es?.close();
    };
  }, []);
}
