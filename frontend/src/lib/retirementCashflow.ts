// 은퇴 연도별 현금흐름 계산 (순수 함수) — RetirementPage 에서 추출 (UI 간소화 ④).
// 연금·법인·연금시뮬 연동 분기와 목돈·보유세·긴급지출을 연단위 누적에 반영.
import { SIM_START_YEAR } from '@/lib/pensionCalc'
import { num } from '@/lib/retirementPlan'
import type { RetirementPlan, LumpsumItem } from '@/types'

export interface CashFlowRow {
  year:                    number
  age:                     number
  nationalPensionMonthly:  number  // 국민연금/월
  pensionMonthly:          number  // 개인연금(IRP·퇴직·연금저축)/월
  dividendMonthly:         number
  corpSalaryMonthly:       number
  corpReturnMonthly:       number
  taxAnnual:               number  // 세금(연) — 종합·연금소득세는 연단위, 음수로 저장(지출 의미)
  expenseMonthly:          number
  travelMonthly:           number
  medicalMonthly:          number
  healthInsuranceMonthly:  number
  totalExpense:            number  // 세금 제외 (생활비+여행·의료+건보)
  lumpsumReceived:         number
  totalIncome:             number
  balance:                 number
  emergencyAnnual:         number
  cumulative:              number
}

/** 법인 연동 현금흐름 설정 (Phase 1/2 분기용) */
export interface CorpCashFlow {
  salaryMonthly:      number
  phaseBoundaryYear:  number
  returnP1Monthly:    number
  divP1Monthly:       number
  divP2Monthly:       number
}

export function buildCashFlow(
  plan: RetirementPlan,
  pensionMap: Map<number, number>,
  currentAge: number,
  stockDivMonthly: number,
  healthInsuranceMonthly: number,
  corpCF?: CorpCashFlow,
  corpLoanOutflow: number = 0,
  /** 연금시뮬 연동 시 1인별 결과에서 산출한 가구 합계 오버라이드 (세금/건보 1인별·연도별 정확). */
  linked?: {
    nationalByYear:  Map<number, number>  // 연도별 국민연금(월)
    privateByYear:   Map<number, number>  // 연도별 개인연금(IRP·퇴직·연금저축)(월)
    dividendByYear:  Map<number, number>  // 연도별 배당(월) — 성장률 반영, 매년 증가
    healthByYear:    Map<number, number>  // 연도별 건보(월) — 재산분(재건축 전환)·소득분 매년 반영
    taxByYear:       Map<number, number>  // 연도별 세금(연) — 연금·배당 성장 반영
  },
  /** 목돈 수입 — 시뮬의 cash 처리 유입 항목 (plan.lumpsum 대체, 단일 소스). */
  lumpsumOverride?: LumpsumItem[],
  /** 목돈 퇴직소득세 맵 (receiveYear → 세금). cash 유입 중 severance 분. */
  lumpsumTaxByYear?: Map<number, number>,
  /** 보유세 연도별 맵(자동 계산) — 제공 시 plan의 수동 플랫 값(개시 연도~) 대신 연도별 값 사용. */
  holdingTaxByYear?: Map<number, number>,
): CashFlowRow[] {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + (100 - currentAge)
  const rows: CashFlowRow[] = []

  const expenseMonthly = plan.expenses.reduce((s, e) => s + num(e.amount), 0)
  const lumpsum = lumpsumOverride ?? plan.lumpsum

  let cumulative = 0

  for (let year = SIM_START_YEAR; year <= endYear; year++) {
    const age = currentAge + (year - currentYear)

    // 여행비: phase1Until 이하면 phase1Times, 이후면 phase2Times
    const travelMonthly = plan.travel.reduce((s, t) => {
      const times = year <= num(t.phase1Until) ? num(t.phase1Times) : num(t.phase2Times)
      return s + (times * num(t.costPerTrip)) / 12
    }, 0)

    // 연금 분리: 국민연금 + 개인연금(IRP·퇴직·연금저축)
    const nationalPensionMonthly = linked
      ? (linked.nationalByYear.get(year) ?? 0)
      : 0
    const pensionMonthly = linked
      ? (linked.privateByYear.get(year) ?? 0)
      : (pensionMap.get(year) ?? 0)

    const emergencyAnnual = plan.emergency.reduce((s, e) => (num(e.year) === year ? s + num(e.amount) : s), 0)
      + (year === SIM_START_YEAR ? corpLoanOutflow : 0)

    const lumpsumReceived = lumpsum.reduce((s, l) => (num(l.receiveYear) === year ? s + num(l.amount) : s), 0)
    // 목돈 퇴직소득세 (severance cash 유입, 수령년 일회)
    const lumpsumTaxAnnual = lumpsumTaxByYear?.get(year) ?? 0

    // 법인 Phase 분기: 가수금 소진 연도 기준
    const isPhase2 = corpCF ? year > corpCF.phaseBoundaryYear : false
    const corpSalaryMonthly = corpCF?.salaryMonthly ?? 0
    const corpReturnMonthly = corpCF ? (isPhase2 ? 0 : corpCF.returnP1Monthly) : 0
    const corpDiv = corpCF ? (isPhase2 ? corpCF.divP2Monthly : corpCF.divP1Monthly) : 0
    // 배당: pension 연동 시 연도별 배당(성장률 반영, 매년 증가), 법인 연동 시 corpDiv만,
    // 미연동 시 실제 배당 풀
    const dividendMonthly = linked
      ? (linked.dividendByYear.get(year) ?? 0)
      : (corpCF ? corpDiv : (stockDivMonthly + corpDiv))

    // 건보: 연동 시 연도별(재산·소득 매년 반영), 아니면 고정
    const hiMonthly = linked ? (linked.healthByYear.get(year) ?? 0) : healthInsuranceMonthly

    // 세금(연) — 종합·연금소득세는 연단위 납부 → 음수로 저장(지출 의미) → 누적에서 그대로 합산.
    // 연동 시 연도별 1인별 산정, 아니면 근사(배당 15.4% + 급여 3%)×12 + 목돈 퇴직소득세
    // + 보유세(재산세+종부세): 자동 맵 제공 시 연도별 값, 아니면 수동 플랫(개시 연도~)
    const holdingTaxAnnual = holdingTaxByYear
      ? (holdingTaxByYear.get(year) ?? 0)
      : year >= (plan.holdingTaxStartYear ?? Infinity)
        ? (plan.holdingTaxAnnual ?? 0)
        : 0
    const taxAnnualRaw = (linked
      ? (linked.taxByYear.get(year) ?? 0)
      : (dividendMonthly * 0.154 + corpSalaryMonthly * 0.03) * 12)
      + lumpsumTaxAnnual
      + holdingTaxAnnual
    const taxAnnual = -Math.abs(taxAnnualRaw)   // 세금 = 음수

    // 세금은 월 지출에서 제외 (연간 조정항목)
    const totalExpense = expenseMonthly + travelMonthly + num(plan.medicalMonthly) + hiMonthly
    const totalIncome  = nationalPensionMonthly + pensionMonthly + dividendMonthly + corpSalaryMonthly + corpReturnMonthly
    const balance      = totalIncome - totalExpense

    // 누적: 세금(taxAnnual<0)·긴급지출(연간) 차감, 목돈 가산
    cumulative += balance * 12 - emergencyAnnual + taxAnnual + lumpsumReceived

    rows.push({
      year, age,
      nationalPensionMonthly, pensionMonthly, dividendMonthly, corpSalaryMonthly, corpReturnMonthly,
      taxAnnual,
      expenseMonthly, travelMonthly,
      medicalMonthly: num(plan.medicalMonthly),
      healthInsuranceMonthly: hiMonthly,
      totalExpense, lumpsumReceived, totalIncome, balance,
      emergencyAnnual, cumulative,
    })
  }
  return rows
}
