// Vercel serverless function — Yahoo 종목 검색 프록시.
// 앱과 같은 출처(/api/search)에서만 쓰므로 CORS 헤더(ACAO)를 두지 않는다.
// 클라이언트: GET /api/search?q=삼성전자&krOnly=1 → { results: [{ticker,name,exchange,yield,growth}] }
/* eslint-disable @typescript-eslint/no-explicit-any */
import { searchStocks } from './_search.js'
import { validQuery } from './_validate.js'

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'public, max-age=300')
  const raw = req.query?.q
  if (!raw) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'missing query' }))
    return
  }
  const q = validQuery(raw)
  if (!q) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'invalid query' }))
    return
  }
  try {
    const results = await searchStocks(q, req.query?.krOnly === '1')
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ results }))
  } catch {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'search failed' }))
  }
}
