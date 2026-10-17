import type { AssetPolicy } from './model';
/**
 * 정책 편집 병합 규칙 (기존 계획 화면 policies 탭과 동일).
 * - 편집 목록(policyList)에 없는 자산의 저장 정책은 그대로 보존한다 (처분·삭제 자산 등).
 * - 목록 자산은 resolvePolicy 값(저장 정책 또는 기본값)으로 저장하고, next에 있는 항목만 교체한다.
 * 화면에 보이지 않는 필드(수익률·배당·인출 등)는 객체째 보존된다.
 */
export function mergePolicies(planPolicies: AssetPolicy[], policyList: AssetPolicy[], next: AssetPolicy[]): AssetPolicy[] {
    return [...planPolicies.filter(p => !policyList.some(x => x.assetId === p.assetId)), ...policyList.map(p => next.find(n => n.assetId === p.assetId) ?? p)];
}
