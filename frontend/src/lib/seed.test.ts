import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { seedSampleData, getAllAssets, clearAllData, getDividendSummary } from '@/lib/db'

describe('샘플 데이터 시드', () => {
  beforeAll(async () => { await clearAllData(); await seedSampleData() })

  it('8개 자산이 생성된다', async () => {
    const all = await getAllAssets()
    expect(all.length).toBe(8)
  })

  it('모든 자산이 currentValue > 0 이고 이력을 가진다', async () => {
    const all = await getAllAssets()
    for (const a of all) {
      expect(a.currentValue).toBeGreaterThan(0)
      expect(a.history.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('유형별 분포: 부동산1·주식3·연금2·예적금1·실물1', async () => {
    const all = await getAllAssets()
    const byType = (t: string) => all.filter((a) => a.type === t).length
    expect(byType('REAL_ESTATE')).toBe(1)
    expect(byType('STOCK')).toBe(3)
    expect(byType('PENSION')).toBe(2)
    expect(byType('SAVINGS')).toBe(1)
    expect(byType('PHYSICAL')).toBe(1)
  })

  it('배당 요약이 에러 없이 계산된다', async () => {
    const s = await getDividendSummary()
    expect(s.totalAnnual).toBeGreaterThanOrEqual(0)
  })
})
