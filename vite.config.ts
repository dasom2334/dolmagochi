/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 프로젝트 페이지: dasom2334.github.io/dolmagochi/
  base: '/dolmagochi/',
  plugins: [
    react(),
    VitePWA({
      // 갱신 타이밍을 앱이 직접 제어(src/pwa.ts) — 새로 열면 조용히 자동 반영,
      // 이미 열어둔 채면 화면 안 끊고 배너로 알린다.
      registerType: 'prompt',
      injectRegister: false, // 자동 주입 대신 main.tsx에서 initPWA()로 등록
      includeAssets: ['icons/apple-touch-icon-180.png'],
      // 기본 globPatterns엔 woff2가 빠져 폰트가 프리캐시 안 됨 → 오프라인 폰트를 위해 추가
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
      manifest: {
        name: '돌 키우기 뽀모도로',
        short_name: '돌뽀모도로',
        description: '집중용 Flowtime 타이머 + 돌 육성 웹게임',
        lang: 'ko',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#262031',
        background_color: '#262031',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
