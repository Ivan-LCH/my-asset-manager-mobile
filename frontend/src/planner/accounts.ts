import type { Asset, StockDetail } from '@/types';
import type { AssetPolicy, Position } from './model';

export const accountName = (asset: Asset) => (asset.detail as StockDetail | undefined)?.accountName?.trim() || '미분류';
/** An existing member asset ID anchors navigation. Renaming an account does not change that ID.
 * Old links resolve by the member, not a hash of a mutable account name. No extra money row is created. */
export function stockAccounts(assets: Asset[]) {
    const groups = new Map<string, Asset[]>();
    for (const asset of assets.filter(a => a.type === 'STOCK' && !a.disposalDate)) {
        const name = accountName(asset);
        groups.set(name, [...(groups.get(name) ?? []), asset]);
    }
    return [...groups].map(([name, members]) => {
        const assets = [...members].sort((a, b) => a.id.localeCompare(b.id));
        return { id: assets[0].id, name, assets };
    });
}
type AccountGroup = ReturnType<typeof stockAccounts>[number];
const linkOf = (asset: Asset) => (asset.detail as { linkedStockId?: string } | undefined)?.linkedStockId?.trim() || '';
/** PENSION linkedStockId → 주식 계좌. 계좌명(trim) 또는 계좌 안 종목 id 로 해석(monthlyPension 과 같은 규칙). 못 찾으면 undefined */
export function linkedAccountOf(asset: Asset, groups: AccountGroup[]): AccountGroup | undefined {
    const link = linkOf(asset);
    if (asset.type !== 'PENSION' || !link) return undefined;
    return groups.find(g => g.name === link) ?? groups.find(g => g.assets.some(a => a.id === link));
}
/** 연결 연금이 가리키는 계좌명 집합 — 표시 전용 '연금 계좌' 구분, 일괄 확인 비활성화에 사용 */
export function linkedAccountNames(assets: Asset[]): Set<string> {
    const groups = stockAccounts(assets);
    return new Set(assets.filter(a => !a.disposalDate).map(a => linkedAccountOf(a, groups)?.name).filter((n): n is string => !!n));
}
/** 연금 취급 주식 계좌명 집합 — 연결 연금(linkedStockId)이 가리키는 계좌 ∪ 이름에 IRP 가 들어간 계좌(trim 기준).
 *  planner 기본 분류(defaultPolicy)·정책 그룹 라벨('연금 계좌 ·')·일괄 확인 차단이 모두 이 기준 하나를 사용한다. */
export function pensionAccountNames(assets: Asset[]): Set<string> {
    const names = linkedAccountNames(assets);
    for (const g of stockAccounts(assets)) if (/irp/i.test(g.name)) names.add(g.name);
    return names;
}
/** 계좌 평가 합계 — 계좌 통합 행이 있으면 그 행만(종목 중복 합산 방지, linkedStocks/monthlyPension 과 같은 규칙) */
export function accountTotal(group: AccountGroup): number {
    const aggregates = group.assets.filter(a => (a.detail as StockDetail | undefined)?.isAccountLevel);
    return (aggregates.length ? aggregates : group.assets).reduce((s, a) => s + (a.currentValue || 0), 0);
}
export interface LinkedWrapperInfo {
    accountName: string;
    accountTotal: number;
    /** 래퍼의 가장 최근 0 아닌 이력 — 합산하지 않음을 안내 */
    lastHistory: { date: string; value: number } | null;
    /** 래퍼 평가액이 0 이 아니고 계좌 합계와 다름 */
    mismatch: boolean;
}
/** 연금 탭 연결 카드 표시용: "계좌 합계 X · 원본 이력 Y(date)은 합산 안 함" + 불일치 안내 */
export function linkedWrapperInfo(wrapper: Asset, assets: Asset[]): LinkedWrapperInfo | null {
    const group = linkedAccountOf(wrapper, stockAccounts(assets));
    if (!group) return null;
    const total = Math.round(accountTotal(group));
    const hist = [...(wrapper.history ?? [])].filter(h => h.date && h.value != null && h.value !== 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    const cv = Math.round(wrapper.currentValue || 0);
    return { accountName: group.name, accountTotal: total, lastHistory: hist ? { date: hist.date.slice(0, 10), value: hist.value! } : null, mismatch: cv !== 0 && cv !== total };
}
/** 목록·검색·드롭다운 표시 이름 — 주식은 같은 종목명이 여러 계좌에 있으므로 "종목명 · 계좌명" */
export const assetLabel = (asset: Asset) => asset.type === 'STOCK' ? `${asset.name} · ${accountName(asset)}` : asset.name;
export type PensionKind = 'national' | 'pension' | 'insurance';
export const PENSION_KIND_LABELS: Record<PensionKind, string> = { national: '국민연금', pension: '연금', insurance: '보험' };
/** 연금 표시 구분(저장값 변경 없음): pensionType 국민/national → 국민연금, 보험/insurance → 보험.
 *  pensionType 이 일반값(PERSONAL 등)인 경우만 이름의 '보험'으로 보조 판정. */
export function pensionKind(asset: Asset): PensionKind {
    const type = ((asset.detail as { pensionType?: string } | undefined)?.pensionType ?? '').toLowerCase();
    if (/national|국민/.test(type)) return 'national';
    if (/insurance|보험/.test(type)) return 'insurance';
    if (/irp|퇴직|dc|db|연금저축|annuity/.test(type)) return 'pension';
    return /보험/.test(asset.name) ? 'insurance' : 'pension';
}
export const stockAccountUrl = (id: string) => '/assets?type=STOCK&account=' + encodeURIComponent(id);
export function accountFundingIds(group: ReturnType<typeof stockAccounts>[number], positions: Position[], policies: AssetPolicy[] = []) {
    return group.assets.filter(a=>{
        const p=policies.find(p=>p.assetId===a.id)??positions.find(p=>p.assetId===a.id);
        return p&&!p.linkedTo&&['investment','pension','deposit'].includes(p.role);
    }).map(a=>a.id);
}
export function safeAssetReturn(value: string | null, fallback = '/assets?type=ALL') {
    if (!value || !value.startsWith('/assets?')) return fallback;
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && url.pathname === '/assets' ? url.pathname + url.search : fallback;
}
