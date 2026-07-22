import { describe, it, expect } from 'vitest'
import {
  EMPTY_PENSION_PLAN, pensionIncomeTax, computePensionVehiclePerPerson,
  computePensionVehicle, computePerPersonComprehensiveDeduction, pensionSchedule,
  severanceTax,
  stockBalanceFromInflows, totalInflows, sourcesFromAssets,
  comprehensiveTax, comprehensiveTaxBreakdown, estimateHealthInsurance,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { realEstatePropertyBases, calcHealthInsurance, stockDividendsByOwner } from '@/lib/healthInsurance'
import { blendedYield } from '@/lib/corpSim'
import type { PensionSimPlan } from '@/types'

const plan = (over: Partial<PensionSimPlan> = {}): PensionSimPlan => ({ ...EMPTY_PENSION_PLAN, ...over })

describe('pensionSim 계산', () => {
  it('pensionIncomeTax / comprehensiveTax 기본', () => {
    expect(pensionIncomeTax(0)).toBe(0)
    expect(pensionIncomeTax(8_000_000)).toBeCloseTo(8_000_000 * 0.03)
    expect(comprehensiveTax(0)).toBe(0)
    expect(comprehensiveTax(10_000_000)).toBeCloseTo(10_000_000 * 0.06)
  })

  it('comprehensiveTaxBreakdown: 한도 내 분리과세, 초과 종합합산', () => {
    expect(comprehensiveTaxBreakdown(10_000_000, 0, 1_500_000).consolidatedFinancial).toBe(0)
    expect(comprehensiveTaxBreakdown(30_000_000, 0, 1_500_000).consolidatedFinancial).toBe(10_000_000)
  })

  it('stockBalanceFromInflows: stock 유입만 합산', () => {
    const inflows = [
      { id: 'a', name: '위로금', amount: 100_000_000, type: 'lumpsum' as const, destination: 'irp' as const, year: 2029, ownership: { husband: 100, wife: 0 } },
      { id: 'b', name: '전세금', amount: 200_000_000, type: 'lumpsum' as const, destination: 'stock' as const, year: 2029, ownership: { husband: 50, wife: 50 } },
      { id: 'c', name: '배당', amount: 5_000_000, type: 'annual' as const, destination: 'stock' as const, year: 2029, ownership: { husband: 50, wife: 50 } },
    ]
    expect(stockBalanceFromInflows(inflows)).toBe(205_000_000) // stock만
    expect(totalInflows(plan({ inflows }))).toBe(305_000_000)
  })

  it('blendedYield: 종목 가중평균', () => {
    const y = blendedYield(
      [{ ticker: 'A', yield: 4 }, { ticker: 'B', yield: 6 }],
      [{ ticker: 'A', weight: 1 }, { ticker: 'B', weight: 1 }],
    )
    expect(y).toBeCloseTo(5) // (4+6)/2
  })

  it('computePensionVehiclePerPerson: IRP/연금은 남편 only', () => {
    const p = plan({
      sources: [{ id: 's', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0, owner: 'husband' }],
      withdrawalYears: 30, startYear: 2029,
    })
    const r = computePensionVehiclePerPerson(p)
    expect(r.husband.annualPensionTaxable).toBeCloseTo(300_000_000 / 30, -3)
    expect(r.wife.annualPensionTaxable).toBe(0)
    expect(r.wife.pensionTax).toBe(0)
  })

  it('1인별 2천만 한도: 부부 합산>2천만이어도 각<2천만이면 종합합산 없음', () => {
    // stock 잔액 6억 × 6% = 3천6백만, 50:50 → 각 1천8백만 (<2천만)
    const p = plan({
      sources: [],
      startYear: 2029,
      stockHoldings: [{ ticker: 'A', weight: 1 }],
      stockYields: [{ ticker: 'A', yield: 6 }],
      stockOwnership: { husband: 50, wife: 50 },
      inflows: [{ id: 's', name: '전세금', amount: 600_000_000, type: 'lumpsum', destination: 'stock', year: 2029, ownership: { husband: 50, wife: 50 } }],
    })
    const r = computePensionVehiclePerPerson(p)
    expect(r.husband.financialIncome).toBeCloseTo(18_000_000, -4)
    expect(r.wife.financialIncome).toBeCloseTo(18_000_000, -4)
    // 각 2천만 이하 → 종합합산 0
    expect(r.husband.consolidatedFinancial).toBe(0)
    expect(r.wife.consolidatedFinancial).toBe(0)
    // 가구 합산(3천6백만)으로 한 번에 계산했으면 1천6백만이 종합합산되었을 것 → 1인별이 유리
  })

  it('명의 100:0 → 와이프 금융소득 0', () => {
    const p = plan({
      sources: [],
      startYear: 2029,
      stockYields: [{ ticker: 'A', yield: 6 }],
      stockHoldings: [{ ticker: 'A', weight: 1 }],
      stockOwnership: { husband: 100, wife: 0 },
      inflows: [{ id: 's', name: '전세금', amount: 300_000_000, type: 'lumpsum', destination: 'stock', year: 2029, ownership: { husband: 100, wife: 0 } }],
    })
    const r = computePensionVehiclePerPerson(p)
    expect(r.husband.financialIncome).toBeCloseTo(18_000_000, -4)
    expect(r.wife.financialIncome).toBe(0)
  })

  it('수동 yield가 조회=0을 이긴다', () => {
    const p = plan({
      sources: [],
      startYear: 2029,
      stockHoldings: [{ ticker: 'X', weight: 1 }],
      stockYields: [{ ticker: 'X', yield: 5, manual: true }],  // 수동 5%
      stockOwnership: { husband: 100, wife: 0 },
      inflows: [{ id: 's', name: '잔액', amount: 100_000_000, type: 'lumpsum', destination: 'stock', year: 2029, ownership: { husband: 100, wife: 0 } }],
    })
    const r = computePensionVehiclePerPerson(p)
    expect(r.husband.financialIncome).toBeCloseTo(5_000_000, -4) // 1억 × 5%
  })

  it('computePensionVehicle(shim): 가구 합계 반환', () => {
    const p = plan({
      sources: [{ id: 's', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0, owner: 'husband' }],
      withdrawalYears: 30, startYear: 2029,
    })
    const legacy = computePensionVehicle(p)
    const per = computePensionVehiclePerPerson(p)
    expect(legacy.netAnnual).toBe(per.totals.netAnnual)
  })

  it('estimateHealthInsurance: 소득 없으면 0', () => {
    expect(estimateHealthInsurance(0, 0, 0)).toBe(0)
  })

  it('computePerPersonComprehensiveDeduction: 본인 150만 + 공통 ÷ 2', () => {
    const base = { spouseDependent: true, dependents: 0, useStandardDeduction: true }
    expect(computePerPersonComprehensiveDeduction(base)).toEqual({ husband: 2_750_000, wife: 2_750_000 })
    // 부양가족 2명: 본인 150 + (150+300+100)/2 = 425만
    expect(computePerPersonComprehensiveDeduction({ ...base, dependents: 2 })).toEqual({ husband: 4_250_000, wife: 4_250_000 })
    // 배우자 OFF, 부양 2: 본인 150 + (300+100)/2 = 350만
    expect(computePerPersonComprehensiveDeduction({ spouseDependent: false, dependents: 2, useStandardDeduction: true })).toEqual({ husband: 3_500_000, wife: 3_500_000 })
  })

  it('공제 자동 산정으로 종합소득세 정확도 ↑ (1인별 2천만 한도)', () => {
    // 부부·부양 0·표준 ON → 각 275만 공제, 각 18M(한도 내) → 종합합산 0
    const p = plan({
      sources: [],
      startYear: 2029,
      stockYields: [{ ticker: 'A', yield: 6 }],
      stockHoldings: [{ ticker: 'A', weight: 1 }],
      stockOwnership: { husband: 50, wife: 50 },
      inflows: [{ id: 's', name: '전세금', amount: 600_000_000, type: 'lumpsum', destination: 'stock', year: 2029, ownership: { husband: 50, wife: 50 } }],
    })
    const r = computePensionVehiclePerPerson(p)
    expect(r.husband.financialIncome).toBeCloseTo(18_000_000, -4)
    // 1인별 18M < 2천만 한도 + 공제 275만 → 과세표준 = max(0, 18M - 2천만 - 275만) = 0
    expect(r.husband.comprehensiveTaxable).toBe(0)
    expect(r.husband.comprehensiveTax).toBe(0)
  })

  it('부동산 명의 가중 → 1인별 재산과세표준 + 건보 재산분에 반영', () => {
    // 부동산 10억, 와이프 100% 명의 (asset.ownership)
    const assets = [{
      id: 're1', type: 'REAL_ESTATE' as const, name: '아파트', currentValue: 1_000_000_000,
      disposalDate: undefined,
      ownership: { husband: 0, wife: 100 },
      detail: { isOwned: true, hasTenant: false, tenantDeposit: 0, address: '', loanAmount: 0 },
    }] as any
    const prop = realEstatePropertyBases(assets)
    expect(prop.husband.propertyTaxBase).toBe(0)
    expect(prop.wife.propertyTaxBase).toBe(1_000_000_000)
    // 와이프 건보(재산분 포함) > 0
    const wifeHI = calcHealthInsurance({ pensionAnnual: 0, dividendAnnual: 0, otherAnnual: 0, propertyTaxBase: prop.wife.propertyTaxBase, rentalDeposit: 0, carValue: 0, scorePerPoint: 208.4 })
    expect(wifeHI.grandTotal).toBeGreaterThan(0)
  })

  it('pensionSchedule: 국민연금 65세 step-up 반영', () => {
    // IRP 원금 3억 (과세) ÷ 30년 = 1000만/년 flat. 국민연금 2035~2055, 월 120만.
    const p = plan({
      sources: [
        { id: 'irp', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0, owner: 'husband' },
        { id: 'nat', name: '국민연금', principal: 60_000_000, taxType: 'national', yieldRate: 0, owner: 'husband' },
      ],
      startYear: 2029, withdrawalYears: 30,
    })
    const nationals = [{ expectedStartYear: 2035, expectedEndYear: 2055, expectedMonthlyPayout: 1_200_000, annualGrowthRate: 0 }]
    const sched = pensionSchedule(p, nationals, 2029, 2058)
    // 2029 (국민연금 전): IRP만 = 1000만/년 → 월 ~83만
    const before = sched.find((r) => r.year === 2029)!
    expect(before.nationalAnnual).toBe(0)
    expect(before.drawdownAnnual).toBe(10_000_000)
    // 2035 (국민연금 개시): + 120만×12 = 1440만 → 합 2440만
    const at65 = sched.find((r) => r.year === 2035)!
    expect(at65.nationalAnnual).toBe(14_400_000)
    expect(at65.totalAnnual).toBe(10_000_000 + 14_400_000)
  })

  it('severanceTax: 위로금 현금 수령 시 퇴직소득세 (연금소득세보다큼)', () => {
    // 위로금 1.5억 현금 수령 → 퇴직소득세 (공제 700만 후 누진)
    const tax = severanceTax(150_000_000)
    expect(tax).toBeGreaterThan(0)
    // 연금소득세(3~6%)보다 유의미하게 큰 효과세율이어야
    expect(tax / 150_000_000).toBeGreaterThan(0.06)
    expect(severanceTax(0)).toBe(0)
  })

  it('cash/corp 유입은 시뮬 소득(연금/배당)에서 제외 — 이중계산 방지', () => {
    // 전세금 5억을 stock으로, 위로금 1.5억을 cash로. cash는 시뮬 소득에 미포함.
    const p = plan({
      sources: [],
      startYear: 2029,
      stockYields: [{ ticker: 'A', yield: 6 }],
      stockHoldings: [{ ticker: 'A', weight: 1 }],
      stockOwnership: { husband: 100, wife: 0 },
      inflows: [
        { id: 's', name: '전세금', amount: 500_000_000, type: 'lumpsum', destination: 'stock', year: 2029, ownership: { husband: 100, wife: 0 } },
        { id: 'c', name: '위로금', amount: 150_000_000, type: 'lumpsum', destination: 'cash', year: 2029, ownership: { husband: 100, wife: 0 }, taxKind: 'severance', useEndYear: 2035 },
      ],
    })
    const r = computePensionVehiclePerPerson(p, { nationalPensions: [] })
    // 주식 잔액 = 5억만 (cash 1.5억 제외) × 6% = 3000만
    expect(r.husband.stockBalance).toBe(500_000_000)
    expect(r.husband.financialIncome).toBe(30_000_000)
    // cash 1.5억은 시뮬 금융소득/원금에 없음 (은퇴계획 목돈으로)
    expect(r.husband.financialIncome).toBeLessThan(45_000_000)
  })

  it('computePensionVehiclePerPerson: national을 실수령 모델로 (원금÷기간 아님)', () => {
    const p = plan({
      sources: [
        { id: 'irp', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0, owner: 'husband' },
        { id: 'nat', name: '국민연금', principal: 60_000_000, taxType: 'national', yieldRate: 0, owner: 'husband' },
      ],
      startYear: 2029, withdrawalYears: 30,
    })
    const nationals = [{ expectedStartYear: 2035, expectedEndYear: 2055, expectedMonthlyPayout: 1_200_000, annualGrowthRate: 0 }]
    const r = computePensionVehiclePerPerson(p, { nationalPensions: nationals })
    // peak(2035) 연금 = IRP 1000만 + 국민 1440만 = 2440만 (과세)
    expect(r.husband.annualPensionTaxable).toBeGreaterThanOrEqual(24_000_000)
  })

  it('stockDividendsByOwner: 1인별 STOCK 배당 분할 (계좌 명의 우선, 자산별 폴백)', () => {
    const assets = [
      // 키움증권 계좌: 와이프 100% (계좌 명의가 이김)
      { id: 's1', type: 'STOCK' as const, name: '삼성', currentValue: 0, disposalDate: undefined,
        ownership: { husband: 70, wife: 30 },
        detail: { accountName: '키움증권' } },
      // NH증권 계좌: 자산별(폴백) — husband 100%
      { id: 's2', type: 'STOCK' as const, name: '에코프로', currentValue: 0, disposalDate: undefined,
        ownership: { husband: 100, wife: 0 },
        detail: { accountName: 'NH증권' } },
      // 미분류: 자산별(폴백) — wife 100%
      { id: 's3', type: 'STOCK' as const, name: '기타', currentValue: 0, disposalDate: undefined,
        ownership: { husband: 0, wife: 100 },
        detail: { accountName: '미분류' } },
    ] as any
    const summary = { items: [
      { assetId: 's1', monthlyKrw: 100_000 },
      { assetId: 's2', monthlyKrw: 200_000 },
      { assetId: 's3', monthlyKrw: 50_000 },
    ] }
    const accountOwners = { '키움증권': { husband: 0, wife: 100 } }  // 키움만 와이프 100% 강제
    const d = stockDividendsByOwner(assets, summary, accountOwners)
    // s1: 계좌 명의 100/0 → husband 0, wife 100k
    // s2: NH증권 미설정 → 자산별 100/0 → husband 200k, wife 0
    // s3: 미분류 → 자산별 0/100 → husband 0, wife 50k
    expect(d.husband).toBe(200_000)
    expect(d.wife).toBe(150_000)
  })
})
