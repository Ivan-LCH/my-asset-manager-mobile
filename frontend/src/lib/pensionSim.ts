// 연금 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
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

/** 종합소득세 누진세율 (2024년 기준, 단순화)
 *  과세표준 = (종합소득금액 − 종합소득공제)
 *  1,400만 이하 6% / ~5,000만 15% / ~8,800만 24% / ~1.5억 35% /
 *  ~3억 38% / ~5억 40% / ~10억 42% / 초과 45% (각 구간 누진공제 차감)
 */
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

/** 분리과세율 (이자·배당 15.4% = 14% 농특세 포함 단순화) */
export const SEPARATED_TAX_RATE = 0.154

/** 금융소득종합과세 기준 — 연 2천만원 초과분은 종합소득세 합산과세 */
export const FINANCIAL_INCOME_LIMIT = 20_000_000

/** 금융소득(이자+배당) 과세 분해 — 분리과세/종합합산/종합소득세
 *  - 한도 이하 금융소득: 분리과세 15.4%
 *  - 한도 초과분: otherIncome(근로/사업 등)과 합산 → 종합소득세 누진
 */
export interface TaxBreakdown {
  financialIncome:        number  // 금융소득 총액 (이자+배당)
  separated:              number  // 분리과세 대상 금융소득 (한도 이하)
  separatedTax:           number  // 분리과세액 (15.4%)
  consolidatedFinancial:  number  // 종합합산 금융소득 (한도 초과분)
  comprehensiveBase:      number  // 종합소득금액 (초과분 + 기타종합소득)
  comprehensiveTaxable:   number  // 종합소득세 과세표준 (− 종합소득공제)
  comprehensiveTax:       number  // 종합소득세
  totalFinancialTax:      number  // 금융소득 관련 총세금 = 분리과세 + 종합소득세
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
    financialIncome, separated, separatedTax,
    consolidatedFinancial, comprehensiveBase, comprehensiveTaxable,
    comprehensiveTax: compTax,
    totalFinancialTax: separatedTax + compTax,
  }
}

/** 기본 입력값 (샘플) */
export const EMPTY_PENSION_PLAN: PensionSimPlan = {
  sources: [
    { id: 'irp1', name: '퇴직연금(DC) → IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 4 },
    { id: 'pen1', name: '연금저축(98년 비과세)', principal: 100_000_000, taxType: 'taxExempt', yieldRate: 4 },
  ],
  severancePay:       150_000_000,
  rentalDeposit:     500_000_000,
  rentalYield:       6,
  rentalOwner:       'wife',
  interestIncome:    0,
  otherIncome:       0,
  comprehensiveDeduction: 1_500_000,
  withdrawalYears:    30,
  startYear:          new Date().getFullYear() + 3,
  pensionDeduction:   12_000_000,
}

/** 연금 원천 총액 */
export const totalPrincipal = (plan: PensionSimPlan): number =>
  plan.sources.reduce((s, src) => s + src.principal, 0)

/** 전세금 배당 투자 결과 — 연간 배당 추정 + 금융소득 2천만 한도 초과분 */
export function rentalDividend(plan: Pick<PensionSimPlan, 'rentalDeposit' | 'rentalYield'>) {
  const annualDividend = Math.round(plan.rentalDeposit * (plan.rentalYield / 100))
  const overLimit = Math.max(0, annualDividend - FINANCIAL_INCOME_LIMIT)
  return { annualDividend, overLimit }
}

export interface PensionYearRow {
  year:                number
  remainingBalance:    number   // 수령 전 잔액
  irpWithdraw:         number   // IRP(퇴직) 수령액 (연, 연금소득세 대상)
  taxableWithdraw:     number   // 과세 연금저축 수령액 (연, 연금소득세 대상)
  exemptWithdraw:      number   // 비과세 연금저축 수령액 (연, 세금 0)
  totalWithdraw:       number   // 총 연금 수령액 (연)
  pensionTaxable:      number   // 연금소득세 과세표준 (수령액 - 공제)
  pensionTax:          number   // 연금소득세 (별도 분류과세)
  financialIncome:     number   // 금융소득 (전세금 배당 + 이자)
  separatedTax:        number   // 금융소득 분리과세 (15.4%, 한도 이하)
  consolidatedFin:     number   // 종합합산 금융소득 (2천만 초과분)
  comprehensiveTax:    number   // 종합소득세 (초과분 + 기타소득 합산)
  totalTax:            number   // 해당 연도 총 세금 = 연금소득세 + 분리과세 + 종합소득세
  netIncome:           number   // 순소득 = 총수령 + 금융소득 − 총세금
}

export interface PensionSimResult {
  rows:              PensionYearRow[]
  annualWithdraw:    number   // 연 수령액 (고정)
  totalTax:          number   // 총 세금 (수령 기간 합계)
  totalNet:          number   // 총 순소득 (수령 기간 합계)
}

/**
 * 연도별 연금 수령 시뮬레이션.
 * 각 원천에서 매년 균등 인출 + 운용 수익(수익률)으로 잔액 감소.
 * 매년: 연금소득세(별도) + 금융소득(배당+이자)의 분리/종합과세를 모두 산출.
 */
export function simulatePension(plan: PensionSimPlan): PensionSimResult {
  const years = plan.withdrawalYears
  const deduction = plan.pensionDeduction
  const baseYear = plan.startYear

  // 각 원천의 초기 잔액 (독립 추적)
  const balances = plan.sources.map((s) => s.principal)
  // 각 원천의 연간 인출액 (균등 + 수익률 감안한 단순화: 원금/수령기간)
  const annualFromSource = plan.sources.map((s) => s.principal / years)

  // 금융소득 — 전세금 배당(연간 고정 가정) + 기타 이자
  const rental = rentalDividend(plan)
  const financialIncome = rental.annualDividend + plan.interestIncome

  const rows: PensionYearRow[] = []
  let totalTax = 0
  let totalNet = 0

  for (let i = 0; i < years; i++) {
    let irpW = 0, taxableW = 0, exemptW = 0

    plan.sources.forEach((src, idx) => {
      const rate = src.yieldRate / 100
      // 잔액에 수익률 적용 후 인출
      balances[idx] *= (1 + rate)
      const withdraw = Math.min(annualFromSource[idx], balances[idx])
      balances[idx] -= withdraw

      if (src.taxType === 'irp' || src.taxType === 'national') irpW += withdraw
      else if (src.taxType === 'taxable') taxableW += withdraw
      else exemptW += withdraw
    })

    // 연금소득세 (연금소득 = IRP + 과세 연금저축, 비과세 제외)
    const pensionIncome = irpW + taxableW
    const pensionTaxable = Math.max(0, pensionIncome - deduction)
    const pensionTax = pensionIncomeTax(pensionTaxable)

    // 금융소득 과세 — 분리과세 + 종합합산
    const fin = comprehensiveTaxBreakdown(financialIncome, plan.otherIncome, plan.comprehensiveDeduction)

    const totalWithdraw = irpW + taxableW + exemptW
    const totalTaxThis = pensionTax + fin.totalFinancialTax
    const netIncome = totalWithdraw + financialIncome - totalTaxThis

    totalTax += totalTaxThis
    totalNet += netIncome

    rows.push({
      year: baseYear + i,
      remainingBalance: balances.reduce((s, b) => s + Math.max(0, b), 0),
      irpWithdraw: irpW, taxableWithdraw: taxableW, exemptWithdraw: exemptW,
      totalWithdraw, pensionTaxable, pensionTax,
      financialIncome,
      separatedTax: fin.separatedTax,
      consolidatedFin: fin.consolidatedFinancial,
      comprehensiveTax: fin.comprehensiveTax,
      totalTax: totalTaxThis,
      netIncome,
    })
  }

  const annualWithdraw = plan.sources.reduce((s, src) => s + src.principal, 0) / years
  return { rows, annualWithdraw, totalTax, totalNet }
}

/** 부부 분산 효과 비교 — 전세금 전액 한 명 vs 절반씩 분산.
 *  동일 총액에서 명의 분산이 종합소득세를 얼마나 줄이는지 산출.
 */
export interface SpouseSplitComparison {
  financialIncome:   number   // 총 금융소득
  singleTax:         number   // 한 명 명의 시 총 금융소득세
  singleConsolidated:number   // 한 명 시 종합합산 금융소득 (2천만 초과)
  splitTax:          number   // 부부 절반 분산 시 총 금융소득세
  splitConsolidated: number   // 분산 시 종합합산 (보통 0)
  savings:           number   // 단독 - 분산 (양수=분산 유리, 음수=단독 유리)
}
export function spouseSplitComparison(
  financialIncome: number,
  otherIncome: number,
  deduction: number,
): SpouseSplitComparison {
  // 한 명 전액: otherIncome도 한 명에 몰린다고 가정 (보수적 상한)
  const single = comprehensiveTaxBreakdown(financialIncome, otherIncome, deduction)
  // 부부 분산: 금융소득 절반씩, otherIncome은 분산 불가(근로주체 1명) → 그대로 한 명
  const eachFin = financialIncome / 2
  const spouseA = comprehensiveTaxBreakdown(eachFin, otherIncome, deduction)
  const spouseB = comprehensiveTaxBreakdown(eachFin, 0, deduction)
  const splitTax = spouseA.totalFinancialTax + spouseB.totalFinancialTax
  return {
    financialIncome,
    singleTax: single.totalFinancialTax,
    singleConsolidated: single.consolidatedFinancial,
    splitTax,
    splitConsolidated: spouseA.consolidatedFinancial + spouseB.consolidatedFinancial,
    savings: single.totalFinancialTax - splitTax,
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
