import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@bg': resolve(__dirname, 'src/background'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Sourcemaps in dev only. Public AMO releases ship without them so the
    // signed XPI is smaller and original module structure isn't shipped to
    // every user.
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'firefox115',
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, 'src/sidebar/index.html'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        'content-autofill': resolve(__dirname, 'src/content/autofill.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content-autofill') return 'content/autofill.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Content scripts cannot use ES module imports inside Firefox's content
        // script context — bundle each entry as a self-contained IIFE so the
        // generated file works when loaded via `content_scripts`.
        manualChunks: undefined,
        inlineDynamicImports: false,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
