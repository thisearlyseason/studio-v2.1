'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { MessageCircle } from 'lucide-react';
import { shouldUseNativeChatFallback } from '@/lib/landing-chat-support';

const APP_CLASS = 'elfsight-app-4f8f60bc-5748-46cb-914c-1b03d7c8826e';

export function LandingChatbot() {
  const [mode, setMode] = useState<'pending' | 'elfsight' | 'fallback'>('pending');

  useEffect(() => {
    setMode(shouldUseNativeChatFallback(navigator.userAgent) ? 'fallback' : 'elfsight');

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

  return (
    <>
      <Script id="elfsight-squad-chatbot" src="https://elfsightcdn.com/platform.js" strategy="afterInteractive" />
      <div className={APP_CLASS} />
    </>
  );
}
