import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

function priceProxyDev(): PluginOption {
  return {
    name: 'price-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/price', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const ticker = url.searchParams.get('ticker')
          if (!ticker) { res.statusCode = 400; res.end('missing ticker'); return }
          const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']
          const INTERVALS = ['1d', '1wk', '1mo']
          const range = RANGES.includes(url.searchParams.get('range') ?? '') ? url.searchParams.get('range') : '1d'
          const interval = INTERVALS.includes(url.searchParams.get('interval') ?? '') ? url.searchParams.get('interval') : '1d'
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } },
          )
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=60')
          res.statusCode = r.ok ? 200 : 502
          res.end(await r.text())
        } catch { res.statusCode = 502; res.end(JSON.stringify({ error: 'upstream error' })) }
      })
    },
  }
}

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
          const closes: number[] = result?.indicators?.quote?.[0]?.close ?? []
          const validCloses = closes.filter((c: number) => typeof c === 'number' && c > 0)
          const firstClose = validCloses.length > 0 ? validCloses[0] : 0
          const avg3yGrowth = (price && firstClose > 0)
            ? Math.round((Math.pow(price / firstClose, 1 / 3) - 1) * 10000) / 100
            : null
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.statusCode = 200
          res.end(JSON.stringify({
            ticker,
            name: result?.meta?.longName ?? result?.meta?.shortName ?? ticker,
            price: Math.round(price * 100) / 100,
            ttmDividend: Math.round(ttm * 100) / 100,
            ttmYield: price > 0 ? Math.round((ttm / price) * 10000) / 100 : null,
            avg3yDividend: Math.round(avg3y * 100) / 100,
            avg3yYield: price > 0 ? Math.round((avg3y / price) * 10000) / 100 : null,
            avg3yGrowth,
            count3y: amounts.length,
          }))
        } catch { res.statusCode = 502; res.end(JSON.stringify({ error: 'upstream error' })) }
      })
    },
  }
}

function searchProxyDev(): PluginOption {
  return {
    name: 'search-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/search', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const q = url.searchParams.get('q')
          const krOnly = url.searchParams.get('krOnly') === '1'
          if (!q) { res.statusCode = 400; res.end('missing query'); return }
          const { searchStocks } = await import('./api/_search')
          const results = await searchStocks(q, krOnly)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'public, max-age=300')
          res.statusCode = 200
          res.end(JSON.stringify({ results }))
        } catch { res.statusCode = 502; res.end(JSON.stringify({ error: 'search failed' })) }
      })
    },
  }
}

export default defineConfig({
  // 빌드 시각 — Settings 하단 버전 표시로 "새 버전이 폰에 적용됐는지" 확인용
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    priceProxyDev(),
    yieldProxyDev(),
    searchProxyDev(),
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
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true, port: 5173, watch: { usePolling: true } },
  build: { outDir: 'dist' },
})
