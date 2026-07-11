// 연금 수령액 연도별 계산 — RetirementPage / CorpSim 공유 (pensionCalc.ts 로 추출).
import type { Asset, PensionDetail, StockDetail, SavingsDetail } from '@/types'

export const SIM_START_YEAR = 2029

export function calcPensionByYear(assets: Asset[], currentAge: number): Map<number, number> {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + (100 - currentAge)
  const map = new Map<number, number>()
  for (let year = SIM_START_YEAR; year <= endYear; year++) {
    let monthly = 0
    for (const a of assets) {
      if (a.type === 'PENSION') {
        const d = a.detail as PensionDetail | undefined
        if (!d) continue
        if (year >= d.expectedStartYear && year <= d.expectedEndYear) {
          const elapsed = year - d.expectedStartYear
          monthly += d.expectedMonthlyPayout * Math.pow(1 + (d.annualGrowthRate ?? 0) / 100, elapsed)
        }
      }
      if (a.type === 'STOCK' || a.type === 'SAVINGS') {
        const d = a.detail as (StockDetail & SavingsDetail) | undefined
        if (!d?.isPensionLike) continue
        if (d.pensionStartYear && year >= d.pensionStartYear) monthly += d.pensionMonthly ?? 0
      }
    }
    map.set(year, monthly)
  }
  return map
}
