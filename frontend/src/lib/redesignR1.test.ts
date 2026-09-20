import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getRetirement, saveRetirement } from './db'
import { EMPTY_PLAN, normalizeSavedPlan } from './retirementPlan'
import { EMPTY_PENSION_PLAN, pensionSchedule } from './pensionSim'
import { EMPTY_CORP_PLAN } from './corpSim'
import { buildCorpCashFlow } from './corpCashFlow'
import { buildCashFlow } from './retirementCashflow'

// 합성 금액의 집계/저장 회귀 검사. 법정 세율·개인별 세액의 정답 검증이 아니다.
describe('R1-A F01 국민연금 중복 방지', () => {
  const national = { id: 'synthetic-national', name: '합성 국민연금', principal: 0,
    taxType: 'national' as const, yieldRate: 0, owner: 'husband' as const,
    expectedMonthlyPayout: 1_000_000, expectedStartYear: 2030, expectedEndYear: 2060, annualGrowthRate: 0 }
  it('sources와 nationals에 같은 월수령액이 있어도 연 1,200만원만 집계한다', () => {
    const plan = { ...EMPTY_PENSION_PLAN, sources: [national], allocations: [] }
    const [row] = pensionSchedule(plan, [national], 2030, 2030, { currentYear: 2030 })
    expect(row.nationalAnnual).toBe(12_000_000)
    expect(row.drawdownAnnual).toBe(0)
    expect(row.taxableAnnual).toBe(12_000_000)
    expect(row.totalAnnual).toBe(12_000_000)
  })
  it('사적 연금 지급은 보존하고 국민연금 개시 전후에도 중복하지 않는다', () => {
    const plan = { ...EMPTY_PENSION_PLAN, allocations: [], sources: [national,
      { ...national, id: 'synthetic-private', taxType: 'taxExempt' as const, expectedMonthlyPayout: 500_000, expectedStartYear: 2029 }], startYear: 2029 }
    const [before, after] = pensionSchedule(plan, [national], 2029, 2030, { currentYear: 2029 })
    expect(before.nationalAnnual).toBe(0)
    expect(before.drawdownAnnual).toBe(6_000_000)
    expect(after.drawdownAnnual).toBe(6_000_000)
    expect(after.totalAnnual).toBe(18_000_000)
    expect(after.exemptAnnual).toBe(6_000_000)
  })
})

describe('R1-A F02 은퇴계획 부분 저장', () => {
  beforeEach(async () => { await db.settings.clear() })
  it('생활비 저장 후 수동 보유세·개시연도·다른 입력이 보존된다', async () => {
    await saveRetirement({ ...EMPTY_PLAN, holdingTaxAuto: false, holdingTaxAnnual: 1_200_000,
      holdingTaxStartYear: 2030, emergency: [{ id: 'e', name: '합성 비용', year: 2031, amount: 100 }] })
    await saveRetirement({ expenses: [{ id: 'food', name: '식비', amount: 700_000 }] })
    const plan = normalizeSavedPlan(await getRetirement())
    expect(plan.holdingTaxAuto).toBe(false)
    expect(plan.holdingTaxAnnual).toBe(1_200_000)
    expect(plan.holdingTaxStartYear).toBe(2030)
    expect(plan.emergency[0].amount).toBe(100)
    expect(plan.expenses[0].amount).toBe(700_000)
  })
  it('서로 다른 항목을 동시에 저장해도 두 변경이 보존된다', async () => {
    await saveRetirement(EMPTY_PLAN)
    await Promise.all([saveRetirement({ medicalMonthly: 300_000 }), saveRetirement({ holdingTaxAnnual: 500_000, holdingTaxAuto: false })])
    const plan = await getRetirement()
    expect(plan.medicalMonthly).toBe(300_000)
    expect(plan.holdingTaxAnnual).toBe(500_000)
    expect(plan.holdingTaxAuto).toBe(false)
  })
  it('구버전 수동 세금 0원·미지 필드도 다른 항목 저장으로 바뀌지 않는다', async () => {
    await db.settings.put({ key: 'retirement_plan', value: JSON.stringify({ holdingTaxAnnual: 0, extension: { preserve: true } }) })
    await saveRetirement({ medicalMonthly: 0 })
    const saved = await getRetirement()
    expect(normalizeSavedPlan(saved).holdingTaxAuto).toBe(false)
    expect(saved).toMatchObject({ extension: { preserve: true }, medicalMonthly: 0 })
  })
  it('명시적으로 개시연도를 지울 수 있고 생략한 값은 보존한다', async () => {
    await saveRetirement({ holdingTaxAnnual: 100, holdingTaxStartYear: 2030 })
    await saveRetirement({ holdingTaxStartYear: undefined })
    expect(await getRetirement()).toEqual({ holdingTaxAnnual: 100 })
  })
  it.each(['not-json', 'null', '[]'])('손상된 기존 JSON(%s)은 덮어쓰지 않는다', async (value) => {
    await db.settings.put({ key: 'retirement_plan', value })
    await expect(saveRetirement({ medicalMonthly: 100 })).rejects.toThrow()
    expect((await db.settings.get('retirement_plan'))?.value).toBe(value)
  })
})

describe('R1-A F08 법인 배당 원천징수 단일 반영', () => {
  const empty = { ...EMPTY_PLAN, expenses: [], medicalMonthly: 0, travel: [], emergency: [], lumpsum: [], holdingTaxAnnual: 0 }
  it.each([0, 0.1, 0.154])('사용자 원천징수 가정 %s를 세전 배당에 한 번 적용한다', (rate) => {
    const corp = buildCorpCashFlow({ ...EMPTY_CORP_PLAN, targetDividendTotal: 12_000_000,
      repSalaryMonthly: 0, repSalaryHusbandMonthly: 0, loanAmount: 0, monthlyReturn: 0,
      shareHusband: 100, shareWife: 0,
      tax: { ...EMPTY_CORP_PLAN.tax, corpTaxRateLow: 0, corpTaxRateMid: 0, dividendTaxRate: rate } })
    expect(corp.divP1Monthly).toBe(1_000_000)
    expect(corp.divP2Monthly).toBe(1_000_000)
    const rows = buildCashFlow(empty, new Map(), 60, 0, 0, corp)
    for (const row of rows.slice(0, 3)) {
      expect(row.dividendMonthly).toBe(1_000_000)
      expect(row.incomeTaxAnnual).toBe(12_000_000 * rate)
      expect(row.taxAnnual).toBeCloseTo(-12_000_000 * rate)
    }
    expect(rows[0].cumulative).toBeCloseTo(12_000_000 * (1 - rate))
  })
  it('소득세·보유세·목돈 세금 상세 합계와 현금흐름 차감액이 일치한다', () => {
    const row = buildCashFlow(empty, new Map(), 60, 0, 0,
      { salaryMonthly: 0, phaseBoundaryYear: 2040, returnP1Monthly: 0, divP1Monthly: 1_000_000, divP2Monthly: 1_000_000, dividendTaxRate: 0.1 },
      0, undefined, [], new Map([[2029, 200_000]]), new Map([[2029, 1_200_000]])).find(r => r.year === 2029)!
    expect(row.taxAnnual).toBe(-2_600_000)
    expect(row.incomeTaxAnnual + row.holdingTaxAnnual + row.lumpsumTaxAnnual).toBe(-row.taxAnnual)
  })
  it('비연동 배당과 연금 연동 세금 경로는 기존 입력 계약을 유지한다', () => {
    expect(buildCashFlow(empty, new Map(), 60, 1_000_000, 0)[0].taxAnnual).toBe(-1_848_000)
    const row = buildCashFlow(empty, new Map(), 60, 0, 0, undefined, 0,
      { nationalByYear: new Map(), privateByYear: new Map(), dividendByYear: new Map([[2029, 1_000_000]]), healthByYear: new Map(), taxByYear: new Map([[2029, 123]]) }).find(r => r.year === 2029)!
    expect(row.incomeTaxAnnual).toBe(123)
    expect(row.taxAnnual).toBe(-123)
  })
})
