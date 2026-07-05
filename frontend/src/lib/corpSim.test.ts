import { describe, it, expect } from 'vitest'
import {
  EMPTY_CORP_PLAN, grossDividend, corpTaxOn, computeCorp, computePersonal,
  sonAccumulation, returnMonths, recommendDividendForSon, shareSum, simulateRunway,
} from '@/lib/corpSim'
import type { CorpSimPlan } from '@/types'

const plan = (over: Partial<CorpSimPlan> = {}): CorpSimPlan => ({ ...EMPTY_CORP_PLAN, ...over })

describe('corpSim 계산', () => {
  it('배당총액: target=0 이면 원금×수익률', () => {
    expect(grossDividend(plan({ investAmount: 600_000_000, dividendYield: 8 }))).toBe(48_000_000)
  })
  it('배당총액: target>0 이면 target 우선', () => {
    expect(grossDividend(plan({ targetDividendTotal: 50_000_000 }))).toBe(50_000_000)
  })

  it('법인세: 2억 이하 low(9%)', () => {
    const t = EMPTY_CORP_PLAN.tax
    expect(corpTaxOn(48_000_000, t)).toBeCloseTo(48_000_000 * 0.09)
  })
  it('법인세: 2억 초과 누진', () => {
    const t = EMPTY_CORP_PLAN.tax
    const income = 300_000_000
    const expected = 200_000_000 * 0.09 + 100_000_000 * 0.19
    expect(corpTaxOn(income, t)).toBeCloseTo(expected)
  })

  it('지분 4:4:2 분배: 배당가능의 40/40/20', () => {
    const r = computeCorp(plan())
    const sum = r.perShare.husband.gross + r.perShare.wife.gross + r.perShare.son.gross
    expect(sum).toBeCloseTo(r.distributable)
    expect(r.perShare.son.gross).toBeCloseTo(r.distributable * 0.2)
    // 세후 = gross × (1 − 0.154)
    expect(r.perShare.son.net).toBeCloseTo(r.perShare.son.gross * (1 - 0.154))
  })
  it('shareSum = 100', () => {
    expect(shareSum(plan())).toBe(100)
  })

  it('개인 시나리오: 금융소득 2천만 초과 시 종합과세 추가', () => {
    const p = plan({ targetDividendTotal: 48_000_000 })
    const r = computePersonal(p)
    expect(r.dividendTax).toBeCloseTo(48_000_000 * 0.154)
    // 4800만 > 2000만 → 초과분 2800만 × 0.35
    expect(r.combinedExtra).toBeCloseTo(28_000_000 * 0.35)
  })

  it('자녀 누적: 매년 동액 누적', () => {
    const rows = sonAccumulation(plan({ targetDividendTotal: 50_000_000 }), 3)
    expect(rows).toHaveLength(3)
    const annual = rows[0].sonDividend
    expect(rows[2].cumulative).toBeCloseTo(annual * 3)
  })

  it('가수금 반환 개월 = 원금 / 월반환', () => {
    expect(returnMonths(plan({ investAmount: 600_000_000, monthlyReturn: 3_500_000 }))).toBe(171)
  })

  it('권고 배당: 미취업 아들 한계 1천만 역산', () => {
    const rec = recommendDividendForSon(plan({ sonEmployed: false, shareSon: 20 }))
    // 역산: 아들 net = rec × 0.91 × 0.2 × 0.846 ≈ 10,000,000
    const sonNet = rec * 0.91 * 0.2 * (1 - 0.154)
    expect(sonNet).toBeCloseTo(10_000_000, -5)
  })

  it('runway: 기본값(인출 과다)은 지속불가 → 부족분 양수, 고갈년 존재', () => {
    const r = simulateRunway(plan())
    expect(r.sustainable).toBe(false)
    expect(r.annualShortfall).toBeGreaterThan(0)
    expect(r.depletedYear).not.toBeNull()
    // 원금은 매년(초기) 감소해야
    expect(r.rows[1].principal).toBeLessThan(r.rows[0].principal)
  })

  it('runway: 인출을 줄이면 지속가능(원금 보존, 고갈년 null)', () => {
    // 급여 0, 가수금월반환 200만 → 연 2400만. 수입 4800만 - 세 432만 = 4368만 > 2400만 → 잉여
    const r = simulateRunway(plan({ repSalaryMonthly: 0, monthlyReturn: 2_000_000 }))
    expect(r.sustainable).toBe(true)
    expect(r.annualShortfall).toBe(0)
    expect(r.depletedYear).toBeNull()
    expect(r.rows[0].net).toBeGreaterThan(0)
  })
})
