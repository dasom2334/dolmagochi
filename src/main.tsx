import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App';
import { initPWA } from './pwa';
import './styles/global.css';

initPWA();
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Analytics />
  </>,
);
