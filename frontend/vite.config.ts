import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// dev 서버에서 /api/price 를 처리(Node가 Yahoo를 직접 fetch → CORS 없음).
// prod(Vercel)에서는 api/price.ts 서버리스 함수가 같은 역할.
function priceProxyDev(): PluginOption {
  return {
    name: 'price-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/price', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const ticker = url.searchParams.get('ticker')
          if (!ticker) { res.statusCode = 400; res.end('missing ticker'); return }
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } },
          )
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.statusCode = r.ok ? 200 : 502
          res.end(await r.text())
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ error: 'upstream error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    priceProxyDev(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'My Asset Manager',
        short_name: '자산관리',
        description: '개인 자산 통합 관리 (폰 로컬 저장 PWA)',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      // dev에서는 SW 비활성(HMR 방해 방지). 검증은 production build/preview로.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,                    // 컨테이너 외부(호스트/폰)에서 접속 허용
    port: 5173,
    watch: { usePolling: true },   // WSL2 + Docker 볼륨 마운트에서 HMR 보장
  },
  build: {
    outDir: 'dist',
  },
})
