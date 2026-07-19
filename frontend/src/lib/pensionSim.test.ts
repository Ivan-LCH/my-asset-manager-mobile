import { describe, it, expect } from 'vitest'
import {
  EMPTY_PENSION_PLAN, pensionIncomeTax, computePensionVehiclePerPerson,
  computePensionVehicle, stockBalanceFromInflows, totalInflows, sourcesFromAssets,
  comprehensiveTax, comprehensiveTaxBreakdown, estimateHealthInsurance,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
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
})
