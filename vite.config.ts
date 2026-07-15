/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 프로젝트 페이지: dasom2334.github.io/dolmagochi/
  base: '/dolmagochi/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
