// 연금 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
// 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델. 1인(남편/와이프) 단위 과세.
// 기존 연금원천(sources)은 그대로 가정(연금=남편 명의), + 유입 항목의 목적지·명의에
// 따라 1인별 세금·건보를 산출 → 가구 총계.
// 모든 수치는 사용자 가정에 기반한 추정치.
import type { PensionSimPlan, PensionSource, PensionInflowItem, Ownership, PortfolioHolding, PortfolioYield } from '@/types'
import { blendedYield } from '@/lib/corpSim'
import { calcHealthInsurance } from '@/lib/healthInsurance'

/** 연금소득세 누진구간 (연금소득 전용, 종합소득세와 별개) */
export function pensionIncomeTax(taxable: number): number {
  if (taxable <= 0) return 0
  if (taxable <= 34_000_000) return taxable * 0.03
  if (taxable <= 76_000_000) return taxable * 0.04 - 340_000
  if (taxable <= 138_000_000) return taxable * 0.05 - 1_100_000
  return taxable * 0.06 - 2_480_000
}

/** 종합소득세 누진세율 (2024년 기준, 단순화) */
export function comprehensiveTax(taxableIncome: number): number {
  const t = Math.max(0, taxableIncome)
  if (t <= 0) return 0
  if (t <= 14_000_000) return t * 0.06
  if (t <= 50_000_000) return t * 0.15 - 1_260_000
  if (t <= 88_000_000) return t * 0.24 - 5_760_000
  if (t <= 150_000_000) return t * 0.35 - 15_400_000
  if (t <= 300_000_000) return t * 0.38 - 19_900_000
  if (t <= 500_000_000) return t * 0.40 - 25_900_000
  if (t <= 1_000_000_000) return t * 0.42 - 31_900_000
  return t * 0.45 - 61_900_000
}

/** 분리과세율 (이자·배당 15.4%) */
export const SEPARATED_TAX_RATE = 0.154

/** 금융소득종합과세 기준 — 연 2천만원 초과분은 종합소득세 합산 (1인별 적용) */
export const FINANCIAL_INCOME_LIMIT = 20_000_000

/** 금융소득 과세 분해 (1인분) */
export interface TaxBreakdown {
  financialIncome:        number
  separatedTax:           number
  consolidatedFinancial:  number
  comprehensiveTaxable:   number
  comprehensiveTax:       number
  totalFinancialTax:      number
}
export function comprehensiveTaxBreakdown(
  financialIncome: number,
  otherIncome: number,
  deduction: number,
): TaxBreakdown {
  const separated = Math.min(financialIncome, FINANCIAL_INCOME_LIMIT)
  const separatedTax = Math.round(separated * SEPARATED_TAX_RATE)
  const consolidatedFinancial = Math.max(0, financialIncome - FINANCIAL_INCOME_LIMIT)
  const comprehensiveBase = consolidatedFinancial + Math.max(0, otherIncome)
  const comprehensiveTaxable = Math.max(0, comprehensiveBase - deduction)
  const compTax = comprehensiveTax(comprehensiveTaxable)
  return {
    financialIncome, separatedTax,
    consolidatedFinancial, comprehensiveTaxable,
    comprehensiveTax: compTax,
    totalFinancialTax: separatedTax + compTax,
  }
}

/** 지역건강보험료 추정(월) — 소득분(연금 50%·금융/기타 100%) × 7.09% + 장기요양 12.95%. 1인분. */
export function estimateHealthInsurance(
  pensionAnnual: number,
  financialAnnual: number,
  otherAnnual: number,
): number {
  const RATE = 0.0709
  const LONG_TERM = 0.1295
  const MIN_HEALTH = 19_780
  const totalIncome = financialAnnual * 1.0 + pensionAnnual * 0.5 + otherAnnual * 1.0
  const incomeMonthly = totalIncome > 0 ? (totalIncome / 12) * RATE : 0
  const healthMonthly = Math.max(incomeMonthly, totalIncome > 0 ? MIN_HEALTH : 0)
  return Math.round(healthMonthly) + Math.round(healthMonthly * LONG_TERM)
}

/** 일반주식계좌 잔액 = stock 유입 합 (일회성 + 연간). 수동 입력 아님. */
export function stockBalanceFromInflows(inflows: PensionInflowItem[]): number {
  return inflows
    .filter((i) => i.destination === 'stock')
    .reduce((s, i) => s + i.amount, 0)
}

/** 종목별 배당률 → 가중평균. 수동 > 자동조회 > 0. */
export function blendedYieldWithFallback(
  yields: PortfolioYield[],
  holdings: PortfolioHolding[],
): number {
  return blendedYield(yields, holdings)
}

/** 기본 입력값 (샘플) */
export const EMPTY_PENSION_PLAN: PensionSimPlan = {
  sources: [
    { id: 'irp1', name: '퇴직연금(DC) → IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 4, owner: 'husband' },
    { id: 'pen1', name: '연금저축(98년 비과세)', principal: 100_000_000, taxType: 'taxExempt', yieldRate: 4, owner: 'husband' },
  ],
  inflows: [],
  stockHoldings: [],
  stockYields: [],
  stockOwnership: { husband: 50, wife: 50 },
  otherIncome: 0,
  spouseDependent: true,
  dependents: 0,
  useStandardDeduction: true,
  withdrawalYears: 30,
  startYear: new Date().getFullYear() + 3,
  pensionDeduction: 12_000_000,
}

/** 연금 원천 총액 */
export const totalPrincipal = (plan: PensionSimPlan): number =>
  plan.sources.reduce((s, src) => s + src.principal, 0)

/** + 유입 항목 합계 */
export const totalInflows = (plan: PensionSimPlan): number =>
  plan.inflows.reduce((s, it) => s + it.amount, 0)

/** 1인별 종합소득공제 자동 계산 (법정 한도, 단순화).
 *  본인 150만 + (배우자 150만 + 부양가족 150만×N + 표준공제 100만) ÷ 2
 *  배우자/부양가족/표준은 부부 공통으로 반씩 분배. */
export function computePerPersonComprehensiveDeduction(plan: Pick<PensionSimPlan, 'spouseDependent' | 'dependents' | 'useStandardDeduction'>): { husband: number; wife: number } {
  const shared = (plan.spouseDependent ? 1_500_000 : 0)
              + plan.dependents * 1_500_000
              + (plan.useStandardDeduction ? 1_000_000 : 0)
  const perPerson = 1_500_000 + shared / 2
  return { husband: perPerson, wife: perPerson }
}

/** 일반주식계좌 blended 배당률(%) — 종목 기반, 실패 시 stockManualYield */
export function stockAccountYield(plan: PensionSimPlan): number {
  if (plan.stockHoldings.length > 0) {
    const y = blendedYieldWithFallback(plan.stockYields, plan.stockHoldings)
    if (y > 0) return y
  }
  return plan.stockManualYield ?? 0
}

// ── 1인별 결과 ───────────────────────────────────────────────
export interface PersonVehicleResult {
  owner:                'husband' | 'wife'
  irpPrincipal:         number
  exemptPrincipal:      number
  annualPensionTaxable: number
  annualPensionExempt:  number
  pensionTax:           number
  stockBalance:         number        // 본인 주식잔액 지분
  financialIncome:      number        // 본인 금융소득(배당+연간유입)
  financialTax:         number
  separatedTax:         number
  consolidatedFinancial:number
  comprehensiveTaxable: number        // 과세표준
  comprehensiveTax:     number
  healthMonthly:        number
  totalAnnualTax:       number
  grossAnnual:          number
  netAnnual:            number
}

export interface HouseholdVehicleResult {
  husband: PersonVehicleResult
  wife:    PersonVehicleResult
  totals: {
    stockBalance:    number
    financialIncome: number
    pensionTax:      number
    financialTax:    number
    totalAnnualTax:  number
    grossAnnual:     number
    netAnnual:       number
    healthMonthly:   number
  }
}

/** 1인별 부동산 재산분 옵션 (PensionSimPage에서 realEstatePropertyBases로 산출해 전달). */
export interface PersonProperty {
  propertyTaxBase: number
  rentalDeposit:  number
  carValue?:       number
}
export interface VehicleOptions {
  husbandProperty?: PersonProperty
  wifeProperty?:    PersonProperty
  scorePerPoint?:   number
}

/** 1인별 연금·개인 vehicle 결과.
 *  - 연금(IRP/과세/비과세 원금) = 남편 100% (연금=남편 가정).
 *  - 일반주식계좌 잔액 = stockBalanceFromInflows → stockOwnership으로 1인 분할.
 *  - 금융소득 2천만 한도·연금소득세·건보 모두 1인별 산출.
 *  - 건보 재산분은 opts.property(부동산 명의 가중)로 1인별 — 미제공 시 소득분만. */
export function computePensionVehiclePerPerson(plan: PensionSimPlan, opts?: VehicleOptions): HouseholdVehicleResult {
  const years = plan.withdrawalYears || 1

  // 기존 sources (남편 명의 가정) 분류
  const taxableSrc = plan.sources
    .filter((s) => s.taxType === 'irp' || s.taxType === 'national' || s.taxType === 'taxable')
    .reduce((s, src) => s + src.principal, 0)
  const exemptSrc = plan.sources
    .filter((s) => s.taxType === 'taxExempt')
    .reduce((s, src) => s + src.principal, 0)

  // IRP 유입은 남편(퇴직) 명의로 합산
  const irpInflow = plan.inflows.filter((i) => i.destination === 'irp').reduce((s, i) => s + i.amount, 0)

  // 일반주식계좌: 잔액은 stock 유입에서, 명의는 stockOwnership
  const stockTotal = stockBalanceFromInflows(plan.inflows)
  const yieldPct = stockAccountYield(plan)
  const annualDividendTotal = Math.round(stockTotal * (yieldPct / 100))
  const stockAnnual = plan.inflows.filter((i) => i.destination === 'stock' && i.type === 'annual').reduce((s, i) => s + i.amount, 0)

  // 주식 소득 1인 분할 (배당 + 연간 유입 모두 동일 지분 적용)
  const husbandShare = plan.stockOwnership.husband / 100
  const wifeShare = plan.stockOwnership.wife / 100
  const fin = {
    husband: annualDividendTotal * husbandShare + stockAnnual * husbandShare,
    wife: annualDividendTotal * wifeShare + stockAnnual * wifeShare,
  }

  // 기타소득은 남편 근로 가정(연금시뮬에선 남편에 배정; 은퇴계획에서 1인별 처리)
  const other = { husband: plan.otherIncome, wife: 0 }

  // 1인별 종합소득공제 자동 산정
  const perPersonDed = computePerPersonComprehensiveDeduction(plan)

  // 1인별 연금 — 남편만 (와이프 연금 0)
  const annualPensionTaxableH = (taxableSrc + irpInflow) / years
  const annualPensionExemptH = exemptSrc / years
  const pensionTaxH = pensionIncomeTax(Math.max(0, annualPensionTaxableH - plan.pensionDeduction))

  const computePerson = (owner: 'husband' | 'wife'): PersonVehicleResult => {
    const isHusband = owner === 'husband'
    const irpPrincipal = isHusband ? taxableSrc + irpInflow : 0
    const exemptPrincipal = isHusband ? exemptSrc : 0
    const annualPensionTaxable = isHusband ? annualPensionTaxableH : 0
    const annualPensionExempt = isHusband ? annualPensionExemptH : 0
    const pensionTax = isHusband ? pensionTaxH : 0

    const personFin = isHusband ? fin.husband : fin.wife
    const personOther = isHusband ? other.husband : other.wife
    const personDeduction = (isHusband ? perPersonDed.husband : perPersonDed.wife)
    const ft = comprehensiveTaxBreakdown(personFin, personOther, personDeduction)

    const stockBalance = stockTotal * (isHusband ? husbandShare : wifeShare)
    const prop = isHusband ? opts?.husbandProperty : opts?.wifeProperty
    const healthMonthly = prop
      ? calcHealthInsurance({
          pensionAnnual: annualPensionTaxable + annualPensionExempt,
          dividendAnnual: personFin,
          otherAnnual: personOther,
          propertyTaxBase: prop.propertyTaxBase,
          rentalDeposit: prop.rentalDeposit,
          carValue: prop.carValue ?? 0,
          scorePerPoint: opts?.scorePerPoint ?? 208.4,
        }).grandTotal
      : estimateHealthInsurance(annualPensionTaxable + annualPensionExempt, personFin, personOther)

    const grossAnnual = annualPensionTaxable + annualPensionExempt + personFin
    const totalAnnualTax = pensionTax + ft.totalFinancialTax
    return {
      owner, irpPrincipal, exemptPrincipal,
      annualPensionTaxable, annualPensionExempt, pensionTax,
      stockBalance, financialIncome: personFin,
      financialTax: ft.totalFinancialTax, separatedTax: ft.separatedTax,
      consolidatedFinancial: ft.consolidatedFinancial,
      comprehensiveTaxable: ft.comprehensiveTaxable,
      comprehensiveTax: ft.comprehensiveTax,
      healthMonthly, totalAnnualTax,
      grossAnnual, netAnnual: grossAnnual - totalAnnualTax,
    }
  }

  const husband = computePerson('husband')
  const wife = computePerson('wife')

  const sum = (k: keyof PersonVehicleResult) => (husband[k] as number) + (wife[k] as number)
  return {
    husband, wife,
    totals: {
      stockBalance: husband.stockBalance + wife.stockBalance,
      financialIncome: sum('financialIncome'),
      pensionTax: sum('pensionTax'),
      financialTax: sum('financialTax'),
      totalAnnualTax: sum('totalAnnualTax'),
      grossAnnual: sum('grossAnnual'),
      netAnnual: sum('netAnnual'),
      healthMonthly: husband.healthMonthly + wife.healthMonthly,
    },
  }
}

/** @deprecated Phase C RetirementPage 연결 전 호환 shim — 가구 합계만 반환. */
export function computePensionVehicle(plan: PensionSimPlan) {
  const h = computePensionVehiclePerPerson(plan)
  const t = h.totals
  return {
    irpPrincipal: h.husband.irpPrincipal,
    exemptPrincipal: h.husband.exemptPrincipal,
    annualPensionTaxable: h.husband.annualPensionTaxable,
    annualPensionExempt: h.husband.annualPensionExempt,
    pensionTaxable: Math.max(0, h.husband.annualPensionTaxable - plan.pensionDeduction),
    pensionTax: t.pensionTax,
    stockBalance: t.stockBalance,
    financialIncome: t.financialIncome,
    financialTax: t.financialTax,
    separatedTax: h.husband.separatedTax + h.wife.separatedTax,
    consolidatedFinancial: h.husband.consolidatedFinancial + h.wife.consolidatedFinancial,
    comprehensiveTax: h.husband.comprehensiveTax + h.wife.comprehensiveTax,
    healthMonthly: t.healthMonthly,
    totalAnnualTax: t.totalAnnualTax,
    grossAnnual: t.grossAnnual,
    netAnnual: t.netAnnual,
  }
}

/** PENSION 자산에서 PensionSource 자동 생성 */
export function sourcesFromAssets(
  assets: { id: string; name: string; currentValue: number; detail?: { pensionType?: string } }[],
  existing: PensionSource[],
): PensionSource[] {
  return assets.map((a) => {
    const pt = a.detail?.pensionType ?? ''
    const taxType = pt.includes('퇴직') ? 'irp' : pt.includes('국민') ? 'national' : pt.includes('비과세') ? 'taxExempt' : 'taxable'
    const existingSrc = existing.find((s) => s.id === a.id)
    return {
      id: a.id,
      name: a.name,
      principal: existingSrc?.principal ?? a.currentValue,
      taxType: existingSrc?.taxType ?? taxType,
      yieldRate: existingSrc?.yieldRate ?? 4,
      owner: existingSrc?.owner ?? 'husband',
    }
  })
}

// (Ownership/PRESET helpers는 types에서 export — PensionSimPage에서 직접 import)
export type { Ownership }
