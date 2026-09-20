import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import MigrationReview from './MigrationReview';
import PlanStart from './PlanStart';
import PlanEntry from './PlanEntry';
import BulkPolicy from './BulkPolicy';
import './review.css';
import CurrentOverview from './CurrentOverview';
import FundingEditor from './FundingEditor';
import { stockAccounts, stockAccountUrl, safeAssetReturn } from './accounts';
import AssetDetail from '@/components/assets/AssetDetail';
import { useAssets } from '@/hooks/useAssets';
import { liveQuery } from 'dexie';
import { db } from '@/lib/db';
import { usePlanner, useSavedRun } from './context';
import { ENGINE_VERSION, RULE_VERSION, assetPensionAmount, availability, blankPlan, debtSchema, defaultPolicy, eventSchema, fixedDate, flowSchema, scenarioSchema, type DateSpec, type PlannerPlan } from './model';
import { baseScenario, selectYears, simulate } from './engine';
import { assetFlowPreview, calculateAndSave, clearDraft, legacyPreview, readDraft, saveDraft, savePlan, type SavedRun } from './storage';
import './planner.css';
const won = (v: number) => Math.round(v).toLocaleString('ko-KR') + '원';
const uid = () => crypto.randomUUID();
const roleLabels: Record<string, string> = { cash: '생활 현금', investment: '투자 계좌/종목', pension: '인출형 연금 계좌', entitlement: '공적/계약 연금 수급권', property: '부동산', deposit: '예치금·지급한 보증금', other: '기타 자산', excluded: '합산 제외' };
const flowLabels: Record<string, string> = { income: '근로·사업·기타 소득', pension: '외부 연금 수령', rent: '임대 수입', expense: '생활·의료·여행비', withdrawal: '계좌 연금/투자 인출', tax: '예상 세금 납부', insurance: '보험료', transfer: '계좌 간 이전·적립' };
const eventLabels: Record<string, string> = { completion: '준공', approval: '사용승인', move: '입주', valuation: '평가액 변경', inflow: '목돈 유입', expense: '일회성 지출·분담금', sale: '매각', borrow: '대출 실행', repay: '대출 상환', depositReceived: '보증금 수령', depositReturned: '보증금 반환', depositPaid: '보증금 지급', depositRecovered: '보증금 회수', transfer: '현금 → 자산 이전', taxSettlement: '연간 세금 정산' };
const coverageLabels: Record<string, string> = { assets: '보유 자산', income: '정기 수입', expenses: '생활비', taxes: '세금', insurance: '보험료' };
const textError = (e: unknown) => e instanceof Error ? e.message : String(e);
export function Shell({ title, children, subtitle }: {
    title: string;
    children: ReactNode;
    subtitle?: string;
}) {
    return <div className="planner"><header className="planner-heading"><div><p className="eyebrow">MY ASSET · 현재와 미래</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><Link className="button secondary" to="/settings">설정·백업</Link></header>{children}</div>;
}
function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Num({ label, value, onChange }: {
    label: string;
    value: number | null | undefined;
    onChange: (v: number | null) => void;
}) { return <Field label={label}><input type="number" step="any" value={value ?? ''} placeholder="미입력" onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}/></Field>; }
function Txt({ label, value, onChange, type = 'text' }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
}) { return <Field label={label}><input type={type} value={value} onChange={e => onChange(e.target.value)}/></Field>; }
function Pick({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: Record<string, string>;
    onChange: (v: string) => void;
}) { return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(options).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
function Check({ label, value, onChange }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) { return <label className="check"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}/>{label}</label>; }
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
function Loading() { const { error } = usePlanner(); return <p role={error ? 'alert' : 'status'}>{error || '저장된 자산과 계획을 읽고 있습니다…'}</p>; }
export function PlannerHome() {
    const { data } = usePlanner(), { record } = useSavedRun(data?.activeRunId ?? null);
    if (!data)
        return <Shell title="내 자산과 은퇴 준비"><Loading /></Shell>;
    const snapshot = data.current, total = snapshot.positions.reduce((s, p) => s + p.balance, 0), debt = snapshot.debts.reduce((s, d) => s + d.balance, 0);
    const stale = record && (record.snapshot.assetRevision !== snapshot.assetRevision || record.snapshot.plan.revision !== data.plan.revision || record.run.engineVersion !== ENGINE_VERSION || record.run.ruleVersion !== RULE_VERSION);
    return <Shell title="내 자산과 은퇴 준비" subtitle="평소에는 자산 확인과 시세 갱신만 하세요. 은퇴계획은 나중에 시작해도 됩니다.">
    <section className="panel"><h2>현재 자산</h2><div className="actions primary-task"><Link className="button" to="/assets?type=STOCK">주식 계좌 확인·시세 갱신 →</Link><Link to="/assets?type=ALL">전체 자산 보기 →</Link></div><div className="kpis"><Link to="/assets?type=ALL"><small>총 자산</small><strong>{won(total)}</strong></Link><Link to="/assets?type=REAL_ESTATE"><small>부채 · 대출 + 받은 보증금</small><strong>{won(debt)}</strong></Link><Link to="/assets?type=ALL"><small>입력 기준 순자산</small><strong>{won(total - debt)}</strong></Link></div><p className="muted">평가액은 마지막 저장 값입니다. 수급권·동일 잔액 연결·합산 제외는 중복 합산하지 않습니다.</p>{snapshot.issues.length > 0 && <details className="compact-audit"><summary>합계는 잠정치 · 분류·기준일 확인 {snapshot.issues.length}건</summary><p>중복 연결 등 합산 기준을 확인하면 더 정확한 합계를 볼 수 있습니다.</p><Link to="/plan?tab=policies">합산 분류 확인 →</Link></details>}</section>
    {!snapshot.positions.length && <section className="panel"><h2>먼저 현재 자산을 등록하세요</h2><p>가상 자산이나 배우자가 자동으로 추가되지 않습니다. 자산 관리만 사용해도 됩니다.</p><Link className="button" to="/assets?type=ALL">자산 등록으로 이동</Link></section>}
    <section className="panel"><h2>자산 관리</h2><div className="actions"><Link to="/assets?type=REAL_ESTATE">부동산</Link><Link to="/assets?type=PENSION">연금</Link><Link to="/assets?type=SAVINGS">예적금</Link><Link to="/history">자산 변동 이력</Link></div></section>
    <section className="panel"><h2>은퇴 분석</h2><p>등록한 자산·연금·생활비를 연결해 결과를 바로 확인합니다.</p><div className="actions"><Link className="button" to="/analysis">기존 입력으로 분석 보기 →</Link><Link to="/analysis?tab=prep">생활비·목돈 수정 →</Link></div><details><summary>고급 · 별도 월별 계획과 저장 분석</summary><Link to="/plan">월별 계획 편집 →</Link>{record&&<p><Link to={'/analysis?run='+record.id}>저장한 월별 분석 보기 →</Link>{stale&&' · 현재 입력과 다른 조건의 저장 결과'}</p>}</details></section>
  </Shell>;
}
const draftKey = () => { let id = sessionStorage.getItem('planner-tab'); if (!id) {
    id = uid();
    sessionStorage.setItem('planner-tab', id);
} return id; };
export function CurrentAssetsOverview() {
    const { data } = usePlanner();
    if (!data)
        return <Shell title="현재 자산"><Loading /></Shell>;
    return <Shell title="현재 자산 전체" subtitle="유형별 요약 → 계좌 → 종목 상세. 현재 합계와 원본 기록을 같은 기준으로 확인합니다."><CurrentOverview snapshot={data.current}/></Shell>;
}
export function AssetInspect() {
    const [params] = useSearchParams();
    const { assetId } = useParams(), { data: assets, isLoading, error } = useAssets(), asset = assets?.find(a => a.id === assetId);
    const group = stockAccounts(assets ?? []).find(g=>g.assets.some(a=>a.id===assetId));
    const back = safeAssetReturn(params.get('returnTo'), group ? stockAccountUrl(group.id) : '/assets?type=' + (asset?.type ?? 'ALL'));
    return <Shell title={asset?.name ?? '자산 상세'}><Link to={back}>← 유형별 관리</Link>{isLoading ? <p>불러오는 중…</p> : error ? <p role="alert">{String(error)}</p> : asset ? <section className="panel"><Link to={'/plan?tab=policies&focus=' + encodeURIComponent(asset.id) + '&returnTo=' + encodeURIComponent(group ? back + '&asset=' + encodeURIComponent(asset.id) : back)}>이 자산의 계획 연결 →</Link>{asset.type==='PENSION'&&<Link to={'/plan?tab=flows&asset='+encodeURIComponent(asset.id)+'&returnTo='+encodeURIComponent(back)}>이 연금의 지급 계획 연결 →</Link>}<AssetDetail asset={asset}/></section> : <p>삭제되었거나 존재하지 않는 자산입니다. 저장된 분석의 당시 원본은 분석 화면에서 확인하세요.</p>}</Shell>;
}
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
    const assets = { '': '연결 없음', ...Object.fromEntries(data.snapshot.positions.map(p => [p.assetId, p.name])) }, owners = Object.fromEntries(plan.people.map(p => [p.id, p.name]));
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
    const policyList = data.snapshot.positions.map(p => plan.policies.find(x => x.assetId === p.assetId) ?? defaultPolicy(p.source));
    const accountGroups = stockAccounts(data.snapshot.positions.map(p=>p.source));
    const policySearch = params.get('q') ?? '', policyGroup = params.get('group') ?? '', focusedPolicy = params.get('focus');
    const groupOf = (id: string) => { const p=data.snapshot.positions.find(p=>p.assetId===id);const g=accountGroups.find(g=>g.assets.some(a=>a.id===id));return g?'account:'+g.id:'type:'+(p?.source.type??''); };
    const policyGroups = [...accountGroups.map(g=>({id:'account:'+g.id,name:'주식 · '+g.name,count:g.assets.length})), ...['REAL_ESTATE','PENSION','SAVINGS','PHYSICAL','ETC'].map(type=>({id:'type:'+type,name:({REAL_ESTATE:'부동산',PENSION:'연금',SAVINGS:'예적금',PHYSICAL:'실물',ETC:'기타'} as Record<string,string>)[type],count:data.snapshot.positions.filter(p=>p.source.type===type).length})).filter(g=>g.count)];
    const visiblePolicyList = policyList.filter(p=> focusedPolicy ? p.assetId===focusedPolicy : (policyGroup||policySearch||params.has('unconfirmed')) && (!policyGroup||groupOf(p.assetId)===policyGroup) && (!params.has('unconfirmed')||!p.confirmed) && data.snapshot.positions.find(x=>x.assetId===p.assetId)!.name.toLowerCase().includes(policySearch.toLowerCase()));
    const policyNav=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);next.set('tab','policies');for(const [key,value] of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key)}setParams(next);};
    const policyChange = (assetId: string, patch: any) => update({ policies: [...plan.policies.filter(p=>!policyList.some(x=>x.assetId===p.assetId)),...policyList.map(p => p.assetId === assetId ? { ...p, ...patch } : p)] });
    const debtOptions = { '': '부채 선택', ...Object.fromEntries(data.snapshot.debts.map(d => [d.id, d.name])) };
    const nav = { household: '1. 은퇴 시점', flows: '2. 생활비·수입', review: '3. 분석 전 확인' };
    const advancedNav = { policies: '자산 연결', events: '일정·목돈', debts: '부채·보증금', scenarios: '대안' };
    return <Shell title="나의 계획" subtitle="현재 자산은 그대로 두고, 은퇴 후 생활을 따로 계획합니다.">
    {tab==='start' && <PlanStart plan={plan} hasLegacy={data.hasLegacy} onOpen={openTab}/>}
    <div className={tab==='start'?'':'sticky-tools'}>
      {tab !== 'start' && <><button className="secondary" onClick={() => openTab('start')}>← 계획 시작 화면</button><nav className="step-nav" aria-label="계획 입력 구분">{Object.entries(nav).map(([id,name]) => <button className="secondary" key={id} aria-current={tab===id?'page':undefined} onClick={()=>openTab(id)}>{name}</button>)}</nav></>}
      <details className="advanced-nav" open={Object.keys(advancedNav).includes(tab)} key={Object.keys(advancedNav).includes(tab)?'advanced':'basic'}><summary>상세 설정 · 자산 연결, 일정, 부채, 대안</summary><div className="actions">{Object.entries(advancedNav).map(([id,name])=><button className="secondary" key={id} aria-current={tab===id?'page':undefined} onClick={()=>openTab(id)}>{name}</button>)}</div></details>
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
    {tab==='review' && <><section className="panel"><h2>분석 전, 빠진 조건만 확인하세요</h2><p>저장 후 분석하면 미확정 항목과 계산 근거를 볼 수 있습니다. 빈칸을 0원으로 확정하지 않습니다.</p><div className="actions"><button className="secondary" onClick={()=>openTab('policies')}>자산 연결·인출 조건 확인</button><button className="secondary" onClick={()=>openTab('events')}>목돈·{availability(data.snapshot).rebuild?'재건축 일정':'일정'} 확인</button><button className="secondary" onClick={()=>openTab('debts')}>대출·보증금 확인</button></div></section>      <section className="panel"><h2>입력 범위 확인</h2><div className="form-grid">{Object.entries(coverageLabels).map(([key, label]) => <Pick key={key} label={label} value={(plan.coverage as any)[key]} options={{ unknown: '아직 확인하지 않음', confirmedNone: '해당 없음 / 0임을 확인', provided: '관련 항목을 입력함' }} onChange={v => update({ coverage: { ...plan.coverage, [key]: v } })}/>)}</div><p className="muted">세금·보험료의 ‘없음’은 전체 계획 기간에 대한 사용자 가정입니다. 법적 면세 판정이 아닙니다.</p></section><MigrationReview/><div className="step-footer"><button disabled={busy} onClick={()=>void save(true)}>저장 후 분석</button></div></>}
    {tab === 'policies' && <><p className="notice">원본 금액·주식 수량은 자산 화면에서 관리합니다. 여기서는 분석 용도와 동일 잔액 연결만 지정합니다. 공동 명의 세금은 개인별 예상 납부 항목으로 나누어 입력하세요.</p><section className="panel policy-tools"><h2>계좌·유형별 연결 검토</h2><div className="form-grid"><Txt label="자산 이름 검색" value={policySearch} onChange={v=>policyNav({q:v,focus:''})}/><Check label="미확인 항목만" value={params.has('unconfirmed')} onChange={v=>policyNav({unconfirmed:v?'1':'',focus:''})}/></div><div className="actions"><button className="secondary" onClick={()=>policyNav({group:'',q:'',focus:'',unconfirmed:''})}>그룹 목록</button>{focusedPolicy&&<button className="secondary" onClick={()=>policyNav({group:groupOf(focusedPolicy),focus:''})}>이 계좌·유형 목록</button>}</div><div className="policy-group-list">{policyGroups.map(g=><button key={g.id} className="secondary" aria-pressed={policyGroup===g.id} onClick={()=>policyNav({group:g.id,focus:'',q:''})}>{g.name} · {g.count}개</button>)}</div><p className="muted">선택한 항목의 설정만 펼칩니다. 분류·세율·명의는 확인 없이 확정하지 않습니다.</p></section>{policyGroup&&!focusedPolicy&&<BulkPolicy policies={visiblePolicyList} onApply={next=>update({policies:[...plan.policies.filter(p=>!policyList.some(x=>x.assetId===p.assetId)),...policyList.map(p=>next.find(n=>n.assetId===p.assetId)??p)]})}/>} {visiblePolicyList.map(p => { const source = data.snapshot.positions.find(x => x.assetId === p.assetId)!; const patch = (v: any) => policyChange(p.assetId, v); return <section id={'source-' + p.assetId} className="panel policy-editor" key={p.assetId}><button className="secondary policy-row" aria-expanded={focusedPolicy===p.assetId} onClick={()=>policyNav({focus:focusedPolicy===p.assetId?'':p.assetId})}>{source.name} · {p.confirmed?'확인 완료':'미확인'} · {focusedPolicy===p.assetId?'접기':'설정 열기'}</button>{focusedPolicy===p.assetId&&<><div className="section-title"><h2>{source.name}</h2><Link to={`/assets/${encodeURIComponent(p.assetId)}`}>보유 상세 →</Link></div><p>원본 평가액 {won(source.source.currentValue)}</p><div className="form-grid"><Pick label="분석 분류" value={p.role} options={roleLabels} onChange={v => patch({ role: v })}/><Pick label="분석 귀속인" value={p.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/><Pick label="동일 잔액의 원본 자산 (중복 합산 제외)" value={p.linkedTo ?? ''} options={Object.fromEntries(Object.entries(assets).filter(([id]) => id !== p.assetId))} onChange={v => patch({ linkedTo: v || undefined })}/>{['investment', 'pension'].includes(p.role) && <><Num label="가격 상승률 (배당 제외, 연 %)" value={p.annualGrowth} onChange={v => patch({ annualGrowth: v })}/><Num label="배당률 (연 %, 없는 경우 0)" value={p.dividendYield} onChange={v => patch({ dividendYield: v })}/><Num label="배당 원천징수 가정 (%)" value={p.dividendWithholding} onChange={v => patch({ dividendWithholding: v })}/></>}{p.role === 'property' && <><Pick label="현재 부동산 상태" value={p.propertyState} options={{ home: '보유·거주', rented: '임대 중', construction: '공사·재건축 중', right: '입주권 등 권리', land: '토지' }} onChange={v => patch({ propertyState: v })}/><Num label="공시가격 (시가와 별도)" value={p.officialValue} onChange={v => patch({ officialValue: v })}/><Num label="사용자 확인 과세표준" value={p.assessedValue} onChange={v => patch({ assessedValue: v })}/><Txt label="가격 근거 기준일" type="date" value={p.valuationDate} onChange={v => patch({ valuationDate: v })}/></>}</div>{['investment', 'pension'].includes(p.role) && <><Check label="현금 부족 시 이 계좌의 인출 허용 (목록 순서, 잔액 한도)" value={p.allowWithdrawal} onChange={v => patch({ allowWithdrawal: v })}/><Num label="현금 부족 시 자동 인출 원천징수율 (%, 없으면 0)" value={p.withdrawalWithholding} onChange={v => patch({ withdrawalWithholding: v })}/><Check label="세후 배당 재투자" value={p.reinvestDividends} onChange={v => patch({ reinvestDividends: v })}/></>}<Check label="분류·중복 연결·수익 가정을 확인했습니다" value={p.confirmed} onChange={v => patch({ confirmed: v })}/>{p.role === 'property' && <Link to={`/plan?tab=events&asset=${p.assetId}`}>이 자산의 일정 추가 →</Link>}</>}</section>; })}{!policyList.length && <Link to="/assets">자산을 먼저 등록하세요 →</Link>}</>}
    {tab === 'flows' && <><section className="panel"><h2>반복 입출금과 적용 기간</h2><button className="secondary" onClick={() => { const preview = assetFlowPreview(plan, data.snapshot, params.get('asset') || undefined); if (!preview.names.length) {
        setMessage("연결할 등록 연금 지급액이 없거나 이미 연결했습니다.");
        return;
    } if (window.confirm(preview.names.join("\\n") + "\\n원본 월 지급액과 연결한 초안을 만들까요? 개시/종료 월과 원천징수율은 확인이 필요합니다."))
        update({ flows: preview.plan.flows }); if(params.get('asset')){const next=new URLSearchParams(params);next.set('focus','asset-payout:'+params.get('asset'));setParams(next);} }}>자산에 등록한 연금 지급액 연결</button><p>국민연금 등 외부 수급은 ‘외부 연금’, IRP·연금저축 잔액 사용은 ‘계좌 인출’입니다. 임대료는 임대 시작 사건과 연결하세요. 세금은 확인한 예상 납부액이며 자동 세법 계산이 아닙니다.</p><button onClick={() => update({ flows: [...plan.flows, flowSchema.parse({ id: uid(), name: '새 입출금', kind: 'expense', amount: null, start: fixedDate(plan.asOfDate), frequency: 'monthly' })] })}>입출금 추가</button></section>{plan.flows.map((f, i) => { const patch = (v: any) => change('flows', i, v); return <PlanEntry key={f.id} id={f.id} title={f.name} description={(f.amountSource ? '등록 지급액 연동' : f.amount===null?'금액 미입력':won(f.amount))+' · '+(f.confirmed?'확인 완료':'확인 필요')} open={params.get('focus')===f.id} onToggle={()=>toggleEntry(f.id)}><div className="section-title"><h2>{f.name}</h2><button className="secondary" onClick={() => remove('flows', i)}>삭제</button></div><div className="form-grid"><Txt label="항목 이름" value={f.name} onChange={v => patch({ name: v })}/><Pick label="유형" value={f.kind} options={flowLabels} onChange={v => patch({ kind: v, withdrawalAssetIds: v==='withdrawal'?f.withdrawalAssetIds:undefined, withdrawalAccountAssetId: v==='withdrawal'?f.withdrawalAccountAssetId:undefined, confirmed:false })}/>{f.amountSource ? <p>원본 자산 연동액: {assetPensionAmount(data.snapshot.positions.find(p => p.assetId === f.assetId)?.source) === null ? "미확정" : won(assetPensionAmount(data.snapshot.positions.find(p => p.assetId === f.assetId)?.source)!)} / 월</p> : <Num label="1회 지급/수령액 (원)" value={f.amount} onChange={v => patch({ amount: v })}/>}<Pick label="주기" value={f.frequency} options={{ monthly: '매월', annual: '매년 (별도 납부월 또는 시작월)', once: '한 번 (시작일)' }} onChange={v => patch({ frequency: v })}/>{f.frequency==='annual'&&<Num label="매년 지급/납부월 (1–12, 비우면 시작월 연동)" value={f.paymentMonth} onChange={v=>patch({paymentMonth:v??undefined})}/>}<Num label="지급일 (1–31, 없는 날은 말일)" value={f.paymentDay} onChange={v => patch({ paymentDay: v ?? 31 })}/><Pick label="귀속인" value={f.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/><Pick label={f.amountSource ? "등록 지급액의 원천 자산" : "관련 자산 / 기본 출금 원천"} value={f.assetId} options={assets} onChange={v => patch({ assetId: v, withdrawalAssetIds: undefined, withdrawalAccountAssetId: undefined, confirmed: false })}/>{f.kind === 'transfer' && <Pick label="입금 계좌" value={f.targetId} options={assets} onChange={v => patch({ targetId: v })}/>}<Num label="금액 증가율 (연 %, 물가와 별도 적용)" value={f.growth} onChange={v => patch({ growth: v ?? 0 })}/>{['income', 'pension', 'rent', 'withdrawal'].includes(f.kind) && <Num label="원천징수 가정 (%, 세후 금액이면 0)" value={f.withholding} onChange={v => patch({ withholding: v })}/>}</div>{f.kind==='withdrawal'&&<FundingEditor flow={f} snapshot={data.snapshot} policies={plan.policies} onChange={patch}/>} {['pension', 'withdrawal'].includes(f.kind) && <Check label="원본 자산의 등록 월 지급액과 계속 연동" value={!!f.amountSource} onChange={v => patch({ amountSource: v ? 'assetPension' : undefined })}/>}<DateEditor label="시작" value={f.start} onChange={v => patch({ start: v })} plan={plan}/><Check label="별도 종료일 지정" value={!!f.end} onChange={v => patch({ end: v ? fixedDate(plan.endDate) : null })}/>{f.end && <DateEditor label="종료 (포함)" value={f.end} onChange={v => patch({ end: v })} plan={plan}/>}<Check label="귀속인의 은퇴일부터 중단" value={f.endsAtRetirement} onChange={v => patch({ endsAtRetirement: v })}/><div className="form-grid">{['tax', 'insurance'].includes(f.kind) && <Txt label="적용 범위 식별자 (같은 세목·자산·귀속인·납부차수에는 같은 값)" value={f.scope} onChange={v => patch({ scope: v })}/>}<Txt label="근거·가정 메모 (예: 확인한 추정세액, 기준연도)" value={f.basis} onChange={v => patch({ basis: v })}/></div><Check label="금액과 적용 기간을 확인했습니다" value={f.confirmed} onChange={v => patch({ confirmed: v })}/></PlanEntry>; })}<div className="step-footer"><button onClick={()=>openTab('review')}>다음: 분석 전 확인 →</button></div></>}
    {tab === 'events' && <><section className="panel"><h2>날짜별 사건</h2><p>금액 변경은 평가, 현금 유입은 목돈/매각으로 구분합니다. 준공만으로 세금·임대료를 자동 생성하지 않습니다. 연결한 일정만 대안에서 함께 이동합니다.</p><button onClick={() => update({ events: [...plan.events, eventSchema.parse({ id: uid(), name: '새 일정', kind: 'inflow', assetId: params.get('asset') || '', at: fixedDate('') })] })}>일정 추가</button></section>{plan.events.map((e, i) => { const patch = (v: any) => change('events', i, v), debtTarget = ['borrow', 'repay', 'depositReceived', 'depositReturned'].includes(e.kind); return <PlanEntry key={e.id} id={e.id} title={e.name} description={eventLabels[e.kind]+' · '+(e.at.value||'날짜 미입력')} open={params.get('focus')===e.id} onToggle={()=>toggleEntry(e.id)}><div className="section-title"><h2>{e.name}</h2><button className="secondary" onClick={() => remove('events', i)}>삭제</button></div><div className="form-grid"><Txt label="일정 이름" value={e.name} onChange={v => patch({ name: v })}/><Pick label="유형" value={e.kind} options={Object.fromEntries(Object.entries(eventLabels).filter(([k]) => availability(data.snapshot).property || !['completion', 'approval', 'move', 'sale'].includes(k)))} onChange={v => patch({ kind: v })}/><Pick label="관련 자산" value={e.assetId} options={assets} onChange={v => patch({ assetId: v })}/><Pick label="귀속인" value={e.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/>{!['completion', 'approval', 'move'].includes(e.kind) && <Num label="금액 (원, 평가는 변경 후 총액)" value={e.amount} onChange={v => patch({ amount: v })}/>}<Pick label="상태" value={e.status} options={{ planned: '예정', actual: '실제 발생 확인', cancelled: '취소' }} onChange={v => patch({ status: v })}/>{debtTarget && <Pick label="연결 부채" value={e.targetId} options={debtOptions} onChange={v => patch({ targetId: v })}/>} {['transfer', 'depositPaid'].includes(e.kind) && <Pick label="입금/보증금 자산" value={e.targetId} options={assets} onChange={v => patch({ targetId: v })}/>}</div><DateEditor label="예정 일정" value={e.at} onChange={v => patch({ at: v })} plan={plan} exclude={e.id}/>{e.status === 'actual' && <Txt label="실제 발생일 (대안에서 이동하지 않음)" type="date" value={e.actualDate} onChange={v => patch({ actualDate: v })}/>}<Txt label="근거·메모" value={e.basis} onChange={v => patch({ basis: v })}/>{e.kind === 'sale' && <fieldset><legend>매각 시 정산할 부채</legend>{data.snapshot.debts.map(d => <Check key={d.id} label={d.name} value={e.settleDebtIds.includes(d.id)} onChange={v => patch({ settleDebtIds: v ? [...e.settleDebtIds, d.id] : e.settleDebtIds.filter(id => id !== d.id) })}/>)}</fieldset>}{e.kind === 'taxSettlement' && <><Num label="소득 귀속연도" value={e.taxYear} onChange={v => patch({ taxYear: v })}/><p className="muted">금액에는 기납부 공제 전 확정/예상 연간 총세액을 입력합니다. 아래 지급원에서 이미 낸 원천세를 한 번만 공제합니다.</p>{plan.flows.filter(f => ['income', 'pension', 'rent', 'withdrawal'].includes(f.kind)).map(f => <Check key={f.id} label={f.name + ' 원천세 공제'} value={e.creditSourceIds.includes(f.id)} onChange={v => patch({ creditSourceIds: v ? [...e.creditSourceIds, f.id] : e.creditSourceIds.filter(id => id !== f.id) })}/>)}</>}</PlanEntry>; })}</>}
    {tab === 'debts' && <><section className="panel"><h2>대출·받은 보증금</h2><p>부동산에 등록한 대출·받은 보증금은 그대로 불러옵니다. 연결 부채의 현재 잔액은 원본 자산에서 수정하세요. 지급한 보증금은 자산으로 관리합니다.</p><button onClick={() => update({ debts: [...plan.debts, debtSchema.parse({ id: uid(), name: '새 부채', kind: 'loan', balance: 0, repayment: 'interestOnly' })] })}>부채 추가</button></section>{[...data.snapshot.debts.filter(d => !plan.debts.some(x => x.id === d.id)), ...plan.debts].map(d => { const patch = (v: any) => update({ debts: [...plan.debts.filter(x => x.id !== d.id), { ...d, ...v }] }), index = plan.debts.findIndex(x => x.id === d.id), linked = /^(loan|deposit):/.test(d.id); return <PlanEntry key={d.id} id={d.id} title={d.name} description={'잔액 '+won(d.balance)} open={params.get('focus')===d.id} onToggle={()=>toggleEntry(d.id)}><div className="section-title"><h2>{d.name}</h2>{d.assetId&&<Link to={'/assets/'+encodeURIComponent(d.assetId)}>원본 자산·부채 수정 →</Link>}{index >= 0 && <button className="secondary" onClick={() => remove('debts', index)}>{linked?'계획 조건 제거':'삭제'}</button>}</div><div className="form-grid"><Txt label="이름" value={d.name} onChange={v => patch({ name: v })}/><Pick label="부채 구분" value={d.kind} options={{ loan: '대출', deposit: '받은 보증금' }} onChange={v => patch({ kind: v })}/>{linked ? <p>원본 연결 잔액 {won(data.snapshot.debts.find(x => x.id === d.id)?.balance ?? d.balance)}</p> : <Num label="기준일 잔액 (원, 미래 실행은 0 + 사건 등록)" value={d.balance} onChange={v => patch({ balance: v ?? 0 })}/>}<Pick label="연결 자산" value={d.assetId} options={assets} onChange={v => patch({ assetId: v })}/><Pick label="귀속인" value={d.ownerId} options={owners} onChange={v => patch({ ownerId: v })}/>{d.kind === 'loan' && <><Num label="연 이율 (%)" value={d.interestRate} onChange={v => patch({ interestRate: v })}/><Pick label="상환 방식 (매월 말)" value={d.repayment} options={{ interestOnly: '이자만 납부 · 만기 원금', equalPrincipal: '매월 고정 원금 + 이자', annuity: '입력한 원리금 정액' }} onChange={v => patch({ repayment: v })}/>{d.repayment !== 'interestOnly' && <Num label="월 원금 / 원리금 약정액 (원)" value={d.monthlyPayment} onChange={v => patch({ monthlyPayment: v })}/>}</>}</div><Check label="변동 금리 (대안의 금리 변화 적용)" value={d.variableRate} onChange={v => patch({ variableRate: v })}/><DateEditor label="만기 / 보증금 반환일" value={d.maturity ?? fixedDate('')} onChange={v => patch({ maturity: v })} plan={plan}/></PlanEntry>; })}</>}
    {tab === 'scenarios' && <><section className="panel"><h2>대안 가정</h2><p>실제 보유 수량·가격을 변경하지 않습니다. 분석 비교는 같은 출발 잔액과 계획을 사용합니다.</p><button onClick={() => update({ scenarios: [...plan.scenarios, scenarioSchema.parse({ id: uid(), name: '새 대안' })] })}>대안 추가</button></section>{plan.scenarios.map((s, i) => { const patch = (v: any) => change('scenarios', i, v); return <PlanEntry key={s.id} id={s.id} title={s.name} description={'기본안과 비교할 조건'} open={params.get('focus')===s.id} onToggle={()=>toggleEntry(s.id)}><div className="section-title"><h2>{s.name}</h2><button className="secondary" onClick={() => remove('scenarios', i)}>삭제</button></div><div className="form-grid"><Txt label="이름" value={s.name} onChange={v => patch({ name: v })}/><Num label="생활비 증감 (%)" value={s.expensePercent} onChange={v => patch({ expensePercent: v ?? 0 })}/><Num label="시작 시 투자자산 가격 충격 (%)" value={s.marketShock} onChange={v => patch({ marketShock: v ?? 0 })}/><Num label="임대료 증감 (%)" value={s.rentPercent} onChange={v => patch({ rentPercent: v ?? 0 })}/><Num label="변동 대출금리 변화 (%p)" value={s.ratePoints} onChange={v => patch({ ratePoints: v ?? 0 })}/><Num label="은퇴일 이동 (개월)" value={s.retirementOffset} onChange={v => patch({ retirementOffset: v ?? 0 })}/>{plan.events.filter(e => e.status === 'planned').map(e => <Num key={e.id} label={e.name + ' 이동 (개월)'} value={s.eventShifts[e.id] ?? 0} onChange={v => patch({ eventShifts: { ...s.eventShifts, [e.id]: v ?? 0 } })}/>)}</div></PlanEntry>; })}</>}
  </Shell>;
}
function exportCsv(record: SavedRun, month: string) {
    const safe = (v: unknown) => {const raw=String(v??'');const value=typeof v==='number'?raw:/^[\\s=+@-]/.test(raw)?"'"+raw:raw;return '"'+value.replace(/"/g,'""')+'"'};
    const rows = [['runId', '기준일', '일자', '이름', '원천ID', '귀속인', '요청원', '지급원', '부족원', '현금증감원', '근거'], ...record.run.months.filter(m => !month || m.month === month).flatMap(m => m.entries.map(e => [record.id, record.snapshot.plan.asOfDate, e.date, e.name, e.sourceId, e.ownerId, e.requested, e.paid, e.shortfall, e.cashDelta, e.formula]))];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url;
    a.download = `myasset-${record.id}-${month || 'all'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SourceEvidence({ record, sourceId }: {
    record: SavedRun;
    sourceId: string;
}) {
    const flow = record.snapshot.plan.flows.find(f => f.id === sourceId), event = record.snapshot.plan.events.find(e => e.id === sourceId);
    if (flow?.amountSource) {
        const amount = assetPensionAmount(record.snapshot.positions.find(p => p.assetId === flow.assetId)?.source);
        return <p className="muted">계산 당시 원본 자산의 월 지급액 {amount === null ? '미확정' : won(amount)}을 사용했습니다. 원본 변경은 새 분석부터 반영됩니다.</p>;
    }
    if (flow)
        return <div className="muted"><p>당시 입력 {flow.amount === null ? '미확정' : won(flow.amount)} · 연 증가율 {flow.growth}% · 원천징수 {flow.withholding === null ? '미확정' : flow.withholding + '%'}</p><p>적용 범위 {flow.scope || '일반 입출금'} · 근거 {flow.basis || '사용자 계획 입력 (별도 근거 없음)'}</p></div>;
    if (event)
        return <p className="muted">당시 사건 {eventLabels[event.kind]} · {event.status === 'actual' ? '실제 발생 확인' : '계획 가정'} · 근거 {event.basis || '사용자 일정 입력'}</p>;
    return null;
}
function CashTrend({ record }: {
    record: SavedRun;
}) {
    const months = record.run.months, max = Math.max(1, ...months.map(m => m.closingCash));
    if (!months.length)
        return null;
    const points = months.map((m, i) => [10 + i * 980 / Math.max(1, months.length - 1), 135 - m.closingCash / max * 120]);
    const path = points.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2)).join(' ');
    return <div className="cash-trend"><svg viewBox="0 0 1000 155" role="img" aria-label={'명목 월말 현금 추세, ' + months[0].month + '부터 ' + months[months.length - 1].month + '까지. 최고 ' + won(max) + '. 빨간 점은 요청 미충족 월.'}><path d={path + ' L990,140 L10,140 Z'} fill="#28588044"/><path d={path} fill="none" stroke="#76b8ff" strokeWidth="3"/>{months.map((m, i) => m.shortfall > 0 ? <circle key={m.month} cx={points[i][0]} cy={145} r="4" fill="#ff9b99"/> : null)}</svg><p className="muted">명목 월말 현금 · {months[0].month} → {months[months.length - 1].month} · 빨간 점: 요청 미충족. 상세 수치는 아래 연도·월에서 확인하세요.</p></div>;
}
export function PlannerAnalysis() {
    const { data } = usePlanner(), [params, setParams] = useSearchParams(), id = params.get('run') || data?.activeRunId || null, { record, error } = useSavedRun(id);
    const [saved, setSaved] = useState<SavedRun[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [scenarioId, setScenarioId] = useState('base'), [real, setReal] = useState(false);
    useEffect(() => { const sub = liveQuery(() => db.table('plannerRuns').orderBy('createdAt').reverse().toArray()).subscribe({ next: setSaved, error: e => setMessage(textError(e)) }); return () => sub.unsubscribe(); }, []);
    const comparison = useMemo(() => record && record.scenario.id !== 'base' ? simulate(record.snapshot, baseScenario) : null, [record]);
    if (!data)
        return <Shell title="분석"><Loading /></Shell>;
    const generate = async () => { setBusy(true); try {
        const scenario = data.plan.scenarios.find(s => s.id === scenarioId) ?? baseScenario;
        const result = await calculateAndSave(scenario);
        setParams({ run: result.id });
        setMessage('현재 저장 입력으로 계산했습니다.');
    }
    catch (e) {
        setMessage(textError(e));
    }
    finally {
        setBusy(false);
    } };
    const run = record?.run, years = run ? selectYears(run) : [], year = params.get('year') || years[0]?.year || '', months = run?.months.filter(m => m.month.startsWith(year)) ?? [], month = months.find(m => m.month === params.get('month')) ?? months[0];
    const stale = record && (record.snapshot.assetRevision !== data.snapshot.assetRevision || record.snapshot.plan.revision !== data.plan.revision || record.run.engineVersion !== ENGINE_VERSION || record.run.ruleVersion !== RULE_VERSION);
    const amount = (v: number, at = month?.month || record?.snapshot.plan.asOfDate.slice(0, 7) || '') => { const p = record?.snapshot.plan; if (!real || !p || p.inflation === null)
        return won(v); const n = (Number(at.slice(0, 4)) - Number(p.asOfDate.slice(0, 4))) * 12 + Number(at.slice(5, 7)) - Number(p.asOfDate.slice(5, 7)); return won(v / Math.pow(1 + p.inflation / 100, n / 12)); };
    const choose = (patch: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...patch });
    const sourceTab = (sourceId: string) => record?.snapshot.plan.events.some(e => e.id === sourceId) ? 'events' : record?.snapshot.plan.flows.some(f => f.id === sourceId) ? 'flows' : record?.snapshot.debts.some(d => d.id === sourceId) ? 'debts' : 'policies';
    return <Shell title="은퇴·현금흐름 분석" subtitle="저장된 월별 원장 → 연간 합계 → 원천 입력. 모든 금액을 눌러 같은 원장의 내역을 확인합니다.">
    <details className="panel analysis-controls" open={!record}><summary>계산·저장 결과 선택</summary><div className="form-grid"><Pick label="새로 계산할 대안" value={scenarioId} options={{ base: '기본안', ...Object.fromEntries(data.plan.scenarios.map(s => [s.id, s.name])) }} onChange={setScenarioId}/><button disabled={busy} onClick={() => void generate()}>{busy ? '계산·저장 중…' : '저장된 입력으로 새 분석'}</button><Pick label="보관한 분석 선택" value={id ?? ''} options={{ '': '아직 저장 없음', ...Object.fromEntries(saved.map(r => [r.id, `${r.scenario.name} · ${new Date(r.createdAt).toLocaleString('ko-KR')} · v${r.snapshot.plan.revision}`])) }} onChange={v => setParams({ run: v })}/></div><p className="muted">계획 화면의 미저장 초안은 반영되지 않습니다. 가격 갱신 후에도 이전 결과는 자동 변경하지 않습니다.</p></details>
    {(message || error) && <p role="status" className="notice">{message || error}</p>}{!record && <section className="panel"><h2>계획을 확인하고 첫 분석을 만들어 보세요</h2><Link to="/plan">계획 입력으로 →</Link></section>}
    {record && run && <><section className="panel"><h2>{record.scenario.name} · {run.status === 'complete' ? '입력 확인 완료' : run.status === 'partial' ? '미확정 입력 포함 — 확정 판정 불가' : '입력 오류 — 결과 사용 불가'}</h2><p>기준일 {record.snapshot.plan.asOfDate} → {record.snapshot.plan.endDate} · 입력 v{run.planRevision} · 자산 {run.assetRevision.slice(0, 8)}</p><p className="muted">계산 {run.engineVersion} / 규칙 {run.ruleVersion} · 세금은 사용자 예상액입니다. ‘입력 확인 완료’는 은퇴 성공 보장이나 세법 검증을 뜻하지 않습니다.</p>{stale && <p className="notice">현재 입력과 다른 과거 결과입니다. 최신 입력으로 다시 계산하거나 이 결과의 당시 조건을 확인하세요.</p>}<details><summary>계산 당시 입력·가정 보기 (읽기 전용)</summary><pre>{JSON.stringify({ plan: record.snapshot.plan, positions: record.snapshot.positions.map(({ source, ...p }) => p), debts: record.snapshot.debts }, null, 2)}</pre></details>{run.issues.length > 0 && <details open={run.status !== 'complete'}><summary>확인 항목 {run.issues.length}건</summary><ul>{run.issues.map((issue, i) => <li key={i}><Link to={`/plan?tab=${sourceTab(issue.sourceId)}&focus=${encodeURIComponent(issue.sourceId)}`}>{issue.severity === 'error' ? '오류' : issue.severity === 'missing' ? '미확정' : '주의'} · {issue.message}</Link></li>)}</ul></details>}</section>
      {run.status !== 'invalid' && month && <><section className="panel"><div className="section-title"><h2>요청한 지출·인출을 충당할 수 있는가</h2><Check label="기준일 구매력으로 표시" value={real} onChange={setReal}/></div><p className={run.firstShortfall ? 'notice' : run.status === 'complete' ? 'notice good' : 'notice'}>{run.firstShortfall ? `첫 요청 미충족 월: ${run.firstShortfall}` : run.status === 'complete' ? '입력한 가정·기간에서 요청 미충족이 없습니다.' : '미확정 입력이 있어 부족 여부를 확정할 수 없습니다.'}</p><div className="form-grid"><Pick label="연도" value={year} options={Object.fromEntries(years.map(y => [y.year, y.year + '년']))} onChange={v => choose({ year: v, month: '' })}/><Pick label="월" value={month.month} options={Object.fromEntries(months.map(m => [m.month, m.month]))} onChange={v => choose({ month: v })}/></div><div className="kpis">{[['월말 현금', month.closingCash], ['요청 미충족', month.shortfall], ['월말 순자산', month.netWorth], ['수입 (자산 인출 제외)', month.income], ['실제 지출 + 세금', month.spending + month.taxes], ['실제 계좌 인출', month.withdrawals]].map(([label, v]) => <a key={label} href={label === '월말 순자산' ? '#month-balances' : '#monthly-ledger'}><small>{label}</small><strong>{amount(v as number)}</strong><span>내역 보기 ↓</span></a>)}</div><p className="muted">순자산 = 자산 − 잔여 부채 − 미충당 비용. 요청 미충족에는 인출·적립 목표 미달도 포함되므로 모두 부채는 아닙니다. 현재 구매력은 표시만 환산하며 CSV는 원장 명목 원화입니다.</p></section>
        <section className="panel"><h2>연간 흐름</h2><CashTrend record={record}/><div className="table-scroll"><table><thead><tr><th>연도</th><th>수입</th><th>실지출</th><th>세금</th><th>정기 수지 월평균*</th><th>연말 현금</th><th>요청 미충족</th></tr></thead><tbody>{years.map(y => <tr key={y.year}><th><button className="secondary" onClick={() => choose({ year: y.year, month: '' })}>{y.year}</button></th><td>{won(y.income)}</td><td>{won(y.spending)}</td><td>{won(y.taxes)}</td><td>{won(y.recurringAverage)}</td><td>{won(y.end.closingCash)}</td><td className={y.shortfall ? 'negative' : ''}>{won(y.shortfall)}</td></tr>)}</tbody></table></div><p className="muted">연간 표는 명목 원화 고정. * 정기 수입 − 요청한 반복 지출·세금, 자산 인출/일회성 사건 제외. 계산된 월만 평균에 포함합니다.</p></section>
        <section className="panel" id="monthly-ledger"><div className="section-title"><h2>{month.month} 입출금 원장</h2><div className="actions"><button className="secondary" onClick={() => exportCsv(record, month.month)}>이번 달 CSV</button><button className="secondary" onClick={() => exportCsv(record, '')}>전체 CSV</button></div></div><p>기초 현금 {amount(month.openingCash)} + 실제 현금 증감 {amount(month.closingCash - month.openingCash)} = 기말 {amount(month.closingCash)}</p>{month.entries.length === 0 ? <p>이 달에는 등록된 사건이나 입출금이 없습니다.</p> : month.entries.map(e => <details key={e.id} className="ledger-entry"><summary><span>{e.date.slice(8)}일 · {e.name}</span><strong className={e.shortfall ? 'negative' : ''}>{amount(e.cashDelta)}{e.shortfall > 0 ? ' · 미충족 있음' : ''}</strong></summary><div className="detail-grid"><p>요청 {amount(e.requested)} / 실행 {amount(e.paid)} / 부족 {amount(e.shortfall)}</p><p>자산 변동 {amount(e.assetDelta)} / 부채 변동 {amount(e.debtDelta)}</p><p>귀속 {record.snapshot.plan.people.find(p => p.id === e.ownerId)?.name ?? e.ownerId}</p><p>{e.formula || '명시적으로 등록한 사건 금액을 적용'}</p><SourceEvidence record={record} sourceId={e.sourceId}/><p className="muted">원천 {e.sourceId}</p><Link to={`/plan?tab=${sourceTab(e.sourceId)}&focus=${encodeURIComponent(e.sourceId)}`}>현재 원천 입력 열기 (과거 결과는 유지) →</Link></div></details>)}</section>
        <section className="panel" id="month-balances"><h2>{month.month} 계좌·자산·부채 잔액</h2><div className="table-scroll"><table><thead><tr><th>구분</th><th>이름</th><th>잔액</th></tr></thead><tbody>{Object.entries(month.balances).map(([id, v]) => <tr key={id}><td>자산</td><th>{record.snapshot.positions.find(p => p.assetId === id)?.name ?? '정산 현금'}</th><td>{amount(v)}</td></tr>)}{Object.entries(month.debts).map(([id, v]) => <tr key={id}><td>부채</td><th>{record.snapshot.debts.find(d => d.id === id)?.name ?? id}</th><td>{amount(v)}</td></tr>)}</tbody></table></div></section></>}
      {availability(record.snapshot).events && <section className="panel"><h2>이 분석에 적용한 일정</h2>{run.resolvedEvents.map(e => <p key={e.id}>{e.date ?? '날짜 미확정'} · {e.name}</p>)}</section>}
      {availability(record.snapshot).property && <section className="panel"><h2>6월 1일 부동산 상태 확인</h2><p className="muted">납부 일정과 분리한 검토용 시점입니다. 법률상 주택 수·과세 대상 판정이나 자동 세액 산출 결과가 아닙니다. 준공 전에도 권리·토지 등 검토가 필요합니다.</p>{run.taxCheckpoints.filter(c => c.date.startsWith(year)).map(c => <p key={c.date + c.assetId}>{c.date} · {record.snapshot.positions.find(p => p.assetId === c.assetId)?.name} · {c.owned ? '보유' : '매각 후'} / {c.state} · 시가 {won(c.market)} · 공시가 {c.official === null ? '미확정' : won(c.official)}</p>)}</section>}
      {comparison && <section className="panel"><h2>동일 출발점의 기본안과 비교</h2><p>기본안 첫 미충족 {comparison.firstShortfall ?? (comparison.status === 'complete' ? '없음' : '미확정')} → {record.scenario.name} {run.firstShortfall ?? (run.status === 'complete' ? '없음' : '미확정')}</p><p>기본안 월말 현금 {won(comparison.months[comparison.months.length - 1]?.closingCash ?? 0)} → 대안 {won(run.months[run.months.length - 1]?.closingCash ?? 0)}</p><p className="muted">같은 저장 스냅샷으로 비교합니다. 현재 주가·미저장 초안은 끼워 넣지 않습니다.</p></section>}</>}
    <p className="muted"><Link to="/legacy-analysis">기존 분야별 참고 계산기</Link>는 별도 가정을 사용하는 구 화면입니다. 위 월별 원장과 합산하지 않습니다.</p>
  </Shell>;
}
