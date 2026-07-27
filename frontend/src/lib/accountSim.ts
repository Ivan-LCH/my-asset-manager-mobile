// 연도별 계좌 잔액 추적 시뮬레이션 — IRP(배당 우선 충당+재투자) + 일반주식계좌(상승률만, 배당 전액 수입).
// 순수 계산 함수 (상태/IO 없음).
import type { PensionSimPlan } from '@/types'
import { stockAccountBalances } from '@/lib/pensionSim'

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

export interface StockAccountSim {
  initial:         number   // 계좌 초기 잔액
  growthRate:      number   // 연평균 주가상승률(%)
  dividendYield:   number   // 연평균 배당률(%)
}

export interface AccountSimOptions {
  irpInitial:         number   // IRP 초기 잔액 (퇴직연금 자산 현재가치 합)
  irpGrowthRate:      number   // IRP 연평균 주가상승률(%)
  irpDividendYield:   number   // IRP 연평균 배당률(%)
  irpMonthlyPension:  number   // IRP에서 월 지급할 연금액 (목표)
  stockAccounts:      StockAccountSim[]   // 일반주식계좌 (남편/와이프 각각)
  // 부동산 (재건축 전환)
  realEstateItems:    { currentValue: number; futureValue?: number; futureYear?: number }[]
  fromYear:           number
  toYear:             number
}

/** IRP + 일반주식계좌(남편/와이프) + 부동산의 연도별 잔액 추적.
 *  - IRP: 배당으로 연금 우선 충당, 남으면 재투자, 부족하면 원금에서.
 *  - 일반주식계좌(각각): 배당은 전액 수입(재투자 X), 상승률만 잔액에 반영. 계좌별 growth/yield 합산.
 */
export function simulateAccounts(opts: AccountSimOptions): AccountSimRow[] {
  const rows: AccountSimRow[] = []
  let irpBalance = opts.irpInitial
  const stockBalances = opts.stockAccounts.map((a) => a.initial)
  const annualPension = opts.irpMonthlyPension * 12
  const irpG = (opts.irpGrowthRate || 0) / 100
  const irpY = (opts.irpDividendYield || 0) / 100
  const stockGS = opts.stockAccounts.map((a) => (a.growthRate || 0) / 100)
  const stockYS = opts.stockAccounts.map((a) => (a.dividendYield || 0) / 100)

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

    // 일반주식계좌(남편/와이프) — 각각 상승 반영, 합산
    let stockStart = 0, stockGrowthAmt = 0, stockDividend = 0, stockEndSum = 0
    for (let i = 0; i < stockBalances.length; i++) {
      stockStart += stockBalances[i]
      const g = stockBalances[i] * stockGS[i]
      const d = stockBalances[i] * stockYS[i]
      stockGrowthAmt += g
      stockDividend += d
      stockBalances[i] = stockBalances[i] + g   // 배당은 재투자 X
      stockEndSum += stockBalances[i]
    }

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
      stockEnd: Math.round(stockEndSum),
      realEstateEnd: Math.round(realEstateEnd),
      totalEnd: Math.round(irpBalance + stockEndSum + realEstateEnd),
    })
  }
  return rows
}

/** PensionSimPlan에서 AccountSimOptions 구성. 일반주식계좌는 남편/와이프 각 계좌(잔액·배당률·상승률). */
export function buildAccountSimOptions(
  plan: PensionSimPlan,
  irpInitial: number,
  irpGrowthRate: number,
  irpDividendYield: number,
): AccountSimOptions {
  const sb = stockAccountBalances(plan)

  // IRP 월 연금지급 = 원금÷수령기간÷12 (기본 목표액)
  const years = plan.withdrawalYears || 1
  const irpMonthlyPension = irpInitial / years / 12

  return {
    irpInitial,
    irpGrowthRate,
    irpDividendYield,
    irpMonthlyPension,
    stockAccounts: [
      { initial: sb.husband.total, growthRate: sb.husband.growthRate, dividendYield: sb.husband.dividendYield },
      { initial: sb.wife.total,    growthRate: sb.wife.growthRate,    dividendYield: sb.wife.dividendYield },
    ],
    realEstateItems: [],
    fromYear: plan.startYear,
    toYear: plan.startYear + years - 1,
  }
}
