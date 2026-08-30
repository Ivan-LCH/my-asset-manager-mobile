// 자동 시세 가져오기 — 같은 출처의 서버리스 함수(/api/price)로 Yahoo 시세 조회.
//
// prod(Vercel)에선 api/price.ts 서버리스 함수가, dev(vite)에선 vite 미들웨어가
// Yahoo 를 서버 측에서 fetch 한다. 같은 출처라 CORS 제약/프록시 설정 불필요(제로 컨피그).

/** 단일 종목 시세 조회. 실패/타임아웃 시 null. */
export async function fetchStockPrice(ticker: string, timeoutMs = 12000): Promise<number | null> {
  if (!ticker) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? meta?.previousClose
    return typeof price === 'number' && price > 0 ? price : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 여러 종목 동시실행 제한 병렬 조회. 성공한 것만 {id: price} 로 반환. */
export async function fetchPrices(
  items: { id: string; ticker: string }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const total = items.length
  let cursor = 0
  let done = 0

  async function worker() {
    while (cursor < items.length) {
      const it = items[cursor++]
      const p = await fetchStockPrice(it.ticker)
      if (p != null) out[it.id] = p
      done++
      onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  return out
}

export interface StockDailyBar { date: string; close: number }

/** 과거 일별 종가 조회 (range: 1mo/3mo/... Yahoo range). 실패 시 null.
 *  timestamp를 거래소 현지 시간대 날짜(KRX=Asia/Seoul 등)로 변환해 'YYYY-MM-DD' 반환. */
export async function fetchStockHistory(
  ticker: string,
  range = '3mo',
  timeoutMs = 15000,
): Promise<StockDailyBar[] | null> {
  if (!ticker) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `/api/price?ticker=${encodeURIComponent(ticker)}&range=${range}&interval=1d`,
      { signal: ctrl.signal },
    )
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const ts: number[] | undefined = result?.timestamp
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close
    if (!Array.isArray(ts) || !Array.isArray(closes)) return null
    const tz: string = result?.meta?.exchangeTimezoneName ?? 'Asia/Seoul'
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const out: StockDailyBar[] = []
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i]
      if (typeof c !== 'number' || !(c > 0)) continue
      out.push({ date: fmt.format(new Date(ts[i] * 1000)), close: c })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
