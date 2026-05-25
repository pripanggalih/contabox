import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'web'),
  // Pages serves under /contabox/. Use relative asset URLs so the same build
  // works whether GitHub Pages is on the user/org root or under a project
  // subpath. Avoids /assets/index-*.css 404s on project pages.
  base: './',
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
