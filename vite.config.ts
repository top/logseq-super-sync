import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Generate minimal icon (1x1 transparent pixel)
const iconData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Plugin metadata
const packageJson = {
  name: "logseq-super-sync",
  version: "0.0.1",
  main: "index.js",
  logseq: {
    id: "logseq-super-sync",
    title: "Logseq Super Sync",
    icon: "icon.png"
  }
};

export default defineConfig({
  build: {
    target: 'es2018',
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['iife'],
      name: 'LogseqSuperSync',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['@logseq/libs'],
      output: {
        globals: {
          '@logseq/libs': 'logseq',
        },
      },
    },
  },
  plugins: [
    {
      name: 'generate-assets',
      writeBundle: async () => {
        // Write package.json
        fs.writeFileSync(
          resolve(__dirname, 'dist/package.json'), 
          JSON.stringify(packageJson, null, 2)
        );
        
        // Write icon
        fs.writeFileSync(
          resolve(__dirname, 'dist/icon.png'),
          Buffer.from(iconData, 'base64')
        );
      },
    },
  ],
});
