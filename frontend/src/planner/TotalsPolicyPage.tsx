// 설정 › 합산 기준 (/settings/totals). 홈·자산 변동 이력·연금 탭 합계의 분류(합산 제외·수급권)와 동일 잔액 연결만 편집한다.
// 저장은 기존과 같은 savePlan(plannerPlans 'main') 경로. 초안 자동 보존(plannerDrafts)은 쓰지 않는다.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BulkPolicy from './BulkPolicy';
import './review.css';
import { stockAccounts, safeAssetReturn, assetLabel, pensionAccountNames, pensionKind, PENSION_KIND_LABELS, type PensionKind } from './accounts';
import { usePlanner } from './context';
import { resolvePolicy, type AssetPolicy } from './model';
import { savePlan } from './storage';
import { mergePolicies } from './policies';
import { roleLabels } from './labels';
import { Check, Loading, Pick, Shell, Txt, textError } from './ui';
import { formatWon as won } from '@/lib/utils';

export default function TotalsPolicyPage() {
    const { data } = usePlanner(), [params, setParams] = useSearchParams();
    // 편집 초안: 시작 시점의 revision을 함께 보관해 다른 화면의 저장과 충돌하면 savePlan이 거절하게 한다
    const [draft, setDraft] = useState<{ policies: AssetPolicy[]; revision: number } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const dirty = draft !== null;
    useEffect(() => { if (!dirty)
        return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
    useEffect(() => { const focus = params.get('focus'); if (focus)
        document.getElementById('source-' + focus)?.scrollIntoView({ block: 'center' }); }, [params, data]);
    const back = <Link className="button secondary" to="/settings">← 설정</Link>;
    if (!data)
        return <Shell title="합산 기준" action={back}><Loading /></Shell>;
    const policies = draft?.policies ?? data.plan.policies;
    const positions = data.current.positions;
    const accountGroups = stockAccounts(positions.map(p => p.source));
    const pensionAccounts = pensionAccountNames(positions.map(p => p.source));
    const policyList = positions.map(p => resolvePolicy(p.source, policies, pensionAccounts));
    const policySearch = params.get('q') ?? '', policyGroup = params.get('group') ?? '', focusedPolicy = params.get('focus');
    const groupOf = (id: string) => { const p=positions.find(p=>p.assetId===id);const g=accountGroups.find(g=>g.assets.some(a=>a.id===id));return g?'account:'+g.id:p?.source.type==='PENSION'?'pension:'+pensionKind(p.source):'type:'+(p?.source.type??''); };
    const typeGroup = (type: string, name: string) => ({id:'type:'+type,name,count:positions.filter(p=>p.source.type===type).length});
    const policyGroups = [...accountGroups.map(g=>({id:'account:'+g.id,name:(pensionAccounts.has(g.name)?'연금 계좌 · ':'주식 · ')+g.name,count:g.assets.length})), typeGroup('REAL_ESTATE','부동산'), ...(['national','pension','insurance'] as PensionKind[]).map(kind=>({id:'pension:'+kind,name:'연금 · '+PENSION_KIND_LABELS[kind],count:positions.filter(p=>p.source.type==='PENSION'&&pensionKind(p.source)===kind).length})), typeGroup('SAVINGS','예적금'), typeGroup('PHYSICAL','실물'), typeGroup('ETC','기타')].filter(g=>g.count);
    const groupConfirmBlocked = (id: string) => { const g=accountGroups.find(g=>'account:'+g.id===id); return g&&pensionAccounts.has(g.name) ? '연금 계좌(연결 연금이 가리키는 계좌)는 분류를 정하지 않은 채 일괄 확인할 수 없습니다. 각 종목의 분류를 먼저 확인하세요.' : undefined; };
    const labelOf = (id: string) => { const x=positions.find(x=>x.assetId===id); return x ? assetLabel(x.source) : id; };
    const visiblePolicyList = policyList.filter(p=> focusedPolicy ? p.assetId===focusedPolicy : (policyGroup||policySearch||params.has('unconfirmed')) && (!policyGroup||groupOf(p.assetId)===policyGroup) && (!params.has('unconfirmed')||!p.confirmed) && labelOf(p.assetId).toLowerCase().includes(policySearch.toLowerCase()));
    const policyNav=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);for(const [key,value] of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key)}setParams(next);};
    const apply = (next: AssetPolicy[]) => { if (busy)
        return; setDraft({ policies: mergePolicies(policies, policyList, next), revision: draft?.revision ?? data.plan.revision }); };
    const policyChange = (assetId: string, patch: Partial<AssetPolicy>) => { const p = policyList.find(x => x.assetId === assetId); if (p) apply([{ ...p, ...patch }]); };
    const assets = { '': '연결 없음', ...Object.fromEntries(positions.map(p => [p.assetId, assetLabel(p.source)])) };
    const save = async () => { if (!draft)
        return; setBusy(true); setMessage(''); try {
        await savePlan({ ...data.plan, policies: draft.policies }, draft.revision);
        setDraft(null);
        setMessage('합산 기준을 저장했습니다.');
    }
    catch (e) {
        setMessage(textError(e));
    }
    finally {
        setBusy(false);
    } };
    return <Shell title="합산 기준" subtitle="홈·자산 변동 이력·연금 탭 합계에만 적용됩니다. 은퇴 분석(연 단위)은 이 설정을 쓰지 않습니다." action={back}>
    {params.get('returnTo') && <Link to={safeAssetReturn(params.get('returnTo'))}>← 이전 자산 화면으로</Link>}
    <p className="notice">원본 금액·주식 수량은 자산 화면에서 관리합니다. 여기서는 합계에서 제외할 자산과 같은 잔액을 가리키는 중복 기록(동일 잔액 연결)만 정합니다.</p>
    {(dirty || message) && <div className="actions">{dirty && <button disabled={busy} onClick={() => void save()}>저장 · 변경 있음</button>}{dirty && <button className="secondary" disabled={busy} onClick={() => { if (window.confirm('변경을 버리고 저장된 기준을 다시 읽을까요?')) { setDraft(null); setMessage(''); } }}>변경 취소</button>}{message && <p role="status">{message}</p>}</div>}
    {draft && data.plan.revision !== draft.revision && <p role="alert" className="notice">다른 화면에서 변경되었습니다. 이 변경은 그대로 덮어쓸 수 없습니다. 변경 취소 후 다시 적용해 주세요.</p>}
    <section className="panel policy-tools"><h2>계좌·유형별 검토</h2><div className="form-grid"><Txt label="자산 이름·계좌명 검색" value={policySearch} onChange={v=>policyNav({q:v,focus:''})}/><Check label="미확인 항목만" value={params.has('unconfirmed')} onChange={v=>policyNav({unconfirmed:v?'1':'',focus:''})}/></div><div className="actions"><button className="secondary" onClick={()=>policyNav({group:'',q:'',focus:'',unconfirmed:''})}>그룹 목록</button>{focusedPolicy&&<button className="secondary" onClick={()=>policyNav({group:groupOf(focusedPolicy),focus:''})}>이 계좌·유형 목록</button>}</div><div className="policy-group-list">{policyGroups.map(g=><button key={g.id} className="secondary" aria-pressed={policyGroup===g.id} onClick={()=>policyNav({group:g.id,focus:'',q:''})}>{g.name} · {g.count}개</button>)}</div><p className="muted">선택한 항목의 설정만 펼칩니다. 분류는 확인 없이 확정하지 않습니다.</p></section>
    {policyGroup&&!focusedPolicy&&<BulkPolicy policies={visiblePolicyList} confirmDisabledReason={groupConfirmBlocked(policyGroup)} fillAssumptions={false} onApply={apply}/>}
    {visiblePolicyList.map(p => { const source = positions.find(x => x.assetId === p.assetId)!; const patch = (v: Partial<AssetPolicy>) => policyChange(p.assetId, v); return <section id={'source-' + p.assetId} className="panel policy-editor" key={p.assetId}><button className="secondary policy-row" aria-expanded={focusedPolicy===p.assetId} onClick={()=>policyNav({focus:focusedPolicy===p.assetId?'':p.assetId})}>{assetLabel(source.source)} · {p.confirmed?'확인 완료':'미확인'} · {focusedPolicy===p.assetId?'접기':'설정 열기'}</button>{focusedPolicy===p.assetId&&<><div className="section-title"><h2>{assetLabel(source.source)}</h2><Link to={`/assets/${encodeURIComponent(p.assetId)}`}>보유 상세 →</Link></div><p>원본 평가액 {won(source.source.currentValue)}</p><div className="form-grid"><Pick label="분류" value={p.role} options={roleLabels} onChange={v => patch({ role: v as AssetPolicy['role'] })}/><Pick label="동일 잔액의 원본 자산 (중복 합산 제외)" value={p.linkedTo ?? ''} options={Object.fromEntries(Object.entries(assets).filter(([id]) => id !== p.assetId))} onChange={v => patch({ linkedTo: v || undefined })}/></div><Check label="분류·중복 연결을 확인했습니다" value={p.confirmed} onChange={v => patch({ confirmed: v })}/></>}</section>; })}
    {!policyList.length && <Link to="/assets">자산을 먼저 등록하세요 →</Link>}
  </Shell>;
}
