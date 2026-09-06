import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { InstallPrompt } from '@/components/InstallPrompt';

// Addendum 2C: "a single clean sans-serif (Inter or system font stack)" --
// replaces the earlier IBM Plex Sans/Mono pairing. Prices use Tailwind's
// tabular-nums utility rather than a separate monospace face, per Section C.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pulse',
  description:
    'Pulse remembers what you own, what you\u2019re waiting for, and what you care about — then watches the real market and tells you when something meaningful changes.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pulse',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0F0E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // required for safe-area-inset-* to resolve on iOS
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink-900 font-sans text-ink-100 antialiased">
        {children}
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
