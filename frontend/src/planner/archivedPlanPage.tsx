// 보관 — 라우트 없음, 삭제는 별도 결정.
// 4단계 항목 1(안 1)에서 월별 계획 편집 화면을 라우트에서 뺐다. 되돌리기 쉽도록 코드만 보존한다.
// 합산 정책 편집(policies 탭)은 TotalsPolicyPage(/settings/totals)로 옮겼다.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MigrationReview from './MigrationReview';
import PlanStart from './PlanStart';
import PlanEntry from './PlanEntry';
import FundingEditor from './FundingEditor';
import './review.css';
import { safeAssetReturn, assetLabel } from './accounts';
import { usePlanner } from './context';
import { assetPensionAmount, availability, debtSchema, eventSchema, fixedDate, flowSchema, scenarioSchema, type DateSpec, type PlannerPlan } from './model';
import { baseScenario } from './engine';
import { assetFlowPreview, calculateAndSave, clearDraft, legacyPreview, readDraft, saveDraft, savePlan } from './storage';
import { eventLabels } from './labels';
import { Check, Loading, Num, Pick, Shell, Txt, textError } from './ui';
import { formatWon as won } from '@/lib/utils';
const uid = () => crypto.randomUUID();
const flowLabels: Record<string, string> = { income: '근로·사업·기타 소득', pension: '외부 연금 수령', rent: '임대 수입', expense: '생활·의료·여행비', withdrawal: '계좌 연금/투자 인출', tax: '예상 세금 납부', insurance: '보험료', transfer: '계좌 간 이전·적립' };
const coverageLabels: Record<string, string> = { assets: '보유 자산', income: '정기 수입', expenses: '생활비', taxes: '세금', insurance: '보험료' };
function DateEditor({ label, value, onChange, plan, exclude = '' }: {
    label: string;
    value: DateSpec;
    onChange: (v: DateSpec) => void;
    plan: PlannerPlan;
    exclude?: string;
}) {
    const update = (patch: Partial<DateSpec>) => onChange({ ...value, ...patch });
    const advanced = !!value.anchorId || value.precision !== 'day' || !!value.offsetMonths || !!value.offsetDays;
    return <fieldset className="date-editor"><legend>{label}</legend>
      {!value.anchorId && <Txt label="기준 날짜" type={value.precision==='day'?'date':value.precision==='month'?'month':'text'} value={value.value} onChange={v=>update({value:v})}/>}
      {value.anchorId && <p>연결 일정: {plan.events.find(e=>e.id===value.anchorId)?.name??'연결 대상 확인 필요'}</p>}
      <details open={advanced || undefined}><summary>날짜 상세 조건 · 일정 연동, 월·연 단위</summary><div className="form-grid">
        <Pick label="일정 기준" value={value.anchorId || ''} options={{ '': '고정 날짜', ...Object.fromEntries(plan.events.filter(e => e.id !== exclude && e.status !== 'cancelled').map(e => [e.id, e.name])) }} onChange={v => update({ anchorId: v || undefined })}/>
        {!value.anchorId && <><Pick label="날짜 정밀도" value={value.precision} options={{ day: '일 단위', month: '월 단위 (말일 가정)', year: '연 단위 (가정 월 필요)' }} onChange={v => update({ precision: v as DateSpec['precision'], value: '' })}/>{value.precision==='year'&&<Num label="가정 월 (1–12)" value={value.assumedMonth} onChange={v=>update({assumedMonth:v??undefined})}/>}</>}
        <Num label="기준에서 이동 (개월, 음수 가능)" value={value.offsetMonths} onChange={v=>update({offsetMonths:v??0})}/><Num label="추가 이동 (일, 직전일까지는 -1)" value={value.offsetDays??0} onChange={v=>update({offsetDays:v??0})}/>
      </div></details>
    </fieldset>;
}
const draftKey = () => { let id = sessionStorage.getItem('planner-tab'); if (!id) {
    id = uid();
    sessionStorage.setItem('planner-tab', id);
} return id; };
export function PlanPage() {
    const { data } = usePlanner(), navigate = useNavigate(), [params, setParams] = useSearchParams();
    const [plan, setPlan] = useState<PlannerPlan | null>(null), [dirty, setDirty] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [tabId] = useState(draftKey), [restored, setRestored] = useState(false);
    const tab = params.get('tab') || 'start';
    const openTab = (id: string) => { const next = new URLSearchParams(params); next.set('tab', id); for (const key of ['focus','group','q','unconfirmed']) next.delete(key); setParams(next); };
    const toggleEntry = (id: string) => { const next = new URLSearchParams(params); if (next.get('focus') === id) next.delete('focus'); else next.set('focus', id); setParams(next); };
    useEffect(() => { if (data && !plan && !restored) {
        setRestored(true);
        void readDraft(tabId).then(d => { setPlan(d ?? structuredClone(data.plan)); if (d) {
            setDirty(true);
            setMessage('저장되지 않은 초안을 복원했습니다. 최신 저장본과 다르면 충돌을 안내합니다.');
        } }).catch(e => { setMessage(textError(e)); setPlan(structuredClone(data.plan)); });
    } }, [data, plan, restored, tabId]);
    useEffect(() => { if (data && plan && !dirty && data.plan.revision !== plan.revision)
        setPlan(structuredClone(data.plan)); }, [data, plan, dirty]);
    useEffect(() => { if (!plan || !dirty)
        return; const timer = setTimeout(() => { void saveDraft(tabId, plan).catch(e => setMessage('초안 보존 실패: ' + textError(e))); }, 400); return () => clearTimeout(timer); }, [plan, dirty, tabId]);
    useEffect(() => { if (!dirty)
        return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
    useEffect(() => { const focus = params.get('focus'); if (focus)
        document.getElementById('source-' + focus)?.scrollIntoView({ block: 'center' }); }, [params, plan]);
    if (!data || !plan)
        return <Shell title="계획"><Loading /></Shell>;
    const update = (patch: Partial<PlannerPlan>) => { if (busy)
        return; setPlan({ ...plan, ...patch }); setDirty(true);
      for (const key of ['flows','events','debts','scenarios'] as const) { const added = patch[key]?.find(item => !plan[key].some(old => old.id === item.id)); if (added) { const next = new URLSearchParams(params); next.set('focus', added.id); setParams(next); break; } }
    };
    const change = (key: 'people' | 'policies' | 'flows' | 'events' | 'debts' | 'scenarios', index: number, patch: any) => update({ [key]: (plan[key] as any[]).map((v, i) => i === index ? { ...v, ...patch } : v) });
    const remove = (key: 'people' | 'flows' | 'events' | 'debts' | 'scenarios', index: number) => { if (window.confirm('이 초안에서 항목을 삭제할까요? 연결된 입력은 오류로 표시되며, 기존 저장 분석은 유지됩니다.'))
        update({ [key]: (plan[key] as any[]).filter((_, i) => i !== index) }); };
    const assets = { '': '연결 없음', ...Object.fromEntries(data.snapshot.positions.map(p => [p.assetId, assetLabel(p.source)])) }, owners = Object.fromEntries(plan.people.map(p => [p.id, p.name]));
    const save = async (calculate = false) => { setBusy(true); setMessage(''); try {
        const saved = await savePlan(plan, plan.revision);
        setPlan(saved);
        setDirty(false);
        await clearDraft(tabId);
        setMessage('계획이 저장되었습니다. 기존 분석은 변경하지 않았습니다.');
        if (calculate) {
            const result = await calculateAndSave(baseScenario);
            navigate('/analysis?run=' + result.id);
        }
    }
    catch (e) {
        setMessage(textError(e));
    }
    finally {
        setBusy(false);
    } };
    const debtOptions = { '': '부채 선택', ...Object.fromEntries(data.snapshot.debts.map(d => [d.id, d.name])) };
    const nav = { household: '1. 은퇴 시점', flows: '2. 생활비·수입', review: '3. 분석 전 확인' };
    const advancedNav = { events: '일정·목돈', debts: '부채·보증금', scenarios: '대안' };
    return <Shell title="나의 계획" subtitle="현재 자산은 그대로 두고, 은퇴 후 생활을 따로 계획합니다.">
    {tab==='start' && <PlanStart plan={plan} hasLegacy={data.hasLegacy} onOpen={openTab}/>}
    <div className={tab==='start'?'':'sticky-tools'}>
      {tab !== 'start' && <><button className="secondary" onClick={() => openTab('start')}>← 계획 시작 화면</button><nav className="step-nav" aria-label="계획 입력 구분">{Object.entries(nav).map(([id,name]) => <button className="secondary" key={id} aria-current={tab===id?'page':undefined} onClick={()=>openTab(id)}>{name}</button>)}</nav></>}
      <details className="advanced-nav" open={Object.keys(advancedNav).includes(tab)} key={Object.keys(advancedNav).includes(tab)?'advanced':'basic'}><summary>상세 설정 · 일정, 부채, 대안</summary><div className="actions">{Object.entries(advancedNav).map(([id,name])=><button className="secondary" key={id} aria-current={tab===id?'page':undefined} onClick={()=>openTab(id)}>{name}</button>)}</div></details>
      {(tab !== 'start' || dirty) && <div className="actions"><button disabled={busy} onClick={() => void save()}>저장{dirty ? ' · 변경 있음' : ''}</button>{tab==='review' && <button disabled={busy} onClick={() => void save(true)}>저장 후 분석</button>}<details><summary>초안 관리</summary><button className="secondary" disabled={busy} onClick={() => { if (window.confirm('초안을 버리고 최신 저장본을 읽을까요?')) { setPlan(structuredClone(data.plan)); setDirty(false); void clearDraft(tabId); } }}>최신 저장본 다시 읽기</button></details></div>}
    </div>
    {params.get('returnTo') && <Link to={safeAssetReturn(params.get('returnTo'))}>← 이전 자산 화면으로</Link>}
    {message && <p role="status" className="notice">{message}</p>}{data.plan.revision !== plan.revision && <p role="alert" className="notice">다른 화면에서 변경되었습니다. 초안을 보존한 상태이며 그대로 덮어쓸 수 없습니다.</p>}
    {tab === 'household' && <><details className="panel"><summary>계획 범위 · 기준일, 종료일, 물가</summary><div className="form-grid"><Txt label="출발 잔액 기준일 (해당 일 마감)" type="date" value={plan.asOfDate} onChange={v => update({ asOfDate: v })}/><Txt label="계획 종료일" type="date" value={plan.endDate} onChange={v => update({ endDate: v })}/><Num label="물가 상승률 (연 %)" value={plan.inflation} onChange={v => update({ inflation: v })}/></div><p className="muted">현재 저장 평가액에서 출발합니다. 과거 날짜를 선택해도 과거 잔액이 자동 재구성되지는 않습니다. 첫 계산은 기준일 다음 날부터입니다.</p></details>
      <section className="panel"><h2>가구 구성원</h2>{plan.people.map((p, i) => <div className="form-grid item" key={p.id}><Txt label="이름" value={p.name} onChange={v => change('people', i, { name: v })}/><Txt label="생년월" type="month" value={p.birthMonth} onChange={v => change('people', i, { birthMonth: v })}/><Txt label="은퇴일 (그 날부터 연결 근로소득 중단)" type="date" value={p.retirementDate} onChange={v => change('people', i, { retirementDate: v })}/>{i > 0 && <button className="secondary" onClick={() => remove('people', i)}>구성원 삭제</button>}</div>)}<button className="secondary" onClick={() => update({ people: [...plan.people, { id: uid(), name: '새 구성원', birthMonth: '', retirementDate: '' }] })}>구성원 추가</button></section>

      {data.hasLegacy && <details className="panel" id="migration-copy"><summary>이전에 입력한 은퇴계획 불러오기</summary><p>원본을 지우지 않습니다. 먼저 초안 복사 내역과 기존 입력을 대조하세요.</p><div className="actions"><button className="secondary" disabled={dirty} onClick={() => void legacyPreview().then(preview => { if (window.confirm(preview.notes.join('\n') + '\n\n검토용 초안으로 가져올까요?')) {
            setPlan(preview.plan);
            setDirty(true);
            setMessage(preview.notes.join(' '));
        } }).catch(e => setMessage(textError(e)))}>이전 미리보기{dirty ? ' (먼저 저장)' : ''}</button><Link to="/legacy-analysis?tab=prep">기존 입력 열기</Link></div><Check label="기존 연금·법인·보험·생활비를 대조했고, 새 계획에 포함/제외할 항목을 확인했습니다" value={plan.reviewedLegacy} onChange={v => update({ reviewedLegacy: v })}/></details>}<div className="step-footer"><button onClick={()=>openTab('flows')}>다음: 생활비·수입 →</button></div></>}
    {tab==='review' && <><section className="panel"><h2>분석 전, 빠진 조건만 확인하세요</h2><p>저장 후 분석하면 미확정 항목과 계산 근거를 볼 수 있습니다. 빈칸을 0원으로 확정하지 않습니다.</p><div className="actions"><Link className="button secondary" to="/settings/totals">합산 기준 확인</Link><button className="secondary" onClick={()=>openTab('events')}>목돈·{availability(data.snapshot).rebuild?'재건축 일정':'일정'} 확인</button><button className="secondary" onClick={()=>openTab('debts')}>대출·보증금 확인</button></div></section>      <section className="panel"><h2>입력 범위 확인</h2><div className="form-grid">{Object.entries(coverageLabels).map(([key, label]) => <Pick key={key} label={label} value={(plan.coverage as any)[key]} options={{ unknown: '아직 확인하지 않음', confirmedNone: '해당 없음 / 0임을 확인', provided: '관련 항목을 입력함' }} onChange={v => update({ coverage: { ...plan.coverage, [key]: v } })}/>)}</div><p className="muted">세금·보험료의 ‘없음’은 전체 계획 기간에 대한 사용자 가정입니다. 법적 면세 판정이 아닙니다.</p></section><MigrationReview/><div className="step-footer"><button disabled={busy} onClick={()=>void save(true)}>저장 후 분석</button></div></>}
    {tab === 'flows' && <><section className="panel"><h2>반복 입출금과 적용 기간</h2><button className="secondary" onClick={() => { const preview = assetFlowPreview(plan, data.snapshot, params.get('asset') || undefined); if (!preview.names.length) {
        setMessage("연결할 등록 연금 지급액이 없거나 이미 연결했습니다.");
        return;
    } if (window.confirm(preview.names.join("\\n") + "\\n원본 월 지급액과 연결한 초안을 만들까요? 개시/종료 월과 원천징수율은 확인이 필요합니다."))
        update({ flows: preview.plan.flows }); if(params.get('asset')){const next=new URLSearchParams(params);next.set('focus','asset-payout:'+params.get('asset'));setParams(next);} }}>자산에 등록한 연금 지급액 연결</button><p>국민연금 등 외부 수급은 ‘외부 연금’, IRP·연금저축 잔액 사용은 ‘계좌 인출’입니다. 임대료는 임대 시작 사건과 연결하세요. 세금은 확인한 예상 납부액이며 자동 세법 계산이 아닙니다.</p><button onClick={() => update({ flows: [...plan.flows, flowSchema.parse({ id: uid(), name: '새 입출금', kind: 'expense', amount: null, start: fixedDate(plan.asOfDate), frequency: 'monthly' })] })}>입출금 추가</button></section>{plan.flows.map((f, i) => { const patch = (v: any) => change('flows', i, v); return <PlanEntry key={f.id} id={f.id} title={f.name} description={(f.amountSource ? '등록 지급액 연동' : f.amount===null?'금액 미입력':won(f.amount))+' · '+(f.confirmed?'확인 완료':'확인 필요')} open={params.get('focus')===f.id} onToggle={()=>toggleEntry(f.id)}><div className="section-title"><h2>{f.name}</h2><button className="secondary" onClick={() => remove('flows', i)}>삭제</button></div><div className="form-grid"><Txt label="항목 이름" value={f.name} onChange={v => patch({ name: v })}/><Pick label="유형" value={f.kind} options={flowLabels} onChange={v => patch({ kind: v, withdrawalAssetIds: v==='withdrawal'?f.withdrawalAssetIds:undefined, withdrawalAccountAssetId: v==='withdrawal'?f.withdrawalAccountAssetId:undefined, confirmed:false })}/>{f.amountSource ? <p>원본 자산 연동액: {assetPensionAmount(data.snapshot.positions.find(p => p.assetId === f.assetId)?.source) === null ? "미입력" : won(assetPensionAmount(data.snapshot.positions.find(p => p.assetId === f.assetId)?.source)!)} / 월</p> : <Num label="1회 지급/수령액 (원)" value={f.amount} onChange={v => patch({ amount: v })}/>}<Pick label="주기" value={f.frequency} options={{ monthly: '매월', annual: '매년 (별도 납부월 또는 시작월)', once: '한 번 (시작일)' }} onChange={v => patch({ frequency: v })}/>{f.frequency==='annual'&&<Num label="매년 지급/납부월 (1–12, 비우면 시작월 연동)" value={f.paymentMonth} onChange={v=>patch({paymentMonth:v??undefined})}/>}<Num label="지급일 (1–31, 없는 날은 말일)" value={f.paymentDay} onChange={v => patch({ paymentDay: v ?? 31 })}/><Pick label="귀속인" value={f.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/><Pick label={f.amountSource ? "등록 지급액의 원천 자산" : "관련 자산 / 기본 출금 원천"} value={f.assetId} options={assets} onChange={v => patch({ assetId: v, withdrawalAssetIds: undefined, withdrawalAccountAssetId: undefined, confirmed: false })}/>{f.kind === 'transfer' && <Pick label="입금 계좌" value={f.targetId} options={assets} onChange={v => patch({ targetId: v })}/>}<Num label="금액 증가율 (연 %, 물가와 별도 적용)" value={f.growth} onChange={v => patch({ growth: v ?? 0 })}/>{['income', 'pension', 'rent', 'withdrawal'].includes(f.kind) && <Num label="원천징수 가정 (%, 세후 금액이면 0)" value={f.withholding} onChange={v => patch({ withholding: v })}/>}</div>{f.kind==='withdrawal'&&<FundingEditor flow={f} snapshot={data.snapshot} policies={plan.policies} onChange={patch}/>} {['pension', 'withdrawal'].includes(f.kind) && <Check label="원본 자산의 등록 월 지급액과 계속 연동" value={!!f.amountSource} onChange={v => patch({ amountSource: v ? 'assetPension' : undefined })}/>}<DateEditor label="시작" value={f.start} onChange={v => patch({ start: v })} plan={plan}/><Check label="별도 종료일 지정" value={!!f.end} onChange={v => patch({ end: v ? fixedDate(plan.endDate) : null })}/>{f.end && <DateEditor label="종료 (포함)" value={f.end} onChange={v => patch({ end: v })} plan={plan}/>}<Check label="귀속인의 은퇴일부터 중단" value={f.endsAtRetirement} onChange={v => patch({ endsAtRetirement: v })}/><div className="form-grid">{['tax', 'insurance'].includes(f.kind) && <Txt label="적용 범위 식별자 (같은 세목·자산·귀속인·납부차수에는 같은 값)" value={f.scope} onChange={v => patch({ scope: v })}/>}<Txt label="근거·가정 메모 (예: 확인한 추정세액, 기준연도)" value={f.basis} onChange={v => patch({ basis: v })}/></div><Check label="금액과 적용 기간을 확인했습니다" value={f.confirmed} onChange={v => patch({ confirmed: v })}/></PlanEntry>; })}<div className="step-footer"><button onClick={()=>openTab('review')}>다음: 분석 전 확인 →</button></div></>}
    {tab === 'events' && <><section className="panel"><h2>날짜별 사건</h2><p>금액 변경은 평가, 현금 유입은 목돈/매각으로 구분합니다. 준공만으로 세금·임대료를 자동 생성하지 않습니다. 연결한 일정만 대안에서 함께 이동합니다.</p><button onClick={() => update({ events: [...plan.events, eventSchema.parse({ id: uid(), name: '새 일정', kind: 'inflow', assetId: params.get('asset') || '', at: fixedDate('') })] })}>일정 추가</button></section>{plan.events.map((e, i) => { const patch = (v: any) => change('events', i, v), debtTarget = ['borrow', 'repay', 'depositReceived', 'depositReturned'].includes(e.kind); return <PlanEntry key={e.id} id={e.id} title={e.name} description={eventLabels[e.kind]+' · '+(e.at.value||'날짜 미입력')} open={params.get('focus')===e.id} onToggle={()=>toggleEntry(e.id)}><div className="section-title"><h2>{e.name}</h2><button className="secondary" onClick={() => remove('events', i)}>삭제</button></div><div className="form-grid"><Txt label="일정 이름" value={e.name} onChange={v => patch({ name: v })}/><Pick label="유형" value={e.kind} options={Object.fromEntries(Object.entries(eventLabels).filter(([k]) => availability(data.snapshot).property || !['completion', 'approval', 'move', 'sale'].includes(k)))} onChange={v => patch({ kind: v })}/><Pick label="관련 자산" value={e.assetId} options={assets} onChange={v => patch({ assetId: v })}/><Pick label="귀속인" value={e.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/>{!['completion', 'approval', 'move'].includes(e.kind) && <Num label="금액 (원, 평가는 변경 후 총액)" value={e.amount} onChange={v => patch({ amount: v })}/>}<Pick label="상태" value={e.status} options={{ planned: '예정', actual: '실제 발생 확인', cancelled: '취소' }} onChange={v => patch({ status: v })}/>{debtTarget && <Pick label="연결 부채" value={e.targetId} options={debtOptions} onChange={v => patch({ targetId: v })}/>} {['transfer', 'depositPaid'].includes(e.kind) && <Pick label="입금/보증금 자산" value={e.targetId} options={assets} onChange={v => patch({ targetId: v })}/>}</div><DateEditor label="예정 일정" value={e.at} onChange={v => patch({ at: v })} plan={plan} exclude={e.id}/>{e.status === 'actual' && <Txt label="실제 발생일 (대안에서 이동하지 않음)" type="date" value={e.actualDate} onChange={v => patch({ actualDate: v })}/>}<Txt label="근거·메모" value={e.basis} onChange={v => patch({ basis: v })}/>{e.kind === 'sale' && <fieldset><legend>매각 시 정산할 부채</legend>{data.snapshot.debts.map(d => <Check key={d.id} label={d.name} value={e.settleDebtIds.includes(d.id)} onChange={v => patch({ settleDebtIds: v ? [...e.settleDebtIds, d.id] : e.settleDebtIds.filter(id => id !== d.id) })}/>)}</fieldset>}{e.kind === 'taxSettlement' && <><Num label="소득 귀속연도" value={e.taxYear} onChange={v => patch({ taxYear: v })}/><p className="muted">금액에는 기납부 공제 전 확정/예상 연간 총세액을 입력합니다. 아래 지급원에서 이미 낸 원천세를 한 번만 공제합니다.</p>{plan.flows.filter(f => ['income', 'pension', 'rent', 'withdrawal'].includes(f.kind)).map(f => <Check key={f.id} label={f.name + ' 원천세 공제'} value={e.creditSourceIds.includes(f.id)} onChange={v => patch({ creditSourceIds: v ? [...e.creditSourceIds, f.id] : e.creditSourceIds.filter(id => id !== f.id) })}/>)}</>}</PlanEntry>; })}</>}
    {tab === 'debts' && <><section className="panel"><h2>대출·받은 보증금</h2><p>부동산에 등록한 대출·받은 보증금은 그대로 불러옵니다. 연결 부채의 현재 잔액은 원본 자산에서 수정하세요. 지급한 보증금은 자산으로 관리합니다.</p><button onClick={() => update({ debts: [...plan.debts, debtSchema.parse({ id: uid(), name: '새 부채', kind: 'loan', balance: 0, repayment: 'interestOnly' })] })}>부채 추가</button></section>{[...data.snapshot.debts.filter(d => !plan.debts.some(x => x.id === d.id)), ...plan.debts].map(d => { const patch = (v: any) => update({ debts: [...plan.debts.filter(x => x.id !== d.id), { ...d, ...v }] }), index = plan.debts.findIndex(x => x.id === d.id), linked = /^(loan|deposit):/.test(d.id); return <PlanEntry key={d.id} id={d.id} title={d.name} description={'잔액 '+won(d.balance)} open={params.get('focus')===d.id} onToggle={()=>toggleEntry(d.id)}><div className="section-title"><h2>{d.name}</h2>{d.assetId&&<Link to={'/assets/'+encodeURIComponent(d.assetId)}>원본 자산·부채 수정 →</Link>}{index >= 0 && <button className="secondary" onClick={() => remove('debts', index)}>{linked?'계획 조건 제거':'삭제'}</button>}</div><div className="form-grid"><Txt label="이름" value={d.name} onChange={v => patch({ name: v })}/><Pick label="부채 구분" value={d.kind} options={{ loan: '대출', deposit: '받은 보증금' }} onChange={v => patch({ kind: v })}/>{linked ? <p>원본 연결 잔액 {won(data.snapshot.debts.find(x => x.id === d.id)?.balance ?? d.balance)}</p> : <Num label="기준일 잔액 (원, 미래 실행은 0 + 사건 등록)" value={d.balance} onChange={v => patch({ balance: v ?? 0 })}/>}<Pick label="연결 자산" value={d.assetId} options={assets} onChange={v => patch({ assetId: v })}/><Pick label="귀속인" value={d.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/>{d.kind === 'loan' && <><Num label="연 이율 (%)" value={d.interestRate} onChange={v => patch({ interestRate: v })}/><Pick label="상환 방식 (매월 말)" value={d.repayment} options={{ interestOnly: '이자만 납부 · 만기 원금', equalPrincipal: '매월 고정 원금 + 이자', annuity: '입력한 원리금 정액' }} onChange={v => patch({ repayment: v })}/>{d.repayment !== 'interestOnly' && <Num label="월 원금 / 원리금 약정액 (원)" value={d.monthlyPayment} onChange={v => patch({ monthlyPayment: v })}/>}</>}</div><Check label="변동 금리 (대안의 금리 변화 적용)" value={d.variableRate} onChange={v => patch({ variableRate: v })}/><DateEditor label="만기 / 보증금 반환일" value={d.maturity ?? fixedDate('')} onChange={v => patch({ maturity: v })} plan={plan}/></PlanEntry>; })}</>}
    {tab === 'scenarios' && <><section className="panel"><h2>대안 가정</h2><p>실제 보유 수량·가격을 변경하지 않습니다. 분석 비교는 같은 출발 잔액과 계획을 사용합니다.</p><button onClick={() => update({ scenarios: [...plan.scenarios, scenarioSchema.parse({ id: uid(), name: '새 대안' })] })}>대안 추가</button></section>{plan.scenarios.map((s, i) => { const patch = (v: any) => change('scenarios', i, v); return <PlanEntry key={s.id} id={s.id} title={s.name} description={'기본안과 비교할 조건'} open={params.get('focus')===s.id} onToggle={()=>toggleEntry(s.id)}><div className="section-title"><h2>{s.name}</h2><button className="secondary" onClick={() => remove('scenarios', i)}>삭제</button></div><div className="form-grid"><Txt label="이름" value={s.name} onChange={v => patch({ name: v })}/><Num label="생활비 증감 (%)" value={s.expensePercent} onChange={v => patch({ expensePercent: v ?? 0 })}/><Num label="시작 시 시장가 자산 (주식·ETF, IRP 포함) 가격 충격 (%)" value={s.marketShock} onChange={v => patch({ marketShock: v ?? 0 })}/><Num label="임대료 증감 (%)" value={s.rentPercent} onChange={v => patch({ rentPercent: v ?? 0 })}/><Num label="변동 대출금리 변화 (%p)" value={s.ratePoints} onChange={v => patch({ ratePoints: v ?? 0 })}/><Num label="은퇴일 이동 (개월)" value={s.retirementOffset} onChange={v => patch({ retirementOffset: v ?? 0 })}/>{plan.events.filter(e => e.status === 'planned').map(e => <Num key={e.id} label={e.name + ' 이동 (개월)'} value={s.eventShifts[e.id] ?? 0} onChange={v => patch({ eventShifts: { ...s.eventShifts, [e.id]: v ?? 0 } })}/>)}</div></PlanEntry>; })}</>}
  </Shell>;
}
