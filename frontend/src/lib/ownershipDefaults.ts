// 신규 자산 명의 기본값 (순수 함수) — AssetCreateForm 전용. 이미 저장된 자산의 명의는 바꾸지 않는다.
import type { AssetType, Ownership } from '@/types'

export interface OwnershipDefault {
  ownership: Ownership
  /** 사용자 확인이 필요한 기본값 — 폼에 "기본값 · 확인하세요" 표시 */
  review: boolean
}

const valid = (o?: Ownership | null): o is Ownership =>
  !!o && Number.isFinite(o.husband) && Number.isFinite(o.wife) && o.husband >= 0 && o.wife >= 0 && Math.abs(o.husband + o.wife - 100) < 0.001

/** 계좌별 명의 맵(settings stock_account_ownership)에서 trim 기준으로 계좌 명의 찾기 */
export function accountOwnerOf(map: Record<string, Ownership> | undefined, accountName: string): Ownership | undefined {
  const key = accountName.trim()
  if (!map || !key) return undefined
  const hit = map[key] ?? Object.entries(map).find(([k]) => k.trim() === key)?.[1]
  return valid(hit) ? hit : undefined
}

/**
 * - 배우자 없음(설정에 배우자 생년월 없음) 또는 연금 → 본인 100%
 * - 주식 → 같은 계좌의 기존 명의, 없으면 본인 100%
 * - 부동산·예적금·실물·기타 → 50:50 유지하되 확인 요청 (사용자 결정 대기)
 */
export function defaultOwnership(type: AssetType, { hasSpouse, accountOwner }: { hasSpouse: boolean; accountOwner?: Ownership }): OwnershipDefault {
  const mine = { husband: 100, wife: 0 }
  if (type === 'STOCK') return { ownership: hasSpouse && valid(accountOwner) ? { ...accountOwner } : mine, review: false }
  if (!hasSpouse || type === 'PENSION') return { ownership: mine, review: false }
  return { ownership: { husband: 50, wife: 50 }, review: true }
}
