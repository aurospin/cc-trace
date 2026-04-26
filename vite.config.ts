import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: {
    outDir: path.resolve(__dirname, 'dist/frontend'),
    emptyOutDir: true,
    // Inline all fonts so the static HTML report is fully self-contained.
    // 200kb covers Newsreader + JetBrains Mono woff2 weights; PNGs/larger
    // assets would still be emitted as separate files.
    assetsInlineLimit: 200 * 1024,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
