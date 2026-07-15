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
      registerType: 'autoUpdate', // 새 버전은 다음 열림에 자동 반영(화면 안 끊음)
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
