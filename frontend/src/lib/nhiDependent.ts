// 건강보험 피부양자 자격 계획 모형 + 전세보증금 배당→일반투자 재배분 (순수 함수, 저장·부작용 없음).
//
// 와이프가 남편보다 오래 일하면(직장가입자) 은퇴한 남편은 와이프의 피부양자가 될 수 있다.
// 근거(계획 가정): 2022 부과체계 개편 이후 국민건강보험법 시행규칙 별표 1의2 · 제44조 실무 해석.
//  - 소득: 연 소득(공적연금 100% + 금융소득 + 기타) ≤ 2천만 원
//  - 재산: 과표 5.4억 이하 → 소득 기준만 / 5.4억 초과~9억 이하 → 소득 1천만 원 이하일 때만 / 9억 초과 → 불가
// ※ 계획 모형이며 국민건강보험공단의 자격 판정이 아니다. 실제 자격·소득 산정(사업자등록, 근로·사업소득,
//   소득 확정 시차 등)은 공단 확인이 필요하다. 와이프의 직장가입자 보험료는 계산하지 않는다.

/** 피부양자 연 소득 상한(원). 초과 시 불가. */
export const DEPENDENT_INCOME_LIMIT = 20_000_000
/** 금융소득(이자+배당) 면제 한도(원). 이하이면 0 반영, 초과하면 전액 반영(절벽). annualHealth 와 같은 관례. */
export const FINANCIAL_INCOME_EXEMPTION = 10_000_000
/** 공적연금 반영률. 지역가입자 보험료(50%)와 달리 피부양자 소득은 100%. */
export const PUBLIC_PENSION_COUNT_RATE = 1
/** 재산 과표 이 금액 이하면 소득 기준(2천만 원)만 적용. */
export const DEPENDENT_PROPERTY_LIMIT = 540_000_000
/** 재산 과표 이 금액 초과면 피부양자 불가. */
export const DEPENDENT_PROPERTY_HARD_LIMIT = 900_000_000
/** 재산 과표 5.4억 초과~9억 이하 구간의 소득 상한(원). */
export const DEPENDENT_PROPERTY_INCOME_LIMIT = 10_000_000

export type DependentStatus = 'eligible' | 'ineligible' | 'unknown'
export type PropertyBand = 'low' | 'mid' | 'high' | 'unknown'

/** 피부양자 기간: husbandRetirementYear <= year < wifeRetirementYear. 같거나 와이프가 먼저 은퇴하면 null. */
export function dependentWindow(husbandYear: number, wifeYear?: number | null): { start: number; end: number } | null {
  if (wifeYear == null || !Number.isFinite(wifeYear) || !Number.isFinite(husbandYear)) return null
  return wifeYear > husbandYear ? { start: husbandYear, end: wifeYear - 1 } : null
}

/** 전세 목돈 식별: 이름에 '전세' 또는 '보증금' 포함 (공백 무시). */
export function isJeonseLumpsum(name: string): boolean {
  const n = String(name ?? '').replace(/\s+/g, '')
  return n.includes('전세') || n.includes('보증금')
}

export interface DependentIncomeInput {
  publicPension: number   // 공적연금 연 수령 예상액(원)
  financial: number       // 이자+배당 연(원)
  other?: number          // 기타 반영 소득(연)
  privatePension?: number // 사적연금(IRP·연금저축) — 표시용, 반영하지 않음
}
export interface DependentResult {
  status: DependentStatus
  income: { publicPension: number; privatePensionExcluded: number; financial: number; includedFinancial: number; other: number; countable: number }
  propertyBase: number | null
  propertyBand: PropertyBand
  /** 적용한 소득 상한(원). 재산 미확인이면 2천만 원을 임시 적용. */
  incomeLimit: number
  reason: string
}

function bandOf(propertyBase: number | null): PropertyBand {
  if (propertyBase == null) return 'unknown'
  if (propertyBase > DEPENDENT_PROPERTY_HARD_LIMIT) return 'high'
  if (propertyBase > DEPENDENT_PROPERTY_LIMIT) return 'mid'
  return 'low'
}
function limitOf(band: PropertyBand): number {
  return band === 'mid' ? DEPENDENT_PROPERTY_INCOME_LIMIT : DEPENDENT_INCOME_LIMIT
}
const man = (v: number) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}만원`

/** 반영 소득 = 공적연금×100% + (금융소득 > 1천만 ? 전액 : 0) + 기타. 사적연금 제외. */
export function countableIncome(i: DependentIncomeInput) {
  const publicPension = Math.max(0, i.publicPension) * PUBLIC_PENSION_COUNT_RATE
  const financial = Math.max(0, i.financial)
  const includedFinancial = financial > FINANCIAL_INCOME_EXEMPTION ? financial : 0
  const other = Math.max(0, i.other ?? 0)
  return { publicPension, privatePensionExcluded: Math.max(0, i.privatePension ?? 0), financial, includedFinancial, other, countable: publicPension + includedFinancial + other }
}

/** 한 해의 피부양자 자격 판정. propertyBase=null 이면 재산 기준을 적용하지 못하고 소득만 본다. */
export function evaluateDependent(i: DependentIncomeInput, propertyBase: number | null): DependentResult {
  const income = countableIncome(i)
  const band = bandOf(propertyBase)
  const incomeLimit = limitOf(band)
  const base = { income, propertyBase, propertyBand: band, incomeLimit }
  if (band === 'high') return { ...base, status: 'ineligible', reason: `재산 과표 추정 ${man(propertyBase!)}이 9억 원을 초과해 피부양자 불가(계획 모형).` }
  if (income.countable > incomeLimit) return { ...base, status: 'ineligible', reason: `반영 소득 ${man(income.countable)}이 상한 ${man(incomeLimit)}을 초과(계획 모형).` }
  if (band === 'unknown') return { ...base, status: 'unknown', reason: `반영 소득 ${man(income.countable)}은 2천만 원 이하이나 부동산 자료가 없어 재산 기준은 판단하지 못했습니다.` }
  return { ...base, status: 'eligible', reason: `반영 소득 ${man(income.countable)} ≤ 상한 ${man(incomeLimit)}${band === 'mid' ? '(재산 5.4억 초과~9억 구간)' : ''}.` }
}

export interface JeonseRebalanceInput {
  publicPension: number
  other?: number
  /** 전세 배당 몫을 뺀 나머지 금융소득(연, 남편 몫). */
  nonJeonseFinancial: number
  /** 현재 전세 목돈 중 일반주식으로 배분된 원금(원, 소유자 구분 전 전체). */
  jeonseStock: number
  /** 전세 목돈 중 현금 나머지(원). 그대로 유지. */
  jeonseCash?: number
  /** 이 주식 몫 중 남편 귀속 비율(0~1). stockOwnership.husband/100. */
  husbandShare: number
  /** 남편 일반주식계좌 배당률(%). */
  dividendYieldPct: number
  propertyBase: number | null
}
export interface JeonseRebalance {
  /** 불가·무배분이면 null. 임의 배분을 만들지 않는다. */
  allocation: { dividendAmount: number; growthAmount: number; cashAmount: number } | null
  /** 'under-cliff': 금융소득 1천만 원 이하 유지 / 'over-cliff': 이미 1천만 원 초과라 상한까지 허용 / 'unconstrained': 배당률 0 등 */
  mode: 'under-cliff' | 'over-cliff' | 'unconstrained' | 'infeasible' | 'none'
  maxDividendPrincipal: number | null
  /** 배당 몫을 제거(0)했을 때의 판정 — 불가 사유 확인용. */
  baseline: DependentResult
  /** 권고 배분 적용 후 판정. allocation=null 이면 baseline 과 동일. */
  result: DependentResult
}

/** 전세 일반주식 몫을 배당/일반(성장)투자로 나눠 피부양자 소득 상한 이하가 되도록 권고. 저장값은 바꾸지 않는다.
 *  금융소득 절벽 때문에 가능하면 1천만 원 이하를 유지하는 쪽(안전)을 우선한다. 현금 이자는 0 가정. */
export function rebalanceJeonse(i: JeonseRebalanceInput): JeonseRebalance {
  const stock = Math.max(0, i.jeonseStock)
  const cash = Math.max(0, i.jeonseCash ?? 0)
  const k = Math.max(0, Math.min(1, i.husbandShare)) * Math.max(0, i.dividendYieldPct) / 100 // 원금 1원당 남편 연 배당
  const fin0 = Math.max(0, i.nonJeonseFinancial)
  const at = (principal: number) => evaluateDependent({ publicPension: i.publicPension, other: i.other, financial: fin0 + principal * k }, i.propertyBase)
  const baseline = at(0)
  if (stock <= 0) return { allocation: null, mode: 'none', maxDividendPrincipal: null, baseline, result: baseline }
  if (baseline.status === 'ineligible') return { allocation: null, mode: 'infeasible', maxDividendPrincipal: null, baseline, result: baseline }

  const limit = baseline.incomeLimit
  let max: number, mode: JeonseRebalance['mode']
  if (k <= 0) { max = Infinity; mode = 'unconstrained' }
  else if (fin0 <= FINANCIAL_INCOME_EXEMPTION) { max = (FINANCIAL_INCOME_EXEMPTION - fin0) / k; mode = 'under-cliff' }
  else { max = (limit - baseline.income.publicPension - baseline.income.other - fin0) / k; mode = 'over-cliff' }
  const dividendAmount = Math.min(stock, Math.max(0, Math.floor(max)))
  return {
    allocation: { dividendAmount, growthAmount: stock - dividendAmount, cashAmount: cash },
    mode, maxDividendPrincipal: Number.isFinite(max) ? Math.max(0, Math.floor(max)) : null,
    baseline, result: at(dividendAmount),
  }
}

// ── 연도별 분석 ────────────────────────────────────────────
export interface JeonseItem { id: string; name: string; receiveYear: number; amount: number; irpAmount: number; stockAmount: number }
export interface DependentRowInput {
  year: number
  /** 남편 공적연금(국민연금 등) 연액. */
  husbandPublicPension: number
  /** 남편 사적연금(IRP·연금저축) 연 지급 — 제외 표시용. */
  husbandPrivatePension: number
  /** 남편 일반주식계좌 금융소득(연). 전세 배당 몫 포함 현재 저장 가정 기준. */
  husbandFinancial: number
}
export interface DependentYearResult {
  year: number
  current: DependentResult
  rebalance: JeonseRebalance
  jeonseStock: number
  jeonseCash: number
  /** 현재 저장 배분에서 전세 주식 몫이 만드는 남편 배당(원금 기준, 성장 미반영). */
  jeonseDividend: number
}
export interface DependentAnalysis {
  status: 'active' | 'no-spouse' | 'wife-year-missing' | 'not-later'
  window: { start: number; end: number } | null
  years: DependentYearResult[]
  jeonseFound: boolean
  jeonseItems: JeonseItem[]
  notes: string[]
}

export function analyzeDependent(a: {
  hasSpouse: boolean
  husbandRetirementYear: number
  wifeRetirementYear: number | null
  rows: DependentRowInput[]
  otherIncome: number
  /** 연도별 남편 재산 과표 추정. null=부동산 자료 없음. */
  propertyBase: (year: number) => number | null
  jeonse: JeonseItem[]
  jeonseFound: boolean
  husbandShare: number
  dividendYieldPct: number
  /** 연금시뮬 연동(배분 반영) 여부. 아니면 전세 배분은 0으로 본다. */
  allocationsApplied: boolean
  corpLinked?: boolean
}): DependentAnalysis {
  const empty = (status: DependentAnalysis['status']): DependentAnalysis => ({ status, window: null, years: [], jeonseFound: a.jeonseFound, jeonseItems: a.jeonse, notes: [] })
  if (!a.hasSpouse) return empty('no-spouse')
  if (a.wifeRetirementYear == null) return empty('wife-year-missing')
  const window = dependentWindow(a.husbandRetirementYear, a.wifeRetirementYear)
  if (!window) return { ...empty('not-later'), notes: ['와이프가 같은 해 또는 먼저 은퇴하여 피부양자 경로를 적용하지 않습니다.'] }

  const years: DependentYearResult[] = []
  for (const r of a.rows) {
    if (r.year < window.start || r.year > window.end) continue
    const items = a.jeonse.filter(j => j.receiveYear <= r.year)
    const jeonseStock = a.allocationsApplied ? items.reduce((s, j) => s + Math.max(0, j.stockAmount), 0) : 0
    const jeonseCash = items.reduce((s, j) => s + Math.max(0, j.amount - (a.allocationsApplied ? j.irpAmount + j.stockAmount : 0)), 0)
    const k = Math.max(0, Math.min(1, a.husbandShare)) * Math.max(0, a.dividendYieldPct) / 100
    const jeonseDividend = jeonseStock * k
    const fin0 = Math.max(0, r.husbandFinancial - jeonseDividend)
    const pb = a.propertyBase(r.year)
    const common = { publicPension: r.husbandPublicPension, other: a.otherIncome, privatePension: r.husbandPrivatePension }
    years.push({
      year: r.year, jeonseStock, jeonseCash, jeonseDividend,
      current: evaluateDependent({ ...common, financial: r.husbandFinancial }, pb),
      rebalance: rebalanceJeonse({ ...common, nonJeonseFinancial: fin0, jeonseStock, jeonseCash, husbandShare: a.husbandShare, dividendYieldPct: a.dividendYieldPct, propertyBase: pb }),
    })
  }
  const notes = [
    '계획 모형이며 국민건강보험공단의 자격 판정이 아닙니다. 와이프 직장가입자 보험료는 계산하지 않습니다.',
    '재산 과표는 시가×75%×60% 추정이며 실제 공시가격 기준 과표와 다릅니다. 전세 임차보증금은 피부양자 재산 과표에 넣지 않습니다.',
    '공적연금은 100% 반영(지역 보험료의 50%와 다름), IRP·연금저축 등 사적연금은 제외, 금융소득은 연 1천만 원 초과 시 전액 반영합니다.',
    '근로·사업소득과 사업자등록은 없다고 가정합니다. 현금 이자는 0%로 보고, 일반투자 몫은 배당 0%로 가정합니다. 전세 몫의 성장은 원금 기준으로 반영하지 않습니다.',
  ]
  if (a.corpLinked) notes.push('법인 연동 소득(급여·배당)은 반영하지 않았습니다. 법인 급여가 있으면 피부양자 자격이 달라질 수 있습니다.')
  if (!a.jeonseFound) notes.push('이름에 "전세" 또는 "보증금"이 포함된 목돈이 없어 재배분은 하지 않고, 기존 배당·연금 기준으로만 판정했습니다.')
  else if (!a.allocationsApplied) notes.push('연금 시뮬레이션 연동이 꺼져 있어 전세 목돈의 주식 배분을 알 수 없습니다. 재배분 권고는 연동 후 표시됩니다.')
  return { status: 'active', window, years, jeonseFound: a.jeonseFound, jeonseItems: a.jeonse, notes }
}
