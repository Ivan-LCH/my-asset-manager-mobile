import type { CorpSimPlan } from '@/types'
import { corpTaxOn, employerInsuranceMonthly } from './corpSim'
import { SIM_START_YEAR } from './pensionCalc'
import type { CorpCashFlow } from './retirementCashflow'

/** 기존 법인 가정 → 현금흐름 입력. 개인 배당 원천징수는 여기서 하지 않는다.
 * 법인 유지비/가수금 납부 시점 등 기존 모델의 지원 범위를 확장하는 함수는 아니다. */
export function buildCorpCashFlow(plan: CorpSimPlan): CorpCashFlow {
  const gross = plan.targetDividendTotal > 0 ? plan.targetDividendTotal
    : (plan.capitalContribution + plan.loanAmount) * plan.dividendYield / 100
  const salaryAnnual = (plan.repSalaryMonthly + plan.repSalaryHusbandMonthly) * 12
  const insuranceAnnual = employerInsuranceMonthly(plan).total * 12
  const corpTax = corpTaxOn(Math.max(0, gross - salaryAnnual - insuranceAnnual), plan.tax)
  const cashAfterTax = gross - corpTax - salaryAnnual - insuranceAnnual
  const returnMonths = plan.monthlyReturn > 0 ? Math.floor(plan.loanAmount / plan.monthlyReturn) : 0
  const share = (plan.shareHusband + plan.shareWife) / 100
  return {
    salaryMonthly: plan.repSalaryMonthly + plan.repSalaryHusbandMonthly,
    phaseBoundaryYear: SIM_START_YEAR + Math.ceil(returnMonths / 12),
    returnP1Monthly: plan.monthlyReturn,
    divP1Monthly: Math.max(0, cashAfterTax - plan.monthlyReturn * 12) * share / 12,
    divP2Monthly: Math.max(0, cashAfterTax) * share / 12,
    dividendTaxRate: plan.tax.dividendTaxRate,
  }
}
