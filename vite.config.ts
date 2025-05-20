import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Read the actual version from the project's package.json
const projectPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// Plugin metadata
const packageJson = {
  name: "logseq-super-sync",
  version: projectPackageJson.version,
  main: "dist/index.html",
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

        // Copy icon.png file from project directory to dist
        if (fs.existsSync('./icon.png')) {
          fs.copyFileSync(
            './icon.png',
            resolve(__dirname, 'dist/icon.png')
          );
        } else {
          console.warn('Warning: icon.png not found in project directory');
        }
      },
    },
  ],
});
