import type { AssetType } from '@/types';
import { formatEok } from '@/lib/utils';
import type { Issue, Position, Snapshot } from './model';

// 화면 공통 합계 기준 — 홈(/)·전체 자산(CurrentOverview)·통합 대시보드(/history)·연금 탭이 모두 이 함수만 사용한다.
// buildSnapshot 의 balance(합산 제외·연결 잔액·기준일 뒤 취득은 0)를 합산하고,
// 0 처리된 항목은 원래 평가액과 사유를 excluded 로 돌려줘 합계 아래에 표시한다(평가액 0인 항목은 생략).
// 국민연금 등 수급권(role 'entitlement')은 엔진 balance 가 0(지급 일정으로만 반영 — 원금·수입 이중 계상 방지)이지만,
// 화면 합계에는 평가액(currentValue)을 포함한다. 기본 분류·저장된 분류 모두 동일하게 적용.
export type ExcludedReason = 'excluded' | 'linked' | 'future';
export interface ExcludedItem {
    assetId: string;
    name: string;
    type: AssetType;
    amount: number;
    reason: ExcludedReason;
}
export interface SnapshotTotals {
    total: number;
    debt: number;
    net: number;
    byType: Partial<Record<AssetType, number>>;
    excluded: ExcludedItem[];
}
export const EXCLUDED_REASON_LABELS: Record<ExcludedReason, string> = {
    excluded: '합산 제외', linked: '연결 잔액', future: '기준일 뒤 취득',
};
/** 합계에서 0 처리되는 사유 — 은퇴 분석의 합산 기준 적용(lib/analysisScope)도 같은 판정을 쓴다 */
export function excludedReason(p: Position, asOfDate: string): ExcludedReason | null {
    if (p.source.acquisitionDate && p.source.acquisitionDate > asOfDate) return 'future';
    if (p.role === 'excluded') return 'excluded';
    if (p.linkedTo || p.linkedAccount) return 'linked';
    return null;
}
// 홈 "검토" 건수 분리 — 합계에 영향을 주는 확인(기준일 뒤 취득·처분·관측, 연결 잔액, 원본 없는 부채, 미확인 합산 제외·동일 잔액 연결)과
// 합계와 무관한 분석 조건 미확인(분류·수익·인출 가정, 옛 미래연도 등). 건수는 각각 자산(sourceId) 단위로 중복 제거(두 쪽에 모두 셀 수 있음).
const TOTAL_IMPACT_CODES = new Set(['FUTURE_ACQUISITION', 'FUTURE_SALE', 'FUTURE_OBSERVATION', 'LINKED_BALANCE', 'ORPHAN_DEBT']);
export interface ReviewCounts { totalImpact: number; analysis: number }
export function reviewCounts(snapshot: Snapshot): ReviewCounts {
    const impact = new Set<string>(), analysis = new Set<string>();
    for (const i of snapshot.issues as Issue[]) (TOTAL_IMPACT_CODES.has(i.code) ? impact : analysis).add(i.sourceId);
    for (const p of snapshot.positions) if (!p.confirmed && (p.role === 'excluded' || p.linkedTo)) impact.add(p.assetId);
    return { totalImpact: impact.size, analysis: analysis.size };
}
export function snapshotTotals(snapshot: Snapshot): SnapshotTotals {
    const byType: Partial<Record<AssetType, number>> = {}, excluded: ExcludedItem[] = [];
    let total = 0;
    for (const p of snapshot.positions) {
        const reason = excludedReason(p, snapshot.plan.asOfDate), amount = Math.round(p.source.currentValue || 0);
        const value = p.role === 'entitlement' && !reason ? amount : p.balance;
        total += value;
        byType[p.source.type] = (byType[p.source.type] ?? 0) + value;
        if (reason && amount > 0) excluded.push({ assetId: p.assetId, name: p.name, type: p.source.type, amount, reason });
    }
    const debt = snapshot.debts.reduce((s, d) => s + d.balance, 0);
    return { total, debt, net: total - debt, byType, excluded: excluded.sort((a, b) => b.amount - a.amount) };
}
/** 1.15억 / 3,981만원 — 합계 보조 표시용 (lib/utils fmtAmount 코어) */
export { formatEok };
/** "제외 항목: OO 합산 제외 1.15억, …" (없으면 빈 문자열) */
export function excludedSummary(items: ExcludedItem[]): string {
    if (!items.length) return '';
    return '제외 항목: ' + items.map(i => `${i.name} ${EXCLUDED_REASON_LABELS[i.reason]} ${formatEok(i.amount)}`).join(', ');
}
