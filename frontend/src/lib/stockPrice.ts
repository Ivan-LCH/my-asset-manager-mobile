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
