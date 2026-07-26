// Vercel serverless function — 배당수익률 산정(3년 배당이력 기준).
// GET /api/yield?ticker=SCHD → { price, ttmDividend, ttmYield, avg3yDividend, avg3yYield, count3y }
// Yahoo chart events=div 로 3년 배당 내역 + 현재가로 TTM/3년평균 수익률 계산.
/* eslint-disable @typescript-eslint/no-explicit-any */

function round2(n: number) { return Math.round(n * 100) / 100 }
function pct(div: number, price: number) { return price > 0 ? round2((div / price) * 100) : null }

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=3600') // 배당률은 천천히 변함

  const ticker = req.query?.ticker
  if (!ticker) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'missing ticker' }))
    return
  }

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3y&interval=1d&events=div`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } },
    )
    const data = await r.json()
    const result = data?.chart?.result?.[0]
    const meta = result?.meta
    const price = meta?.regularMarketPrice ?? meta?.previousClose
    const divs: Record<string, any> = result?.events?.dividends ?? {}
    const entries = Object.entries(divs) as [string, { amount: number }][]

    const amounts = entries.map(([, v]) => v.amount).filter((a) => typeof a === 'number' && a > 0)
    const total3y = amounts.reduce((s, a) => s + a, 0)
    const avg3y = amounts.length > 0 ? total3y / 3 : 0

    // TTM(최근 12개월) 합
    const ts = entries.map(([t]) => Number(t))
    const latest = ts.length > 0 ? Math.max(...ts) : 0
    const ttm = entries
      .filter(([t]) => Number(t) > latest - 365 * 24 * 3600)
      .reduce((s, [, v]) => s + (v.amount || 0), 0)

    // 3년 주가상승률 — 종가 배열에서 첫값 vs 현재가
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? []
    const validCloses = closes.filter((c) => typeof c === 'number' && c > 0)
    const firstClose = validCloses.length > 0 ? validCloses[0] : 0
    const avg3yGrowth = (price && firstClose > 0)
      ? Math.round((Math.pow(price / firstClose, 1 / 3) - 1) * 10000) / 100  // 연평균 복리 상승률(%)
      : null

    res.setHeader('Content-Type', 'application/json')
    if (!r.ok || !price) { res.statusCode = 502; res.end(JSON.stringify({ error: 'no data' })); return }
    res.statusCode = 200
    res.end(JSON.stringify({
      ticker,
      name: meta?.longName ?? meta?.shortName ?? ticker,
      price: round2(price),
      ttmDividend: round2(ttm),
      ttmYield: pct(ttm, price),
      avg3yDividend: round2(avg3y),
      avg3yYield: pct(avg3y, price),
      avg3yGrowth,
      count3y: amounts.length,
    }))
  } catch {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'upstream error' }))
  }
}
