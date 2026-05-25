import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'web'),
  plugins: [tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'public-pages'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'web/index.html'),
    },
  },
});
