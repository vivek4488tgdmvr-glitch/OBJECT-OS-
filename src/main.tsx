import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import TvApp from './tv/TvApp';
import './styles.css';

/**
 * Fire TV detection: Fire TV's Silk browser / WebView reports "AFT" (Amazon Fire TV) in its user agent.
 * Use ?tv=1 to force the TV UI on any browser (handy for demos and judging), ?tv=0 to force the standard UI.
 */
function isTvMode(): boolean {
  const flag = new URLSearchParams(window.location.search).get('tv');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return /\bAFT[A-Z0-9]*\b|AmazonWebAppPlatform|Fire ?TV/i.test(navigator.userAgent);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isTvMode() ? <TvApp /> : <App />}</React.StrictMode>
);
