import { ENGINE_VERSION, RULE_VERSION, fingerprint, assetPensionAmount, type DateSpec, type Snapshot, type Scenario, type Issue, type PlanEvent, type Flow } from './model';
export interface Entry {
    id: string;
    date: string;
    kind: string;
    name: string;
    sourceId: string;
    assetId: string;
    ownerId: string;
    requested: number;
    paid: number;
    shortfall: number;
    cashDelta: number;
    assetDelta: number;
    debtDelta: number;
    formula: string;
    recurring: boolean;
}
export interface Month {
    month: string;
    openingCash: number;
    closingCash: number;
    income: number;
    spending: number;
    taxes: number;
    withdrawals: number;
    shortfall: number;
    unpaid: number;
    netWorth: number;
    liquid: number;
    recurringNet: number;
    balances: Record<string, number>;
    debts: Record<string, number>;
    states: Record<string, string>;
    entries: Entry[];
}
export interface Run {
    id: string;
    snapshotId: string;
    assetRevision: string;
    planRevision: number;
    scenarioId: string;
    engineVersion: string;
    ruleVersion: string;
    status: 'complete' | 'partial' | 'invalid';
    issues: Issue[];
    months: Month[];
    firstShortfall: string | null;
    resolvedEvents: {
        id: string;
        date: string | null;
        name: string;
    }[];
    taxCheckpoints: {
        date: string;
        assetId: string;
        state: string;
        owned: boolean;
        market: number;
        official: number | null;
        assessed: number | null;
    }[];
}
export const baseScenario: Scenario = { id: 'base', name: '기본안', expensePercent: 0, marketShock: 0, rentPercent: 0, ratePoints: 0, retirementOffset: 0, eventShifts: {} };
const utc = (date: string) => new Date(date + 'T00:00:00Z');
const iso = (date: Date) => date.toISOString().slice(0, 10);
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(utc(date).getTime()) && iso(utc(date)) === date;
const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export function shiftDate(date: string, months: number) {
    const d = utc(date), target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    target.setUTCDate(Math.min(d.getUTCDate(), monthEnd(target.getUTCFullYear(), target.getUTCMonth() + 1)));
    return iso(target);
}
export function resolveDate(spec: DateSpec, events: PlanEvent[], scenario = baseScenario, seen = new Set<string>()): string | null {
    const offset = (value: string) => { const d = utc(value); d.setUTCDate(d.getUTCDate() + (spec.offsetDays ?? 0)); return iso(d); };
    if (spec.anchorId) {
        if (seen.has(spec.anchorId))
            throw new Error('일정 연결에 순환 참조가 있습니다.');
        const event = events.find(e => e.id === spec.anchorId && e.status !== 'cancelled');
        if (!event)
            throw new Error('연결한 일정이 없거나 취소되었습니다: ' + spec.anchorId);
        const next = new Set(seen);
        next.add(spec.anchorId);
        const anchor = event.status === 'actual' ? (validDate(event.actualDate) ? event.actualDate : null)
            : resolveDate(event.at, events, scenario, next);
        return anchor ? offset(shiftDate(anchor, spec.offsetMonths + (event.status === 'actual' ? 0 : scenario.eventShifts[event.id] ?? 0))) : null;
    }
    if (spec.precision === 'day')
        return validDate(spec.value) ? offset(shiftDate(spec.value, spec.offsetMonths)) : null;
    if (spec.precision === 'year' && (!/^\d{4}$/.test(spec.value) || !spec.assumedMonth))
        return null;
    const ym = spec.precision === 'year' ? `${spec.value}-${String(spec.assumedMonth).padStart(2, '0')}` : spec.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym))
        return null;
    const [year, month] = ym.split('-').map(Number);
    return offset(shiftDate(`${ym}-${monthEnd(year, month)}`, spec.offsetMonths));
}
export function eventDate(event: PlanEvent, events: PlanEvent[], scenario: Scenario) {
    if (event.status === 'cancelled')
        return null;
    if (event.status === 'actual')
        return validDate(event.actualDate) ? event.actualDate : null;
    const date = resolveDate(event.at, events, scenario, new Set([event.id]));
    return date ? shiftDate(date, scenario.eventShifts[event.id] ?? 0) : null;
}
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
export function simulate(snapshot: Snapshot, scenario: Scenario = baseScenario): Run {
    const plan = snapshot.plan, issues = [...snapshot.issues];
    const issue = (code: string, message: string, sourceId = '', severity: Issue['severity'] = 'missing') => {
        if (!issues.some(i => i.code === code && i.sourceId === sourceId))
            issues.push({ code, message, sourceId, severity });
    };
    const run: Run = { id: fingerprint({ snapshot: snapshot.id, scenario, engine: ENGINE_VERSION, rule: RULE_VERSION }), snapshotId: snapshot.id,
        assetRevision: snapshot.assetRevision, planRevision: plan.revision, scenarioId: scenario.id, engineVersion: ENGINE_VERSION, ruleVersion: RULE_VERSION,
        status: 'complete', issues, months: [], firstShortfall: null, resolvedEvents: [], taxCheckpoints: [] };
    if (!validDate(plan.asOfDate) || !validDate(plan.endDate) || plan.endDate <= plan.asOfDate || (utc(plan.endDate).getTime() - utc(plan.asOfDate).getTime()) / 86400000 > 366 * 100)
        issue('HORIZON', '기준일 이후 100년 이내의 계획 종료일을 입력해 주세요.', '', 'error');
    if (plan.inflation === null)
        issue('INFLATION', '현재 구매력 환산을 위한 물가 가정을 확인해 주세요.');
    for (const [key, state] of Object.entries(plan.coverage))
        if (state === 'unknown')
            issue('COVERAGE_' + key, `${({ assets: '자산', income: '수입', expenses: '생활비', taxes: '세금', insurance: '보험료' } as any)[key]} 입력 여부를 확인해 주세요.`, key);
    if (plan.coverage.expenses === 'provided' && !plan.flows.some(f => f.kind === 'expense'))
        issue('NO_EXPENSE', '생활비 제공으로 표시했지만 지출 항목이 없습니다.', 'expenses');
    if (plan.coverage.income === 'provided' && !plan.flows.some(f => ['income', 'pension', 'rent'].includes(f.kind)) && !snapshot.positions.some(p=>(p.dividendYield??0)>0&&!p.linkedTo))
        issue('NO_INCOME', '수입 제공으로 표시했지만 수입 항목이 없습니다.', 'income');
    for (const kind of ['tax', 'insurance'] as const)
        if (plan.coverage[kind === 'tax' ? 'taxes' : 'insurance'] === 'provided' && !plan.flows.some(f => f.kind === kind) && !(kind==='tax'&&(plan.flows.some(f=>(f.withholding??0)>0)||plan.events.some(e=>e.kind==='taxSettlement')||snapshot.positions.some(p=>(p.dividendWithholding??0)>0))))
            issue('NO_' + kind, '제공으로 표시했지만 세금/보험료 항목이 없습니다.', kind);
    if (plan.coverage.assets === 'provided' && !snapshot.positions.length)
        issue('NO_ASSETS', '자산 제공으로 표시했지만 등록 자산이 없습니다.', 'assets');
    if (plan.coverage.assets === 'confirmedNone' && snapshot.positions.some(p => p.balance > 0))
        issue('ASSET_COVERAGE_CONFLICT', '자산 없음 확인과 등록 잔액이 충돌합니다.', 'assets', 'error');
    const positions = snapshot.positions, ids = new Set(positions.map(p => p.assetId)), people = new Set(plan.people.map(p => p.id));
    for (const collection of [plan.people, plan.events, plan.flows, snapshot.debts, plan.scenarios]) {
        const keys = collection.map(x => x.id);
        if (new Set(keys).size !== keys.length)
            issue('DUPLICATE_ID', '같은 종류의 항목 ID가 중복되었습니다.', '', 'error');
    }
    for (const p of positions) {
        if (!Number.isFinite(p.balance) || p.balance < 0)
            issue('INVALID_BALANCE', `${p.name}: 유효하지 않은 잔액입니다.`, p.assetId, 'error');
        if (!people.has(p.ownerId))
            issue('OWNER', `${p.name}: 명의자를 확인해 주세요.`, p.assetId);
        if (p.linkedTo && (!ids.has(p.linkedTo) || p.linkedTo === p.assetId || positions.find(x => x.assetId === p.linkedTo)?.linkedTo))
            issue('LINK', `${p.name}: 동일 잔액 연결이 유효하지 않습니다.`, p.assetId, 'error');
        if (!p.linkedTo && ['investment', 'pension'].includes(p.role) && p.annualGrowth === null)
            issue('RETURN', `${p.name}: 가격 상승률 가정(0 포함)을 확인해 주세요.`, p.assetId);
        if (!p.linkedTo && ['investment','pension'].includes(p.role) && (p.dividendYield === null || (p.dividendYield > 0 && p.dividendWithholding === null)))
            issue('DIVIDEND', `${p.name}: 배당률·원천징수 가정을 확인해 주세요.`, p.assetId);
        const linked = (p.source.detail as any)?.linkedStockId;
        if(p.allowWithdrawal&&!p.linkedTo&&['investment','pension'].includes(p.role)&&p.withdrawalWithholding==null)issue('WITHDRAW_TAX',`${p.name}: 자동 인출 시 원천징수 가정(없으면 0)을 확인하세요. 매각차익 과세는 별도 예상액으로 입력합니다.`,p.assetId);
        if (linked && !p.linkedTo && p.role!=='excluded')
            issue('DUPLICATE_ACCOUNT', `${p.name}: 기존 연결 계좌와 동일한 잔액인지 확인해 주세요.`, p.assetId);
        if (['construction', 'right'].includes(p.propertyState) && p.role === 'property' && plan.coverage.taxes !== 'confirmedNone' && !plan.flows.some(f => f.kind === 'tax' && f.assetId === p.assetId && f.confirmed && f.basis))
            issue('PROPERTY_TAX', `${p.name}: 공사 전후 세금의 대상·기간·근거를 입력해 주세요. 준공 전 세금을 0원으로 가정하지 않습니다.`, p.assetId);
    }
    const dates = new Map<string, string>();
    try {
        for (const e of plan.events.filter(e => e.status !== 'cancelled')) {
            const date = eventDate(e, plan.events, scenario);
            run.resolvedEvents.push({ id: e.id, date, name: e.name });
            if (!date)
                issue('EVENT_DATE', `${e.name}: 날짜 또는 연 단위 일정의 가정 월을 입력해 주세요.`, e.id);
            else
                dates.set(e.id, date);
            if (e.at.precision !== 'day' && !e.at.anchorId)
                issue('DATE_ESTIMATE', `${e.name}: ${e.at.precision === 'year' ? '가정 월' : '입력 월'} 말일에 배치한 추정 일정입니다.`, e.id, 'warning');
            if (e.assetId && !ids.has(e.assetId))
                issue('EVENT_ASSET', `${e.name}: 원천 자산이 없습니다.`, e.id, 'error');
            if (!['completion', 'approval', 'move'].includes(e.kind) && e.amount === null)
                issue('EVENT_AMOUNT', `${e.name}: 금액을 확인해 주세요.`, e.id);
            if (e.status === 'actual' && scenario.eventShifts[e.id])
                issue('ACTUAL_SHIFT', '실제 발생한 사건은 대안에서 이동할 수 없습니다.', e.id, 'error');
        }
    }
    catch (error) {
        issue('EVENT_LINK', (error as Error).message, '', 'error');
    }
    const flows: {
        flow: Flow;
        start: string;
        end: string;
    }[] = [];
    for (const stored of plan.flows) {
        const f = stored.amountSource === 'assetPension' ? { ...stored, amount: assetPensionAmount(positions.find(p => p.assetId === stored.assetId)?.source) } : stored;
        // Validate funding even when dates still need review. Old linked-pension flows must not silently use a zero wrapper balance.
        if (f.kind === 'withdrawal') {
            const contract = positions.find(p => p.assetId === f.assetId);
            if ((contract?.source.detail as any)?.linkedStockId && !f.withdrawalAssetIds)
                issue('WITHDRAW_LINK', `${f.name}: 등록 지급액의 원천과 실제 주식 출금 계좌를 연결해 주세요.`, f.id, 'error');
            if (f.withdrawalAssetIds) {
                const seen = new Set<string>();
                if (!f.withdrawalAssetIds.length) issue('WITHDRAW_LINK', `${f.name}: 출금 계좌를 찾지 못했습니다. 원천을 선택해 주세요.`, f.id, 'error');
                for (const id of f.withdrawalAssetIds) {
                    const p = positions.find(p => p.assetId === id);
                    if (!p || p.linkedTo || !['investment', 'pension', 'deposit'].includes(p.role) || seen.has(id))
                        issue('WITHDRAW_MEMBERS', `${f.name}: 출금 목록에 없는 자산·중복·제외 자산이 있습니다.`, f.id, 'error');
                    seen.add(id);
                }
                if (f.withdrawalAccountAssetId) {
                    const anchor = positions.find(p => p.assetId === f.withdrawalAccountAssetId);
                    const name = (anchor?.source.detail as any)?.accountName;
                    const currentIds = positions.filter(p => p.source.type === 'STOCK' && (p.source.detail as any)?.accountName === name && !p.linkedTo && ['investment','pension','deposit'].includes(p.role)).map(p => p.assetId);
                    if (!anchor || !name || currentIds.length !== seen.size || currentIds.some(id => !seen.has(id)))
                        issue('ACCOUNT_MEMBERSHIP', `${f.name}: 계좌 구성과 출금 목록이 달라졌습니다. 계좌를 다시 선택해 검토하세요.`, f.id, 'error');
                }
            }
        } else if (f.withdrawalAssetIds) issue('WITHDRAW_KIND', `${f.name}: 출금 목록은 계좌 인출 항목에서만 사용합니다.`, f.id, 'error');
        try {
            const start = resolveDate(f.start, plan.events, scenario), end = f.end ? resolveDate(f.end, plan.events, scenario) : plan.endDate;
            if (!start || !end) {
                issue('FLOW_DATE', `${f.name}: 적용기간을 확인해 주세요.`, f.id);
                continue;
            }
            if (end < start) {
                issue('FLOW_PERIOD', `${f.name}: 종료가 시작보다 빠릅니다.`, f.id, 'error');
                continue;
            }
            if (f.amount === null || !f.confirmed)
                issue('FLOW_AMOUNT', `${f.name}: 금액(0 포함)과 입력 근거를 확인해 주세요.`, f.id);
            if (!people.has(f.ownerId))
                issue('FLOW_OWNER', `${f.name}: 귀속인을 확인해 주세요.`, f.id);
            if (f.assetId && !ids.has(f.assetId))
                issue('FLOW_ASSET', `${f.name}: 연결 자산이 없습니다.`, f.id, 'error');
            if (['withdrawal', 'transfer'].includes(f.kind) && !f.assetId)
                issue('FLOW_SOURCE', `${f.name}: 출금 계좌를 지정해 주세요.`, f.id, 'error');
            if (f.kind === 'pension' && f.assetId && positions.find(p => p.assetId === f.assetId)?.role !== 'entitlement')
                issue('PENSION_KIND', `${f.name}: 계좌 연금은 외부 연금이 아닌 계좌 인출로 등록해 주세요.`, f.id, 'error');
            if (['income', 'pension', 'rent', 'withdrawal'].includes(f.kind) && f.withholding === null)
                issue('WITHHOLDING', `${f.name}: 세후 입력은 0%, 세전 입력은 확인한 원천징수율을 입력하세요.`, f.id);
            if (['tax', 'insurance'].includes(f.kind) && (!f.basis || !f.scope))
                issue('TAX_BASIS', `${f.name}: 적용 대상과 근거가 필요합니다.`, f.id);
            if (f.endsAtRetirement && !validDate(plan.people.find(p => p.id === f.ownerId)?.retirementDate ?? ''))
                issue('RETIREMENT_DATE', `${f.name}: 연결한 은퇴일을 입력해 주세요.`, f.id);
            flows.push({ flow: f, start, end });
        }
        catch (error) {
            issue('FLOW_LINK', (error as Error).message, f.id, 'error');
        }
    }
    for(const key of ['income','expenses','taxes','insurance'] as const) {
        const kinds=key==='income'?['income','pension','rent']:key==='expenses'?['expense']:key==='taxes'?['tax']:['insurance'];
        const found=flows.some(({flow,start,end})=>kinds.includes(flow.kind)&&(flow.amount??0)>0&&start<=plan.endDate&&end>plan.asOfDate);
        if(plan.coverage[key]==='confirmedNone'&&found)issue('COVERAGE_CONFLICT_'+key,'해당 없음 확인과 입력된 양수 입출금이 충돌합니다. 입력 범위를 다시 확인하세요.',key,'error');
    }
    // Applicability period is separate from annual payment month. No unconfirmed pre-completion zero tax.
    for(const p of positions.filter(p=>validDate(plan.asOfDate)&&validDate(plan.endDate)&&p.role==='property'&&['construction','right'].includes(p.propertyState))) {
        if(plan.coverage.taxes==='confirmedNone')continue;
        const saleDates=plan.events.filter(e=>e.assetId===p.assetId&&e.kind==='sale').map(e=>dates.get(e.id)).filter((d):d is string=>!!d&&d>plan.asOfDate).sort();
        const end=saleDates[0]&&saleDates[0]<plan.endDate?saleDates[0]:plan.endDate;
        const first=utc(plan.asOfDate);first.setUTCDate(first.getUTCDate()+1);let covered=iso(first);
        const intervals=flows.filter(x=>x.flow.kind==='tax'&&x.flow.assetId===p.assetId&&x.flow.confirmed&&x.flow.amount!==null&&x.flow.basis).sort((a,b)=>a.start.localeCompare(b.start));
        for(const interval of intervals){if(interval.start>covered)break;if(interval.end>=covered){const next=utc(interval.end);next.setUTCDate(next.getUTCDate()+1);covered=iso(next)}}
        if(covered<=end)issue('PROPERTY_TAX_GAP',`${p.name}: ${covered}부터 공사 전후 세금 적용 기간이 비어 있습니다. 세액 미확정과 0원 확인을 구분해 기간·근거를 입력하세요.`,p.assetId);
    }
    for (let i = 0; i < flows.length; i++)
        for (let j = i + 1; j < flows.length; j++) {
            const a = flows[i], b = flows[j];
            if (a.flow.kind === 'pension' && b.flow.kind === 'pension' && a.flow.assetId && a.flow.assetId === b.flow.assetId && a.flow.ownerId === b.flow.ownerId && a.start <= b.end && b.start <= a.end)
                issue('PENSION_OVERLAP', `${a.flow.name} / ${b.flow.name}: 같은 연금 수급권의 지급 기간이 겹칩니다.`, a.flow.id, 'error');
            if (['tax', 'insurance'].includes(a.flow.kind) && a.flow.kind === b.flow.kind && a.flow.scope && a.flow.scope === b.flow.scope && a.start <= b.end && b.start <= a.end)
                issue('TAX_OVERLAP', `${a.flow.name} / ${b.flow.name}: 같은 범위의 예상액 기간이 겹칩니다. 한 항목으로 대체하거나 범위를 나누세요.`, a.flow.id, 'error');
        }
    for (const d of snapshot.debts) {
        if(d.balance===0&&!plan.events.some(e=>e.targetId===d.id&&['borrow','depositReceived'].includes(e.kind)&&e.status!=='cancelled'))continue;
        if (d.kind === 'loan' && d.interestRate === null)
            issue('DEBT_RATE', `${d.name}: 금리를 확인해 주세요.`, d.id);
        if (d.repayment !== 'interestOnly' && d.monthlyPayment === null)
            issue('DEBT_PAYMENT', `${d.name}: 월 상환액을 입력해 주세요.`, d.id);
        if (!d.maturity)
            issue('DEBT_MATURITY', `${d.name}: 만기/반환일을 확인해 주세요.`, d.id);
        else {
            try {
                const date = resolveDate(d.maturity, plan.events, scenario);
                if (!date)
                    issue('DEBT_MATURITY', `${d.name}: 만기/반환일을 확인해 주세요.`, d.id);
                else if (date <= plan.asOfDate && d.balance > 0)
                    issue('DEBT_OVERDUE', `${d.name}: 기준일 이전 만기입니다. 실제 미상환 여부와 새 상환 일정을 확인하세요.`, d.id);
            }
            catch {
                issue('DEBT_LINK', `${d.name}: 만기 연결 오류`, d.id, 'error');
            }
        }
    }
    if (issues.some(i => i.severity === 'error')) {
        run.status = 'invalid';
        return run;
    }
    const balances = Object.fromEntries(positions.map(p => [p.assetId, p.balance]));
    const debts = Object.fromEntries(snapshot.debts.map(d => [d.id, d.balance]));
    const states = Object.fromEntries(positions.filter(p => p.role === 'property').map(p => [p.assetId, p.propertyState as string]));
    const cashIds = positions.filter(p => p.role === 'cash' && !p.linkedTo).map(p => p.assetId);
    if (!cashIds.length) {
        cashIds.push('cash:settlement');
        balances['cash:settlement'] = 0;
    }
    const cash = () => sum(cashIds.map(id => balances[id] ?? 0));
    const credit = (amount: number) => { balances[cashIds[0]] += amount; };
    const debit = (amount: number) => { let rest = amount; for (const id of cashIds) {
        const take = Math.min(rest, balances[id]);
        balances[id] -= take;
        rest -= take;
    } };
    const sold = new Set<string>(), credited = new Map<string, number>();
    const arrears: {
        kind: string;
        name: string;
        sourceId: string;
        assetId: string;
        ownerId: string;
        remaining: number;
    }[] = [];
    let unpaid = 0, date = utc(plan.asOfDate), entries: Entry[] = [], openingCash = cash(), month = '', debtInterest: Record<string, number> = {}, growthAcc: Record<string, number> = {}, dividendAcc: Record<string, number> = {};
    const push = (day: string, kind: string, name: string, sourceId: string, assetId: string, ownerId: string, requested: number, paid: number, cashDelta: number, assetDelta = 0, debtDelta = 0, recurring = false, formula = '') => {
        const entry = { id: `${day}:${sourceId}:${kind}:${entries.length}`, date: day, kind, name, sourceId, assetId, ownerId, requested, paid, shortfall: Math.max(0, requested - paid), cashDelta, assetDelta, debtDelta, recurring, formula };
        entries.push(entry);
        return entry;
    };
    const withdraw = (day: string, id: string, amount: number, sourceId: string, ownerId: string, recurring: boolean, withholding=0):number => {
        const source = positions.find(p => p.assetId === id);
        const actualId = source?.linkedTo || id;
        if (!source || !['investment', 'pension', 'deposit'].includes(positions.find(p => p.assetId === actualId)?.role ?? '')) {
            issue('WITHDRAW_SOURCE', '인출 가능한 계좌를 확인해 주세요.', sourceId, 'error');
            return 0;
        }
        const paid = Math.min(Math.max(0, balances[actualId] ?? 0), amount);
        balances[actualId] -= paid;
        credit(paid);
        push(day, 'withdrawal', source.name + ' → 생활현금', sourceId, actualId, ownerId, amount, paid, paid, -paid, 0, recurring, '실제 인출 = min(목표, 가용 계좌 잔액)');
        if(withholding>0)pay(day,'withholding',source.name+' 인출 원천징수',sourceId,actualId,ownerId,Math.round(paid*withholding/100),recurring);
        return paid;
    };
    const pay = (day: string, kind: string, name: string, sourceId: string, assetId: string, ownerId: string, amount: number, recurring = false):number => {
        let needed = Math.max(0, amount - cash());
        for (const p of positions.filter(p => p.allowWithdrawal && !p.linkedTo && ['investment', 'pension'].includes(p.role))) {
            if (needed <= 0)
                break;
            const rate=p.withdrawalWithholding??0;
            if(rate>=100)continue;
            withdraw(day, p.assetId, Math.min(Math.ceil(needed/(1-rate/100)), balances[p.assetId]), sourceId, p.ownerId, false,rate);
            needed=Math.max(0,amount-cash());
        }
        const paid = Math.min(cash(), amount);
        debit(paid);
        // Unpaid principal already remains in the debt balance. Transfers are goals, not a second liability.
        if (!['principal', 'transfer'].includes(kind) && amount > paid) {
            unpaid += amount - paid;
            arrears.push({ kind, name, sourceId, assetId, ownerId, remaining: amount - paid });
        }
        push(day, kind, name, sourceId, assetId, ownerId, amount, paid, -paid, 0, 0, recurring, '지급 = min(요청액, 허용 인출 후 현금); 부족분은 미충당 의무로 별도 표시');
        return paid;
    };
    const receive = (day: string, kind: string, name: string, sourceId: string, assetId: string, ownerId: string, amount: number, withholding: number, recurring: boolean) => {
        credit(amount);
        push(day, kind, name, sourceId, assetId, ownerId, amount, amount, amount, 0, 0, recurring, '확인한 지급액 × 기간별 증가 가정');
        if (withholding > 0)
            pay(day, 'withholding', name + ' 원천징수', sourceId, assetId, ownerId, Math.round(amount * withholding / 100), recurring);
    };
    const settleArrears = (day: string) => {
        for (const a of arrears) {
            if (cash() <= 0)
                break;
            if (a.remaining <= 0)
                continue;
            const paid = Math.min(cash(), a.remaining);
            debit(paid);
            a.remaining -= paid;
            unpaid -= paid;
            push(day, a.kind, a.name + ' · 이전 미충당 비용 정산', a.sourceId, a.assetId, a.ownerId, paid, paid, -paid, 0, 0, false, '당기 요청 처리 후 남은 현금으로 이전 미충당 비용을 발생 순서대로 충당; 부채 원금은 별도');
        }
    };
    const eventByDay = new Map<string, PlanEvent[]>();
    for (const e of plan.events) {
        const d = dates.get(e.id);
        if (d && d > plan.asOfDate && d <= plan.endDate)
            eventByDay.set(d, [...(eventByDay.get(d) ?? []), e]);
    }
    // Market shock changes only this run; the source snapshot and real records stay untouched.
    for (const p of positions.filter(p => p.role === 'investment' && !p.linkedTo))
        balances[p.assetId] = Math.round(balances[p.assetId] * (1 + scenario.marketShock / 100));
    date.setUTCDate(date.getUTCDate() + 1);
    while (iso(date) <= plan.endDate) {
        const day = iso(date), ym = day.slice(0, 7), year = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
        if (ym !== month) {
            month = ym;
            openingCash = cash();
            entries = [];
            debtInterest = {};
            growthAcc = {};
            dividendAcc = {};
        }
        // Opening-day capital only: a contribution cannot earn returns before it arrives.
        for (const p of positions.filter(p => !p.linkedTo && ['investment', 'pension'].includes(p.role) && !sold.has(p.assetId))) {
            const balance = balances[p.assetId];
            const growth = Math.round(balance * (Math.pow(1 + (p.annualGrowth ?? 0) / 100, 1 / monthEnd(year, m) / 12) - 1));
            balances[p.assetId] += growth;
            growthAcc[p.assetId] = (growthAcc[p.assetId] ?? 0) + growth;
            dividendAcc[p.assetId] = (dividendAcc[p.assetId] ?? 0) + balance * (p.dividendYield ?? 0) / 100 / 12 / monthEnd(year, m);
        }
        const processEvent = (e: PlanEvent) => {
            const amount = Math.round(e.amount ?? 0), asset = e.assetId, target = e.targetId;
            if (['completion', 'approval', 'move'].includes(e.kind)) {
                states[asset] = e.kind;
                push(day, e.kind, e.name, e.id, asset, e.ownerId, 0, 0, 0, 0, 0, false, '물리적 상태 사건이며 세금 발생을 자동 확정하지 않음');
                return;
            }
            if (e.amount === null)
                return;
            if (e.kind === 'valuation') {
                const delta = amount - (balances[asset] ?? 0);
                balances[asset] = amount;
                push(day, e.kind, e.name, e.id, asset, e.ownerId, amount, amount, 0, delta, 0, false, '예상 평가액 변경 — 생활현금 유입 아님');
                return;
            }
            if (e.kind === 'inflow') {
                receive(day, 'inflow', e.name, e.id, asset, e.ownerId, amount, 0, false);
                return;
            }
            if (e.kind === 'expense') {
                pay(day, 'expense', e.name, e.id, asset, e.ownerId, amount);
                return;
            }
            if (['borrow', 'depositReceived'].includes(e.kind)) {
                if (!(owns(debts, target))) {
                    issue('DEBT_TARGET', `${e.name}: 연결 부채가 없습니다.`, e.id, 'error');
                    return;
                }
                debts[target] += amount;
                credit(amount);
                push(day, e.kind, e.name, e.id, asset, e.ownerId, amount, amount, amount, 0, amount);
                return;
            }
            if (['repay', 'depositReturned'].includes(e.kind)) {
                if (!(owns(debts, target))) {
                    issue('DEBT_TARGET', `${e.name}: 상환 부채가 없습니다.`, e.id, 'error');
                    return;
                }
                const paid = pay(day, 'principal', e.name, e.id, asset, e.ownerId, Math.min(amount, debts[target]));
                debts[target] -= paid;
                entries[entries.length - 1].debtDelta = -paid;
                return;
            }
            if (e.kind === 'depositPaid' || e.kind === 'transfer') {
                if (!(owns(balances, target))) {
                    issue('TRANSFER_TARGET', `${e.name}: 입금 자산을 지정하세요.`, e.id, 'error');
                    return;
                }
                const paid = pay(day, 'transfer', e.name, e.id, asset, e.ownerId, amount);
                balances[target] += paid;
                if (cashIds.includes(target))
                    entries[entries.length - 1].cashDelta += paid;
                else
                    entries[entries.length - 1].assetDelta = paid;
                return;
            }
            if (e.kind === 'depositRecovered') {
                withdraw(day, asset, amount, e.id, e.ownerId, false);
                return;
            }
            if (e.kind === 'sale') {
                if (!ids.has(asset) || sold.has(asset)) {
                    issue('SALE_TARGET', `${e.name}: 매각 대상이 없거나 이미 매각됐습니다.`, e.id, 'error');
                    return;
                }
                const value = balances[asset] ?? 0;
                balances[asset] = 0;
                credit(amount);
                sold.add(asset);
                states[asset] = 'sold';
                push(day, 'sale', e.name, e.id, asset, e.ownerId, amount, amount, amount, -value, 0, false, '매각대금 유입과 기존 자산 제거; 거래세/비용은 별도 사건');
                for (const debtId of e.settleDebtIds)
                    if (owns(debts, debtId)) {
                        const paid = pay(day, 'principal', '매각 시 부채 정산', e.id, asset, e.ownerId, debts[debtId]);
                        debts[debtId] -= paid;
                        entries[entries.length - 1].debtDelta = -paid;
                    }
                return;
            }
            if (e.kind === 'taxSettlement') {
                if (!e.basis || !e.taxYear)
                    issue('SETTLEMENT_BASIS', `${e.name}: 귀속연도·근거를 확인해 주세요.`, e.id);
                const all = [...run.months.flatMap(r => r.entries), ...entries];
                let creditAmount = 0;
                for (const source of e.creditSourceIds) {
                    const key = `${e.taxYear}:${source}`;
                    const withheld = sum(all.filter(x => x.kind === 'withholding' && x.sourceId === source && x.date.startsWith(String(e.taxYear))).map(x => x.paid));
                    const available = Math.max(0, withheld - (credited.get(key) ?? 0));
                    creditAmount += available;
                    credited.set(key, withheld);
                }
                const remaining = amount - creditAmount;
                if (remaining >= 0)
                    pay(day, 'tax', e.name, e.id, asset, e.ownerId, remaining);
                else {
                    credit(-remaining);
                    push(day, 'taxRefund', e.name, e.id, asset, e.ownerId, -remaining, -remaining, -remaining, 0, 0, false, '확인한 연간 세액 − 아직 공제하지 않은 기납부 원천세');
                }
            }
        };
        const priority = (e: PlanEvent) => ['completion', 'approval', 'move', 'valuation'].includes(e.kind) ? 0 : ['inflow', 'borrow', 'depositReceived', 'sale', 'depositRecovered'].includes(e.kind) ? 1 : 2;
        const dayEvents = [...(eventByDay.get(day) ?? [])].sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
        for (const e of dayEvents.filter(e => priority(e) < 2))
            processEvent(e);
        const scheduled = flows.filter(({ flow: f, start, end }) => {
            if (day < start || day > end)
                return false;
            if (f.endsAtRetirement) {
                const retire = plan.people.find(p => p.id === f.ownerId)?.retirementDate;
                if (retire && validDate(retire) && day >= shiftDate(retire, scenario.retirementOffset))
                    return false;
            }
            if (f.assetId && sold.has(f.assetId) && ['rent', 'withdrawal', 'transfer'].includes(f.kind))
                return false;
            if (f.frequency === 'once')
                return day === start;
            return date.getUTCDate() === Math.min(f.paymentDay, monthEnd(year, m)) && (f.frequency !== 'annual' || (f.paymentMonth??Number(start.slice(5,7)))===m);
        }).sort((a, b) => Number(['expense', 'tax', 'insurance', 'transfer'].includes(a.flow.kind)) - Number(['expense', 'tax', 'insurance', 'transfer'].includes(b.flow.kind)) || a.flow.id.localeCompare(b.flow.id));
        for (const { flow: f, start } of scheduled) {
            if (f.amount === null)
                continue;
            const elapsed = (year - Number(start.slice(0, 4))) * 12 + m - Number(start.slice(5, 7));
            const adjustment = f.kind === 'expense' ? scenario.expensePercent : f.kind === 'rent' ? scenario.rentPercent : 0;
            const amount = Math.round(f.amount * Math.pow(1 + f.growth / 100, elapsed / 12) * (1 + adjustment / 100));
            if (['income', 'pension', 'rent'].includes(f.kind))
                receive(day, f.kind, f.name, f.id, f.assetId, f.ownerId, amount, f.withholding ?? 0, true);
            else if (f.kind === 'withdrawal') {
                if (!f.withdrawalAssetIds) withdraw(day, f.assetId, amount, f.id, f.ownerId, true, f.withholding??0);
                else {
                    let remaining = amount;
                    for (const id of f.withdrawalAssetIds) {
                        const take = sold.has(id) ? 0 : Math.min(remaining, balances[id] ?? 0);
                        if (take > 0) remaining -= withdraw(day, id, take, f.id, f.ownerId, true, f.withholding??0);
                        if (remaining <= 0) break;
                    }
                    if (remaining > 0) push(day, 'withdrawal', f.name + ' 출금 목록 잔액 부족', f.id, f.assetId, f.ownerId, remaining, 0, 0, 0, 0, true, '검토한 출금 목록의 합산 잔액까지 지급. 남은 요청은 미충족');
                }
            }
            else if (f.kind === 'transfer') {
                if (!(owns(balances, f.targetId))) {
                    issue('FLOW_TARGET', `${f.name}: 입금 계좌가 없습니다.`, f.id, 'error');
                    continue;
                }
                const taken = cashIds.includes(f.assetId) ? pay(day, 'transfer', f.name, f.id, f.assetId, f.ownerId, amount, true) : Math.min(amount, balances[f.assetId] ?? 0);
                if (!cashIds.includes(f.assetId)) {
                    balances[f.assetId] -= taken;
                    push(day, 'transfer', f.name, f.id, f.assetId, f.ownerId, amount, taken, 0, -taken);
                }
                balances[f.targetId] += taken;
                if (!cashIds.includes(f.targetId))
                    entries[entries.length - 1].assetDelta += taken;
                else
                    entries[entries.length - 1].cashDelta += taken;
            }
            else
                pay(day, f.kind, f.name, f.id, f.assetId, f.ownerId, amount, true);
        }
        for (const e of dayEvents.filter(e => priority(e) === 2))
            processEvent(e);
        for (const debt of snapshot.debts.filter(d => d.kind === 'loan')) {
            const rate = Math.max(0, (debt.interestRate ?? 0) + (debt.variableRate ? scenario.ratePoints : 0));
            debtInterest[debt.id] = (debtInterest[debt.id] ?? 0) + debts[debt.id] * rate / 100 / (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
        }
        for (const d of snapshot.debts) {
            let maturity: string | null = null;
            try {
                maturity = d.maturity ? resolveDate(d.maturity, plan.events, scenario) : null;
            }
            catch {
                issue('DEBT_DATE', `${d.name}: 만기 연결 오류`, d.id, 'error');
            }
            if (maturity === day && debts[d.id] > 0) {
                const paid = pay(day, 'principal', d.name + ' 만기/반환', d.id, d.assetId, d.ownerId, debts[d.id]);
                debts[d.id] -= paid;
                entries[entries.length - 1].debtDelta = -paid;
            }
        }
        if (day.slice(5) === '06-01')
            for (const p of positions.filter(p => p.role === 'property'))
                run.taxCheckpoints.push({ date: day, assetId: p.assetId, state: states[p.assetId], owned: !sold.has(p.assetId), market: balances[p.assetId], official: p.officialValue, assessed: p.assessedValue });
        const last = date.getUTCDate() === monthEnd(year, m), periodLast = last || day === plan.endDate;
        if (!periodLast)
            settleArrears(day);
        if (periodLast) {
            for (const d of snapshot.debts) {
                const interest = Math.round(debtInterest[d.id] ?? 0);
                if (interest)
                    pay(day, 'interest', d.name + ' 이자', d.id, d.assetId, d.ownerId, interest, true);
                let maturity: string | null = null;
                try {
                    maturity = d.maturity ? resolveDate(d.maturity, plan.events, scenario) : null;
                }
                catch { }
                const due = !last || (maturity && maturity <= day) || d.repayment === 'interestOnly' ? 0 : d.repayment === 'annuity' ? Math.max(0, (d.monthlyPayment ?? 0) - interest) : d.monthlyPayment ?? 0;
                if (due > 0) {
                    const paid = pay(day, 'principal', d.name + ' 원금 상환', d.id, d.assetId, d.ownerId, Math.min(due, debts[d.id]), true);
                    debts[d.id] -= paid;
                    entries[entries.length - 1].debtDelta = -paid;
                }
            }
            for (const p of positions.filter(p => !p.linkedTo && ['investment', 'pension'].includes(p.role))) {
                const dividend = Math.round(dividendAcc[p.assetId] ?? 0), growth = growthAcc[p.assetId] ?? 0;
                if (growth)
                    push(day, 'valuation', p.name + ' 가격 상승 가정', p.assetId, p.assetId, p.ownerId, Math.abs(growth), Math.abs(growth), 0, growth, 0, false, '매일 기초 잔액 × ((1+연 가격상승률)^(1/월일수/12)−1), 일별 원 반올림 합계; 당일 유입은 다음 날부터');
                if (dividend) {
                    receive(day, 'dividend', p.name + ' 예상 배당', p.assetId, p.assetId, p.ownerId, dividend, p.dividendWithholding ?? 0, true);
                    if (p.reinvestDividends && !sold.has(p.assetId)) {
                        const net = dividend - Math.round(dividend * (p.dividendWithholding ?? 0) / 100);
                        debit(net);
                        balances[p.assetId] += net;
                        push(day, 'transfer', p.name + ' 배당 재투자', p.assetId, p.assetId, p.ownerId, net, net, -net, net, 0, true);
                    }
                }
            }
            settleArrears(day);
            const incomeKinds = ['income', 'pension', 'rent', 'dividend', 'inflow'], expenseKinds = ['expense', 'insurance', 'interest'], taxKinds = ['tax', 'withholding'];
            const closingCash = Math.round(cash()), shortfall = sum(entries.map(e => e.shortfall));
            if (Math.abs(openingCash + sum(entries.map(e => e.cashDelta)) - closingCash) > 1)
                issue('CASH_RECONCILIATION', `${ym}: 현금 보존식 불일치`, '', 'error');
            if (!run.firstShortfall && shortfall > 0)
                run.firstShortfall = ym;
            run.months.push({ month: ym, openingCash, closingCash, income: sum(entries.filter(e => incomeKinds.includes(e.kind)).map(e => e.paid)),
                spending: sum(entries.filter(e => expenseKinds.includes(e.kind)).map(e => e.paid)), taxes: sum(entries.filter(e => taxKinds.includes(e.kind)).map(e => e.paid)) - sum(entries.filter(e => e.kind === 'taxRefund').map(e => e.paid)),
                withdrawals: sum(entries.filter(e => e.kind === 'withdrawal').map(e => e.paid)), shortfall, unpaid,
                netWorth: Math.round(sum(Object.values(balances)) - sum(Object.values(debts)) - unpaid), liquid: Math.round(cash() + sum(positions.filter(p => p.allowWithdrawal && !p.linkedTo && ['investment', 'pension'].includes(p.role)).map(p => balances[p.assetId]))),
                recurringNet: sum(entries.filter(e => e.recurring && [...incomeKinds, ...expenseKinds, ...taxKinds].includes(e.kind)).map(e => incomeKinds.includes(e.kind) ? e.paid : -e.requested)),
                balances: { ...balances }, debts: { ...debts }, states: { ...states }, entries: [...entries] });
        }
        date.setUTCDate(date.getUTCDate() + 1);
    }
    run.status = issues.some(i => i.severity === 'error') ? 'invalid' : issues.some(i => i.severity === 'missing') ? 'partial' : 'complete';
    return run;
}
export function selectYears(run: Run) {
    const years = [...new Set(run.months.map(m => m.month.slice(0, 4)))];
    return years.map(year => {
        const months = run.months.filter(m => m.month.startsWith(year)), end = months[months.length - 1];
        return { year, months, end,
            income: sum(months.map(m => m.income)), spending: sum(months.map(m => m.spending)), taxes: sum(months.map(m => m.taxes)), shortfall: sum(months.map(m => m.shortfall)), recurringAverage: Math.round(sum(months.map(m => m.recurringNet)) / months.length) };
    });
}
