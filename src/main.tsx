import { createRoot } from 'react-dom/client';

// M1: 로직 전용 마일스톤 — UI는 M2에서 이식된다.
createRoot(document.getElementById('root')!).render(null);
