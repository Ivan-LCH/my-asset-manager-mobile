// 목돈 분배의 증권 몫 해석 (순수 함수). annualPension·stockAccountBalances·피부양자 분석이 공유한다.
// 신규 필드(owner·destination·stockDividendRatio)가 모두 없으면 기존 결과와 동일하다.
import type { LumpsumItem, Ownership, PensionAllocation } from '@/types'

type Alloc = Pick<PensionAllocation, 'irpAmount' | 'stockAmount' | 'destination' | 'stockDividendRatio'>

/** 행선지 힌트를 반영한 증권 원금 요청액. 'stock'은 목돈 − IRP 전액, 'cash'는 0, 그 외는 저장값. */
export function requestedStockAmount(a: Alloc, lumpsumAmount: number, irpAmount = a.irpAmount): number {
  if (a.destination === 'cash') return 0
  if (a.destination === 'stock') return Math.max(0, lumpsumAmount - Math.max(0, irpAmount))
  return a.stockAmount
}

/** 배당투자 비율(0~1). 미설정·비정상 = 1(전액 배당, 기존 동작). */
export function dividendShare(a: Pick<PensionAllocation, 'stockDividendRatio'>): number {
  const r = a.stockDividendRatio
  if (r == null || !Number.isFinite(r)) return 1
  return Math.min(100, Math.max(0, r)) / 100
}

/** 증권 원금의 남편 귀속 비율(0~1). owner가 있으면 100% 그 사람, 없으면 stockOwnership. */
export function husbandStockShare(owner: LumpsumItem['owner'], ownership: Ownership): number {
  if (owner === 'husband') return 1
  if (owner === 'wife') return 0
  return ownership.husband / 100
}

export interface StockSplit {
  husband: { stock: number; growthOnly: number }
  wife: { stock: number; growthOnly: number }
}

/** 한 목돈의 증권 원금을 명의별 (전체 원금, 일반투자 원금)으로 나눈다. 배당 원금 = stock − growthOnly. */
export function splitLumpsumStock(stockAmount: number, owner: LumpsumItem['owner'], ownership: Ownership, a: Pick<PensionAllocation, 'stockDividendRatio'>): StockSplit {
  const stock = Math.max(0, stockAmount)
  const h = husbandStockShare(owner, ownership)
  const w = owner ? 1 - h : ownership.wife / 100
  const g = 1 - dividendShare(a)
  return {
    husband: { stock: stock * h, growthOnly: stock * h * g },
    wife: { stock: stock * w, growthOnly: stock * w * g },
  }
}

/** 신규 필드(owner·destination·stockDividendRatio) 중 하나라도 지정됐는지 — 피부양자 재배분 대상 판정용. */
export function hasExplicitStockFields(l: Pick<LumpsumItem, 'owner'>, a?: Pick<PensionAllocation, 'destination' | 'stockDividendRatio'>): boolean {
  return l.owner != null || a?.destination != null || a?.stockDividendRatio != null
}
