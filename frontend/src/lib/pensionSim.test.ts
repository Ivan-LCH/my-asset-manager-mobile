import { describe, it, expect } from 'vitest'
import {
  EMPTY_PENSION_PLAN, pensionIncomeTax, computePensionVehicle, totalPrincipal, totalInflows,
  sourcesFromAssets, comprehensiveTax, comprehensiveTaxBreakdown, estimateHealthInsurance,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import type { PensionSimPlan } from '@/types'

const plan = (over: Partial<PensionSimPlan> = {}): PensionSimPlan => ({ ...EMPTY_PENSION_PLAN, ...over })

describe('pensionSim 계산', () => {
  it('pensionIncomeTax: 1,200만 공제 후 누진', () => {
    expect(pensionIncomeTax(0)).toBe(0)
    expect(pensionIncomeTax(8_000_000)).toBeCloseTo(8_000_000 * 0.03)
    expect(pensionIncomeTax(40_000_000)).toBeCloseTo(40_000_000 * 0.04 - 340_000)
  })

  it('comprehensiveTax: 종합소득세 누진세율', () => {
    expect(comprehensiveTax(0)).toBe(0)
    expect(comprehensiveTax(10_000_000)).toBeCloseTo(10_000_000 * 0.06)
    expect(comprehensiveTax(100_000_000)).toBeCloseTo(100_000_000 * 0.35 - 15_400_000)
  })

  it('comprehensiveTaxBreakdown: 한도 내 분리과세, 초과분 종합합산', () => {
    const within = comprehensiveTaxBreakdown(10_000_000, 0, 1_500_000)
    expect(within.separatedTax).toBeCloseTo(10_000_000 * 0.154)
    expect(within.consolidatedFinancial).toBe(0)
    expect(within.comprehensiveTax).toBe(0)

    const over = comprehensiveTaxBreakdown(30_000_000, 0, 1_500_000)
    expect(over.consolidatedFinancial).toBe(10_000_000)
    expect(over.comprehensiveTax).toBeGreaterThan(0)
  })

  it('estimateHealthInsurance: 소득 없으면 0, 있으면 최저 이상', () => {
    expect(estimateHealthInsurance(0, 0, 0).totalMonthly).toBe(0)
    const hi = estimateHealthInsurance(20_000_000, 10_000_000, 0)
    expect(hi.totalMonthly).toBeGreaterThan(0)
  })

  it('totalPrincipal / totalInflows: 합산', () => {
    expect(totalPrincipal(plan())).toBe(400_000_000) // 3억 + 1억
    const p = plan({ inflows: [
      { id: 'a', name: '위로금', amount: 100_000_000, type: 'lumpsum', destination: 'irp', year: 2029 },
      { id: 'b', name: '배당', amount: 5_000_000, type: 'annual', destination: 'stock', year: 2029 },
    ] })
    expect(totalInflows(p)).toBe(105_000_000)
  })

  it('sourcesFromAssets: PENSION 자산에서 과세 구분 추정', () => {
    const assets = [
      { id: 'a1', name: '퇴직연금', currentValue: 3_0000_0000, detail: { pensionType: '퇴직연금' } },
      { id: 'a2', name: '연금저축', currentValue: 1_0000_0000, detail: { pensionType: '개인연금' } },
    ]
    const sources = sourcesFromAssets(assets, [])
    expect(sources[0].taxType).toBe('irp')
    expect(sources[1].taxType).toBe('taxable')
    expect(sources[0].principal).toBe(3_0000_0000)
  })

  it('computePensionVehicle: IRP 유입은 연금원금에 합산, 수령기간으로 균등', () => {
    const p = plan({
      sources: [{ id: 's', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }],
      inflows: [{ id: 'i', name: '위로금', amount: 150_000_000, type: 'lumpsum', destination: 'irp', year: 2029 }],
      withdrawalYears: 30,
      startYear: 2029,
    })
    const r = computePensionVehicle(p)
    expect(r.irpPrincipal).toBe(450_000_000)
    expect(r.annualPensionTaxable).toBeCloseTo(450_000_000 / 30, -3)
    expect(r.pensionTax).toBeGreaterThanOrEqual(0)
  })

  it('computePensionVehicle: 주식 일회성은 잔액 가산→배당, 연간은 직접 금융소득', () => {
    const p = plan({
      sources: [],
      stockBalance: 300_000_000,
      stockDividendYield: 6,
      startYear: 2029,
      inflows: [
        { id: 'l', name: '전세금', amount: 200_000_000, type: 'lumpsum', destination: 'stock', year: 2029 },
        { id: 'a', name: '기타배당', amount: 3_000_000, type: 'annual', destination: 'stock', year: 2029 },
      ],
    })
    const r = computePensionVehicle(p)
    // 잔액 (3억+2억) × 6% = 3천만 + 연간 3백만 = 3천3백만
    expect(r.stockBalance).toBe(500_000_000)
    expect(r.financialIncome).toBe(33_000_000)
    // 3천3백만 > 2천만 → 종합합산 발생
    expect(r.consolidatedFinancial).toBe(33_000_000 - FINANCIAL_INCOME_LIMIT)
    expect(r.financialTax).toBeGreaterThan(0)
  })

  it('computePensionVehicle: 비과세 연금은 세금 0, 총수입에 포함', () => {
    const p = plan({
      sources: [{ id: 'e', name: '비과세', principal: 120_000_000, taxType: 'taxExempt', yieldRate: 0 }],
      withdrawalYears: 30,
    })
    const r = computePensionVehicle(p)
    expect(r.annualPensionExempt).toBe(4_000_000)
    expect(r.pensionTax).toBe(0)
    expect(r.grossAnnual).toBeGreaterThan(0)
  })

  it('computePensionVehicle: 수령개시 이후 도착 유입은 pending (잔액 미반영)', () => {
    // startYear 2029. 위로금 1.5억이 2035(수령 중)에 도착 → IRP 원금에 미반영, pending 집계
    const p = plan({
      sources: [{ id: 's', name: 'IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }],
      inflows: [{ id: 'i', name: '위로금', amount: 150_000_000, type: 'lumpsum', destination: 'irp', year: 2035 }],
      withdrawalYears: 30,
      startYear: 2029,
    })
    const r = computePensionVehicle(p)
    expect(r.irpPrincipal).toBe(300_000_000)         // 도착 전이므로 미반영
    expect(r.pendingInflowCount).toBe(1)
    expect(r.pendingInflowAmount).toBe(150_000_000)
  })
})
