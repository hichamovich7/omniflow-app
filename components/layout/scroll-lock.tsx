'use client';

import { useEffect } from 'react';

/** The viewport's scrollability is governed by <body>'s overflow, per the CSS
 * overflow-propagation rule — a nested div's overflow-hidden alone doesn't stop
 * the window from scrolling when the wheel event starts outside that div (e.g.
 * over the topbar or sidebar). Lock body/html scroll while the dashboard is mounted
 * so only the flex-1 content pane scrolls, and restore it on unmount for other routes. */
export function ScrollLock() {
  useEffect(() => {
    const { documentElement, body } = document;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      documentElement.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return null;
}
