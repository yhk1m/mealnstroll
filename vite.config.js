// © 2026 김용현
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        walk3d: resolve(__dirname, 'walk3d.html')
      }
    }
  }
});
