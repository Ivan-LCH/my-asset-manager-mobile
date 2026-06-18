// Vercel serverless function — Yahoo Finance 시세 프록시.
// 앱과 같은 출처(/api/price)라 브라우저 CORS 제약이 없다.
// 클라이언트: GET /api/price?ticker=005930.KS → Yahoo chart JSON 그대로 반환.
// (Vercel 이 api/ 디렉토리의 .ts 를 자동으로 서버리스 함수로 컴파일·배포한다.)
import type { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage & { query?: Record<string, string> }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=60')

  const ticker = req.query?.ticker
  if (!ticker) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'missing ticker' }))
    return
  }

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } },
    )
    const text = await r.text()
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = r.ok ? 200 : 502
    res.end(text)
  } catch {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'upstream error' }))
  }
}
