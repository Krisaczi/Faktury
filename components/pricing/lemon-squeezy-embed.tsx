'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Setup: (config: { eventHandler: (event: { event: string }) => void }) => void;
      Refresh: () => void;
    };
  }
}

interface LemonSqueezyEmbedProps {
  checkoutUrl: string;
}

export function LemonSqueezyEmbed({ checkoutUrl }: LemonSqueezyEmbedProps) {
  useEffect(() => {
    const existingScript = document.getElementById('lemon-squeezy-js');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'lemon-squeezy-js';
      script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
      script.defer = true;
      document.body.appendChild(script);
    }
    return () => {
      const s = document.getElementById('lemon-squeezy-js');
      if (s) s.remove();
    };
  }, []);

  return (
    <a
      href={checkoutUrl}
      className="lemonsqueezy-button inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-200 transition-all duration-200 hover:bg-blue-700 hover:shadow-blue-300 active:scale-[0.98]"
    >
      Activate Professional Plan
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}
