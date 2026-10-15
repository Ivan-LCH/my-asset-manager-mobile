// 자동 시세 가져오기 — 같은 출처의 서버리스 함수(/api/price)로 Yahoo 시세 조회.
//
// prod(Vercel)에선 api/price.ts 서버리스 함수가, dev(vite)에선 vite 미들웨어가
// Yahoo 를 서버 측에서 fetch 한다. 같은 출처라 CORS 제약/프록시 설정 불필요(제로 컨피그).

export type QuoteError = 'http' | 'timeout' | 'network' | 'no_price'
export type QuoteResult = { price: number } | { error: QuoteError; status?: number }

/** 실패 사유 → 짧은 한국어 라벨 (UI·quote-status 사유에 사용). */
export function quoteErrorLabel(error: QuoteError | string | undefined, status?: number): string {
  switch (error) {
    case 'http': return status === 400 ? '티커 형식 오류' : `HTTP ${status ?? '오류'}`
    case 'timeout': return '시간 초과'
    case 'network': return '네트워크 오류'
    case 'no_price': return '가격 정보 없음'
    default: return '조회 실패'
  }
}

/** 단일 종목 시세 조회 — 성공 {price}, 실패 {error, status?} 로 사유를 구분한다. */
export async function fetchStockQuote(ticker: string, timeoutMs = 12000): Promise<QuoteResult> {
  if (!ticker) return { error: 'no_price' }
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  try {
    const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`, { signal: ctrl.signal })
    if (!res.ok) return { error: 'http', status: res.status }
    let data: { chart?: { result?: { meta?: { regularMarketPrice?: unknown; previousClose?: unknown } }[] } }
    try { data = await res.json() } catch { return timedOut ? { error: 'timeout' } : { error: 'no_price' } }
    const meta = data?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice ?? meta?.previousClose
    return typeof price === 'number' && price > 0 ? { price } : { error: 'no_price' }
  } catch {
    return { error: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** 기존 호출자용 래퍼. 실패/타임아웃 시 null. */
export async function fetchStockPrice(ticker: string, timeoutMs = 12000): Promise<number | null> {
  const r = await fetchStockQuote(ticker, timeoutMs)
  return 'price' in r ? r.price : null
}

/** 여러 종목 동시실행 제한 병렬 조회. 모든 항목의 결과(성공·실패 사유)를 {id: result} 로 반환. */
export async function fetchQuotes(
  items: { id: string; ticker: string }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<Record<string, QuoteResult>> {
  const out: Record<string, QuoteResult> = {}
  const total = items.length
  let cursor = 0
  let done = 0

  async function worker() {
    while (cursor < items.length) {
      const it = items[cursor++]
      out[it.id] = await fetchStockQuote(it.ticker)
      done++
      onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  return out
}

/** 기존 호출자용 래퍼. 성공한 것만 {id: price} 로 반환. */
export async function fetchPrices(
  items: { id: string; ticker: string }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<Record<string, number>> {
  const results = await fetchQuotes(items, onProgress, concurrency)
  const out: Record<string, number> = {}
  for (const [id, r] of Object.entries(results)) if ('price' in r) out[id] = r.price
  return out
}

/** 저장된 quote-status 하나 (db.applyQuoteObservation 이 기록). */
export interface QuoteStatus { observedAt: string; ok: boolean; reason?: string; error?: string; status?: number }

/** 종목별 quote-status → "마지막 갱신 시각 · 현재 실패 N건 (사유별 건수)" 요약. 상태가 없으면 null. */
export function quoteRunSummary(statuses: (QuoteStatus | null | undefined)[]): { lastAt: string; failed: number; reasons: string } | null {
  const list = statuses.filter((s): s is QuoteStatus => !!s && typeof s.observedAt === 'string')
  if (!list.length) return null
  const times = list.map(s => s.observedAt).sort(), lastAt = times[times.length - 1]
  const counts = new Map<string, number>()
  for (const s of list) {
    if (s.ok) continue
    const label = s.error ? quoteErrorLabel(s.error, s.status) : (s.reason?.split(' — ')[0] || '조회 실패')
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const failed = [...counts.values()].reduce((a, b) => a + b, 0)
  return { lastAt, failed, reasons: [...counts].map(([k, n]) => `${k} ${n}`).join(', ') }
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
      const parts = Object.fromEntries(fmt.formatToParts(new Date(ts[i] * 1000)).map(p => [p.type, p.value]))
      out.push({ date: `${parts.year}-${parts.month}-${parts.day}`, close: c })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
