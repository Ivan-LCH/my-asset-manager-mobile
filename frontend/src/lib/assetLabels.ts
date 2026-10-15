import type { AssetType } from '@/types'

// 자산 상세 KPI 라벨 — 매각 완료 자산은 평가가 아니라 매각가/실현손익으로 표시한다.
// 매각가(disposalPrice)는 총액(원)으로 해석한다(기존 AssetDetail·StockTile 과 동일, 데이터 변환 없음).

export const DISPOSAL_PRICE_MISSING = '매각가 미입력'

/** 매각일은 있는데 매각가가 비었거나 0 — 손실로 보이지 않게 "매각가 미입력"으로 표시 */
export const disposalPriceMissing = (a: { disposalDate?: string | null; disposalPrice?: number | null }) =>
  !!a.disposalDate && !((a.disposalPrice ?? 0) > 0)

export interface ValueKpiLabels {
  /** 첫 번째 KPI (평가액 또는 매각가) */
  value: string
  /** 기타 유형 세 번째 KPI (변동액 또는 실현손익) */
  change: string
  /** 주식 단가 KPI (현재 가격 또는 매각 단가) */
  unitPrice: string
  /** 주식 1줄 요약 "평단 → ○○" */
  summaryPrice: string
}

export function valueKpiLabels(type: AssetType, isSold: boolean, isAccountLevel = false): ValueKpiLabels {
  const unitPrice = isSold ? '매각 단가' : '현재 가격', summaryPrice = isSold ? '매각가' : '현재'
  if (type === 'REAL_ESTATE') return { value: isSold ? '매각가' : '현재 시세', change: '순자산 (Equity)', unitPrice, summaryPrice }
  if (type === 'STOCK' || type === 'PHYSICAL')
    return { value: isSold ? '매각가/실현손익' : isAccountLevel ? '평가액/손익' : '평가금액/손익', change: isSold ? '실현손익' : '손익', unitPrice, summaryPrice }
  return { value: isSold ? '매각가' : '현재 가치', change: isSold ? '실현손익' : '변동액', unitPrice, summaryPrice }
}
