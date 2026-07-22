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
              // 注意：Vite 的全局 `define` 不会处理自定义 load 钩子返回的 node_modules
              // 模块（实测仍残留裸 __dirname），因此这里必须自己注入声明。因 define 不
              // 触碰本模块，`var __dirname` 不会被替换成 `var "/"`，不冲突。
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
  // 多个 Node 库（jimp/@jimp、emscripten 的 @xhacker 包）在浏览器无意义的分支里
  // 裸引用 __dirname/__filename。浏览器/Worker 无这两个全局 → ReferenceError，
  // 阻断解密模块图。用 define 在所有代码里把它们替换成安全字面量。
  // 注意：define 做的是标识符文本替换（不影响 `.dirname` 成员访问），因此
  //   `scriptDirectory=__dirname+"/"` → `scriptDirectory="/"+"/"`（合法）。
  define: {
    __dirname: '"/"',
    __filename: '""',
  },
  optimizeDeps: {
    exclude: ['@xhacker/qmcwasm', '@xhacker/kgmwasm'],
    // 依赖预打包（esbuild）阶段同样需要替换，jimp 等被打进 chunk-*.js
    esbuildOptions: {
      define: {
        __dirname: '"/"',
        __filename: '""',
      },
    },
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
    // 开发期 musicex 解密代理：浏览器同源请求 /qq-api，由 vite 转发到 u.y.qq.com。
    // 前端用 X-QQ-Cookie 头传 Cookie（浏览器禁止设 Cookie 头），这里转成真实 Cookie 头。
    proxy: {
      '/qq-api': {
        target: 'https://u.y.qq.com',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const cookie = (req.headers['x-qq-cookie'] as string | undefined) || '';
            if (cookie) proxyReq.setHeader('Cookie', cookie);
            proxyReq.removeHeader('x-qq-cookie');
          });
        },
      },
    },
  },
});
