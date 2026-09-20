import { db, getAllAssets, getSettings, getRetirement } from '@/lib/db';
import { blankPlan, buildSnapshot, fingerprint, planSchema, today, flowSchema, eventSchema, assetPensionAmount, type PlannerPlan, type Snapshot, type Scenario } from './model';
import { simulate, type Run } from './engine';
import { stockAccounts, accountFundingIds } from './accounts';
export interface Context {
    plan: PlannerPlan;
    snapshot: Snapshot;
    current: Snapshot;
    activeRunId: string | null;
    hasPlan: boolean;
    hasLegacy: boolean;
}
export interface SavedRun {
    id: string;
    createdAt: string;
    snapshot: Snapshot;
    scenario: Scenario;
    run: Run;
}
export async function loadContext(): Promise<Context> {
    return db.transaction('r', db.tables, async () => {
        const record = await db.table('plannerPlans').get('main');
        const plan = record ? planSchema.parse(record.plan) : blankPlan();
        const assets = await getAllAssets(), settings = await getSettings();
        const legacy = await getRetirement();
        const snapshot = buildSnapshot(assets, settings, plan, new Date().toISOString());
        if (Object.keys(legacy).some(key => key !== 'lumpsum') && !plan.reviewedLegacy)
            snapshot.issues.push({ code: 'LEGACY_PLAN', severity: 'missing', sourceId: 'legacy', message: '기존 은퇴계획이 있습니다. 이전 미리보기에서 보존할 입력을 확인해 주세요.' });
        const current = buildSnapshot(assets, settings, { ...plan, asOfDate: today() }, new Date().toISOString());
        return { plan, snapshot, current, activeRunId: record?.activeRunId ?? null, hasPlan: !!record, hasLegacy: Object.keys(legacy).length > 0 };
    });
}
export class RevisionConflict extends Error {
    constructor() { super('다른 화면에서 입력이 변경되었습니다. 초안은 보존했습니다. 최신 입력과 비교한 뒤 다시 적용해 주세요.'); }
}
export async function savePlan(plan: PlannerPlan, expectedRevision: number): Promise<PlannerPlan> {
    const parsed = planSchema.parse(plan);
    return db.transaction('rw', db.table('plannerPlans'), async () => {
        const current = await db.table('plannerPlans').get('main');
        if ((current?.plan.revision ?? 0) !== expectedRevision)
            throw new RevisionConflict();
        const next = { ...parsed, revision: expectedRevision + 1 };
        await db.table('plannerPlans').put({ id: 'main', plan: next, activeRunId: current?.activeRunId ?? null });
        return next;
    });
}
export async function saveDraft(tabId: string, plan: PlannerPlan) { await db.table('plannerDrafts').put({ id: tabId, plan, savedAt: new Date().toISOString() }); }
export async function readDraft(tabId: string): Promise<PlannerPlan | null> { const row = await db.table('plannerDrafts').get(tabId); return row ? planSchema.parse(row.plan) : null; }
export async function clearDraft(tabId: string) { await db.table('plannerDrafts').delete(tabId); }
export async function calculateAndSave(scenario: Scenario): Promise<SavedRun> {
    const context = await loadContext(), snapshot = structuredClone(context.snapshot);
    const run = simulate(snapshot, scenario);
    const record = { id: run.id, createdAt: new Date().toISOString(), snapshot, scenario, run };
    let savedRecord:SavedRun=record;
    await db.transaction('rw', db.tables, async () => {
        const latest = await loadContext();
        if (latest.plan.revision !== snapshot.plan.revision || latest.snapshot.assetRevision !== snapshot.assetRevision)
            throw new RevisionConflict();
        const existing = await db.table('plannerRuns').get(record.id);
        if (!existing)
            await db.table('plannerRuns').add(record);
        else savedRecord=existing;
        const current = await db.table('plannerPlans').get('main');
        await db.table('plannerPlans').put({ ...(current ?? { id: 'main', plan: snapshot.plan }), activeRunId: record.id });
    });
    return savedRecord;
}
/** Pure preview. No automatic interpretation of futureYear as completion. */
export async function legacyPreview() {
    const ctx = await loadContext(), legacy = await getRetirement(), plan = structuredClone(ctx.plan);
    const notes: string[] = [];
    const settings = await getSettings();
    const birth = (value: unknown) => { const text=String(value??'').replace('.', '-');return /^\d{4}-(0[1-9]|1[0-2])$/.test(text)?text:''; };
    if (plan.people.length===1 && plan.people[0].id==='self' && !plan.people[0].birthMonth && !plan.people[0].retirementDate) {
        const husband=birth(settings.birthHusband),wife=birth(settings.birthWife);
        if(husband)plan.people[0]={...plan.people[0],name:'본인 (기존 남편 입력)',birthMonth:husband};
        if(wife)plan.people.push({id:'wife',name:'배우자 (기존 입력)',birthMonth:wife,retirementDate:''});
        if(husband||wife)notes.push('기존 생년월을 가구 초안에 복사합니다. 본인/배우자 대응과 자산별 귀속인을 확인하세요. 은퇴 월·일은 자동 확정하지 않습니다.');
    }
    if (!Object.keys(legacy).length)
        return { plan, notes: ['기존 은퇴계획이 없습니다.'] };
    const at = { value: plan.asOfDate, precision: 'day' as const, offsetMonths: 0 };
    for (const expense of legacy.expenses ?? []) {
        const id = 'legacy-expense:' + expense.id;
        if (!plan.flows.some(f => f.id === id))
            plan.flows.push(flowSchema.parse({ id, name: expense.name || '기존 생활비', kind: 'expense', amount: expense.amount, start: at, frequency: 'monthly', confirmed: true, basis: '기존 은퇴계획에서 확인 후 이전' }));
    }
    if (legacy.medicalMonthly != null && !plan.flows.some(f => f.id === 'legacy-medical'))
        plan.flows.push(flowSchema.parse({ id: 'legacy-medical', name: '기존 의료비 (소비/적립 확인 필요)', kind: 'expense', amount: legacy.medicalMonthly, start: at, frequency: 'monthly' }));
    for (const item of legacy.lumpsum ?? []) {
        const id = 'legacy-lumpsum:' + item.id;
        if (!plan.events.some(e => e.id === id))
            plan.events.push(eventSchema.parse({ id, name: item.name || '기존 목돈', kind: 'inflow', amount: item.amount, at: { value: String(item.receiveYear), precision: 'year', offsetMonths: 0 } }));
    }
    for (const item of legacy.emergency ?? []) {
        const id = 'legacy-emergency:' + item.id;
        if (!plan.events.some(e => e.id === id))
            plan.events.push(eventSchema.parse({ id, name: item.name || '기존 긴급 지출', kind: 'expense', amount: item.amount, at: { value: String(item.year), precision: 'year', offsetMonths: 0 } }));
    }
    notes.push('생활비·의료비·목돈·긴급지출을 초안으로 복사합니다. 원본은 그대로 보존됩니다.');
    if (legacy.holdingTaxAnnual != null) {
        if (!plan.flows.some(f => f.id === 'legacy-holding-tax'))
            plan.flows.push(flowSchema.parse({ id: 'legacy-holding-tax', name: '기존 수동 보유세 — 납부월 확인', kind: 'tax', amount: legacy.holdingTaxAnnual, scope: 'holding:household', basis: '기존 수동 입력', start: { value: String(legacy.holdingTaxStartYear ?? plan.asOfDate.slice(0, 4)), precision: 'year', offsetMonths: 0 }, frequency: 'annual' }));
    }
    notes.push('여행비 구간, 건강보험, 퇴직금 투자 분배, 기존 연금/법인 가정은 원본 화면에서 대조해 등록하세요. 기존 미래연도는 의미·월 확인 전 미확정입니다.');
    plan.reviewedLegacy = false;
    return { plan, notes };
}
export function contextDigest(context: Context) { return fingerprint({ plan: context.plan, assetRevision: context.snapshot.assetRevision }); }
/** Preview creates stable source links, not a second principal or a guessed start month. */
export function assetFlowPreview(plan: PlannerPlan, snapshot: Snapshot, assetId?: string) {
    const next = structuredClone(plan), names: string[] = [];
    const accounts = stockAccounts(snapshot.positions.map(p => p.source));
    for (const position of snapshot.positions) {
        if(assetId && position.assetId!==assetId)continue;
        const amount = assetPensionAmount(position.source), detail = position.source.detail as any;
        if (amount === null || next.flows.some(f => f.id === 'asset-payout:' + position.assetId))
            continue;
        const startYear = detail?.expectedStartYear || detail?.pensionStartYear;
        const endYear = detail?.expectedEndYear;
        const funding = detail?.linkedStockId ? accounts.find(a => a.name === detail.linkedStockId) : undefined;
        next.flows.push(flowSchema.parse({ id: 'asset-payout:' + position.assetId, name: position.name + ' 지급 계획', kind: position.role === 'entitlement' ? 'pension' : 'withdrawal', assetId: position.assetId, ownerId: position.ownerId, amount, amountSource: 'assetPension',
            ...(detail?.linkedStockId ? { withdrawalAssetIds: funding ? accountFundingIds(funding, snapshot.positions, plan.policies) : [], withdrawalAccountAssetId: funding?.id } : {}),
            frequency: 'monthly', start: { value: startYear ? String(startYear) : '', precision: 'year', offsetMonths: 0 }, end: endYear ? { value: String(endYear), precision: 'year', offsetMonths: 0 } : null, basis: '등록 월 지급액 원천과 실제 출금 원천을 분리. 개시/종료 월·세율·출금 목록 및 순서 확인 필요' }));
        names.push(position.name);
    }
    return { plan: next, names };
}
