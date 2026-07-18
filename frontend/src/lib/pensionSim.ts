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

/** 기본 입력값 (샘플) */
export const EMPTY_PENSION_PLAN: PensionSimPlan = {
  sources: [
    { id: 'irp1', name: '퇴직연금(DC) → IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 4 },
    { id: 'pen1', name: '연금저축(98년 비과세)', principal: 100_000_000, taxType: 'taxExempt', yieldRate: 4 },
  ],
  withdrawalYears:    30,
  startYear:          new Date().getFullYear() + 3,
  isaBalance:         50_000_000,
  pensionDeduction:   12_000_000,
}

/** 연금 원천 총액 */
export const totalPrincipal = (plan: PensionSimPlan): number =>
  plan.sources.reduce((s, src) => s + src.principal, 0)

export interface PensionYearRow {
  year:             number
  remainingBalance: number   // 수령 전 잔액
  irpWithdraw:      number   // IRP(퇴직) 수령액 (연, 연금소득세 대상)
  taxableWithdraw:  number   // 과세 연금저축 수령액 (연, 연금소득세 대상)
  exemptWithdraw:   number   // 비과세 연금저축 수령액 (연, 세금 0)
  totalWithdraw:    number   // 총 수령액 (연)
  pensionTaxable:   number   // 연금소득세 과세표준 (수령액 - 공제)
  pensionTax:       number   // 연금소득세
  isaIncome:        number   // 전세금/ISA 투자 수익 (연)
  isaTax:           number   // ISA 분리과세 9.9% (만기 시만, 단순화)
  netIncome:        number   // 순수령 = 총수령 + 투자수익 - 세금
}

export interface PensionSimResult {
  rows:              PensionYearRow[]
  annualWithdraw:    number   // 연 수령액 (고정)
  totalTax:          number   // 총 연금소득세 (수령 기간 합계)
  totalNet:          number   // 총 순수령 (수령 기간 합계)
}

/**
 * 연도별 연금 수령 시뮬레이션.
 * 각 원천에서 매년 균등 인출 + 운용 수익(수익률)으로 잔액 감소.
 */
export function simulatePension(plan: PensionSimPlan): PensionSimResult {
  const years = plan.withdrawalYears
  const deduction = plan.pensionDeduction
  const baseYear = plan.startYear

  // 각 원천의 초기 잔액 (독립 추적)
  const balances = plan.sources.map((s) => s.principal)
  // 각 원천의 연간 인출액 (균등 + 수익률 감안한 단순화: 원금/수령기간)
  const annualFromSource = plan.sources.map((s) => s.principal / years)

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

    const pensionIncome = irpW + taxableW           // 과세 대상 연금소득
    const pensionTaxable = Math.max(0, pensionIncome - deduction)
    const pensionTax = pensionIncomeTax(pensionTaxable)

    // ISA 수익은 별도 (운용 중 비과세, 만기 시 분리과세)
    const isaIncome = 0
    const isaTax = 0

    const totalWithdraw = irpW + taxableW + exemptW
    const netIncome = totalWithdraw + isaIncome - pensionTax - isaTax

    totalTax += pensionTax
    totalNet += netIncome

    rows.push({
      year: baseYear + i,
      remainingBalance: balances.reduce((s, b) => s + Math.max(0, b), 0),
      irpWithdraw: irpW, taxableWithdraw: taxableW, exemptWithdraw: exemptW,
      totalWithdraw, pensionTaxable, pensionTax,
      isaIncome, isaTax, netIncome,
    })
  }

  const annualWithdraw = plan.sources.reduce((s, src) => s + src.principal, 0) / years
  return { rows, annualWithdraw, totalTax, totalNet }
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
