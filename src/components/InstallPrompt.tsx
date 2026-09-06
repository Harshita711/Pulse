'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const DISMISSED_KEY = 'pulse_install_prompt_dismissed';
// Only surface this on pages past onboarding -- not on first load, and not
// while someone is still logging in or setting up their first watchlist.
const ELIGIBLE_PREFIXES = ['/dashboard', '/stocks', '/watchlists', '/portfolio', '/settings', '/search'];

function isEligiblePath(pathname: string) {
  return ELIGIBLE_PREFIXES.some((p) => pathname.startsWith(p));
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as any).MSStream;
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosCard, setShowIosCard] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS has no beforeinstallprompt equivalent -- Apple exposes no
    // programmatic install trigger, so show a static instructional card.
    if (isIOS() && !isStandalone()) setShowIosCard(true);

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (dismissed || isStandalone() || !isEligiblePath(pathname ?? '')) return null;
  if (!deferredPrompt && !showIosCard) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  return (
    <div className="fixed inset-x-4 bottom-20 z-30 mx-auto max-w-sm rounded-md border border-ink-600 bg-ink-800 p-4 shadow-lg sm:bottom-6">
      {deferredPrompt ? (
        <>
          <p className="text-sm text-ink-100">Add Pulse to your home screen for one-tap access.</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={install}
              className="rounded bg-signal px-3 py-1.5 text-xs font-medium text-ink-900 hover:opacity-90"
            >
              Add to home screen
            </button>
            <button onClick={dismiss} className="rounded px-3 py-1.5 text-xs text-ink-400">
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-100">
            Add Pulse to your home screen: tap <span className="font-medium">Share</span>, then{' '}
            <span className="font-medium">Add to Home Screen</span>.
          </p>
          <button onClick={dismiss} className="mt-3 rounded px-3 py-1.5 text-xs text-ink-400">
            Got it
          </button>
        </>
      )}
    </div>
  );
}
