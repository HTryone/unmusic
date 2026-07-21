import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// The @xhacker/* WASM bundles are emscripten MODULARIZE modules that assign the
// factory to a top-level `var XxxCryptoModule = (function(){...})()` with NO ESM
// exports. Under webpack the old project used `exports-loader?XxxCryptoModule`
// so `import XxxCryptoModule from ...` resolved. Vite has no such loader, so we
// intercept the module via `load`, read the raw CJS source, append a real
// `export default XxxCryptoModule`, and neutralise the node-only `require()`
// calls (they live inside the `ENVIRONMENT_IS_NODE` branch and never run in a
// browser, but esbuild would otherwise try to resolve "path"/"fs").
function emscriptenExports(): Plugin {
  const targets: Array<{ re: RegExp; varName: string; file: string }> = [
    { re: /@xhacker[\\/]qmcwasm[\\/]QmcWasmBundle(?:\.js)?(\?.*)?$/, varName: 'QmcCryptoModule', file: '@xhacker/qmcwasm/QmcWasmBundle.js' },
    { re: /@xhacker[\\/]kgmwasm[\\/]KgmWasmBundle(?:\.js)?(\?.*)?$/, varName: 'KgmCryptoModule', file: '@xhacker/kgmwasm/KgmWasmBundle.js' },
  ];
      return {
        name: 'unlock-music:emscripten-exports',
        load(id) {
          for (const t of targets) {
            if (t.re.test(id)) {
              const abs = resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules', t.file);
              let code = readFileSync(abs, 'utf-8');
              code = code
                // The node-only `require()` calls live inside the `ENVIRONMENT_IS_NODE`
                // branch which never runs in a browser/worker. Replace them with a
                // harmless object so the surrounding `.dirname(...)` / `.readFileSync(...)`
                // member accesses stay syntactically valid (a bare `0` would make
                // `0.dirname` an illegal "identifier after number").
                .replace(/require\("path"\)/g, '({})')
                .replace(/require\("fs"\)/g, '({})')
                // Force ENVIRONMENT_IS_NODE to false regardless of whether a `process`
                // polyfill is present, so the bundle always takes the web/worker path.
                .replace(/typeof process\.versions\.node==="string"/g, 'false');
              // 浏览器/Worker 环境没有 __dirname/__filename。它们只出现在 emscripten
              // 的脚本目录探测里，且所在分支在 ENVIRONMENT_IS_NODE 为 false 时不会真正
              // 执行；显式声明为安全字面量，避免裸引用抛 ReferenceError。
              const shim = 'var __dirname = "/";\nvar __filename = ".";\n';
              return { code: `${shim}${code}\nexport default ${t.varName};\n`, map: null };
            }
          }
          return null;
        },
      };
}

// Vite + Vue 3 configuration for Unlock Music
// Migrated from Vue CLI (Webpack) on 2026-07-21
export default defineConfig({
  base: './',
  plugins: [
    emscriptenExports(),
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
    // PWA (re-enabled in step 3). registerType autoUpdate mirrors the old
    // register-service-worker + workbox config from vue-cli-plugin-pwa.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '音乐解锁',
        short_name: '音乐解锁',
        theme_color: '#4DBA87',
        background_color: '#000000',
        display: 'standalone',
        start_url: './index.html',
        description: '在任何设备上解锁已购的加密音乐！',
        icons: [
          {
            src: './img/icons/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: './img/icons/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // WASM and worker bundles are large; raise the precache size ceiling.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: [
        './img/icons/android-chrome-192x192.png',
        './img/icons/android-chrome-512x512.png',
        './img/icons/safari-pinned-tab.svg',
        './img/icons/favicon-32x32.png',
        './img/icons/favicon-16x16.png',
        './img/icons/apple-touch-icon-152x152.png',
        './img/icons/msapplication-icon-144x144.png',
      ],
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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus') || id.includes('@element-plus')) {
              return 'element';
            }
            if (id.includes('@xhacker')) {
              return 'wasm';
            }
            if (id.includes('crypto-js')) {
              return 'crypto';
            }
            if (id.includes('music-metadata')) {
              return 'metadata';
            }
            if (id.includes('jimp') || id.includes('pngjs') || id.includes('phin')) {
              return 'jimp';
            }
          }
        },
      },
    },
  },
  server: {
    port: 8080,
    open: false,
  },
});
