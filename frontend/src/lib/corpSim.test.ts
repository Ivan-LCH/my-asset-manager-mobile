import { describe, it, expect } from 'vitest'
import {
  EMPTY_CORP_PLAN, grossDividend, corpTaxOn, computeCorp, computePersonal,
  sonAccumulation, returnMonths, recommendDividendForSon, shareSum, simulateRunway,
  salariedCount, computeTwoPhase, blendedYield, comprehensiveTax,
} from '@/lib/corpSim'
import type { CorpSimPlan } from '@/types'

const plan = (over: Partial<CorpSimPlan> = {}): CorpSimPlan => ({ ...EMPTY_CORP_PLAN, ...over })

describe('corpSim 계산', () => {
  it('배당총액: target=0 이면 (출자+가수금)×수익률', () => {
    expect(grossDividend(plan({ capitalContribution: 0, loanAmount: 600_000_000, dividendYield: 8 }))).toBe(48_000_000)
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

  it('개인 시나리오: 금융소득 2천만 초과 시 종합과세(누진) 추가', () => {
    const p = plan({ targetDividendTotal: 48_000_000 })
    const r = computePersonal(p)
    expect(r.dividendTax).toBeCloseTo(48_000_000 * 0.154)
    // 4800만 > 2000만 → 초과분 2800만, 종합소득 2800만(연금 0) → 15% 구간
    // comprehensiveTax(2800만) = 2800만×0.15 - 126만 = 294만
    expect(r.combinedExtra).toBeCloseTo(28_000_000 * 0.15 - 1_260_000)
    expect(r.marginalRate).toBeGreaterThan(0)
  })

  it('comprehensiveTax: 누진구간 경계', () => {
    expect(comprehensiveTax(10_000_000)).toBeCloseTo(10_000_000 * 0.06)       // 6%
    expect(comprehensiveTax(14_000_000)).toBeCloseTo(14_000_000 * 0.06)        // 6% 경계
    expect(comprehensiveTax(20_000_000)).toBeCloseTo(20_000_000 * 0.15 - 1_260_000) // 15%
    expect(comprehensiveTax(60_000_000)).toBeCloseTo(60_000_000 * 0.24 - 5_760_000) // 24%
    expect(comprehensiveTax(100_000_000)).toBeCloseTo(100_000_000 * 0.35 - 15_440_000) // 35%
  })

  it('자녀 누적: 매년 동액 누적', () => {
    const rows = sonAccumulation(plan({ targetDividendTotal: 50_000_000 }), 3)
    expect(rows).toHaveLength(3)
    const annual = rows[0].sonDividend
    expect(rows[2].cumulative).toBeCloseTo(annual * 3)
  })

  it('가수금 반환 개월 = 가수금 / 월반환 (출자금 제외)', () => {
    expect(returnMonths(plan({ capitalContribution: 1_000_000, loanAmount: 600_000_000, monthlyReturn: 3_500_000 }))).toBe(171)
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
    // 부부 급여 모두 0, 가수금월반환 200만 → 연 2400만. 수입 4800만 - 세 432만 = 4368만 > 2400만 → 잉여
    const r = simulateRunway(plan({ repSalaryMonthly: 0, repSalaryHusbandMonthly: 0, monthlyReturn: 2_000_000 }))
    expect(r.sustainable).toBe(true)
    expect(r.annualShortfall).toBe(0)
    expect(r.depletedYear).toBeNull()
    expect(r.rows[0].net).toBeGreaterThan(0)
  })

  // ── CS 신규: 남편 급여·2인 건보 · 2상 비교 · 포트폴리오 ──
  it('salariedCount: 부부 모두 급여면 2, 한쪽만이면 1', () => {
    expect(salariedCount(plan())).toBe(2)
    expect(salariedCount(plan({ repSalaryHusbandMonthly: 0 }))).toBe(1)
  })

  it('computeCorp: 건보는 급여받는 인원수 × 직장건보', () => {
    expect(computeCorp(plan()).corpHealthAnnual).toBe(2 * 70_000 * 12)
    expect(computeCorp(plan({ repSalaryHusbandMonthly: 0 })).corpHealthAnnual).toBe(1 * 70_000 * 12)
  })

  it('computeTwoPhase: Phase2 비용이 Phase1보다 크다 (배당세 추가)', () => {
    const r = computeTwoPhase(plan())
    expect(r.cost2).toBeGreaterThan(r.cost1)
    expect(r.diff).toBeGreaterThan(0)
    // Phase2 배당 인출 = 가수금 월반환 × 12
    expect(r.dividendDist).toBe(plan().monthlyReturn * 12)
  })

  it('computeTwoPhase: 배당인출이 2천만 초과 시 종합과세 추가', () => {
    // monthlyReturn 200만 → 연 2400만 > 2000만 → combinedExtra > 0
    const r = computeTwoPhase(plan({ monthlyReturn: 2_000_000 }))
    expect(r.combinedExtra).toBeGreaterThan(0)
  })

  it('blendedYield: 비중 가중평균', () => {
    const yields = [{ ticker: 'A', yield: 4 }, { ticker: 'B', yield: 8 }]
    const portfolio = [{ ticker: 'A', weight: 1 }, { ticker: 'B', weight: 1 }]
    expect(blendedYield(yields, portfolio)).toBeCloseTo(6) // (4+8)/2
    // 비중 1:3
    expect(blendedYield(yields, [{ ticker: 'A', weight: 1 }, { ticker: 'B', weight: 3 }])).toBeCloseTo(7)
  })
})
