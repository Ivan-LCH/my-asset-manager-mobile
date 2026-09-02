// Yahoo 종목 검색 공통 로직 — dev(vite 미들웨어)와 Vercel 서버리스(api/search.ts)가 공유.
// 브라우저 CORS 제약 회피용 프록시의 서버측 핵심부.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SearchResultItem {
  ticker: string
  name: string
  exchange: string
  yield?: number
  growth?: number
}

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (asset-manager-pwa)' } }

/** 3년 차트로 배당률·3년 상승률 계산 */
async function enrich(ticker: string): Promise<{ yield?: number; growth?: number }> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3y&interval=1d&events=div`,
      UA,
    )
    const d = await r.json()
    const result = d?.chart?.result?.[0]
    const price = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose
    const divs = result?.events?.dividends ?? {}
    const amounts = Object.values(divs).map((v: any) => v.amount).filter((a: number) => a > 0)
    const out: { yield?: number; growth?: number } = {}
    if (amounts.length > 0 && price > 0) {
      out.yield = Math.round((amounts.reduce((s: number, a: number) => s + a, 0) / 3 / price) * 10000) / 100
    }
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? []
    const valid = closes.filter((c: number) => c > 0)
    if (valid.length > 0 && price > 0) {
      const years = Math.max(0.5, valid.length / 252)
      out.growth = Math.round((Math.pow(price / valid[0], 1 / years) - 1) * 10000) / 100
    }
    return out
  } catch {
    return {}
  }
}

/** 종목 검색. 결과 없고 티커 형식(005930.KS)이면 차트 API 직접 조회 폴백. */
export async function searchStocks(q: string, krOnly: boolean): Promise<SearchResultItem[]> {
  const sr = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
    UA,
  )
  const sd = await sr.json()
  const quotes = (sd?.quotes ?? []).filter((x: any) => {
    const s: string = x.symbol ?? ''
    if (krOnly) return s.endsWith('.KS') || s.endsWith('.KQ')
    return true
  }).slice(0, 8)

  // 검색 결과 없고 티커 형식이면 직접 조회 폴백
  if (quotes.length === 0 && /^[0-9]{6}\.(KS|KQ)$/i.test(q.toUpperCase())) {
    const t = q.toUpperCase()
    try {
      const cr = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=3y&interval=1d&events=div`,
        UA,
      )
      if (cr.ok) {
        const cd = await cr.json()
        const result = cd?.chart?.result?.[0]
        if (result) {
          const name = result?.meta?.longName ?? result?.meta?.shortName ?? t
          const e = await enrich(t)
          return [{ ticker: t, name, exchange: 'KRX', yield: e.yield, growth: e.growth }]
        }
      }
    } catch { /* 폴백 실패 시 빈 결과 */ }
    return []
  }

  return Promise.all(quotes.map(async (x: any) => {
    const ticker: string = x.symbol
    const e = await enrich(ticker)
    return {
      ticker,
      name: x.longname ?? x.shortname ?? ticker,
      exchange: x.exchange ?? '',
      yield: e.yield,
      growth: e.growth,
    }
  }))
}
