// 투자법인 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
// 모든 수치는 사용자 가정에 기반한 추정치. 세율/공식은 plan.tax 로 편집 가능.
import type { CorpSimPlan, CorpTaxParams } from '@/types'

/** 세제 파라미터 기본값 (2024년 경 기준 추정치 — 실제는 세무사 확인) */
export const DEFAULT_CORP_TAX: CorpTaxParams = {
  corpTaxRateLow:       0.09,
  corpTaxRateMid:       0.19,
  corpTaxThreshold:     200_000_000,
  dividendTaxRate:      0.154,
  finIncomeCombinedThr: 20_000_000,
  giftTaxRate:          0.30,
  salaryTaxRate:        0.03,
  healthInsRate:        0.0801,  // 건강보험(7.09%)+장기요양(건보×12.95%) ≈ 8.01% (본인부담 50% 별도)
}

/** 입력 기본값 (보고서 기준 샘플) */
export const EMPTY_CORP_PLAN: CorpSimPlan = {
  capitalContribution:     1_000_000,
  loanAmount:              600_000_000,
  dividendYield:           8,
  targetDividendTotal:     0,
  shareHusband:            40,
  shareWife:               40,
  shareSon:                20,
  repSalaryMonthly:        1_000_000,
  repSalaryHusbandMonthly: 1_000_000,
  sonEmployed:             false,
  annualMaintCost:         1_200_000,
  monthlyReturn:           3_500_000,
  personalHealthAnnual:    7_800_000,
  giftTaxBase:             600_000_000,
  setupCost:               2_000_000,
  linkPension:             true,
  pensionIncomeAnnual:     0,
  portfolio:               [
    { ticker: 'SCHD', weight: 1 },
    { ticker: 'GPIQ', weight: 1 },
    { ticker: 'JEPQ', weight: 1 },
  ],
  tax:                     { ...DEFAULT_CORP_TAX },
}

/** 급여 받는 임원 수(직장건보 대상). 부부 모두 월급이면 2. */
export const salariedCount = (plan: CorpSimPlan): number =>
  (plan.repSalaryMonthly > 0 ? 1 : 0) + (plan.repSalaryHusbandMonthly > 0 ? 1 : 0)

/** 직장건보 월 합계 = 각 급여자별 salary × healthInsRate × 50%(본인부담) 의 합 */
export function corpHealthMonthly(plan: CorpSimPlan): number {
  const rate = (plan.tax.healthInsRate ?? 0.0801) * 0.5
  let sum = 0
  if (plan.repSalaryMonthly > 0) sum += plan.repSalaryMonthly * rate
  if (plan.repSalaryHusbandMonthly > 0) sum += plan.repSalaryHusbandMonthly * rate
  return Math.round(sum)
}

/** 4대보험 사업주 부담 월 합계 (법인 비용) */
export interface EmployerInsurance {
  health:     number  // 건강보험 사업주 50%
  pension:    number  // 국민연금 사업주 4.5%
  employment: number  // 고용보험 사업주 ~0.9%
  accident:   number  // 산재보험 사업주 100% ~0.7%
  total:      number
}

export function employerInsuranceMonthly(plan: CorpSimPlan): EmployerInsurance {
  const totalSalary = (plan.repSalaryMonthly > 0 ? plan.repSalaryMonthly : 0)
    + (plan.repSalaryHusbandMonthly > 0 ? plan.repSalaryHusbandMonthly : 0)
  const rate = plan.tax.healthInsRate ?? 0.0801
  const health = Math.round(totalSalary * rate * 0.5)       // 건보 사업주 50%
  const pension = Math.round(totalSalary * 0.045)            // 국민연금 사업주 4.5%
  const employment = Math.round(totalSalary * 0.009)         // 고용보험 사업주 0.9%
  const accident = Math.round(totalSalary * 0.007)           // 산재보험 사업주 0.7% (사무직)
  return { health, pension, employment, accident, total: health + pension + employment + accident }
}

/** 부부 합산 연간 급여 */
export const salariesAnnual = (plan: CorpSimPlan): number =>
  (plan.repSalaryMonthly + plan.repSalaryHusbandMonthly) * 12

/** 배당주 포트폴리오 가중평균 수익률(%). yields: 각 ticker의 3년평균 수익률 */
export function blendedYield(
  yields: { ticker: string; yield: number }[],
  portfolio: { ticker: string; weight: number }[],
): number {
  const totalW = portfolio.reduce((s, h) => s + (h.weight > 0 ? h.weight : 0), 0)
  if (totalW <= 0) return 0
  let blended = 0
  for (const h of portfolio) {
    if (h.weight <= 0) continue
    const y = yields.find((v) => v.ticker === h.ticker)?.yield
    if (typeof y === 'number') blended += y * (h.weight / totalW)
  }
  return blended
}

/** 지분 합(100 이어야 함) */
export const shareSum = (plan: CorpSimPlan): number =>
  plan.shareHusband + plan.shareWife + plan.shareSon

/** 법인 운용 총자금 = 출자금(자본금) + 가수금(대여금) — 배당을 버는 ETF 원금 */
export const totalInvest = (plan: CorpSimPlan): number =>
  plan.capitalContribution + plan.loanAmount

/** 연간 법인 배당총액(=법인 과세소득). target>0 이면 target, 아니면 원금×수익률 */
export function grossDividend(plan: CorpSimPlan): number {
  return plan.targetDividendTotal > 0
    ? plan.targetDividendTotal
    : totalInvest(plan) * (plan.dividendYield / 100)
}

/** 초과누진 법인세 */
export function corpTaxOn(income: number, tax: CorpTaxParams): number {
  if (income <= tax.corpTaxThreshold) return income * tax.corpTaxRateLow
  return tax.corpTaxThreshold * tax.corpTaxRateLow + (income - tax.corpTaxThreshold) * tax.corpTaxRateMid
}

/**
 * 한국 종합소득세 누진과세 (과세표준 기준, 2024년).
 * 종합과세 대상 소득(연금+급여+금융초과분 등)의 세액 산출.
 */
export function comprehensiveTax(taxable: number): number {
  if (taxable <= 0) return 0
  if (taxable <= 14_000_000) return taxable * 0.06
  if (taxable <= 50_000_000) return taxable * 0.15 - 1_260_000
  if (taxable <= 88_000_000) return taxable * 0.24 - 5_760_000
  if (taxable <= 150_000_000) return taxable * 0.35 - 15_440_000
  return taxable * 0.38 - 19_940_000
}

export interface PerShare { gross: number; net: number }
export interface CorpResult {
  grossDividend:     number
  corpTax:           number
  distributable:     number  // 배당가능 = gross - 법인세 - 급여 - 4대보험 사업주분
  perShare:          { husband: PerShare; wife: PerShare; son: PerShare }
  corpHealthAnnual:  number  // 직장건보 본인부담(연)
  employerInsAnnual: EmployerInsurance  // 4대보험 사업주분(연)
  maintAnnual:       number
  totalLeakAnnual:   number  // 법인세 + 유지비 + 건보 + 4대보험 사업주분 (연간 법인 측 비용)
}

/** 법인 시나리오 계산 */
export function computeCorp(plan: CorpSimPlan): CorpResult {
  const gross = grossDividend(plan)
  const salAnnual = salariesAnnual(plan)
  const empInsMonthly = employerInsuranceMonthly(plan)
  const empInsAnnual = empInsMonthly.total * 12
  // 급여 + 4대보험 사업주분 모두 법인 비용(공제)
  const taxable = Math.max(0, gross - salAnnual - empInsAnnual)
  const tax = corpTaxOn(taxable, plan.tax)
  const distributable = gross - tax - salAnnual - empInsAnnual   // 배당가능액
  const split = (pct: number): PerShare => {
    const g = distributable * (pct / 100)
    return { gross: g, net: g * (1 - plan.tax.dividendTaxRate) }
  }
  const corpHealthAnnual = corpHealthMonthly(plan) * 12
  const employerInsAnnual = {
    health: empInsMonthly.health * 12,
    pension: empInsMonthly.pension * 12,
    employment: empInsMonthly.employment * 12,
    accident: empInsMonthly.accident * 12,
    total: empInsAnnual,
  }
  const maintAnnual = plan.annualMaintCost
  return {
    grossDividend: gross,
    corpTax: tax,
    distributable,
    perShare: { husband: split(plan.shareHusband), wife: split(plan.shareWife), son: split(plan.shareSon) },
    corpHealthAnnual,
    employerInsAnnual,
    maintAnnual,
    totalLeakAnnual: tax + maintAnnual + corpHealthAnnual + employerInsAnnual.total,
  }
}

export interface PersonalResult {
  dividendTax:        number // 배당소득세 15.4% (연)
  combinedExtra:      number // 금융소득종합과세 초과분 추가세 (연, 누진)
  marginalRate:       number // 적용 한계세율 (%)
  personalHealthAnnual: number
  giftTax:            number // 자녀 승계 비교용 (일회/미래)
  annualLeak:         number // 배당세+종합과세+건보 (연간)
}

/** 개인 명의 직접 투자(Before) 시나리오 — 누진 종합과세 */
export function computePersonal(plan: CorpSimPlan): PersonalResult {
  const gross = grossDividend(plan)
  const dividendTax = gross * plan.tax.dividendTaxRate
  const pension = plan.pensionIncomeAnnual
  let combinedExtra = 0, marginalRate = 0
  if (gross > plan.tax.finIncomeCombinedThr) {
    const excess = gross - plan.tax.finIncomeCombinedThr
    const taxWithExcess = comprehensiveTax(pension + excess)
    const taxWithout = comprehensiveTax(pension)
    combinedExtra = Math.max(0, taxWithExcess - taxWithout)
    marginalRate = excess > 0 ? combinedExtra / excess : 0
  }
  const giftTax = plan.giftTaxBase * plan.tax.giftTaxRate
  const personalHealthAnnual = plan.personalHealthAnnual
  return {
    dividendTax, combinedExtra, marginalRate,
    personalHealthAnnual, giftTax,
    annualLeak: dividendTax + combinedExtra + personalHealthAnnual,
  }
}

export interface SonAccumRow { year: number; sonDividend: number; cumulative: number }

/** 연도별 아들 배당(세후) 누적 = 자금출처 시뮬 */
export function sonAccumulation(plan: CorpSimPlan, years: number): SonAccumRow[] {
  const annual = computeCorp(plan).perShare.son.net
  const rows: SonAccumRow[] = []
  let cum = 0
  const baseYear = new Date().getFullYear()
  for (let i = 1; i <= years; i++) {
    cum += annual
    rows.push({ year: baseYear + i, sonDividend: annual, cumulative: cum })
  }
  return rows
}

/** 가수금(빌려준 원금) 월 반환 시 전액 회수까지 걸리는 개월 수 */
export function returnMonths(plan: CorpSimPlan): number {
  return plan.monthlyReturn > 0 ? Math.floor(plan.loanAmount / plan.monthlyReturn) : 0
}

/**
 * 아들 건보 마진 한계(미취업 1천만/취업 2천만)에 맞춘 권장 연 배당총액 역산.
 * 아들 세후 배당 = gross × (1−법인세율) × 지분% × (1−배당세율) 이 한계가 되는 gross.
 */
export function recommendDividendForSon(plan: CorpSimPlan): number {
  const limit = plan.sonEmployed ? 20_000_000 : 10_000_000
  const effCorp = 1 - plan.tax.corpTaxRateLow
  const denom = effCorp * (plan.shareSon / 100) * (1 - plan.tax.dividendTaxRate)
  return denom > 0 ? Math.round(limit / denom) : 0
}

// ── 현금흐름 / 지속가능성 (Safe Withdrawal) ──────────────────
// 핵심: 법인의 배당 수입(현금 유입)이 가족이 빼내는 돈(급여+가수금반환)을 커버하면
// 원금(ETF) 보존 → 지속가능. 못 커버하면 ETF 원금을 매도해 부족분을 메워야 →
// 원금 감소 → 다음 해 배당도 줄고 → 가속적 고갈.
export interface RunwayRow {
  year:        number
  principal:   number   // 잔존 원금(매도 전)
  cashIn:      number   // 배당 수입 = principal × 수익률
  tax:         number   // 법인세
  familyDraw:  number   // 급여(연) + 가수금반환(연)
  net:         number   // cashIn − tax − familyDraw (음수=매도, 양수=잉여)
  surplus:     number   // max(0, net) — 배당·재투자 가능분
}
export interface RunwayResult {
  rows:            RunwayRow[]
  sustainable:     boolean       // 첫해 net >= 0
  annualShortfall: number        // net<0 이면 부족분(양수), 아니면 0
  depletedYear:    number | null // 원금 고갈(<=0) 연도, 없으면 null
}

/** 연도별 현금흐름 시뮬레이션 → 지속가능성/고갈 시점 산출 */
export function simulateRunway(plan: CorpSimPlan, maxYears = 50): RunwayResult {
  const salaryAnnual = (plan.repSalaryMonthly + plan.repSalaryHusbandMonthly) * 12
  const returnAnnual = plan.monthlyReturn * 12
  const empInsAnnual = employerInsuranceMonthly(plan).total * 12
  const familyDraw = salaryAnnual + returnAnnual + empInsAnnual  // 급여 + 가수금 + 4대보험 사업주분
  const baseYear = new Date().getFullYear()

  let principal = totalInvest(plan)
  const rows: RunwayRow[] = []
  let depletedYear: number | null = null

  for (let i = 1; i <= maxYears; i++) {
    const cashIn = principal * (plan.dividendYield / 100)
    // 급여 + 4대보험 사업주분 모두 법인 비용(공제)
    const corpTaxable = Math.max(0, cashIn - salaryAnnual - empInsAnnual)
    const tax = corpTaxOn(corpTaxable, plan.tax)
    const net = cashIn - tax - familyDraw
    rows.push({
      year: baseYear + i,
      principal: Math.max(0, principal),
      cashIn, tax, familyDraw, net,
      surplus: Math.max(0, net),
    })
    if (net < 0) principal += net   // 부족분만큼 원금 매도
    if (principal <= 0 && depletedYear === null) {
      depletedYear = baseYear + i
      break
    }
  }

  const first = rows[0]
  const sustainable = first ? first.net >= 0 : false
  const annualShortfall = first && first.net < 0 ? -first.net : 0
  return { rows, sustainable, annualShortfall, depletedYear }
}

// ── 2상 비용 비교 (가수금 회수 중 vs 완료 후) ─────────────────
// 같은 생활비를 인출한다고 가정. Phase1은 가수금(비과세)+급여, Phase2는 가수금 소진 후
// 동일 액을 배당(과세)으로 채운다. 법인세·건보·급여소득세는 양상 공통, 배당세·종합과세가 차이.
export interface TwoPhaseResult {
  salariesAnnual:   number
  empInsAnnual:     number // 4대보험 사업주분(연)
  corpTaxable:      number
  corpTax:          number
  corpHealth:       number
  salaryTax:        number
  dividendDist:     number
  dividendTax:      number
  combinedExtra:    number
  marginalRate:     number
  cost1:            number // Phase1: 법인세+건보+급여세+4대보험 (가수금 비과세)
  cost2:            number // Phase2: + 배당세 + 종합
  diff:             number
}

export function computeTwoPhase(plan: CorpSimPlan): TwoPhaseResult {
  const salariesAnnual = (plan.repSalaryMonthly + plan.repSalaryHusbandMonthly) * 12
  const empInsAnnual = employerInsuranceMonthly(plan).total * 12
  const gross = grossDividend(plan)
  const corpTaxable = Math.max(0, gross - salariesAnnual - empInsAnnual)  // 급여+4대보험 공제
  const corpTax = corpTaxOn(corpTaxable, plan.tax)
  const corpHealth = corpHealthMonthly(plan) * 12
  const salaryTax = salariesAnnual * plan.tax.salaryTaxRate

  // Phase2: 가수금 몫(monthlyReturn×12)을 배당으로 인출
  const dividendDist = plan.monthlyReturn * 12
  const dividendTax = dividendDist * plan.tax.dividendTaxRate
  const pension = plan.pensionIncomeAnnual
  let combinedExtra = 0, marginalRate = 0
  if (dividendDist > plan.tax.finIncomeCombinedThr) {
    const excess = dividendDist - plan.tax.finIncomeCombinedThr
    const base = pension + salariesAnnual  // 연금 + 급여
    const taxWithExcess = comprehensiveTax(base + excess)
    const taxWithout = comprehensiveTax(base)
    combinedExtra = Math.max(0, taxWithExcess - taxWithout)
    marginalRate = excess > 0 ? combinedExtra / excess : 0
  }

  const cost1 = corpTax + corpHealth + salaryTax + empInsAnnual
  const cost2 = cost1 + dividendTax + combinedExtra
  return {
    salariesAnnual, empInsAnnual, corpTaxable, corpTax, corpHealth, salaryTax,
    dividendDist, dividendTax, combinedExtra, marginalRate,
    cost1, cost2, diff: cost2 - cost1,
  }
}
