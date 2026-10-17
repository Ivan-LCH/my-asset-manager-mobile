// 4단계 db.ts 분리 — 이전까지 직접 테스트가 없던 저장 경로 고정 (분리 전 동작 기준)
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db, createAsset, deleteAsset, addHistory, deleteHistory, getAssetById, addDividend, getDividends, removeDividend,
  updateDividendSettings, renameStockAccount, getStockAccountOwnership, saveStockAccountOwnership, getDividendSummary,
} from '@/lib/db'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const stock = (name: string, accountName: string, extra: Record<string, unknown> = {}) => createAsset({
  type: 'STOCK', name, acquisitionDate: '2024-01-01', acquisitionPrice: 1000, quantity: 10,
  detail: { accountName, currency: 'KRW', isPensionLike: false, ...extra },
})

describe('renameStockAccount', () => {
  it('종목 accountName · 연금 linkedStockId · 계좌 명의 키를 함께 바꾼다', async () => {
    const a = await stock('A', '키움'), b = await stock('B', 'NH')
    const p = await createAsset({ type: 'PENSION', name: 'IRP 래퍼', acquisitionDate: '2024-01-01', acquisitionPrice: 0, detail: { linkedStockId: '키움' } })
    await saveStockAccountOwnership({ 키움: { husband: 100, wife: 0 }, NH: { husband: 0, wife: 100 } })
    await renameStockAccount(' 키움 ', '키움증권 ')
    expect((await db.stockDetails.get(a))!.accountName).toBe('키움증권')
    expect((await db.stockDetails.get(b))!.accountName).toBe('NH')
    expect((await db.pensionDetails.get(p))!.linkedStockId).toBe('키움증권')
    expect(await getStockAccountOwnership()).toEqual({ 키움증권: { husband: 100, wife: 0 }, NH: { husband: 0, wife: 100 } })
  })

  it('기존 계좌명으로 바꾸면 병합 — 명의는 기존 대상 계좌 값 우선', async () => {
    await stock('A', '키움'); await stock('B', 'NH')
    await saveStockAccountOwnership({ 키움: { husband: 100, wife: 0 }, NH: { husband: 0, wife: 100 } })
    await renameStockAccount('키움', 'NH')
    expect((await db.stockDetails.toArray()).map((s) => s.accountName)).toEqual(['NH', 'NH'])
    expect(await getStockAccountOwnership()).toEqual({ NH: { husband: 0, wife: 100 } })
  })

  it('빈 이름·같은 이름은 무시', async () => {
    const a = await stock('A', '키움')
    await renameStockAccount('키움', '  ')
    await renameStockAccount('키움', '키움')
    expect((await db.stockDetails.get(a))!.accountName).toBe('키움')
  })
})

describe('deleteAsset / deleteHistory', () => {
  it('자산 삭제는 이력·상세·배당을 함께 지우고 다른 자산은 그대로', async () => {
    const a = await stock('A', '키움'), b = await stock('B', '키움')
    await addHistory(a, { date: '2024-02-01', price: 1100, quantity: 10 })
    await addDividend(a, { date: '2024-03-01', amountKrw: 500, amountOriginal: 500, currency: 'KRW', exchangeRate: 1, memo: '' })
    await addDividend(b, { date: '2024-03-01', amountKrw: 700, amountOriginal: 700, currency: 'KRW', exchangeRate: 1, memo: '' })
    await deleteAsset(a)
    expect(await db.assets.get(a)).toBeUndefined()
    expect(await db.stockDetails.get(a)).toBeUndefined()
    expect(await db.assetHistory.where('assetId').equals(a).count()).toBe(0)
    expect(await db.dividendHistory.where('assetId').equals(a).count()).toBe(0)
    expect(await getAssetById(b)).not.toBeNull()
    expect((await getDividends(b)).map((d) => d.amountKrw)).toEqual([700])
  })

  it('이력 삭제 후 currentValue·수량은 남은 최신 이력으로 동기화', async () => {
    const a = await stock('A', '키움')
    await addHistory(a, { date: '2024-02-01', price: 1100, quantity: 10 })
    await addHistory(a, { date: '2024-03-01', price: 1500, quantity: 12 })
    expect((await getAssetById(a))!.currentValue).toBe(18_000)
    await deleteHistory(a, '2024-03-01')
    const after = (await getAssetById(a))!
    expect(after.currentValue).toBe(11_000)
    expect(after.quantity).toBe(10)
  })
})

describe('배당', () => {
  it('add/remove — 다른 자산의 배당 id 로는 지우지 않는다, 날짜 내림차순 조회', async () => {
    const a = await stock('A', '키움'), b = await stock('B', '키움')
    const d1 = await addDividend(a, { date: '2024-01-01', amountKrw: 100 } as never)
    await addDividend(a, { date: '2024-06-01', amountKrw: 200, amountOriginal: 2, currency: 'USD', exchangeRate: 100, memo: 'm' })
    expect((await getDividends(a)).map((d) => [d.date, d.amountKrw])).toEqual([['2024-06-01', 200], ['2024-01-01', 100]])
    expect((await getDividends(a))[1]).toMatchObject({ amountOriginal: 0, currency: 'KRW', exchangeRate: 1, memo: '' })
    await removeDividend(b, d1)
    expect(await getDividends(a)).toHaveLength(2)
    await removeDividend(a, d1)
    expect((await getDividends(a)).map((d) => d.amountKrw)).toEqual([200])
  })

  it('updateDividendSettings 는 준 필드만 바꾸고 연간 요약에 반영', async () => {
    const a = await stock('A', '키움')
    await updateDividendSettings(a, { dividendYield: 5 })
    expect((await db.stockDetails.get(a))).toMatchObject({ dividendYield: 5 })
    let s = await getDividendSummary()
    expect(s.items[0]).toMatchObject({ annualKrw: 500, dividendCycle: '연간' })   // 10,000 × 5%
    await updateDividendSettings(a, { dividendDps: 50, dividendCycle: '분기' })
    expect((await db.stockDetails.get(a))).toMatchObject({ dividendYield: 5, dividendDps: 50, dividendCycle: '분기' })
    s = await getDividendSummary()
    expect(s.totalAnnual).toBe(50 * 10 * 4)
    expect(s.totalMonthly).toBe(50 * 10 * 4 / 12)
    await updateDividendSettings('missing', { dividendYield: 1 })   // 없는 자산은 무시
  })
})
