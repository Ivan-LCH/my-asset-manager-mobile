import type { Asset, AssetType } from '@/types'

/**
 * 성장 추이 차트를 그릴 유형 — 보유(미처분) 자산이 1건 이상인 유형만.
 * 병합 탭(실물·기타)에서 자산이 없는 유형의 빈 "데이터 없음" 카드를 숨긴다.
 */
export function chartTypes(types: AssetType[], active: Pick<Asset, 'type'>[]): AssetType[] {
  return types.filter((t) => active.some((a) => a.type === t))
}
