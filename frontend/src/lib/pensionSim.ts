// 연금 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
// 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델.
// 기존 연금원천(sources)은 그대로 가정하고, 추가 + 유입 항목(inflows)의
// 목적지(퇴직IRP / 일반주식계좌)에 따른 연간 세금·건보·순취득을 산출.
// 모든 수치는 사용자 가정에 기반한 추정치.
import type { PensionSimPlan, PensionSource } from '@/types'

/** 연금소득세 누진구간 (연금소득 전용, 종합소득세와 별개)
 *  ~1,200만: 면세(공제) / ~4,600만: 3% / ~8,800만: 4% / ~1.5억: 5% / 6%
 *  (과세표준 = 연금수령액 − 1,200만 연금소득공제)
 */
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

/** 금융소득종합과세 기준 — 연 2천만원 초과분은 종합소득세 합산과세 */
export const FINANCIAL_INCOME_LIMIT = 20_000_000

/** 금융소득 과세 분해 — 분리과세/종합합산/종합소득세 */
export interface TaxBreakdown {
  financialIncome:        number
  separatedTax:           number  // 분리과세액 (한도 이하, 15.4%)
  consolidatedFinancial:  number  // 종합합산 금융소득 (한도 초과분)
  comprehensiveTaxable:   number  // 종합소득세 과세표준
  comprehensiveTax:       number  // 종합소득세
  totalFinancialTax:      number  // 분리과세 + 종합소득세
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

/** 지역건강보험료 추정(월) — 소득월액(연금 50%·금융/기타 100%) × 7.09% + 장기요양 12.95%.
 *  재산·자동차 분은 은퇴계획 페이지에서 별도 산정하므로 여기선 소득분만 단순 추정. */
export function estimateHealthInsurance(
  pensionAnnual: number,
  financialAnnual: number,
  otherAnnual: number,
): { healthMonthly: number; longTermMonthly: number; totalMonthly: number } {
  const RATE = 0.0709
  const LONG_TERM = 0.1295
  const MIN_HEALTH = 19_780
  const totalIncome = financialAnnual * 1.0 + pensionAnnual * 0.5 + otherAnnual * 1.0
  const incomeMonthly = totalIncome > 0 ? (totalIncome / 12) * RATE : 0
  const healthMonthly = Math.max(incomeMonthly, totalIncome > 0 ? MIN_HEALTH : 0)
  const longTermMonthly = Math.round(healthMonthly * LONG_TERM)
  return { healthMonthly: Math.round(healthMonthly), longTermMonthly, totalMonthly: Math.round(healthMonthly) + longTermMonthly }
}

/** 기본 입력값 (샘플) */
export const EMPTY_PENSION_PLAN: PensionSimPlan = {
  sources: [
    { id: 'irp1', name: '퇴직연금(DC) → IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 4 },
    { id: 'pen1', name: '연금저축(98년 비과세)', principal: 100_000_000, taxType: 'taxExempt', yieldRate: 4 },
  ],
  inflows: [],
  stockBalance: 0,
  stockDividendYield: 6,
  otherIncome: 0,
  comprehensiveDeduction: 1_500_000,
  withdrawalYears: 30,
  startYear: new Date().getFullYear() + 3,
  pensionDeduction: 12_000_000,
}

/** 연금 원천 총액 (기존 sources) */
export const totalPrincipal = (plan: PensionSimPlan): number =>
  plan.sources.reduce((s, src) => s + src.principal, 0)

/** + 유입 항목 합계 */
export const totalInflows = (plan: PensionSimPlan): number =>
  plan.inflows.reduce((s, it) => s + it.amount, 0)

export interface PensionVehicleResult {
  // IRP side
  irpPrincipal:           number   // IRP 총 원금 (기존 sources + IRP 유입)
  exemptPrincipal:        number   // 비과세 연금 원금
  annualPensionTaxable:   number   // 연 과세 연금 수령
  annualPensionExempt:    number   // 연 비과세 연금 수령
  pensionTaxable:         number   // 연금소득세 과세표준
  pensionTax:             number   // 연금소득세(연)
  // Stock side
  stockBalance:           number   // 일반주식계좌 총액 (기본 + 일회성 유입)
  financialIncome:        number   // 연간 금융소득 (배당 + 연간 유입)
  financialTax:           number   // 금융소득세 (분리+종합)
  separatedTax:           number
  consolidatedFinancial:  number
  comprehensiveTax:       number
  // 건보
  healthMonthly:          number   // 지역건보(월, 소득분 추정)
  // totals
  totalAnnualTax:         number   // 연금소득세 + 금융소득세 (연)
  grossAnnual:            number   // 연 총수입 (연금수령 + 금융소득)
  netAnnual:              number   // 연 순취득 (총수입 − 세금)
}

/**
 * 연금·개인 vehicle 연간 결과 산출.
 * 모든 유입 항목은 수령 개시 전에 도착한다고 가정 — 각 항목의 year는 기록용이며
 * 잔액 계산에는 전량 반영된다 (연도별 시점 배치는 은퇴계획 현금흐름에서).
 * - IRP 유입 → IRP 원금 합산, 수령기간으로 균등 인출.
 * - 주식 일회성 → 잔액 가산(배당 발생), 연간 → 직접 금융소득 가산.
 */
export function computePensionVehicle(plan: PensionSimPlan): PensionVehicleResult {
  const years = plan.withdrawalYears || 1

  // 기존 sources 분류
  const taxableSrc = plan.sources
    .filter((s) => s.taxType === 'irp' || s.taxType === 'national' || s.taxType === 'taxable')
    .reduce((s, src) => s + src.principal, 0)
  const exemptSrc = plan.sources
    .filter((s) => s.taxType === 'taxExempt')
    .reduce((s, src) => s + src.principal, 0)

  // 유입 항목을 목적지/유형별로 합산 (전량 잔액에 반영)
  const irpInflow = plan.inflows.filter((i) => i.destination === 'irp').reduce((s, i) => s + i.amount, 0)
  const stockLumpsum = plan.inflows.filter((i) => i.destination === 'stock' && i.type === 'lumpsum').reduce((s, i) => s + i.amount, 0)
  const stockAnnual = plan.inflows.filter((i) => i.destination === 'stock' && i.type === 'annual').reduce((s, i) => s + i.amount, 0)

  // IRP 수령
  const irpPrincipal = taxableSrc + irpInflow
  const exemptPrincipal = exemptSrc
  const annualPensionTaxable = irpPrincipal / years
  const annualPensionExempt = exemptPrincipal / years
  const pensionTaxable = Math.max(0, annualPensionTaxable - plan.pensionDeduction)
  const pensionTax = pensionIncomeTax(pensionTaxable)

  // 주식/금융소득
  const stockBalance = plan.stockBalance + stockLumpsum
  const annualDividend = Math.round(stockBalance * (plan.stockDividendYield / 100))
  const financialIncome = annualDividend + stockAnnual
  const fin = comprehensiveTaxBreakdown(financialIncome, plan.otherIncome, plan.comprehensiveDeduction)

  // 건보 (월)
  const hi = estimateHealthInsurance(annualPensionTaxable + annualPensionExempt, financialIncome, plan.otherIncome)

  const grossAnnual = annualPensionTaxable + annualPensionExempt + financialIncome
  const totalAnnualTax = pensionTax + fin.totalFinancialTax
  const netAnnual = grossAnnual - totalAnnualTax

  return {
    irpPrincipal, exemptPrincipal,
    annualPensionTaxable, annualPensionExempt,
    pensionTaxable, pensionTax,
    stockBalance, financialIncome,
    financialTax: fin.totalFinancialTax,
    separatedTax: fin.separatedTax,
    consolidatedFinancial: fin.consolidatedFinancial,
    comprehensiveTax: fin.comprehensiveTax,
    healthMonthly: hi.totalMonthly,
    totalAnnualTax, grossAnnual, netAnnual,
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
    }
  })
}
