import { z } from 'zod';
import { planSchema, policySchema, debtSchema, scenarioSchema } from './model';
export const legacyTables = ['assets', 'assetHistory', 'realEstateDetails', 'stockDetails', 'pensionDetails', 'savingsDetails', 'dividendHistory', 'settings'];
export const plannerTables = ['plannerPlans', 'plannerRuns', 'plannerDrafts'];
const number = z.number().finite(), nonnegative = number.nonnegative(), identifier = z.string().min(1).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; });
// Older exports can contain null for an unentered acquisition date. Preserve the
// stored value (also on v2 re-export); null is unknown, never an invented date.
const asset = z.object({ id: identifier, type: z.enum(['REAL_ESTATE', 'STOCK', 'PENSION', 'SAVINGS', 'PHYSICAL', 'ETC']), name: z.string().min(1), currentValue: nonnegative, acquisitionDate: date.or(z.literal('')).nullable(), acquisitionPrice: nonnegative, quantity: nonnegative, createdAt: z.string(), updatedAt: z.string(), disposalDate: date.nullish(), disposalPrice: nonnegative.nullish(), ownership: z.object({ husband: nonnegative.max(100), wife: nonnegative.max(100) }).refine(v => Math.abs(v.husband + v.wife - 100) < .001).optional() }).passthrough();
const issue = z.object({ code: z.string(), severity: z.enum(['error', 'missing', 'warning']), message: z.string(), sourceId: z.string() });
const entry = z.object({ id: identifier, date, name: z.string(), kind: z.string(), sourceId: z.string(), assetId: z.string(), ownerId: z.string(), requested: nonnegative, paid: nonnegative, shortfall: nonnegative, cashDelta: number, assetDelta: number, debtDelta: number, formula: z.string(), recurring: z.boolean() });
const month = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), openingCash: nonnegative, closingCash: nonnegative, income: number, spending: number, taxes: number, withdrawals: nonnegative, shortfall: nonnegative, unpaid: nonnegative, netWorth: number, liquid: number, recurringNet: number, balances: z.record(number), debts: z.record(nonnegative), states: z.record(z.string()), entries: z.array(entry) });
const snapshot = z.object({ id: identifier, assetRevision: identifier, capturedAt: z.string(), plan: planSchema, issues: z.array(issue), debts: z.array(debtSchema), positions: z.array(policySchema.extend({ name: z.string(), balance: nonnegative, source: asset.passthrough() })) });
const run = z.object({ id: identifier, snapshotId: identifier, assetRevision: identifier, planRevision: nonnegative, scenarioId: identifier, engineVersion: z.string(), ruleVersion: z.string(), status: z.enum(['complete', 'partial', 'invalid']), issues: z.array(issue), months: z.array(month), firstShortfall: z.string().nullable(), resolvedEvents: z.array(z.object({ id: identifier, date: date.nullable(), name: z.string() })), taxCheckpoints: z.array(z.object({ date, assetId: identifier, state: z.string(), owned: z.boolean(), market: nonnegative, official: nonnegative.nullable(), assessed: nonnegative.nullable() })) });
const schemas: Record<string, z.ZodTypeAny> = {
    assets: asset,
    assetHistory: z.object({ id: z.number().int().positive().optional(), assetId: identifier, date, value: nonnegative.nullish(), price: nonnegative.nullish(), quantity: nonnegative.nullish(), quantitySourceDate: date.optional() }).passthrough(),
    realEstateDetails: z.object({ assetId: identifier, isOwned: z.boolean(), hasTenant: z.boolean(), tenantDeposit: nonnegative, address: z.string(), loanAmount: nonnegative, futureValue: nonnegative.optional(), futureYear: z.number().int().optional(), housingTaxStartDate: date.optional(), constructionHoldingTaxAnnual: nonnegative.optional() }).passthrough(),
    stockDetails: z.object({ assetId: identifier, accountName: z.string(), currency: z.enum(['KRW', 'USD', 'JPY']), isPensionLike: z.boolean(), ticker: z.string().optional() }).passthrough(),
    pensionDetails: z.object({ assetId: identifier, expectedStartYear: number, expectedEndYear: number, expectedMonthlyPayout: nonnegative, annualGrowthRate: number }).passthrough(),
    savingsDetails: z.object({ assetId: identifier, isPensionLike: z.boolean() }).passthrough(),
    dividendHistory: z.object({ id: z.number().int().positive().optional(), assetId: identifier, date, amountKrw: nonnegative, amountOriginal: nonnegative, currency: z.string(), exchangeRate: nonnegative, memo: z.string() }).passthrough(),
    settings: z.object({ key: identifier, value: z.string() }),
    plannerPlans: z.object({ id: z.literal('main'), plan: planSchema, activeRunId: z.string().nullable() }),
    plannerDrafts: z.object({ id: identifier, plan: planSchema, savedAt: z.string() }),
    plannerRuns: z.object({ id: identifier, createdAt: z.string(), scenario: scenarioSchema, snapshot, run }),
};
export function validateBackup(input: unknown): {
    app: 'asset_manager_m';
    version: 1 | 2;
    exportedAt: string;
    tables: Record<string, any[]>;
} {
    const header = z.object({ app: z.literal('asset_manager_m'), version: z.union([z.literal(1), z.literal(2)]), exportedAt: z.string(), tables: z.record(z.array(z.unknown())) }).parse(input);
    const required = [...legacyTables, ...(header.version === 2 ? plannerTables : [])];
    for (const name of required)
        if (!Object.prototype.hasOwnProperty.call(header.tables, name))
            throw new Error(`불완전한 백업: ${name} 테이블이 없습니다. 기존 데이터는 변경하지 않았습니다.`);
    const tables: Record<string, any[]> = {};
    for (const [name, rows] of Object.entries(header.tables)) {
        if (!schemas[name])
            throw new Error(`지원하지 않는 백업 테이블: ${name}`);
        tables[name] = rows.map((row, index) => { try {
            return schemas[name].parse(row);
        }
        catch (e) {
            throw new Error(`${name}[${index}]: ${String(e)}`);
        } });
        const keys = tables[name].map(r => r.id ?? r.key ?? r.assetId).filter(v => v != null);
        if (new Set(keys).size !== keys.length)
            throw new Error(`${name}: 중복 식별자가 있습니다.`);
    }
    for (const name of plannerTables)
        tables[name] ??= [];
    const assets = new Map(tables.assets.map(a => [a.id, a]));
    const detailType: Record<string, string> = { realEstateDetails: 'REAL_ESTATE', stockDetails: 'STOCK', pensionDetails: 'PENSION', savingsDetails: 'SAVINGS' };
    for (const name of ['assetHistory', 'dividendHistory', ...Object.keys(detailType)])
        for (const row of tables[name]) {
            if (!assets.has(row.assetId))
                throw new Error(`${name}: 없는 자산을 참조합니다 (${row.assetId}).`);
            if (detailType[name] && assets.get(row.assetId).type !== detailType[name])
                throw new Error(`${name}: 자산 유형과 상세 정보가 다릅니다.`);
        }
    for (const a of tables.assets) {
        const detail = Object.keys(detailType).find(k => detailType[k] === a.type);
        if (detail && !tables[detail].some(r => r.assetId === a.id))
            throw new Error(`${a.name}: 자산 상세 테이블 행이 없습니다.`);
    }
    const days = tables.assetHistory.map(h => h.assetId + ':' + h.date);
    if (new Set(days).size !== days.length)
        throw new Error('같은 자산·날짜의 이력이 중복되었습니다.');
    for (const row of tables.settings.filter(s => ['retirement_plan', 'pension_sim_plan', 'corp_sim_plan'].includes(s.key))) {
        let parsed;
        try {
            parsed = JSON.parse(row.value);
        }
        catch {
            throw new Error(`${row.key}: 손상된 설정 JSON`);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error(`${row.key}: 설정 객체가 아닙니다.`);
    }
    for (const record of tables.plannerRuns)
        if (record.id !== record.run.id || record.snapshot.id !== record.run.snapshotId || record.snapshot.assetRevision !== record.run.assetRevision || record.snapshot.plan.revision !== record.run.planRevision)
            throw new Error('저장 분석의 스냅샷 연결이 일치하지 않습니다.');
    for (const main of tables.plannerPlans)
        if (main.activeRunId && !tables.plannerRuns.some(r => r.id === main.activeRunId))
            throw new Error('선택한 분석 결과가 백업에 없습니다.');
    for(const record of tables.plannerRuns) {
        let previous:number|undefined;
        for(const month of record.run.months){
            const cashDelta=month.entries.reduce((s:number,e:any)=>s+e.cashDelta,0);
            if(Math.abs(month.openingCash+cashDelta-month.closingCash)>1||(previous!==undefined&&Math.abs(previous-month.openingCash)>1))throw new Error('백업 분석의 월별 현금 보존식이 맞지 않습니다.');
            const assets=Object.values(month.balances).reduce((s:any,v:any)=>s+v,0) as number,debt=Object.values(month.debts).reduce((s:any,v:any)=>s+v,0) as number;
            if(Math.abs(assets-debt-month.unpaid-month.netWorth)>1)throw new Error('백업 분석의 순자산 합계가 맞지 않습니다.');
            previous=month.closingCash;
        }
    }
    return { ...header, tables };
}
