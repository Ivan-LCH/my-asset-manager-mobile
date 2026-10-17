// 안 1 — 월별 계획은 보관(읽기 전용)으로만 남긴다. 보관 링크 노출 판정과 옛 URL 리다이렉트.
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '@/lib/db';
import { planSchema, type PlannerPlan } from './model';
/**
 * 사용자가 월별 계획에 실제로 무언가를 입력했는지.
 * policies·coverage·asOfDate·reviewedLegacy는 보지 않는다 — 합산 기준만 저장한 사용자에게 보관 링크가 뜨지 않게.
 */
export function hasMonthlyContent(plan: PlannerPlan): boolean {
    return plan.flows.length > 0 || plan.events.length > 0 || plan.debts.length > 0 || plan.scenarios.length > 0
        || plan.endDate !== '' || plan.inflation !== null || plan.people.length > 1
        || plan.people.some(p => !!p.birthMonth || !!p.retirementDate);
}
/** 보관 링크 노출 조건: 저장된 월별 분석이 있거나, 저장된 계획에 월별 입력이 있음. plannerDrafts는 보지 않는다. 계획 파싱 실패는 false. */
export function hasMonthlyArchive(main: { plan: unknown } | undefined, runCount: number): boolean {
    if (runCount > 0) return true;
    if (!main) return false;
    const parsed = planSchema.safeParse(main.plan);
    return parsed.success && hasMonthlyContent(parsed.data);
}
export async function readMonthlyArchive(): Promise<boolean> {
    const [main, runs] = await Promise.all([db.table('plannerPlans').get('main'), db.table('plannerRuns').count()]);
    return hasMonthlyArchive(main, runs);
}
/** 보관본 존재 여부. 읽는 중 null. 읽기 오류는 false(링크 숨김). */
export function useMonthlyArchive(): boolean | null {
    const [value, setValue] = useState<boolean | null>(null);
    useEffect(() => {
        const sub = liveQuery(readMonthlyArchive).subscribe({ next: setValue, error: () => setValue(false) });
        return () => sub.unsubscribe();
    }, []);
    return value;
}
const keep = (search: string, keys: string[]) => {
    const from = new URLSearchParams(search), to = new URLSearchParams();
    for (const key of keys) { const v = from.get(key); if (v !== null) to.set(key, v); }
    const text = to.toString();
    return text ? '?' + text : '';
};
/**
 * 옛 월별 계획 URL → 새 위치.
 * - /plan?tab=policies… → /settings/totals (focus·group·q·unconfirmed·returnTo 유지)
 * - 그 밖의 /plan…, /advanced-analysis…, /analysis?run=… → /analysis/archive (run·year·month 유지)
 */
export function legacyPlannerRedirect(path: string, search: string): string {
    if (path.startsWith('/plan') && new URLSearchParams(search).get('tab') === 'policies')
        return '/settings/totals' + keep(search, ['focus', 'group', 'q', 'unconfirmed', 'returnTo']);
    return '/analysis/archive' + keep(search, ['run', 'year', 'month']);
}
