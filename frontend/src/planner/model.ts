import { z } from 'zod';
import type { Asset, Settings } from '@/types';
export const PLAN_VERSION = 2 as const;
export const ENGINE_VERSION = 'monthly-ledger-3';
export const RULE_VERSION = 'user-estimates-1';
export const money = z.number().finite().nonnegative().max(9e14);
const id = z.string().min(1).max(160).refine(v => !['__proto__', 'constructor', 'prototype', 'cash:settlement'].includes(v), '예약된 ID입니다.');
const text = z.string().max(2000);
export const dateSpecSchema = z.object({
    value: z.string().max(10), precision: z.enum(['day', 'month', 'year']),
    anchorId: z.string().optional(), offsetMonths: z.number().int().min(-1200).max(1200).default(0),
    assumedMonth: z.number().int().min(1).max(12).optional(),
    offsetDays: z.number().int().min(-3660).max(3660).optional(),
});
export type DateSpec = z.infer<typeof dateSpecSchema>;
export const policySchema = z.object({
    assetId: id, role: z.enum(['cash', 'investment', 'pension', 'entitlement', 'property', 'deposit', 'other', 'excluded']),
    ownerId: z.string().default('self'), confirmed: z.boolean().default(false),
    linkedTo: z.string().optional(), annualGrowth: z.number().finite().min(-99).max(100).nullable().default(null),
    dividendYield: z.number().finite().min(0).max(100).nullable().default(null),
    allowWithdrawal: z.boolean().default(false), reinvestDividends: z.boolean().default(false),
    dividendWithholding: z.number().min(0).max(100).nullable().default(null),
    withdrawalWithholding: z.number().min(0).max(100).nullable().optional(),
    propertyState: z.enum(['home', 'rented', 'construction', 'right', 'land']).default('home'),
    officialValue: money.nullable().default(null), assessedValue: money.nullable().default(null), valuationDate: z.string().default(''),
});
export type AssetPolicy = z.infer<typeof policySchema>;
export const flowSchema = z.object({
    id, name: text.min(1), kind: z.enum(['income', 'pension', 'rent', 'expense', 'withdrawal', 'tax', 'insurance', 'transfer']),
    amount: money.nullable(), ownerId: z.string().default('self'), assetId: z.string().default(''), targetId: z.string().default(''),
    start: dateSpecSchema, end: dateSpecSchema.nullable().default(null), frequency: z.enum(['monthly', 'annual', 'once']),
    paymentDay: z.number().int().min(1).max(31).default(31), growth: z.number().finite().min(-99).max(100).default(0),
    paymentMonth: z.number().int().min(1).max(12).optional(),
    withholding: z.number().finite().min(0).max(100).nullable().default(null),
    required: z.boolean().default(true), endsAtRetirement: z.boolean().default(false),
    amountSource: z.literal('assetPension').optional(),
    // assetId remains the payout-contract/amount source. These are the actual funding positions, in reviewed order.
    withdrawalAssetIds: z.array(id).max(500).optional(),
    withdrawalAccountAssetId: z.string().optional(),
    scope: z.string().default(''), basis: z.string().default(''), confirmed: z.boolean().default(false),
});
export type Flow = z.infer<typeof flowSchema>;
export const eventSchema = z.object({
    id, name: text.min(1), kind: z.enum(['completion', 'approval', 'move', 'valuation', 'inflow', 'expense', 'sale', 'borrow', 'repay', 'depositReceived', 'depositReturned', 'depositPaid', 'depositRecovered', 'transfer', 'taxSettlement']),
    at: dateSpecSchema, assetId: z.string().default(''), targetId: z.string().default(''), ownerId: z.string().default('self'),
    amount: money.nullable().default(null), status: z.enum(['planned', 'actual', 'cancelled']).default('planned'),
    actualDate: z.string().default(''), basis: z.string().default(''),
    settleDebtIds: z.array(id).default([]), creditSourceIds: z.array(id).default([]), taxYear: z.number().int().nullable().default(null),
});
export type PlanEvent = z.infer<typeof eventSchema>;
export const debtSchema = z.object({
    id, name: text.min(1), kind: z.enum(['loan', 'deposit']), assetId: z.string().default(''), ownerId: z.string().default('self'),
    balance: money, interestRate: z.number().min(0).max(100).nullable().default(null),
    repayment: z.enum(['interestOnly', 'equalPrincipal', 'annuity']), monthlyPayment: money.nullable().default(null),
    maturity: dateSpecSchema.nullable().default(null), variableRate: z.boolean().default(false),
});
export type Debt = z.infer<typeof debtSchema>;
export const scenarioSchema = z.object({
    id, name: text.min(1), expensePercent: z.number().min(-100).max(200).default(0),
    marketShock: z.number().min(-99).max(100).default(0), rentPercent: z.number().min(-100).max(200).default(0),
    ratePoints: z.number().min(-30).max(30).default(0), retirementOffset: z.number().int().min(-240).max(240).default(0),
    eventShifts: z.record(z.number().int().min(-240).max(240)).default({}),
});
export type Scenario = z.infer<typeof scenarioSchema>;
const state = z.enum(['unknown', 'confirmedNone', 'provided']);
export const planSchema = z.object({
    version: z.literal(PLAN_VERSION), revision: z.number().int().nonnegative(),
    asOfDate: z.string(), endDate: z.string(), inflation: z.number().min(-50).max(50).nullable(),
    people: z.array(z.object({ id, name: text.min(1), birthMonth: z.string(), retirementDate: z.string() })).min(1),
    coverage: z.object({ assets: state, income: state, expenses: state, taxes: state, insurance: state }),
    policies: z.array(policySchema), flows: z.array(flowSchema), events: z.array(eventSchema), debts: z.array(debtSchema),
    scenarios: z.array(scenarioSchema), reviewedLegacy: z.boolean().default(false),
});
export type PlannerPlan = z.infer<typeof planSchema>;
export interface Position extends AssetPolicy {
    name: string;
    balance: number;
    source: Asset;
}
export interface Snapshot {
    id: string;
    assetRevision: string;
    plan: PlannerPlan;
    positions: Position[];
    debts: Debt[];
    capturedAt: string;
    issues: Issue[];
}
export interface Issue {
    code: string;
    severity: 'error' | 'missing' | 'warning';
    message: string;
    sourceId: string;
}
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function blankPlan(date = today()): PlannerPlan {
    return { version: PLAN_VERSION, revision: 0, asOfDate: date, endDate: '', inflation: null,
        people: [{ id: 'self', name: '본인', birthMonth: '', retirementDate: '' }],
        coverage: { assets: 'unknown', income: 'unknown', expenses: 'unknown', taxes: 'unknown', insurance: 'unknown' },
        policies: [], flows: [], events: [], debts: [], scenarios: [], reviewedLegacy: false };
}
export const fixedDate = (value: string): DateSpec => ({ value, precision: 'day', offsetMonths: 0 });
export function defaultPolicy(asset: Asset): AssetPolicy {
    const pensionType = (asset.detail as {
        pensionType?: string;
    })?.pensionType?.toLowerCase() ?? '';
    const role = asset.type === 'REAL_ESTATE' ? 'property' : asset.type === 'STOCK' ? 'investment'
        : asset.type === 'SAVINGS' ? ((asset.detail as any)?.isPensionLike ? 'pension' : 'cash') : asset.type === 'PENSION'
            ? (/national|국민/.test(pensionType) ? 'entitlement' : 'pension') : 'other';
    return policySchema.parse({ assetId: asset.id, role });
}
/** Deterministic content fingerprint, not a cryptographic signature. */
export function fingerprint(value: unknown): string {
    const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
        : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
    const str = JSON.stringify(canonical(value));
    let a = 2166136261, b = 5381;
    for (let i = 0; i < str.length; i++) {
        a = Math.imul(a ^ str.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ str.charCodeAt(i);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function buildSnapshot(assets: Asset[], settings: Settings, plan: PlannerPlan, capturedAt: string): Snapshot {
    const issues: Issue[] = [];
    if (plan.asOfDate !== capturedAt.slice(0, 10) && plan.asOfDate !== today())
        issues.push({ code: 'VALUATION_DATE', severity: 'missing', message: '현재 평가액을 출발 잔액으로 사용합니다. 기준일이 다른 경우 해당 날짜 잔액과 일치하는지 확인하세요. 과거 실적을 재구성한 결과가 아닙니다.', sourceId: 'asOfDate' });
    const positions = assets.filter(a => !a.disposalDate || a.disposalDate > plan.asOfDate).map(source => {
        const policy = plan.policies.find(p => p.assetId === source.id) ?? defaultPolicy(source);
        if(source.history?.some(h=>h.date>plan.asOfDate))issues.push({code:'FUTURE_OBSERVATION',severity:'error',sourceId:source.id,message:`${source.name}: 기준일 뒤의 관측 이력이 현재 평가액에 섞일 수 있습니다. 미래 가정은 일정으로 옮기고 실제 이력 날짜를 확인하세요.`});
        if (source.acquisitionDate && source.acquisitionDate > plan.asOfDate)
            issues.push({ code: 'FUTURE_ACQUISITION', severity: 'error', message: `${source.name}: 기준일 뒤 취득 자산입니다. 현재 보유 기록과 계획 기준일을 확인하세요.`, sourceId: source.id });
        if (!policy.confirmed)
            issues.push({ code: 'ASSET_REVIEW', severity: 'missing', message: `${source.name}: 분석 분류·수익·인출 조건을 확인해 주세요.`, sourceId: source.id });
        if (source.disposalDate && source.disposalDate > plan.asOfDate)
            issues.push({ code: 'FUTURE_SALE', severity: 'missing', message: `${source.name}: 기존 미래 처분일을 매각 사건으로 확인해 주세요.`, sourceId: source.id });
        if (source.type === 'REAL_ESTATE' && (source.detail as any)?.futureYear && policy.role!=='excluded' && !plan.events.some(e => e.assetId === source.id && e.kind==='valuation' && e.status!=='cancelled'))
            issues.push({ code: 'LEGACY_DATE', severity: 'missing', message: `${source.name}: 기존 미래연도의 의미를 확인하세요. 준공으로 자동 변환하지 않았습니다.`, sourceId: source.id });
        return { ...policy, name: source.name, balance: (source.acquisitionDate && source.acquisitionDate > plan.asOfDate) || policy.role === 'entitlement' || policy.role === 'excluded' || policy.linkedTo ? 0 : Math.round(source.currentValue), source };
    });
    const debts = [...plan.debts];
    for (const a of assets.filter(a => a.type === 'REAL_ESTATE')) {
        const detail = a.detail as any;
        for (const [prefix, kind, amount] of [['loan', 'loan', detail?.loanAmount], ['deposit', 'deposit', detail?.tenantDeposit]] as const) {
            const debtId = `${prefix}:${a.id}`, index = debts.findIndex(d => d.id === debtId);
            if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)continue;
            if(amount===0&&index<0)continue;
            if (index >= 0)
                debts[index] = { ...debts[index], balance: amount };
            else
                debts.push(debtSchema.parse({ id: debtId, name: `${a.name} ${kind === 'loan' ? '대출' : '받은 보증금'}`, kind, assetId: a.id, balance: amount, repayment: 'interestOnly' }));
        }
    }
    for(const d of debts)if(/^(loan|deposit):/.test(d.id)&&d.assetId&&!assets.some(a=>a.id===d.assetId))issues.push({code:'ORPHAN_DEBT',severity:'missing',sourceId:d.id,message:`${d.name}: 원본 자산이 삭제되었습니다. 남은 부채인지 확인하거나 조건을 제거하세요.`});
    const assetRevision = fingerprint({ assets, fx: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('exchange_rate_'))) });
    const snapshot = { id: '', assetRevision, positions, debts, plan, capturedAt, issues };
    snapshot.id = fingerprint({ assetRevision, plan });
    return snapshot;
}
export function availability(snapshot: Snapshot) {
    const active = snapshot.positions.filter(p => p.role !== 'excluded' && !p.linkedTo);
    return {
        property: active.some(p => p.role === 'property'),
        rebuild: active.some(p => p.role === 'property' && ['construction', 'right'].includes(p.propertyState)) || snapshot.plan.events.some(e => ['completion', 'approval'].includes(e.kind) && e.status !== 'cancelled'),
        landlord: snapshot.plan.flows.some(f => f.kind === 'rent'), tenant: active.some(p => p.role === 'deposit'),
        pension: active.some(p => ['pension', 'entitlement'].includes(p.role)) || snapshot.plan.flows.some(f => f.kind === 'pension'),
        investment: active.some(p => p.role === 'investment'), debt: snapshot.debts.length > 0,
        events: snapshot.plan.events.some(e => e.status !== 'cancelled'),
    };
}
export function assetPensionAmount(asset?: Asset): number | null {
    if (!asset)
        return null;
    const detail = asset.detail as any;
    const amount = asset.type === 'PENSION' ? detail?.expectedMonthlyPayout : detail?.isPensionLike ? detail?.pensionMonthly : null;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
}
