import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Plugin to serve index-pwa.html instead of index.html in dev mode
function servePwaHtml(): Plugin {
  return {
    name: 'serve-pwa-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          req.url = '/index-pwa.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    servePwaHtml(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: false, // We use our own manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // Cache sql.js WASM file
        runtimeCaching: [
          {
            urlPattern: /sql-wasm\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sql-wasm-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  define: {
    // Define PWA mode flag
    'import.meta.env.VITE_PWA_MODE': JSON.stringify('true'),
  },
  server: {
    port: 5174, // Different port for PWA dev
  },
  build: {
    outDir: 'dist-pwa',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index-pwa.html',
      },
    },
  },
  optimizeDeps: {
    exclude: ['sql.js'], // sql.js needs special handling for WASM
  },
})
