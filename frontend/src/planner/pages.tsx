import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams, useParams } from 'react-router-dom';
import './review.css';
import CurrentOverview from './CurrentOverview';
import { excludedSummary, reviewCounts, snapshotTotals } from './totals';
import { stockAccounts, stockAccountUrl, safeAssetReturn } from './accounts';
import AssetDetail from '@/components/assets/AssetDetail';
import { useAssets } from '@/hooks/useAssets';
import { liveQuery } from 'dexie';
import { db } from '@/lib/db';
import { usePlanner, useSavedRun } from './context';
import { ENGINE_VERSION, RULE_VERSION, assetPensionAmount, availability } from './model';
import { baseScenario, selectYears, simulate } from './engine';
import type { SavedRun } from './storage';
import { hasMonthlyContent, useMonthlyArchive } from './archive';
import { eventLabels } from './labels';
import { Check, Loading, Pick, Shell, textError } from './ui';
import { formatWon as won, formatEok } from '@/lib/utils';
export { Shell } from './ui';
// 월별 계획 편집 화면(PlanPage)은 archivedPlanPage.tsx로 옮겨 보관(라우트 없음).
const ARCHIVE_LABEL = '보관된 월별 분석 (읽기 전용)';
export function PlannerHome() {
    const { data } = usePlanner(), archive = useMonthlyArchive();
    if (!data)
        return <Shell title="내 자산과 은퇴 준비"><Loading /></Shell>;
    const snapshot = data.current, { total, debt, excluded } = snapshotTotals(snapshot), review = reviewCounts(snapshot);
    return <Shell title="내 자산과 은퇴 준비" subtitle="평소에는 자산 확인과 시세 갱신만 하세요.">
    <section className="panel"><h2>현재 자산</h2><div className="actions primary-task"><Link className="button" to="/assets?type=STOCK">주식 계좌 확인·시세 갱신 →</Link><Link to="/assets?type=ALL">전체 자산 보기 →</Link></div><div className="kpis"><Link to="/assets?type=ALL"><small>총 자산</small><strong>{formatEok(total)}</strong></Link><Link to="/assets?type=REAL_ESTATE"><small>부채 · 대출 + 받은 보증금</small><strong>{formatEok(debt)}</strong></Link><Link to="/assets?type=ALL"><small>입력 기준 순자산</small><strong>{formatEok(total - debt)}</strong></Link></div>{excluded.length > 0 && <p className="muted" data-excluded-summary>{excludedSummary(excluded)}</p>}<p className="muted">평가액은 마지막 저장 값입니다. 국민연금 수급권은 평가액을 합산하고, 동일 잔액 연결·합산 제외는 중복 합산하지 않습니다.</p>{review.totalImpact > 0 && <details className="compact-audit" data-review-counts><summary>합계는 잠정치 · 합계 영향 {review.totalImpact}건</summary><p>기준일 뒤 취득·처분, 연결 연금의 자체 평가액, 합산 제외·동일 잔액 연결처럼 합계에 영향을 주는 항목입니다.</p><Link to="/settings/totals?unconfirmed=1">합산 기준 확인 →</Link></details>}</section>
    {!snapshot.positions.length && <section className="panel"><h2>먼저 현재 자산을 등록하세요</h2><p>가상 자산이나 배우자가 자동으로 추가되지 않습니다. 자산 관리만 사용해도 됩니다.</p><Link className="button" to="/assets?type=ALL">자산 등록으로 이동</Link></section>}
    <section className="panel"><h2>자산 관리</h2><div className="actions"><Link to="/assets?type=REAL_ESTATE">부동산</Link><Link to="/assets?type=PENSION">연금</Link><Link to="/assets?type=SAVINGS">예적금</Link><Link to="/history">자산 변동 이력</Link></div></section>
    <section className="panel"><h2>은퇴 분석</h2><p>등록한 자산·연금·생활비를 연결해 결과를 바로 확인합니다.</p><div className="actions"><Link className="button" to="/analysis">은퇴 분석 보기 →</Link><Link to="/analysis?tab=prep">생활비·목돈 수정 →</Link></div>{archive === true && <p className="muted"><Link to="/analysis/archive" data-archive-link>{ARCHIVE_LABEL} →</Link></p>}</section>
  </Shell>;
}
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
    return <Shell title={asset?.name ?? '자산 상세'}><Link to={back}>← 유형별 관리</Link>{isLoading ? <p>불러오는 중…</p> : error ? <p role="alert">{String(error)}</p> : asset ? <section className="panel"><p><Link to={'/settings/totals?focus=' + encodeURIComponent(asset.id) + '&returnTo=' + encodeURIComponent(group ? back + '&asset=' + encodeURIComponent(asset.id) : back)}>이 자산의 합산 기준 →</Link></p><AssetDetail asset={asset}/></section> : <p>삭제되었거나 존재하지 않는 자산입니다.</p>}</Shell>;
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
        return <p className="muted">계산 당시 원본 자산의 월 지급액 {amount === null ? '미입력' : won(amount)}을 사용했습니다. 이후 원본 변경은 이 보관 결과에 반영되지 않습니다.</p>;
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
/** 보관된 월별 분석 (/analysis/archive). 읽기 전용 — 새 계산·계획 수정 진입점이 없다. 보관본이 없으면 /analysis로 보낸다. */
export function ArchivedMonthlyAnalysis() {
    const archive = useMonthlyArchive();
    const { data } = usePlanner(), [params, setParams] = useSearchParams();
    const [saved, setSaved] = useState<SavedRun[]>([]), [message, setMessage] = useState('');
    useEffect(() => { const sub = liveQuery(() => db.table('plannerRuns').orderBy('createdAt').reverse().toArray()).subscribe({ next: setSaved, error: e => setMessage(textError(e)) }); return () => sub.unsubscribe(); }, []);
    const id = params.get('run') || data?.activeRunId || saved[0]?.id || null, { record, error } = useSavedRun(id);
    if (archive === false)
        return <Navigate replace to="/analysis"/>;
    const action = <Link className="button secondary" to="/analysis">← 은퇴 분석</Link>;
    if (!data || archive === null)
        return <Shell title={ARCHIVE_LABEL} action={action}><Loading /></Shell>;
    const stale = !!record && (record.snapshot.assetRevision !== data.snapshot.assetRevision || record.snapshot.plan.revision !== data.plan.revision || record.run.engineVersion !== ENGINE_VERSION || record.run.ruleVersion !== RULE_VERSION);
    return <Shell title={ARCHIVE_LABEL} subtitle="이전에 저장한 월별 계획 결과입니다. 새로 계산하거나 수정할 수 없으며, 은퇴 분석(연 단위)과 합산하지 않습니다." action={action}>
    {saved.length > 0 && <section className="panel"><div className="form-grid"><Pick label="보관한 분석 선택" value={id ?? ''} options={Object.fromEntries(saved.map(r => [r.id, `${r.scenario.name} · ${new Date(r.createdAt).toLocaleString('ko-KR')} · v${r.snapshot.plan.revision}`]))} onChange={v => setParams({ run: v })}/></div></section>}
    {(message || (error && saved.length > 0)) && <p role="status" className="notice">{message || '선택한 보관 분석을 읽지 못했습니다. 목록에서 다른 보관본을 선택하세요.'}</p>}
    {record && <ArchivedRunBody record={record} stale={stale}/>}
    {hasMonthlyContent(data.plan) && <details className="panel" open={!saved.length}><summary>저장된 월별 계획 입력 (읽기 전용)</summary><pre>{JSON.stringify(data.plan, null, 2)}</pre></details>}
  </Shell>;
}
/** 보관 분석 본문 (표시 전용). 계획 편집·재계산 링크 없음. CSV 내보내기와 기본안 비교(메모리 계산)만 남긴다. */
export function ArchivedRunBody({ record, stale }: {
    record: SavedRun;
    stale: boolean;
}) {
    const [params, setParams] = useSearchParams(), [real, setReal] = useState(false);
    const comparison = useMemo(() => record.scenario.id !== 'base' ? simulate(record.snapshot, baseScenario) : null, [record]);
    const run = record.run, years = selectYears(run), year = params.get('year') || years[0]?.year || '', months = run.months.filter(m => m.month.startsWith(year)), month = months.find(m => m.month === params.get('month')) ?? months[0];
    const amount = (v: number, at = month?.month || record.snapshot.plan.asOfDate.slice(0, 7)) => { const p = record.snapshot.plan; if (!real || p.inflation === null)
        return won(v); const n = (Number(at.slice(0, 4)) - Number(p.asOfDate.slice(0, 4))) * 12 + Number(at.slice(5, 7)) - Number(p.asOfDate.slice(5, 7)); return won(v / Math.pow(1 + p.inflation / 100, n / 12)); };
    const choose = (patch: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...patch });
    return <>
      <section className="panel"><h2>{record.scenario.name} · {run.status === 'complete' ? '입력 확인 완료' : run.status === 'partial' ? '미확정 입력 포함 — 확정 판정 불가' : '입력 오류 — 결과 사용 불가'}</h2><p>기준일 {record.snapshot.plan.asOfDate} → {record.snapshot.plan.endDate} · 입력 v{run.planRevision} · 자산 {run.assetRevision.slice(0, 8)}</p><p className="muted">계산 {run.engineVersion} / 규칙 {run.ruleVersion} · 세금은 사용자 예상액입니다. ‘입력 확인 완료’는 은퇴 성공 보장이나 세법 검증을 뜻하지 않습니다.</p>{stale && <p className="notice">현재 자산·입력과 다른 시점의 결과입니다. 계산 당시 조건 그대로 보관되어 있습니다.</p>}<details><summary>계산 당시 입력·가정 보기 (읽기 전용)</summary><pre>{JSON.stringify({ plan: record.snapshot.plan, positions: record.snapshot.positions.map(({ source, ...p }) => p), debts: record.snapshot.debts }, null, 2)}</pre></details>{run.issues.length > 0 && <details open={run.status !== 'complete'}><summary>확인 항목 {run.issues.length}건</summary><ul>{run.issues.map((issue, i) => <li key={i}>{issue.severity === 'error' ? '오류' : issue.severity === 'missing' ? '미확정' : '주의'} · {issue.message}</li>)}</ul></details>}</section>
      {run.status !== 'invalid' && month && <><section className="panel"><div className="section-title"><h2>요청한 지출·인출을 충당할 수 있는가</h2><Check label="기준일 구매력으로 표시" value={real} onChange={setReal}/></div><p className={run.firstShortfall ? 'notice' : run.status === 'complete' ? 'notice good' : 'notice'}>{run.firstShortfall ? `첫 요청 미충족 월: ${run.firstShortfall}` : run.status === 'complete' ? '입력한 가정·기간에서 요청 미충족이 없습니다.' : '미확정 입력이 있어 부족 여부를 확정할 수 없습니다.'}</p><div className="form-grid"><Pick label="연도" value={year} options={Object.fromEntries(years.map(y => [y.year, y.year + '년']))} onChange={v => choose({ year: v, month: '' })}/><Pick label="월" value={month.month} options={Object.fromEntries(months.map(m => [m.month, m.month]))} onChange={v => choose({ month: v })}/></div><div className="kpis">{[['월말 현금', month.closingCash], ['요청 미충족', month.shortfall], ['월말 순자산', month.netWorth], ['수입 (자산 인출 제외)', month.income], ['실제 지출 + 세금', month.spending + month.taxes], ['실제 계좌 인출', month.withdrawals]].map(([label, v]) => <a key={label} href={label === '월말 순자산' ? '#month-balances' : '#monthly-ledger'}><small>{label}</small><strong>{amount(v as number)}</strong><span>내역 보기 ↓</span></a>)}</div><p className="muted">순자산 = 자산 − 잔여 부채 − 미충당 비용. 요청 미충족에는 인출·적립 목표 미달도 포함되므로 모두 부채는 아닙니다. 현재 구매력은 표시만 환산하며 CSV는 원장 명목 원화입니다. 국민연금 수급권 평가액은 지급 일정으로 반영되어 시작 순자산에는 포함되지 않습니다.</p></section>
        <section className="panel"><h2>연간 흐름</h2><CashTrend record={record}/><div className="table-scroll"><table><thead><tr><th>연도</th><th>수입</th><th>실지출</th><th>세금</th><th>정기 수지 월평균*</th><th>연말 현금</th><th>요청 미충족</th></tr></thead><tbody>{years.map(y => <tr key={y.year}><th><button className="secondary" onClick={() => choose({ year: y.year, month: '' })}>{y.year}</button></th><td>{won(y.income)}</td><td>{won(y.spending)}</td><td>{won(y.taxes)}</td><td>{won(y.recurringAverage)}</td><td>{won(y.end.closingCash)}</td><td className={y.shortfall ? 'negative' : ''}>{won(y.shortfall)}</td></tr>)}</tbody></table></div><p className="muted">연간 표는 명목 원화 고정. * 정기 수입 − 요청한 반복 지출·세금, 자산 인출/일회성 사건 제외. 계산된 월만 평균에 포함합니다.</p></section>
        <section className="panel" id="monthly-ledger"><div className="section-title"><h2>{month.month} 입출금 원장</h2><div className="actions"><button className="secondary" onClick={() => exportCsv(record, month.month)}>이번 달 CSV</button><button className="secondary" onClick={() => exportCsv(record, '')}>전체 CSV</button></div></div><p>기초 현금 {amount(month.openingCash)} + 실제 현금 증감 {amount(month.closingCash - month.openingCash)} = 기말 {amount(month.closingCash)}</p>{month.entries.length === 0 ? <p>이 달에는 등록된 사건이나 입출금이 없습니다.</p> : month.entries.map(e => <details key={e.id} className="ledger-entry"><summary><span>{e.date.slice(8)}일 · {e.name}</span><strong className={e.shortfall ? 'negative' : ''}>{amount(e.cashDelta)}{e.shortfall > 0 ? ' · 미충족 있음' : ''}</strong></summary><div className="detail-grid"><p>요청 {amount(e.requested)} / 실행 {amount(e.paid)} / 부족 {amount(e.shortfall)}</p><p>자산 변동 {amount(e.assetDelta)} / 부채 변동 {amount(e.debtDelta)}</p><p>귀속 {record.snapshot.plan.people.find(p => p.id === e.ownerId)?.name ?? e.ownerId}</p><p>{e.formula || '명시적으로 등록한 사건 금액을 적용'}</p><SourceEvidence record={record} sourceId={e.sourceId}/><p className="muted">원천 {e.sourceId}</p></div></details>)}</section>
        <section className="panel" id="month-balances"><h2>{month.month} 계좌·자산·부채 잔액</h2><div className="table-scroll"><table><thead><tr><th>구분</th><th>이름</th><th>잔액</th></tr></thead><tbody>{Object.entries(month.balances).map(([id, v]) => <tr key={id}><td>자산</td><th>{record.snapshot.positions.find(p => p.assetId === id)?.name ?? '정산 현금'}</th><td>{amount(v)}</td></tr>)}{Object.entries(month.debts).map(([id, v]) => <tr key={id}><td>부채</td><th>{record.snapshot.debts.find(d => d.id === id)?.name ?? id}</th><td>{amount(v)}</td></tr>)}</tbody></table></div></section></>}
      {availability(record.snapshot).events && <section className="panel"><h2>이 분석에 적용한 일정</h2>{run.resolvedEvents.map(e => <p key={e.id}>{e.date ?? '날짜 미확정'} · {e.name}</p>)}</section>}
      {availability(record.snapshot).property && <section className="panel"><h2>6월 1일 부동산 상태 확인</h2><p className="muted">납부 일정과 분리한 검토용 시점입니다. 법률상 주택 수·과세 대상 판정이나 자동 세액 산출 결과가 아닙니다. 준공 전에도 권리·토지 등 검토가 필요합니다.</p>{run.taxCheckpoints.filter(c => c.date.startsWith(year)).map(c => <p key={c.date + c.assetId}>{c.date} · {record.snapshot.positions.find(p => p.assetId === c.assetId)?.name} · {c.owned ? '보유' : '매각 후'} / {c.state} · 시가 {won(c.market)} · 공시가 {c.official === null ? '미확정' : won(c.official)}</p>)}</section>}
      {comparison && <section className="panel"><h2>동일 출발점의 기본안과 비교</h2><p>기본안 첫 미충족 {comparison.firstShortfall ?? (comparison.status === 'complete' ? '없음' : '미확정')} → {record.scenario.name} {run.firstShortfall ?? (run.status === 'complete' ? '없음' : '미확정')}</p><p>기본안 월말 현금 {won(comparison.months[comparison.months.length - 1]?.closingCash ?? 0)} → 대안 {won(run.months[run.months.length - 1]?.closingCash ?? 0)}</p><p className="muted">같은 저장 스냅샷으로 비교합니다. 현재 주가·미저장 초안은 끼워 넣지 않습니다.</p></section>}
  </>;
}
