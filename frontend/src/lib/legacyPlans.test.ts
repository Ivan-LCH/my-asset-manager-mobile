// 4단계 db.ts 분리 — 레거시 저장 형태 읽기 변환 고정 (characterization, 분리 전 동작 기준)
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, getPensionSim, getPortfolio, getAllAssets, getAssetById } from '@/lib/db'

const put = (key: string, value: unknown) =>
  db.settings.put({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('getPensionSim 레거시 변환', () => {
  it('저장값 없음 → null, 깨진 JSON → null', async () => {
    expect(await getPensionSim()).toBeNull()
    await put('pension_sim_plan', '{oops')
    expect(await getPensionSim()).toBeNull()
  })

  it('구 stockBalance/stockDividendYield → 빈 holdings 거쳐 계좌 단위 stockAccount(기본 4%·5%)', async () => {
    await put('pension_sim_plan', { stockBalance: 1000, stockDividendYield: 3, refYear: 2026 })
    expect(await getPensionSim()).toEqual({
      refYear: 2026,
      stockOwnership: { husband: 50, wife: 50 },
      stockAccount: {
        husband: { extraAmount: 0, dividendYield: 4, growthRate: 5 },
        wife:    { extraAmount: 0, dividendYield: 4, growthRate: 5 },
      },
      allocations: [],
    })
  })

  it('종목 기반 stockHoldings → 가중평균 배당률·상승률 stockAccount', async () => {
    await put('pension_sim_plan', {
      stockHoldings: [
        { ticker: 'A', weight: 3, growthRate: 10 },
        { ticker: 'B', weight: 1, growthRate: 0 },
        { ticker: '', weight: 5, growthRate: 99 },
      ],
      stockYields: [{ ticker: 'A', yield: 2 }, { ticker: 'B', yield: 6 }],
      stockGrowthRate: 7, stockManualYield: 1,
      allocations: [{ lumpsumId: 'x', irpAmount: 1, stockAmount: 2 }],
    })
    const r = await getPensionSim() as unknown as Record<string, unknown>
    // 배당 (2*3 + 6*1)/4 = 3, 상승률은 growthRate>0 인 A만 → 10
    expect(r.stockAccount).toEqual({
      husband: { extraAmount: 0, dividendYield: 3, growthRate: 10 },
      wife:    { extraAmount: 0, dividendYield: 3, growthRate: 10 },
    })
    for (const k of ['stockHoldings', 'stockYields', 'stockGrowthRate', 'stockManualYield']) expect(r).not.toHaveProperty(k)
    expect(r.allocations).toEqual([{ lumpsumId: 'x', irpAmount: 1, stockAmount: 2 }])
  })

  it('가중평균이 0이면 stockManualYield·stockGrowthRate 폴백', async () => {
    await put('pension_sim_plan', { stockHoldings: [], stockManualYield: 1.5, stockGrowthRate: 2.5 })
    const r = await getPensionSim() as unknown as Record<string, unknown>
    expect(r.stockAccount).toEqual({
      husband: { extraAmount: 0, dividendYield: 1.5, growthRate: 2.5 },
      wife:    { extraAmount: 0, dividendYield: 1.5, growthRate: 2.5 },
    })
  })

  it('stockAccount 가 이미 있으면 stockHoldings 는 그대로 둔다', async () => {
    const acct = { husband: { extraAmount: 1, dividendYield: 2, growthRate: 3 }, wife: { extraAmount: 0, dividendYield: 0, growthRate: 0 } }
    await put('pension_sim_plan', { stockHoldings: [{ ticker: 'A', weight: 1 }], stockAccount: acct })
    const r = await getPensionSim() as unknown as Record<string, unknown>
    expect(r.stockAccount).toEqual(acct)
    expect(r.stockHoldings).toEqual([{ ticker: 'A', weight: 1 }])
  })

  it('구 comprehensiveDeduction → spouseDependent/dependents/useStandardDeduction', async () => {
    await put('pension_sim_plan', { comprehensiveDeduction: 1_500_000 })
    expect(await getPensionSim()).toEqual({ spouseDependent: true, dependents: 0, useStandardDeduction: true, allocations: [] })
    await put('pension_sim_plan', { comprehensiveDeduction: 1_500_000, dependents: 2 })
    expect(await getPensionSim()).toMatchObject({ dependents: 2 })
    // spouseDependent 가 이미 있으면 변환하지 않음
    await put('pension_sim_plan', { comprehensiveDeduction: 1, spouseDependent: false })
    expect(await getPensionSim()).toEqual({ comprehensiveDeduction: 1, spouseDependent: false, allocations: [] })
  })

  it('읽기 변환은 저장값을 바꾸지 않는다', async () => {
    const raw = JSON.stringify({ stockBalance: 1, comprehensiveDeduction: 2 })
    await put('pension_sim_plan', raw)
    await getPensionSim()
    expect((await db.settings.get('pension_sim_plan'))!.value).toBe(raw)
  })
})

describe('getPortfolio 레거시 변환', () => {
  it('저장값 없음 → null, 깨진 JSON → null', async () => {
    expect(await getPortfolio()).toBeNull()
    await put('portfolio_settings', 'nope')
    expect(await getPortfolio()).toBeNull()
  })

  it('holdings + blendedYield → dividendYield, growthRate 가중평균', async () => {
    await put('portfolio_settings', {
      holdings: [{ ticker: 'A', weight: 1, growthRate: 4 }, { ticker: 'B', weight: 3, growthRate: 8 }, { weight: 0, growthRate: 100 }],
      blendedYield: 2.5, manualYields: [{ ticker: 'A', yield: 9 }], other: 'keep',
    })
    expect(await getPortfolio()).toEqual({ dividendYield: 2.5, growthRate: 7, other: 'keep' })
  })

  it('blendedYield 없으면 manualYields 평균, 음수는 0', async () => {
    await put('portfolio_settings', { holdings: [], manualYields: [{ yield: 2 }, { yield: 4 }] })
    expect(await getPortfolio()).toEqual({ dividendYield: 3, growthRate: 0 })
    await put('portfolio_settings', { holdings: [], blendedYield: -1 })
    expect(await getPortfolio()).toEqual({ dividendYield: 0, growthRate: 0 })
  })

  it('dividendYield 가 이미 있으면 그대로', async () => {
    await put('portfolio_settings', { holdings: [{ ticker: 'A' }], dividendYield: 1, growthRate: 2 })
    expect(await getPortfolio()).toEqual({ holdings: [{ ticker: 'A' }], dividendYield: 1, growthRate: 2 })
  })
})

describe('자산 조회 레거시 폴백 (composeAsset)', () => {
  it('acquisitionDate null → "", ownership 없으면 부동산 상세 ownership → 50:50', async () => {
    const now = '2026-01-01T00:00:00.000Z'
    const base = { currentValue: 1, acquisitionPrice: 1, quantity: 0, createdAt: now, updatedAt: now }
    await db.assets.bulkPut([
      { ...base, id: 're', type: 'REAL_ESTATE', name: '집', acquisitionDate: null },
      { ...base, id: 'st', type: 'STOCK', name: '주식', acquisitionDate: '2020-01-01' },
      { ...base, id: 'own', type: 'ETC', name: '기타', acquisitionDate: '2020-01-01', ownership: { husband: 100, wife: 0 } },
    ])
    await db.realEstateDetails.put({ assetId: 're', isOwned: true, hasTenant: false, tenantDeposit: 0, address: '', loanAmount: 0, ownership: { husband: 30, wife: 70 } } as never)
    const re = (await getAssetById('re'))!
    expect(re.acquisitionDate).toBe('')
    expect(re.ownership).toEqual({ husband: 30, wife: 70 })
    expect((await getAssetById('st'))!.ownership).toEqual({ husband: 50, wife: 50 })
    expect((await getAssetById('own'))!.ownership).toEqual({ husband: 100, wife: 0 })
    expect((await getAllAssets()).map((a) => a.id).sort()).toEqual(['own', 're', 'st'])
  })
})
