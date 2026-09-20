import { describe, it, expect } from 'vitest'
import { comprehensiveTax, comprehensiveTaxBreakdown, annualFinancialTax, perPersonYearTaxHealth, EMPTY_PENSION_PLAN } from './pensionSim'
import { annualPension } from './annualPension'
import { annualVehicle } from './annualVehicle'
import { retirementInputs } from './analysisInputs'
import { buildCashFlow } from './retirementCashflow'

describe('금융소득 비교과세와 현금흐름', () => {
  it.each([0, 10_000_000, 19_999_999, 20_000_000, 20_000_001, 21_000_000, 30_000_000])('일반 금융소득 %i: 원천징수 총액을 보존한다', income => {
    const t = comprehensiveTaxBreakdown(income, 0, 1_500_000)
    expect(t.withholdingTax).toBe(Math.round(income * 0.154))
    expect(t.additionalTax).toBe(0)
    expect(t.totalFinancialTax).toBe(t.withholdingTax)
    expect(t.exceedsThreshold).toBe(income > 20_000_000)
  })

  it.each([
    [14_000_000, 840_000], [50_000_000, 6_240_000], [88_000_000, 15_360_000],
    [150_000_000, 37_060_000], [300_000_000, 94_060_000],
    [500_000_000, 174_060_000], [1_000_000_000, 384_060_000],
  ])('국세 기본세율 경계 %i에서 누진공제와 연속성', (base, tax) => {
    expect(comprehensiveTax(base)).toBeCloseTo(tax, 4)
    expect(comprehensiveTax(base + 1) - tax).toBeGreaterThan(0)
    expect(comprehensiveTax(base + 1) - tax).toBeLessThan(1)
  })

  it('기타소득이 있으면 두 비교 산출액과 지방세를 함께 반영한다', () => {
    const t = comprehensiveTaxBreakdown(30_000_000, 50_000_000, 1_500_000)
    expect(t.generalNationalTax).toBe(11_080_000)
    expect(t.comparisonNationalTax).toBe(10_215_000)
    expect(t.totalFinancialTax).toBe(12_188_000)
    expect(t.additionalTax).toBe(7_568_000) // 기타소득 기납부 미확인, 공제하지 않음
  })

  it('선택분리과세도 전체 원천징수 + 추가 부담 = 총세액', () => {
    const t = comprehensiveTaxBreakdown(60_000_000, 0, 1_500_000, { separatedDividend: 30_000_000 })
    expect(t.totalFinancialTax).toBe(9_900_000) // 일반 462만 + 선택분리 528만
    expect(t.withholdingTax).toBe(9_240_000)
    expect(t.additionalTax).toBe(660_000)
    expect(t.exceedsThreshold).toBe(true)
    expect(comprehensiveTaxBreakdown(60_000_000, 0, 0, { separatedDividend: 60_000_000 }).exceedsThreshold).toBe(false)
  })

  it('잘못된 음수·비유한 입력으로 음수 세금이나 NaN을 만들지 않는다', () => {
    expect(comprehensiveTaxBreakdown(-1, -1, -1).totalFinancialTax).toBe(0)
    expect(comprehensiveTaxBreakdown(NaN, Infinity, NaN, { separatedDividend: Infinity }).totalFinancialTax).toBe(0)
  })

  it('조회·개인투자·연간 현금흐름의 세금이 일치하고 한 번만 차감한다', () => {
    const year = new Date().getFullYear()
    const plan = {
      ...EMPTY_PENSION_PLAN, sources: [], allocations: [], startYear: year, refYear: year,
      spouseDependent: false, dependents: 0, useStandardDeduction: false,
      stockAccount: {
        husband: { extraAmount: 100_000_000, dividendYield: 21, growthRate: 0 },
        wife: { extraAmount: 100_000_000, dividendYield: 18, growthRate: 0 },
      },
    }
    const before = JSON.stringify(plan)
    const row = annualPension(plan, [], year, year, { currentYear: year, simulation: true, growth: 0 }).rows[0]
    const detail = annualFinancialTax(row, plan)
    expect(detail.husband.totalFinancialTax).toBe(3_234_000)
    expect(detail.wife.totalFinancialTax).toBe(2_772_000)
    expect(detail.husband.exceedsThreshold).toBe(true)
    expect(detail.wife.exceedsThreshold).toBe(false)
    const prop = { propertyTaxBase: 0, rentalDeposit: 0 }
    const yearly = perPersonYearTaxHealth(row, plan, prop, prop)
    const vehicle = annualVehicle(plan, row, { husband: prop, wife: prop })
    expect(vehicle.totals.totalAnnualTax).toBe(6_006_000)
    expect(yearly.husbandTax + yearly.wifeTax).toBe(vehicle.totals.totalAnnualTax)
    const retirement = retirementInputs({ retirementYear: year, expenses: [], travel: [], emergency: [], lumpsum: [], medicalMonthly: 0, holdingTaxAuto: false, holdingTaxAnnual: 0 }).plan
    const cf = buildCashFlow(retirement, new Map(), 60, 0, 0, undefined, 0, {
      nationalByYear: new Map(), privateByYear: new Map(), healthByYear: new Map(),
      dividendByYear: new Map([[year, 39_000_000 / 12]]), taxByYear: new Map([[year, vehicle.totals.totalAnnualTax]]),
    })[0]
    expect(cf.totalIncome).toBe(39_000_000 / 12)
    expect(cf.incomeTaxAnnual).toBe(6_006_000)
    expect(cf.taxAnnual).toBe(-6_006_000)
    expect(cf.cumulative).toBe(32_994_000)
    expect(JSON.stringify(plan)).toBe(before)
  })
})
