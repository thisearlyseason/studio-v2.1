'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { MessageCircle } from 'lucide-react';
import { shouldUseNativeChatFallback } from '@/lib/landing-chat-support';

const APP_CLASS = 'elfsight-app-4f8f60bc-5748-46cb-914c-1b03d7c8826e';

export function LandingChatbot() {
  const [mode, setMode] = useState<'pending' | 'choice' | 'elfsight' | 'fallback'>('pending');

  useEffect(() => {
    setMode(shouldUseNativeChatFallback(navigator.userAgent) ? 'fallback' : 'choice');

    return () => {
      // Elfsight mounts parts of the widget directly under <body>, outside the
      // landing-page React tree. Remove those portals when client navigation
      // leaves `/` so the chatbot cannot persist into authenticated screens.
      document.querySelectorAll([
        `.${APP_CLASS}`,
        '[class*="eapps-widget"]',
        '[id^="eapps-"]',
        'iframe[src*="elfsight"]',
      ].join(',')).forEach(element => element.remove());
    };
  }, []);

  if (mode === 'pending') return null;

  if (mode === 'fallback') {
    return (
      <a
        href="mailto:team@thesquad.pro?subject=The%20Squad%20Support"
        aria-label="Contact The Squad support"
        title="Contact The Squad support"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <MessageCircle aria-hidden="true" className="h-6 w-6" />
      </a>
    );
  }

  if (mode === 'choice') return (
    <aside aria-label="Support options" className="fixed bottom-5 right-5 z-50 max-w-xs rounded-2xl border bg-white p-4 text-black shadow-xl">
      <p className="font-bold">Need help?</p>
      <p className="mt-2 text-sm">Optional chat is provided by Elfsight. Enabling it shares your connection details and chat messages with that provider. Avoid sending private player or payment information.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="rounded-lg bg-black px-3 py-2 text-white focus-visible:ring-4 focus-visible:ring-primary" onClick={() => setMode('elfsight')}>Enable chat</button>
        <button type="button" className="rounded-lg border px-3 py-2 focus-visible:ring-4 focus-visible:ring-primary" onClick={() => setMode('fallback')}>Use email instead</button>
      </div>
      <a className="mt-2 inline-block text-sm underline" href="/cookies">Cookies and privacy choices</a>
    </aside>
  );

  return (
    <>
      <button type="button" className="fixed bottom-24 right-5 z-60 rounded-lg border bg-white px-3 py-2 text-sm text-black" onClick={() => window.location.reload()}>Stop chat and reload</button>
      <Script id="elfsight-squad-chatbot" src="https://elfsightcdn.com/platform.js" strategy="afterInteractive" />
      <div className={APP_CLASS} />
    </>
  );
}
