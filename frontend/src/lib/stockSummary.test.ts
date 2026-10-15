// 1단계 — 주식 계좌 필터 시 요약 카드가 필터 범위로 계산되는지
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/types'
import type { Position } from '@/planner/model'
import { stockSummary } from './stockSummary'

const stock = (id: string, account: string, value: number, cost: number, extra: Partial<Asset> = {}): Asset => ({
  id, type: 'STOCK', name: id, currentValue: value, acquisitionDate: '2024-01-01', acquisitionPrice: cost, quantity: 1,
  ownership: { husband: 100, wife: 0 }, createdAt: '', updatedAt: '', history: [],
  detail: { accountName: account, currency: 'KRW' } as any, ...extra,
})
const costOf = (a: Asset) => a.acquisitionPrice * a.quantity
const stocks = [
  stock('a1', '키움', 1_200, 1_000),
  stock('a2', '키움 ', 500, 600),   // 계좌명 뒤 공백 — accountName() 과 같이 trim 해서 같은 계좌
  stock('b1', '퇴직IRP', 3_000, 2_000),
  stock('b2', '퇴직IRP', 9_999, 9_999, { disposalDate: '2025-01-01' }),
]
const divs = [{ assetId: 'a1', annualKrw: 100 }, { assetId: 'b1', annualKrw: 50 }, { assetId: 'b2', annualKrw: 7 }]

describe('stockSummary', () => {
  it('필터 없음 → 보유 주식 전체', () => {
    const s = stockSummary(stocks, null, costOf, [], divs)
    expect([s.val, s.cost, s.pnl, s.dividend]).toEqual([4_700, 3_600, 1_100, 150])
  })
  it('계좌 필터 → 그 계좌 종목만 (전체 값이 아님), 배당도 범위 id 로만', () => {
    const s = stockSummary(stocks, '키움', costOf, [], divs)
    expect([s.val, s.cost, s.pnl, s.dividend]).toEqual([1_700, 1_600, 100, 100])
    expect(s.roi).toBeCloseTo(6.25)
    const irp = stockSummary(stocks, '퇴직IRP', costOf, [], divs)
    expect([irp.val, irp.cost, irp.dividend]).toEqual([3_000, 2_000, 50])   // 매각 b2 제외
  })
  it('연결 잔액(linkedTo) 종목은 계좌 범위에서도 합산하지 않는다', () => {
    const positions = [{ assetId: 'a2', role: 'investment', linkedTo: 'x' } as Position]
    expect(stockSummary(stocks, '키움', costOf, positions).val).toBe(1_200)
  })
  it('배당 요약이 없으면 dividend 는 undefined', () => {
    expect(stockSummary(stocks, null, costOf, []).dividend).toBeUndefined()
  })
})
