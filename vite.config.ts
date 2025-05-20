import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Read the actual version from the project's package.json
const projectPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// Plugin metadata
const packageJson = {
  name: "logseq-super-sync",
  version: projectPackageJson.version,
  main: "index.html",
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
      name: 'LSPlugin',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        globals: {
          '@logseq/libs': 'logseq',
        },
        inlineDynamicImports: true,
        extend: true,
        esModule: false
      },
    },
  },
  plugins: [
    {
      name: 'generate-assets',
      writeBundle: async () => {
        fs.writeFileSync(
          resolve(__dirname, 'dist/package.json'),
          JSON.stringify(packageJson, null, 2)
        );

        ['index.html', 'README.md', 'icon.png'].forEach(file => {
          if (fs.existsSync(`./${file}`)) {
            fs.copyFileSync(
              `./${file}`,
              resolve(__dirname, `dist/${file}`)
            );
          }
        });
      },
    },
  ],
});
