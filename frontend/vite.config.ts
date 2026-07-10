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

// dev 서버에서 /api/yield 처리(3년 배당이력 → 수익률). prod는 api/yield.ts 서버리스.
function yieldProxyDev(): PluginOption {
  return {
    name: 'yield-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/yield', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const ticker = url.searchParams.get('ticker')
          if (!ticker) { res.statusCode = 400; res.end('missing ticker'); return }
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3y&interval=1d&events=div`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } },
          )
          const data = await r.json()
          const result = data?.chart?.result?.[0]
          const price = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose
          const divs = result?.events?.dividends ?? {}
          const entries = Object.entries(divs) as [string, { amount: number }][]
          const amounts = entries.map(([, v]) => v.amount).filter((a) => typeof a === 'number' && a > 0)
          const total3y = amounts.reduce((s, a) => s + a, 0)
          const avg3y = total3y / 3
          const ts = entries.map(([t]) => Number(t))
          const latest = ts.length > 0 ? Math.max(...ts) : 0
          const ttm = entries.filter(([t]) => Number(t) > latest - 365 * 24 * 3600).reduce((s, [, v]) => s + (v.amount || 0), 0)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.statusCode = 200
          res.end(JSON.stringify({
            ticker,
            price: Math.round(price * 100) / 100,
            ttmDividend: Math.round(ttm * 100) / 100,
            ttmYield: price > 0 ? Math.round((ttm / price) * 10000) / 100 : null,
            avg3yDividend: Math.round(avg3y * 100) / 100,
            avg3yYield: price > 0 ? Math.round((avg3y / price) * 10000) / 100 : null,
            count3y: amounts.length,
          }))
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
    yieldProxyDev(),
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
        orientation: 'any',
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
