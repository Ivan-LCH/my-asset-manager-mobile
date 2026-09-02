// Vercel serverless function — Yahoo 종목 검색 프록시.
// 앱과 같은 출처(/api/search)라 브라우저 CORS 제약이 없다.
// 클라이언트: GET /api/search?q=삼성전자&krOnly=1 → { results: [{ticker,name,exchange,yield,growth}] }
/* eslint-disable @typescript-eslint/no-explicit-any */
import { searchStocks } from './_search'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=300')
  const q = req.query?.q
  if (!q) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'missing query' }))
    return
  }
  try {
    const results = await searchStocks(String(q), req.query?.krOnly === '1')
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ results }))
  } catch {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'search failed' }))
  }
}
