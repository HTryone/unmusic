import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath, URL } from 'node:url';

// Vite + Vue 3 configuration for Unlock Music
// Migrated from Vue CLI (Webpack) on 2026-07-21
// NOTE: PWA (vite-plugin-pwa) is temporarily disabled — see step 3 migration plan.
// The workbox-build dynamic-require ESM issue will be resolved when PWA is re-added.
export default defineConfig({
  base: './',
  plugins: [
    vue({
      // Vue 2 -> Vue 3 migration: support legacy slot syntax
      script: {
        defineModel: true,
      },
    }),
    // Node polyfills for browser: jimp (album-art resize) needs Buffer + node builtins;
    // ncm.ts also uses Buffer directly. protocolImports keeps ESM workers happy.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
  },
  // WASM support: Vite handles .wasm as ES module by default
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@xhacker/qmcwasm', '@xhacker/kgmwasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          element: ['element-plus'],
          wasm: ['@xhacker/qmcwasm', '@xhacker/kgmwasm'],
        },
      },
    },
  },
  server: {
    port: 8080,
    open: false,
  },
});
