// 연금 시뮬레이터 — 순수 계산 함수(상태/IO 없음, 단위테스트 대상).
// 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델. 1인(남편/와이프) 단위 과세.
// 기존 연금원천(sources)은 그대로 가정(연금=남편 명의), + 유입 항목의 목적지·명의에
// 따라 1인별 세금·건보를 산출 → 가구 총계.
// 모든 수치는 사용자 가정에 기반한 추정치.
import type { PensionSimPlan, PensionSource, PensionAllocation, Ownership } from '@/types'
import { calcHealthInsurance } from '@/lib/healthInsurance'

/** 연금소득세 누진구간 (연금소득 전용, 종합소득세와 별개) */
export function pensionIncomeTax(taxable: number): number {
  if (taxable <= 0) return 0
  if (taxable <= 34_000_000) return taxable * 0.03
  if (taxable <= 76_000_000) return taxable * 0.04 - 340_000
  if (taxable <= 138_000_000) return taxable * 0.05 - 1_100_000
  return taxable * 0.06 - 2_480_000
}

/** 퇴직소득세(단순 추정) — 현금 수령 시 즉시 과세.
 *  퇴직소득 = amount − 퇴직소득공제(700만, 근속연수당 공제는 생략 단순화) → 누진 6~35%.
 *  연금소득세(3~6%)보다 가파름. 실제는 근속연수/공제에 따라 변동 → 추정치. */
export function severanceTax(amount: number): number {
  const taxable = Math.max(0, amount - 7_000_000)
  if (taxable <= 0) return 0
  if (taxable <= 14_000_000) return taxable * 0.06
  if (taxable <= 50_000_000) return taxable * 0.15 - 1_260_000
  if (taxable <= 88_000_000) return taxable * 0.24 - 5_760_000
  if (taxable <= 150_000_000) return taxable * 0.35 - 15_400_000
  if (taxable <= 300_000_000) return taxable * 0.38 - 19_900_000
  if (taxable <= 500_000_000) return taxable * 0.40 - 25_900_000
  return taxable * 0.42 - 31_900_000
}

/** 국민연금 비과세(공제연금소득) 비율 — 2005년 이전 불입분 상당액 등.
 *  1970년대생 가입자는 대부분 2006년 이후 불입이라 사실상 0에 가깝다고 보고 0으로 둔다.
 *  (실제는 가입기간별 비과세 비율 계산 필요 — 시뮬레이션 단순화) */
export const NATIONAL_PENSION_NONTAX_RATE = 0

/** 연금소득세(사적+공적 합산) — 세법대로:
 *  연금소득 과세표준 = (사적 과세연금 − 연금소득공제 1,200만, 0 하한) + 국민연금 과세분.
 *  연금소득공제는 사적연금(IRP·연금저축)에만 적용 — 국민연금(공적연금)은 공제 없이 합산.
 *  합산 과세표준에 단일 누진(3~6%) 적용. */
export function pensionTaxCombined(
  privateTaxable: number,
  nationalAnnual: number,
  deduction: number,
): number {
  const privateBase = Math.max(0, privateTaxable - deduction)
  const nationalTaxable = nationalAnnual * (1 - NATIONAL_PENSION_NONTAX_RATE)
  return pensionIncomeTax(privateBase + nationalTaxable)
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

/** 배당가산율 — 종합과세되는 배당(2천만 초과분)에 법인세액상당액 가산.
 *  현행(법인세 최저세율 기준) 추정치 10%. 대주주·비상장 원칙, 상장 소액주주는 미적용이지만
 *  시뮬레이션 단순화로 종합과세 배당 전체에 균일 적용. */
export const DIVIDEND_GROSS_UP_RATE = 0.10
/** 배당세액공제율 — 배당가산액의 13% (이중과세 경감 세액공제) */
export const DIVIDEND_TAX_CREDIT_RATE = 0.13

/** 금융소득종합과세 기준 — 연 2천만원 초과분은 종합소득세 합산 (1인별 적용) */
export const FINANCIAL_INCOME_LIMIT = 20_000_000

/** 금융소득 과세 분해 (1인분) */
export interface TaxBreakdown {
  financialIncome:        number
  separatedTax:           number
  consolidatedFinancial:  number
  /** 배당가산액 — 종합과세 배당의 법인세액상당 (과세표준에 가산) */
  dividendGrossUp:        number
  comprehensiveTaxable:   number
  comprehensiveTax:       number
  /** 종합합산된 금융소득에 이미 원천징수된 15.4% — 기납부세액 공제 */
  withheldCredit:         number
  /** 배당세액공제 — 배당가산액 × 13% */
  dividendCredit:         number
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
  // 배당가산: 종합과세되는 배당에 법인세액상당액 가산 → 과세표준 확대
  const grossUp = Math.round(consolidatedFinancial * DIVIDEND_GROSS_UP_RATE)
  const comprehensiveBase = consolidatedFinancial + grossUp + Math.max(0, otherIncome)
  const comprehensiveTaxable = Math.max(0, comprehensiveBase - deduction)
  const compTaxRaw = comprehensiveTax(comprehensiveTaxable)
  // 초과분도 수령 시 15.4% 원천징수되며, 종합소득세 신고 시 기납부세액으로 공제된다.
  // 공제 없이 누진세 전액을 매기면 이중과세로 세금이 과대 계상됨.
  const withheldCredit = Math.round(consolidatedFinancial * SEPARATED_TAX_RATE)
  // 배당세액공제: 가산액의 13% — 법인단계 이중과세 경감
  const dividendCredit = Math.round(grossUp * DIVIDEND_TAX_CREDIT_RATE)
  const compTax = Math.max(0, compTaxRaw - withheldCredit - dividendCredit)
  return {
    financialIncome, separatedTax,
    consolidatedFinancial, dividendGrossUp: grossUp,
    comprehensiveTaxable,
    comprehensiveTax: compTax,
    withheldCredit, dividendCredit,
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

/** 일반주식계좌 잔액 = Σ allocations.stockAmount (목돈 분배로 주식에 넣은 원금). */
export function stockBalanceFromInflows(allocations: PensionAllocation[]): number {
  return allocations.reduce((s, a) => s + a.stockAmount, 0)
}

/** 일반주식계좌(남편/와이프 각각) 잔액·배당기준.
 *  잔액 = (목돈 분배 stock 합 × stockOwnership 지분) + extraAmount.
 *  dividendBase = 잔액 × dividendYield%. */
export interface StockAccountBalances {
  husband: { linked: number; extra: number; total: number; dividendBase: number; growthRate: number; dividendYield: number }
  wife:    { linked: number; extra: number; total: number; dividendBase: number; growthRate: number; dividendYield: number }
}
export function stockAccountBalances(plan: PensionSimPlan): StockAccountBalances {
  const pool = stockBalanceFromInflows(plan.allocations)
  const h = plan.stockAccount.husband, w = plan.stockAccount.wife
  const hLinked = pool * (plan.stockOwnership.husband / 100)
  const wLinked = pool * (plan.stockOwnership.wife / 100)
  const hTot = hLinked + h.extraAmount
  const wTot = wLinked + w.extraAmount
  return {
    husband: { linked: hLinked, extra: h.extraAmount, total: hTot, dividendBase: hTot * (h.dividendYield / 100), growthRate: h.growthRate, dividendYield: h.dividendYield },
    wife:    { linked: wLinked, extra: w.extraAmount, total: wTot, dividendBase: wTot * (w.dividendYield / 100), growthRate: w.growthRate, dividendYield: w.dividendYield },
  }
}

/** 목돈별 현금 나머지 = 목돈 금액 − (퇴직IRP + 주식 분배). 0 미만 방지. */
export function cashRemainder(lumpsumAmount: number, allocations: { irpAmount: number; stockAmount: number }[]): number {
  const allocated = allocations.reduce((s, a) => s + a.irpAmount + a.stockAmount, 0)
  return Math.max(0, lumpsumAmount - allocated)
}

/** 기본 입력값 (샘플) */
export const EMPTY_PENSION_PLAN: PensionSimPlan = {
  sources: [
    { id: 'irp1', name: '퇴직연금(DC) → IRP', principal: 300_000_000, taxType: 'irp', yieldRate: 4, owner: 'husband' },
    { id: 'pen1', name: '연금저축(98년 비과세)', principal: 100_000_000, taxType: 'taxExempt', yieldRate: 4, owner: 'husband' },
  ],
  allocations: [],
  stockAccount: {
    husband: { extraAmount: 0, dividendYield: 4, growthRate: 5 },
    wife:    { extraAmount: 0, dividendYield: 4, growthRate: 5 },
  },
  stockOwnership: { husband: 50, wife: 50 },
  otherIncome: 0,
  spouseDependent: true,
  dependents: 0,
  useStandardDeduction: true,
  withdrawalYears: 30,
  startYear: new Date().getFullYear() + 3,
  refYear: 2030,
  pensionDeduction: 12_000_000,
}

/** 연금 원천 총액 */
export const totalPrincipal = (plan: PensionSimPlan): number =>
  plan.sources.reduce((s, src) => s + src.principal, 0)

/** + 분배된 투자 원금 합계 (IRP + 주식) */
export const totalInflows = (plan: PensionSimPlan): number =>
  plan.allocations.reduce((s, a) => s + a.irpAmount + a.stockAmount, 0)

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
/** 국민연금(확정급여) — 월 수령액·수령기간을 자산 detail에서 추출. 원금인출 아님. */
export interface NationalPension {
  expectedStartYear:     number
  expectedEndYear:       number
  expectedMonthlyPayout: number
  annualGrowthRate:      number
}
export interface VehicleOptions {
  husbandProperty?:  PersonProperty
  wifeProperty?:     PersonProperty
  nationalPensions?: NationalPension[]   // 국민연금 자산(월수령액 모델)
  scorePerPoint?:    number
  irpGrowthRate?:    number              // IRP 퇴직시점 성장용 연평균 상승률(%)
  currentYear?:      number
}

/** 연도별 연금 스케줄.
 *  - IRP/퇴직/과세·비과세 연금저축 = 원금 ÷ 수령기간 (flat 인출, 매년 동일).
 *  - 국민연금 = expectedStartYear~End, 월수령액 × 12 × (1+증가율)^경과년 (65세 step-up 반영).
 *  국민연금 sources는 원금인출 합계에서 제외(이중계산 방지). */
export interface PensionScheduleRow {
  year:            number
  drawdownAnnual:  number   // IRP/연금저축 인출 (과세+비과세, 성장률 적용)
  nationalAnnual:  number   // 국민연금 (과세)
  financialAnnual: number   // 일반주식계좌 배당 합계 (남편+와이프, 성장률 적용)
  financialHusbandAnnual: number  // 남편 계좌 배당 (본인 배당률·상승률)
  financialWifeAnnual:    number  // 와이프 계좌 배당
  taxableAnnual:   number   // drawdown과세 + 국민연금
  exemptAnnual:    number   // drawdown 비과세
  totalAnnual:     number   // 연금 + 배당 합계
}
export function pensionSchedule(
  plan: PensionSimPlan,
  nationals: NationalPension[],
  fromYear: number,
  toYear: number,
  opts?: { irpGrowthRate?: number; currentYear?: number },
): PensionScheduleRow[] {
  const years = plan.withdrawalYears || 1
  const irpGrowth = ((opts?.irpGrowthRate ?? 0)) / 100  // IRP 잔액 성장
  const currentYear = opts?.currentYear ?? new Date().getFullYear()
  const startYear = plan.startYear

  // ── 일반주식계좌 (남편/와이프 각각): 계좌 단위 배당률·상승률 ──
  const sb = stockAccountBalances(plan)
  const hGrowth = sb.husband.growthRate / 100
  const wGrowth = sb.wife.growthRate / 100

  // ── IRP/퇴직연금 (통합 1계좌): 퇴직시점까지 성장한 잔액 ÷ 수령기간 ──
  // 목돈 IRP 분배(퇴직금 등) + expectedMonthlyPayout 미등록 IRP 자산.
  // 수령 개시/종료 연도는 퇴직연금 자산의 expectedStart/EndYear을 따름 (한 계좌로 합쳐진 가정).
  const irpSourcesAll = plan.sources.filter((s) => s.taxType === 'irp')
  const irpStartCand = irpSourcesAll.map((s) => s.expectedStartYear).filter((y): y is number => !!y)
  const irpEndCand = irpSourcesAll.map((s) => s.expectedEndYear).filter((y): y is number => !!y)
  const irpStartY = irpStartCand.length ? Math.min(...irpStartCand) : startYear
  const irpEndY = irpEndCand.length ? Math.max(...irpEndCand) : (startYear + years - 1)
  const irpYears = Math.max(1, irpEndY - irpStartY + 1)
  const yearsToIrpStart = Math.max(0, irpStartY - currentYear)
  const irpInflow = plan.allocations.reduce((sm, a) => sm + a.irpAmount, 0)
  // 등록 월수령액이 있는 IRP 자산은 registeredSources에서 수령 → 여기서는 제외(이중방지)
  const irpAssetCurrent = plan.sources
    .filter((s) => s.taxType === 'irp' && !(s.expectedMonthlyPayout && s.expectedMonthlyPayout > 0))
    .reduce((sm, s) => sm + s.principal, 0)
  const irpProjected = (irpAssetCurrent + irpInflow) * Math.pow(1 + irpGrowth, yearsToIrpStart)
  const irpAnnualBase = irpProjected / irpYears
  const irpAnnualAt = (Y: number): number => {
    if (Y < irpStartY || Y > irpEndY) return 0
    const elapsed = Y - irpStartY
    return irpAnnualBase * Math.pow(1 + irpGrowth, elapsed)
  }

  // ── 등록 월수령액 모델 (비과세·과세 연금저축): expectedMonthlyPayout × 12 × 연성장 ──
  const registeredSources = plan.sources.filter((s) => s.expectedMonthlyPayout && s.expectedMonthlyPayout > 0)
  const allowanceAnnualAt = (Y: number): { taxable: number; exempt: number } => {
    let taxable = 0, exempt = 0
    for (const s of registeredSources) {
      // 0(미입력)도 폴백 — || 사용 (??는 0을 그대로 둬 startYear가 안 됨)
      const st = s.expectedStartYear || startYear
      const ed = s.expectedEndYear || (startYear + years - 1)
      if (Y < st || Y > ed) continue
      const elapsed = Math.max(0, Y - st)
      const g = (s.annualGrowthRate ?? 0) / 100
      const annual = (s.expectedMonthlyPayout as number) * 12 * Math.pow(1 + g, elapsed)
      if (s.taxType === 'taxExempt') exempt += annual
      else taxable += annual   // taxable 연금저축(과세) — 연금소득세 대상
    }
    return { taxable, exempt }
  }

  // ── 폴백: expectedMonthlyPayout 미등록 비과세·과세 연금저축 = 원금 ÷ 수령기간 (예전 모델) ──
  const hasPayout = (s: PensionSource) => !!(s.expectedMonthlyPayout && s.expectedMonthlyPayout > 0)
  const flatTaxableBase = plan.sources
    .filter((s) => s.taxType === 'taxable' && !hasPayout(s))
    .reduce((sm, s) => sm + s.principal, 0) / years
  const flatExemptBase = plan.sources
    .filter((s) => s.taxType === 'taxExempt' && !hasPayout(s))
    .reduce((sm, s) => sm + s.principal, 0) / years
  const flatAnnualAt = (Y: number): { taxable: number; exempt: number } => {
    if (Y < startYear || Y > startYear + years - 1) return { taxable: 0, exempt: 0 }
    return { taxable: flatTaxableBase, exempt: flatExemptBase }
  }

  const rows: PensionScheduleRow[] = []
  for (let year = fromYear; year <= toYear; year++) {
    const elapsed = year - fromYear  // 배당 성장 경과년수
    // 남편/와이프 각 계좌 배당 (본인 배당률·상승률 적용)
    const finH = sb.husband.dividendBase * Math.pow(1 + hGrowth, elapsed)
    const finW = sb.wife.dividendBase * Math.pow(1 + wGrowth, elapsed)
    const financial = finH + finW

    const irp = irpAnnualAt(year)
    const allow = allowanceAnnualAt(year)
    const flat = flatAnnualAt(year)

    let national = 0
    for (const n of nationals) {
      // 국민연금은 종신 → 수령개시연도부터 스케줄 끝(toYear, 사망)까지 지급.
      // (endYear가 짧아 현금흐름 중간에 끊기는 버그 방지 — 와이프 자동생성 endYear=start+50 등)
      if (year >= n.expectedStartYear && year <= toYear) {
        const natElapsed = year - n.expectedStartYear
        national += n.expectedMonthlyPayout * 12 * Math.pow(1 + (n.annualGrowthRate || 0) / 100, natElapsed)
      }
    }
    const drawTaxable = irp + allow.taxable + flat.taxable
    const drawExempt = allow.exempt + flat.exempt
    const taxable = drawTaxable + national
    rows.push({
      year,
      drawdownAnnual: Math.round(drawTaxable + drawExempt),
      nationalAnnual: Math.round(national),
      financialAnnual: Math.round(financial),
      financialHusbandAnnual: Math.round(finH),
      financialWifeAnnual: Math.round(finW),
      taxableAnnual: Math.round(taxable),
      exemptAnnual: Math.round(drawExempt),
      totalAnnual: Math.round(taxable + drawExempt + financial),
    })
  }
  return rows
}

/** 특정 연도 스케줄 행에 대해 1인별 세금·건보 산정 (현금흐름 연도별 재산정용).
 *  연금은 남편 명의 가정. 배당은 남편/와이프 각 계좌의 본인 배당(row.financialHusband/WifeAnnual).
 *  재산분은 해당 연도의 부동산 재산과표(props) 반영 (재건축 futureYear 전환 포함). */
export function perPersonYearTaxHealth(
  row: PensionScheduleRow,
  plan: PensionSimPlan,
  husbandProp: PersonProperty,
  wifeProp: PersonProperty,
  scorePerPoint = 208.4,
): { husbandTax: number; wifeTax: number; husbandHealth: number; wifeHealth: number } {
  const ded = computePerPersonComprehensiveDeduction(plan)

  const pensionTaxableH = row.taxableAnnual
  const pensionExemptH = row.exemptAnnual
  // 연금소득세 — 국민연금(공적)은 연금소득공제 대상 아님: 사적분에만 공제 후 합산 누진
  const pensionTaxH = pensionTaxCombined(row.taxableAnnual - row.nationalAnnual, row.nationalAnnual, plan.pensionDeduction)

  const finH = row.financialHusbandAnnual
  const finW = row.financialWifeAnnual
  const ftH = comprehensiveTaxBreakdown(finH, plan.otherIncome, ded.husband)
  const ftW = comprehensiveTaxBreakdown(finW, 0, ded.wife)

  const husbandTax = pensionTaxH + ftH.totalFinancialTax
  const wifeTax = ftW.totalFinancialTax

  const husbandHealth = calcHealthInsurance({
    pensionAnnual: pensionTaxableH + pensionExemptH,
    dividendAnnual: finH,
    otherAnnual: plan.otherIncome,
    propertyTaxBase: husbandProp.propertyTaxBase,
    rentalDeposit: husbandProp.rentalDeposit,
    carValue: husbandProp.carValue ?? 0,
    scorePerPoint,
  }).grandTotal
  const wifeHealth = calcHealthInsurance({
    pensionAnnual: 0,
    dividendAnnual: finW,
    otherAnnual: 0,
    propertyTaxBase: wifeProp.propertyTaxBase,
    rentalDeposit: wifeProp.rentalDeposit,
    carValue: wifeProp.carValue ?? 0,
    scorePerPoint,
  }).grandTotal

  return { husbandTax, wifeTax, husbandHealth, wifeHealth }
}


/** 1인별 연금·개인 vehicle 결과.
 *  - 연금(IRP/과세/비과세 원금) = 남편 100% (연금=남편 가정).
 *  - 일반주식계좌 잔액 = stockBalanceFromInflows → stockOwnership으로 1인 분할.
 *  - 금융소득 2천만 한도·연금소득세·건보 모두 1인별 산출.
 *  - 건보 재산분은 opts.property(부동산 명의 가중)로 1인별 — 미제공 시 소득분만. */
export function computePensionVehiclePerPerson(plan: PensionSimPlan, opts?: VehicleOptions): HouseholdVehicleResult {
  const years = plan.withdrawalYears || 1

  // 국민연금(확정급여) 분리 — 원금인출 아님, 월수령액 모델
  const nationals = opts?.nationalPensions ?? []
  const nationalIds = new Set(plan.sources.filter((s) => s.taxType === 'national').map((s) => s.id))
  const hasNationalAsset = nationals.length > 0

  // 인출형 연금 원금 (국민연금 제외) — 남편 명의
  const taxableSrc = plan.sources
    .filter((s) => (s.taxType === 'irp' || s.taxType === 'taxable') && !nationalIds.has(s.id))
    .reduce((s, src) => s + src.principal, 0)
  const exemptSrc = plan.sources
    .filter((s) => s.taxType === 'taxExempt')
    .reduce((s, src) => s + src.principal, 0)
  // 국민연금 자산 detail이 없는 경우(legacy) 폴백: 원금÷기간
  const nationalFallback = hasNationalAsset ? 0
    : plan.sources.filter((s) => s.taxType === 'national').reduce((s, src) => s + src.principal, 0)

  // IRP 유입은 남편(퇴직) 명의로 합산 (목돈 분배 → 퇴직IRP)
  const irpInflow = plan.allocations.reduce((s, a) => s + a.irpAmount, 0)

  // 일반주식계좌 (남편/와이프 각각): 계좌 단위 잔액·배당기준
  const sb = stockAccountBalances(plan)

  // 기타소득은 남편 근로 가정(연금시뮬에선 남편에 배정; 은퇴계획에서 1인별 처리)
  const other = { husband: plan.otherIncome, wife: 0 }

  // 1인별 종합소득공제 자동 산정
  const perPersonDed = computePerPersonComprehensiveDeduction(plan)

  // 연도별 연금 스케줄 (국민연금 step-up 반영) — 대표연도 = 기준년도(refYear, 기본 2030).
  // refYear가 수령기간 밖이면 가장 가까운 해로, 미설정이면 peak.
  const fromYear = plan.startYear
  const toYear = plan.startYear + years - 1
  const schedule = pensionSchedule(plan, nationals, fromYear, toYear, {
    irpGrowthRate: opts?.irpGrowthRate,
    currentYear: opts?.currentYear,
  })
  const peakRow = schedule.reduce<PensionScheduleRow | undefined>(
    (max, r) => (!max || r.totalAnnual > max.totalAnnual ? r : max), undefined)
  const refY = plan.refYear
  const refRow = refY
    ? (schedule.find((r) => r.year === refY)
      ?? (refY <= fromYear ? schedule[0] : schedule[schedule.length - 1]))
    : peakRow

  // 1인별 연금 — 남편만 (와이프 연금 0)
  const pensionRow = refRow ?? peakRow
  const annualPensionTaxableH = (pensionRow?.taxableAnnual ?? (taxableSrc + irpInflow + nationalFallback) / years)
  const annualPensionExemptH = pensionRow?.exemptAnnual ?? exemptSrc / years
  // 연금소득세 — 국민연금(공적)은 연금소득공제 대상 아님: 사적분에만 공제 후 합산 누진
  const annualNationalH = pensionRow?.nationalAnnual ?? nationalFallback / years
  const pensionTaxH = pensionTaxCombined(annualPensionTaxableH - annualNationalH, annualNationalH, plan.pensionDeduction)

  // 기준년도 주식 배당 (본인 계좌 배당률·상승률 적용) — pensionRow의 1인별 배당 사용
  const fin = {
    husband: pensionRow?.financialHusbandAnnual ?? sb.husband.dividendBase,
    wife: pensionRow?.financialWifeAnnual ?? sb.wife.dividendBase,
  }

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

    const stockBalance = isHusband ? sb.husband.total : sb.wife.total
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

/** PENSION 자산의 현재가치 — 연동(linkedStockId)된 주식계좌가 있으면 그 계좌 현재가치(주가 하락 반영). */
export function effectivePensionValue(
  a: { currentValue: number; detail?: { linkedStockId?: string } },
  stockById?: Map<string, number>,
): number {
  const sid = a.detail?.linkedStockId
  if (sid && stockById?.has(sid)) return stockById.get(sid) as number
  return a.currentValue
}

/** PENSION 자산에서 PensionSource 자동 생성 */
export function sourcesFromAssets(
  assets: { id: string; name: string; currentValue: number; detail?: { pensionType?: string; linkedStockId?: string; expectedMonthlyPayout?: number; expectedStartYear?: number; expectedEndYear?: number; annualGrowthRate?: number } }[],
  existing: PensionSource[] = [],
  stockById?: Map<string, number>,
): PensionSource[] {
  return assets.map((a) => {
    const pt = (a.detail?.pensionType ?? '').toLowerCase()
    // 과세구분 자동 산출 (한글/영문 모두, 대소문자 무시) — NATIONAL(영어) 분류 수정 반영.
    const autoTaxType: PensionSource['taxType'] =
      pt.includes('퇴직') || pt.includes('irp') ? 'irp'
      : (pt.includes('국민') || pt.includes('national')) ? 'national'
      : (pt.includes('비과세') || pt.includes('exempt')) ? 'taxExempt'
      : 'taxable'
    const existingSrc = existing.find((s) => s.id === a.id)
    // 과세구분: 사용자가 PensionPage에서 수동 설정(taxTypeManual)한 경우 그 값을 존중.
    // 그렇지 않으면 pensionType에서 자동 산출 — PERSONAL 등 모호한 타입은 기본 taxable.
    // (비과세 연금이 자꾸 0이 되던 원인: 수동 설정값이 매번 자동산출로 덮어씌워졌음)
    const taxType: PensionSource['taxType'] = (existingSrc?.taxTypeManual && existingSrc?.taxType) ? existingSrc.taxType : autoTaxType
    // 연동된 주식계좌가 있으면 그 현재가치를 원금으로 (주가 하락 반영)
    const principal = a.detail?.linkedStockId && stockById?.has(a.detail.linkedStockId)
      ? effectivePensionValue(a, stockById)
      : (existingSrc?.principal ?? a.currentValue)
    return {
      id: a.id,
      name: a.name,
      principal,
      taxType,
      yieldRate: existingSrc?.yieldRate ?? 4,
      owner: existingSrc?.owner ?? 'husband',
      // 수령 모델 필드 (자산 detail에서 자동 채움) — 비과세·과세 연금저축의 등록 월수령액
      expectedMonthlyPayout: a.detail?.expectedMonthlyPayout ?? existingSrc?.expectedMonthlyPayout,
      expectedStartYear: a.detail?.expectedStartYear ?? existingSrc?.expectedStartYear,
      expectedEndYear: a.detail?.expectedEndYear ?? existingSrc?.expectedEndYear,
      annualGrowthRate: a.detail?.annualGrowthRate ?? existingSrc?.annualGrowthRate,
    }
  })
}

// (Ownership/PRESET helpers는 types에서 export — PensionSimPage에서 직접 import)
export type { Ownership }
