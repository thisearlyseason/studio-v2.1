'use client';

import { useEffect } from 'react';
import Script from 'next/script';

const APP_CLASS = 'elfsight-app-4f8f60bc-5748-46cb-914c-1b03d7c8826e';

export function LandingChatbot() {
  useEffect(() => {
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

  return (
    <>
      <Script id="elfsight-squad-chatbot" src="https://elfsightcdn.com/platform.js" strategy="afterInteractive" />
      <div className={APP_CLASS} data-elfsight-app-lazy />
    </>
  );
}

