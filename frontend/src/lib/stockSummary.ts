import type { Asset } from '@/types'
import type { Position } from '@/planner/model'
import { accountName } from '@/planner/accounts'

// 주식 탭 요약 카드(평가총액·손익·원금·배당) 계산 — 계좌 필터가 있으면 그 계좌 범위만 합산한다.

/** 홈 합계와 같은 중복 제외 규칙 (연결 잔액·합산 제외·수급권은 합산하지 않음) */
export function inAggregate(asset: Asset, positions: Position[]) {
  const p = positions.find(p => p.assetId === asset.id)
  return !p || (!p.linkedTo && !['excluded', 'entitlement'].includes(p.role))
}

export function stockTotals(stocks: Asset[], costOf: (a: Asset) => number, positions: Position[]) {
  const included = stocks.filter(a => inAggregate(a, positions))
  return { val: included.reduce((s, a) => s + a.currentValue, 0), cost: included.reduce((s, a) => s + costOf(a), 0) }
}

export interface StockSummary { val: number; cost: number; pnl: number; roi: number; dividend: number | undefined }

/** account=null 이면 보유 주식 전체, 계좌명이면 그 계좌 종목만. 배당도 범위 안 자산 id 로만 합산 */
export function stockSummary(
  stocks: Asset[], account: string | null, costOf: (a: Asset) => number, positions: Position[],
  dividendItems?: { assetId: string; annualKrw: number }[],
): StockSummary {
  const scope = stocks.filter(a => !a.disposalDate && (account == null || accountName(a) === account))
  const { val, cost } = stockTotals(scope, costOf, positions)
  const ids = new Set(scope.filter(a => inAggregate(a, positions)).map(a => a.id))
  const dividend = dividendItems?.filter(i => ids.has(i.assetId)).reduce((s, i) => s + i.annualKrw, 0)
  const pnl = val - cost
  return { val, cost, pnl, roi: cost > 0 ? (pnl / cost) * 100 : 0, dividend }
}
