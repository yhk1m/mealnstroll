// © 2026 김용현
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: true },
  build: { target: 'es2020' }
});
