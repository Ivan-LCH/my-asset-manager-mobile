// 연도별 계좌 잔액 추적 시뮬레이션 — IRP(배당 우선 충당+재투자) + 일반주식계좌(상승률만, 배당 전액 수입).
// 순수 계산 함수 (상태/IO 없음).
import type { PensionSimPlan } from '@/types'
import { stockBalanceFromInflows, stockAccountYield } from '@/lib/pensionSim'

export interface AccountSimRow {
  year:            number
  // IRP (퇴직연금 통합 1계좌)
  irpStart:        number   // 연초 잔액
  irpGrowth:       number   // 주가상승분
  irpDividend:     number   // 배당수익
  irpPension:      number   // 연금지급액 (배당 우선 충당, 부족분 원금)
  irpReinvest:     number   // 배당 - 연금 (양수=재투자, 음수=원금 인출)
  irpEnd:          number   // 연말 잔액
  // 일반주식계좌
  stockStart:      number
  stockGrowth:     number   // 주가상승분
  stockDividend:   number   // 배당 (전액 수입으로 나감)
  stockEnd:        number   // 연말 잔액 (상승만, 배당 재투자 X)
  // 합계
  totalEnd:        number   // IRP + 주식 + 부동산 연말 잔액
  // 부동산
  realEstateEnd:   number   // 부동산 가치 (재건축 전환 반영)
}

export interface AccountSimOptions {
  irpInitial:         number   // IRP 초기 잔액 (퇴직연금 자산 현재가치 합)
  irpGrowthRate:      number   // IRP 연평균 주가상승률(%)
  irpDividendYield:   number   // IRP 연평균 배당률(%)
  irpMonthlyPension:  number   // IRP에서 월 지급할 연금액 (목표)
  stockInitial:       number   // 일반주식계좌 초기 잔액
  stockGrowthRate:    number   // 주식계좌 연평균 주가상승률(%)
  stockDividendYield: number   // 주식계좌 연평균 배당률(%)
  // 부동산 (재건축 전환)
  realEstateItems:    { currentValue: number; futureValue?: number; futureYear?: number }[]
  fromYear:           number
  toYear:             number
}

/** IRP + 일반주식계좌 + 부동산의 연도별 잔액 추적.
 *  - IRP: 배당으로 연금 우선 충당, 남으면 재투자, 부족하면 원금에서.
 *  - 일반주식계좌: 배당은 전액 수입(재투자 X), 상승률만 잔액에 반영.
 */
export function simulateAccounts(opts: AccountSimOptions): AccountSimRow[] {
  const rows: AccountSimRow[] = []
  let irpBalance = opts.irpInitial
  let stockBalance = opts.stockInitial
  const annualPension = opts.irpMonthlyPension * 12
  const irpG = (opts.irpGrowthRate || 0) / 100
  const irpY = (opts.irpDividendYield || 0) / 100
  const stockG = (opts.stockGrowthRate || 0) / 100
  const stockY = (opts.stockDividendYield || 0) / 100

  for (let year = opts.fromYear; year <= opts.toYear; year++) {
    const irpStart = irpBalance
    const irpGrowth = irpBalance * irpG
    const irpDividend = irpBalance * irpY
    // 배당으로 우선 충당
    const pensionFromDiv = Math.min(irpDividend, annualPension)
    const pensionFromPrincipal = Math.max(0, annualPension - irpDividend)
    const reinvest = irpDividend - pensionFromDiv   // 양수=재투자, 음수 안 됨 (부족분은 principal에서)
    // 잔액 = 전년 × (1+성장) + 재투자 - 원금인출
    irpBalance = irpBalance + irpGrowth + reinvest - pensionFromPrincipal
    if (irpBalance < 0) irpBalance = 0   // 잔액 바닥

    const stockStart = stockBalance
    const stockGrowthAmt = stockBalance * stockG
    const stockDividend = stockBalance * stockY
    stockBalance = stockBalance + stockGrowthAmt   // 배당은 재투자 X

    // 부동산 가치 (재건축 전환: futureYear 이후 futureValue)
    const realEstateEnd = opts.realEstateItems.reduce((s, item) => {
      const useFuture = item.futureValue != null && item.futureYear != null && year >= (item.futureYear as number)
      return s + (useFuture ? (item.futureValue as number) : item.currentValue)
    }, 0)

    rows.push({
      year,
      irpStart: Math.round(irpStart),
      irpGrowth: Math.round(irpGrowth),
      irpDividend: Math.round(irpDividend),
      irpPension: Math.round(pensionFromDiv + pensionFromPrincipal),
      irpReinvest: Math.round(reinvest - pensionFromPrincipal),
      irpEnd: Math.round(irpBalance),
      stockStart: Math.round(stockStart),
      stockGrowth: Math.round(stockGrowthAmt),
      stockDividend: Math.round(stockDividend),
      stockEnd: Math.round(stockBalance),
      realEstateEnd: Math.round(realEstateEnd),
      totalEnd: Math.round(irpBalance + stockBalance + realEstateEnd),
    })
  }
  return rows
}

/** PensionSimPlan + IRP 포트폴리오에서 AccountSimOptions 구성. */
export function buildAccountSimOptions(
  plan: PensionSimPlan,
  irpInitial: number,
  irpGrowthRate: number,
  irpDividendYield: number,
): AccountSimOptions {
  const stockTotal = stockBalanceFromInflows(plan.allocations)
  const stockYieldPct = stockAccountYield(plan)
  // 종목별 growthRate 가중평균
  const holdings = plan.stockHoldings.filter((h) => h.ticker && h.weight > 0 && (h.growthRate ?? 0) > 0)
  const totalW = holdings.reduce((s, h) => s + h.weight, 0)
  const stockGrowth = totalW > 0 ? holdings.reduce((s, h) => s + (h.growthRate ?? 0) * (h.weight / totalW), 0) : 0

  // IRP 월 연금지급 = 원금÷수령기간÷12 (기본 목표액)
  const years = plan.withdrawalYears || 1
  const irpMonthlyPension = irpInitial / years / 12

  return {
    irpInitial,
    irpGrowthRate,
    irpDividendYield,
    irpMonthlyPension,
    stockInitial: stockTotal,
    stockGrowthRate: stockGrowth,
    stockDividendYield: stockYieldPct,
    realEstateItems: [],
    fromYear: plan.startYear,
    toYear: plan.startYear + years - 1,
  }
}
