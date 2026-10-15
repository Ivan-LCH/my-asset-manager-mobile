import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPrices, fetchQuotes, fetchStockPrice, fetchStockQuote, quoteErrorLabel, quoteRunSummary } from './stockPrice'

const ok = (price: unknown) => ({ ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: price } }] } }) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('시세 조회 실패 사유 구분', () => {
  it('성공 → {price}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(123.5)))
    expect(await fetchStockQuote('SCHD')).toEqual({ price: 123.5 })
    expect(await fetchStockPrice('SCHD')).toBe(123.5)
  })
  it('HTTP 오류 → http + status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })))
    expect(await fetchStockQuote('SCHD')).toEqual({ error: 'http', status: 502 })
    expect(await fetchStockPrice('SCHD')).toBeNull()
  })
  it('가격 없음 → no_price (0·없음·JSON 아님)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(0)))
    expect(await fetchStockQuote('SCHD')).toEqual({ error: 'no_price' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x') } })))
    expect(await fetchStockQuote('SCHD')).toEqual({ error: 'no_price' })
    expect(await fetchStockQuote('')).toEqual({ error: 'no_price' })
  })
  it('네트워크 오류 → network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await fetchStockQuote('SCHD')).toEqual({ error: 'network' })
  })
  it('시간 초과 → timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    expect(await fetchStockQuote('SCHD', 5)).toEqual({ error: 'timeout' })
  })
  it('fetchQuotes 는 실패도 결과에 남기고, fetchPrices 래퍼는 성공만', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('BAD') ? { ok: false, status: 400 } : ok(10)))
    const items = [{ id: 'a', ticker: 'SCHD' }, { id: 'b', ticker: 'BAD' }]
    expect(await fetchQuotes(items)).toEqual({ a: { price: 10 }, b: { error: 'http', status: 400 } })
    expect(await fetchPrices(items)).toEqual({ a: 10 })
  })
  it('사유 라벨', () => {
    expect(quoteErrorLabel('http', 400)).toBe('티커 형식 오류')
    expect(quoteErrorLabel('http', 502)).toBe('HTTP 502')
    expect(quoteErrorLabel('timeout')).toBe('시간 초과')
    expect(quoteErrorLabel('network')).toBe('네트워크 오류')
    expect(quoteErrorLabel('no_price')).toBe('가격 정보 없음')
  })
  it('갱신 요약: 마지막 시각·실패 건수·사유별 건수 (옛 형식 사유 포함)', () => {
    expect(quoteRunSummary([null, undefined])).toBeNull()
    const s = quoteRunSummary([
      { observedAt: '2026-10-15T01:00:00Z', ok: true },
      { observedAt: '2026-10-15T01:00:02Z', ok: false, error: 'timeout' },
      { observedAt: '2026-10-15T01:00:01Z', ok: false, error: 'timeout' },
      { observedAt: '2026-10-15T00:00:00Z', ok: false, reason: '티커/계좌 입력이 변경되어 재조회 필요' },
      { observedAt: '2026-10-14T00:00:00Z', ok: false, reason: '시세 조회 실패 — 기존 평가액 유지' },
    ])!
    expect(s.lastAt).toBe('2026-10-15T01:00:02Z')
    expect(s.failed).toBe(4)
    expect(s.reasons).toBe('시간 초과 2, 티커/계좌 입력이 변경되어 재조회 필요 1, 시세 조회 실패 1')
  })
})
