import type { AssetType } from '@/types';
import type { Position, Snapshot } from './model';

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
function excludedReason(p: Position, asOfDate: string): ExcludedReason | null {
    if (p.source.acquisitionDate && p.source.acquisitionDate > asOfDate) return 'future';
    if (p.role === 'excluded') return 'excluded';
    if (p.linkedTo) return 'linked';
    return null;
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
/** 1.15억 / 3,981만원 — 합계 보조 표시용 */
export function formatEok(v: number): string {
    if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2).replace(/\.?0+$/, '')}억`;
    return `${Math.round(v / 10000).toLocaleString('ko-KR')}만원`;
}
/** "제외 항목: OO 합산 제외 1.15억, …" (없으면 빈 문자열) */
export function excludedSummary(items: ExcludedItem[]): string {
    if (!items.length) return '';
    return '제외 항목: ' + items.map(i => `${i.name} ${EXCLUDED_REASON_LABELS[i.reason]} ${formatEok(i.amount)}`).join(', ');
}
