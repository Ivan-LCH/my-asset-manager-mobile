import { describe, it, expect } from 'vitest'
import {
  EMPTY_PENSION_PLAN, pensionIncomeTax, simulatePension, totalPrincipal, sourcesFromAssets, rentalDividend, FINANCIAL_INCOME_LIMIT,
  comprehensiveTax, comprehensiveTaxBreakdown, spouseSplitComparison,
} from '@/lib/pensionSim'
import type { PensionSimPlan } from '@/types'

const plan = (over: Partial<PensionSimPlan> = {}): PensionSimPlan => ({ ...EMPTY_PENSION_PLAN, ...over })

describe('pensionSim 계산', () => {
  it('pensionIncomeTax: 1,200만 공제 후 누진', () => {
    // 수령 1,200만 → 공제后 0 → 세금 0
    expect(pensionIncomeTax(0)).toBe(0)
    // 수령 2,000만 → 과세 800만 → 3% = 24만
    expect(pensionIncomeTax(8_000_000)).toBeCloseTo(8_000_000 * 0.03)
    // 과세 3,000만 → 3% (3,400만 이하 구간)
    expect(pensionIncomeTax(30_000_000)).toBeCloseTo(30_000_000 * 0.03)
    // 과세 4,000만 → 4% - 34만 (3,400만 초과 구간)
    expect(pensionIncomeTax(40_000_000)).toBeCloseTo(40_000_000 * 0.04 - 340_000)
  })

  it('totalPrincipal: 원천 합산', () => {
    expect(totalPrincipal(plan())).toBe(400_000_000) // 3억 + 1억
  })

  it('simulatePension: 수익률 0이면 매년 잔액 감소', () => {
    // 수익률 0이면 확정 감소. 수익률 > 인출률이면 초기엔 증가 가능 (정상)
    const r = simulatePension(plan({ sources: [{ id: 's', name: 'test', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }] }))
    expect(r.rows).toHaveLength(30)
    expect(r.rows[1].remainingBalance).toBeLessThan(r.rows[0].remainingBalance)
    expect(r.rows[29].remainingBalance).toBeLessThan(r.rows[0].remainingBalance)
  })

  it('simulatePension: IRP + 과세 수령액에 연금소득세, 비과세는 면세', () => {
    const r = simulatePension(plan())
    const r0 = r.rows[0]
    expect(r0.irpWithdraw).toBeGreaterThan(0)    // IRP 수령 있음
    expect(r0.exemptWithdraw).toBeGreaterThan(0) // 비과세 수령 있음
    expect(r0.pensionTax).toBeGreaterThanOrEqual(0) // 세금 (공제后 0 가능)
    // 비과세는 세금 계산에 포함 안 됨 → 총수령 > IRP+과세
    expect(r0.totalWithdraw).toBeGreaterThan(r0.irpWithdraw + r0.taxableWithdraw)
  })

  it('simulatePension: 수익률 0이면 원금/기간 = 연 수령액', () => {
    const p = plan({
      sources: [{ id: 'test', name: 'test', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }],
      withdrawalYears: 30,
    })
    const r = simulatePension(p)
    const expectedAnnual = 300_000_000 / 30
    expect(r.rows[0].irpWithdraw).toBeCloseTo(expectedAnnual, -3)
    // 수익률 0이면 마지막 해 잔액도 0에 가까움
    expect(r.rows[29].remainingBalance).toBeLessThan(1_000)
  })

  it('sourcesFromAssets: PENSION 자산에서 과세 구분 추정', () => {
    const assets = [
      { id: 'a1', name: '퇴직연금', currentValue: 3_0000_0000, detail: { pensionType: '퇴직연금' } },
      { id: 'a2', name: '연금저축', currentValue: 1_0000_0000, detail: { pensionType: '개인연금' } },
    ]
    const sources = sourcesFromAssets(assets, [])
    expect(sources[0].taxType).toBe('irp')        // 퇴직연금 → irp
    expect(sources[1].taxType).toBe('taxable')      // 개인연금 → 과세
    expect(sources[0].principal).toBe(3_0000_0000)
  })

  it('rentalDividend: 전세금 × 배당률, 2천만 한도 초과분', () => {
    // 전세금 5억 × 6% = 연 3천만 → 2천만 초과 1천만 종합과세 대상
    const over = rentalDividend({ rentalDeposit: 500_000_000, rentalYield: 6 })
    expect(over.annualDividend).toBe(30_000_000)
    expect(over.overLimit).toBe(30_000_000 - FINANCIAL_INCOME_LIMIT)
    // 전세금 3억 × 6% = 연 1천8백만 → 한도 내
    const within = rentalDividend({ rentalDeposit: 300_000_000, rentalYield: 6 })
    expect(within.annualDividend).toBe(18_000_000)
    expect(within.overLimit).toBe(0)
  })

  it('comprehensiveTax: 종합소득세 누진세율', () => {
    expect(comprehensiveTax(0)).toBe(0)
    // 1,400만 이하 6%
    expect(comprehensiveTax(10_000_000)).toBeCloseTo(10_000_000 * 0.06)
    // 3,000만 → 15% - 126만
    expect(comprehensiveTax(30_000_000)).toBeCloseTo(30_000_000 * 0.15 - 1_260_000)
    // 1억 → 35% - 1,540만 (8,800만~1.5억 구간)
    expect(comprehensiveTax(100_000_000)).toBeCloseTo(100_000_000 * 0.35 - 15_400_000)
  })

  it('comprehensiveTaxBreakdown: 금융소득 한도 내면 분리과세만', () => {
    // 금융 1천만 < 2천만 → 분리과세 15.4%, 종합합산 0
    const b = comprehensiveTaxBreakdown(10_000_000, 0, 1_500_000)
    expect(b.separatedTax).toBeCloseTo(10_000_000 * 0.154)
    expect(b.consolidatedFinancial).toBe(0)
    expect(b.comprehensiveTax).toBe(0)
  })

  it('comprehensiveTaxBreakdown: 금융소득 초과분은 종합합산', () => {
    // 금융 3천만 → 2천만 분리과세 + 1천만 종합합산 (기타소득 0, 공제 150만)
    const b = comprehensiveTaxBreakdown(30_000_000, 0, 1_500_000)
    expect(b.consolidatedFinancial).toBe(10_000_000)
    expect(b.comprehensiveTaxable).toBeCloseTo(10_000_000 - 1_500_000)
    expect(b.comprehensiveTax).toBeGreaterThan(0)
  })

  it('spouseSplitComparison: 기타소득 없으면 분리과세 15.4%가 종합 6%보다 커 분산이 손해일 수 있다', () => {
    // 금융 3천만, 기타소득 0 — 단독: 2천만 분리(3.08M) + 1천만 종합(6%) ≈ 3.59M
    //                         분산: 각 1천5백만 분리 → 4.62M (오히려 더 비쌈)
    const cmp = spouseSplitComparison(30_000_000, 0, 1_500_000)
    expect(cmp.singleConsolidated).toBe(10_000_000) // 단독은 2천만 초과 1천만 종합합산
    expect(cmp.splitConsolidated).toBe(0)            // 분산은 각 1천5백만 < 2천만 → 합산 0
    expect(cmp.savings).toBeLessThan(0)              // 이 케이스에선 단독이 유리
  })

  it('spouseSplitComparison: 기타 근로소득이 크면 분산이 종합소득세를 크게 줄인다', () => {
    // 금융 3천만 + 근로 5천만 — 단독은 금융 초과분이 고세율 구간으로, 분산이 유리
    const cmp = spouseSplitComparison(30_000_000, 50_000_000, 1_500_000)
    expect(cmp.singleConsolidated).toBe(10_000_000)
    expect(cmp.splitConsolidated).toBe(0)
    expect(cmp.savings).toBeGreaterThan(0)           // 분산이 유리
    expect(cmp.splitTax).toBeLessThan(cmp.singleTax)
  })
})
