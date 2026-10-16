import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyQuoteObservation, beginQuoteRequest, createAsset, db } from './db'
import { evaluateFxReading, fxFailureText, readFxStatus, settingsRate, updateExchangeRates } from './fx'
import type { QuoteResult } from './stockPrice'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
}
const now = () => new Date('2026-10-15T01:00:00Z')

beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

describe('환율 sanity 판정 (순수 함수)', () => {
  it('≤0·NaN 거절', () => {
    expect(evaluateFxReading(0, 1500, null)).toMatchObject({ accept: false, reason: 'invalid' })
    expect(evaluateFxReading(-1, 1500, null)).toMatchObject({ accept: false, reason: 'invalid' })
    expect(evaluateFxReading(NaN, null, null)).toMatchObject({ accept: false, reason: 'invalid' })
  })
  it('저장값 없음 또는 ±15% 이내는 수용', () => {
    expect(evaluateFxReading(1400, null, null)).toEqual({ accept: true, value: 1400, pending: null })
    expect(evaluateFxReading(1725, 1500, null)).toMatchObject({ accept: true })   // +15%
    expect(evaluateFxReading(1275, 1500, null)).toMatchObject({ accept: true })   // -15%
  })
  it('범위 밖은 2회 연속(서로 비슷한 값)일 때만 수용', () => {
    const first = evaluateFxReading(1800, 1500, null, now())
    expect(first).toMatchObject({ accept: false, reason: 'out_of_range', pending: { value: 1800 } })
    const second = evaluateFxReading(1790, 1500, first.pending)
    expect(second).toEqual({ accept: true, value: 1790, pending: null })
  })
  it('범위 밖 값이 서로 크게 다르면 대기값만 교체', () => {
    const first = evaluateFxReading(1800, 1500, null)
    const second = evaluateFxReading(9000, 1500, first.pending)
    expect(second).toMatchObject({ accept: false, pending: { value: 9000 } })
  })
  it('범위 안 값은 대기값을 지운다(연속성 끊김)', () => {
    expect(evaluateFxReading(1510, 1500, { value: 1800, at: '' })).toEqual({ accept: true, value: 1510, pending: null })
  })
  it('settings 값은 문자열이어도 parseFloat, 없으면 FALLBACK_RATES', () => {
    expect(settingsRate({ exchange_rate_USD: '1508.85' }, 'USD')).toBe(1508.85)
    expect(settingsRate({ exchange_rate_USD: 1400 }, 'USD')).toBe(1400)
    expect(settingsRate({}, 'USD')).toBe(1450)
    expect(settingsRate({ exchange_rate_USD: 'x' }, 'USD')).toBe(1450)
    expect(settingsRate(undefined, 'JPY')).toBe(9.5)
    expect(settingsRate({}, 'KRW')).toBe(1)
  })
})

describe('updateExchangeRates (모의 /api/price)', () => {
  const quotes = (map: Record<string, QuoteResult>) => async (t: string) => map[t] ?? { error: 'no_price' as const }

  it('KRW=X 로 USD 갱신 + updatedAt 기록', async () => {
    await db.settings.put({ key: 'exchange_rate_USD', value: '1508.85' })
    const asked: string[] = []
    const storage = memoryStorage()
    const r = await updateExchangeRates(['USD'], { fetchQuote: async t => { asked.push(t); return { price: 1420.5 } }, storage, now })
    expect(asked).toEqual(['KRW=X'])
    expect(r[0]).toMatchObject({ currency: 'USD', ok: true, value: 1420.5, previous: 1508.85 })
    expect((await db.settings.get('exchange_rate_USD'))?.value).toBe('1420.5')
    expect((await db.settings.get('exchange_rate_USD_updatedAt'))?.value).toBe('2026-10-15T01:00:00.000Z')
    expect(readFxStatus(storage)?.results[0].ok).toBe(true)
  })

  it('JPY 는 JPYKRW=X', async () => {
    const r = await updateExchangeRates(['USD', 'JPY'], { fetchQuote: quotes({ 'KRW=X': { price: 1400 }, 'JPYKRW=X': { price: 9.3 } }), storage: memoryStorage(), now })
    expect(r.map(x => [x.currency, x.value])).toEqual([['USD', 1400], ['JPY', 9.3]])
  })

  it('실패 시 기존 값 유지 + "환율 갱신 실패 · 기존 X (날짜)"', async () => {
    await db.settings.bulkPut([{ key: 'exchange_rate_USD', value: '1508.85' }, { key: 'exchange_rate_USD_updatedAt', value: '2026-10-01T00:00:00.000Z' }])
    const r = await updateExchangeRates(['USD'], { fetchQuote: quotes({ 'KRW=X': { error: 'timeout' } }), storage: memoryStorage(), now })
    expect(r[0].ok).toBe(false)
    expect((await db.settings.get('exchange_rate_USD'))?.value).toBe('1508.85')
    expect(fxFailureText(r[0])).toBe('환율 갱신 실패 · 기존 1,508.85 (2026-10-01) · 시간 초과')
  })

  it('±15% 밖 값은 1회째 거절(대기 저장), 2회 연속이면 반영', async () => {
    await db.settings.put({ key: 'exchange_rate_USD', value: '1200' })
    const storage = memoryStorage(), fetchQuote = quotes({ 'KRW=X': { price: 1500 } })
    const first = await updateExchangeRates(['USD'], { fetchQuote, storage, now })
    expect(first[0].ok).toBe(false)
    expect(first[0].reason).toContain('±15%')
    expect((await db.settings.get('exchange_rate_USD'))?.value).toBe('1200')
    expect(JSON.parse(storage.getItem('fx_pending_USD')!).value).toBe(1500)
    const second = await updateExchangeRates(['USD'], { fetchQuote, storage, now })
    expect(second[0]).toMatchObject({ ok: true, value: 1500 })
    expect((await db.settings.get('exchange_rate_USD'))?.value).toBe('1500')
    expect(storage.getItem('fx_pending_USD')).toBeNull()
  })

  it('0 이하 응답은 반영하지 않음', async () => {
    await db.settings.put({ key: 'exchange_rate_USD', value: '1500' })
    const r = await updateExchangeRates(['USD'], { fetchQuote: async () => ({ price: -5 }), storage: memoryStorage(), now })
    expect(r[0]).toMatchObject({ ok: false, reason: '비정상 값' })
    expect((await db.settings.get('exchange_rate_USD'))?.value).toBe('1500')
  })
})

describe('시세 실패 사유를 quote-status 에 저장', () => {
  it('error/status/라벨이 남고 기존 평가액 유지', async () => {
    const id = await createAsset({ type: 'STOCK', name: 'SYN', acquisitionDate: '2026-06-01', acquisitionPrice: 100, quantity: 10, detail: { accountName: 'T', ticker: 'SCHD', currency: 'KRW', isPensionLike: false } })
    const before = (await db.assets.get(id))!.currentValue
    await beginQuoteRequest([id], 'r1')
    expect(await applyQuoteObservation(id, 'SCHD', null, '2026-10-15', 'r1', { error: 'http', status: 502, label: 'HTTP 502' })).toBe(false)
    const status = JSON.parse((await db.settings.get('quote-status:' + id))!.value)
    expect(status).toMatchObject({ ok: false, error: 'http', status: 502 })
    expect(status.reason).toBe('시세 조회 실패 (HTTP 502) — 기존 평가액 유지')
    expect((await db.assets.get(id))!.currentValue).toBe(before)
  })
})
