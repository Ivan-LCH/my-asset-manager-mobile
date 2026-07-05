// 투자법인 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
// 모든 수치는 사용자 가정에 기반한 추정치. 세율/공식은 plan.tax 로 편집 가능.
import type { CorpSimPlan, CorpTaxParams } from '@/types'

/** 세제 파라미터 기본값 (2024년 경 기준 추정치 — 실제는 세무사 확인) */
export const DEFAULT_CORP_TAX: CorpTaxParams = {
  corpTaxRateLow:       0.09,    // 법인세 과세표준 2억 이하
  corpTaxRateMid:       0.19,    // 2억 초과
  corpTaxThreshold:     200_000_000,
  dividendTaxRate:      0.154,   // 배당소득세 15.4%
  finIncomeCombinedThr: 20_000_000, // 금융소득종합과세 기준(연, 부부합산)
  combinedMarginalRate: 0.35,    // 종합소득 한계세율 추정
  giftTaxRate:          0.30,    // 자녀 승계 비교용 증여/상속 세율 추정
}

/** 입력 기본값 (보고서 기준 샘플) */
export const EMPTY_CORP_PLAN: CorpSimPlan = {
  investAmount:          600_000_000,
  dividendYield:         8,
  targetDividendTotal:   0,
  shareHusband:          40,
  shareWife:             40,
  shareSon:              20,
  repSalaryMonthly:      1_000_000,
  sonEmployed:           false,
  annualMaintCost:       1_200_000,
  monthlyReturn:         3_500_000,
  employeeHealthMonthly: 70_000,
  personalHealthAnnual:  7_800_000,
  giftTaxBase:           600_000_000,
  setupCost:             2_000_000,
  tax:                   { ...DEFAULT_CORP_TAX },
}

/** 지분 합(100 이어야 함) */
export const shareSum = (plan: CorpSimPlan): number =>
  plan.shareHusband + plan.shareWife + plan.shareSon

/** 연간 법인 배당총액(=법인 과세소득). target>0 이면 target, 아니면 원금×수익률 */
export function grossDividend(plan: CorpSimPlan): number {
  return plan.targetDividendTotal > 0
    ? plan.targetDividendTotal
    : plan.investAmount * (plan.dividendYield / 100)
}

/** 초과누진 법인세 */
export function corpTaxOn(income: number, tax: CorpTaxParams): number {
  if (income <= tax.corpTaxThreshold) return income * tax.corpTaxRateLow
  return tax.corpTaxThreshold * tax.corpTaxRateLow + (income - tax.corpTaxThreshold) * tax.corpTaxRateMid
}

export interface PerShare { gross: number; net: number }
export interface CorpResult {
  grossDividend:   number
  corpTax:         number
  distributable:   number  // 배당가능 = gross - 법인세
  perShare:        { husband: PerShare; wife: PerShare; son: PerShare }
  corpHealthAnnual: number // 대표 직장건보(연)
  maintAnnual:     number
  totalLeakAnnual: number  // 법인세 + 유지비 + 건보 (연간 법인 측 비용)
}

/** 법인 시나리오 계산 */
export function computeCorp(plan: CorpSimPlan): CorpResult {
  const gross = grossDividend(plan)
  const tax = corpTaxOn(gross, plan.tax)
  const distributable = gross - tax
  const split = (pct: number): PerShare => {
    const g = distributable * (pct / 100)
    return { gross: g, net: g * (1 - plan.tax.dividendTaxRate) }
  }
  const corpHealthAnnual = plan.employeeHealthMonthly * 12
  const maintAnnual = plan.annualMaintCost
  return {
    grossDividend: gross,
    corpTax: tax,
    distributable,
    perShare: { husband: split(plan.shareHusband), wife: split(plan.shareWife), son: split(plan.shareSon) },
    corpHealthAnnual,
    maintAnnual,
    totalLeakAnnual: tax + maintAnnual + corpHealthAnnual,
  }
}

export interface PersonalResult {
  dividendTax:        number // 배당소득세 15.4% (연)
  combinedExtra:      number // 금융소득종합과세 초과분 추가세 (연)
  personalHealthAnnual: number
  giftTax:            number // 자녀 승계 비교용 (일회/미래)
  annualLeak:         number // 배당세+종합과세+건보 (연간)
}

/** 개인 명의 직접 투자(Before) 시나리오 계산 */
export function computePersonal(plan: CorpSimPlan): PersonalResult {
  const gross = grossDividend(plan)
  const dividendTax = gross * plan.tax.dividendTaxRate
  const combinedExtra =
    gross > plan.tax.finIncomeCombinedThr
      ? (gross - plan.tax.finIncomeCombinedThr) * plan.tax.combinedMarginalRate
      : 0
  const giftTax = plan.giftTaxBase * plan.tax.giftTaxRate
  const personalHealthAnnual = plan.personalHealthAnnual
  return {
    dividendTax,
    combinedExtra,
    personalHealthAnnual,
    giftTax,
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

/** 가수금 월 반환 시 세금/건보 부담 없이 유지되는 개월 수 */
export function returnMonths(plan: CorpSimPlan): number {
  return plan.monthlyReturn > 0 ? Math.floor(plan.investAmount / plan.monthlyReturn) : 0
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
  const salaryAnnual = plan.repSalaryMonthly * 12
  const returnAnnual = plan.monthlyReturn * 12
  const familyDraw = salaryAnnual + returnAnnual
  const baseYear = new Date().getFullYear()

  let principal = plan.investAmount
  const rows: RunwayRow[] = []
  let depletedYear: number | null = null

  for (let i = 1; i <= maxYears; i++) {
    const cashIn = principal * (plan.dividendYield / 100)
    const tax = corpTaxOn(cashIn, plan.tax)
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
