import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const reactPeerDeps = ['react', 'react-dom', 'react/jsx-runtime'];

/** @type {import('vite').UserConfig} */
const shared = {
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
};

/** @type {import('vite').UserConfig} */
const libConfig = {
  ...shared,
  plugins: [react(), cssInjectedByJsPlugin()],
  build: {
    lib: {
      entry: resolve(rootDir, 'src/index.js'),
      name: 'IxGrid',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: reactPeerDeps,
      output: {
        exports: 'named',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
};

/** @type {import('vite').UserConfig} */
const appConfig = {
  ...shared,
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
  },
};

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return libConfig;
  }
  return appConfig;
});
