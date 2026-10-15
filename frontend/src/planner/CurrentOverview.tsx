import { Link } from 'react-router-dom';
import { stockAccounts, stockAccountUrl } from './accounts';
import type { Snapshot } from './model';
import { excludedSummary, snapshotTotals } from './totals';

import { formatEok, formatManwon } from '@/lib/utils';
const labels: Record<string, string> = { STOCK: '주식·투자 계좌', REAL_ESTATE: '부동산', PENSION: '연금', SAVINGS: '예적금', PHYSICAL: '실물', ETC: '기타' };
export default function CurrentOverview({ snapshot }: { snapshot: Snapshot }) {
    const { total, debt, byType, excluded } = snapshotTotals(snapshot);
    const groups = stockAccounts(snapshot.positions.map(p=>p.source));
    return <><section className="panel"><div className="kpis"><div><small>총 자산</small><h2>{formatEok(total)}</h2></div><div><small>부채</small><h2>{formatEok(debt)}</h2></div><div><small>순자산</small><h2>{formatEok(total-debt)}</h2></div></div>{excluded.length>0&&<p className="muted" data-excluded-summary>{excludedSummary(excluded)}</p>}<p className="muted">마지막 저장 평가액 기준 · 계좌를 누르면 종목과 상세 내역을 볼 수 있습니다.</p><details className="compact-audit"><summary>합산 기준{snapshot.positions.some(p=>!p.confirmed)?' · 분류 미확인 항목이 있어 합계는 잠정치입니다':''}</summary><p>분류 미확인 {snapshot.positions.filter(p=>!p.confirmed).length}건. 연결 잔액·합산 제외는 중복 합산하지 않습니다. 국민연금 등 수급권은 평가액을 합산합니다(인출 불가).</p><Link to="/plan?tab=policies">분류·연결 확인 →</Link></details></section>
    <div className="overview-groups">{Object.entries(labels).map(([type,label])=>{
        const rows=snapshot.positions.filter(p=>p.source.type===type);
        if(!rows.length)return null;
        return <section className="panel" key={type} data-asset-type={type}><div className="section-title"><h2>{label}</h2><strong>{formatManwon(byType[type as keyof typeof byType]??0)}</strong></div>{excluded.some(e=>e.type===type)&&<p className="muted">{excludedSummary(excluded.filter(e=>e.type===type))}</p>}
          {type==='STOCK' ? <><p>{groups.length}개 계좌 · {rows.length}개 보유 종목/계좌 기록</p><div className="account-links">{groups.map(group=><Link key={group.id} data-account-link to={stockAccountUrl(group.id)}><span>{group.name}<small>{group.assets.length}개 기록 · 종목·배당·이력 보기 →</small></span><strong>{formatManwon(rows.filter(p=>group.assets.some(a=>a.id===p.assetId)).reduce((s,p)=>s+p.balance,0))}</strong></Link>)}</div></> : <><p>{rows.length}개 기록</p><Link to={'/assets?type='+type}>보유 내역 관리 →</Link><details><summary>자산별 금액 펼치기</summary>{rows.map(p=><div key={p.assetId} className="section-title"><Link to={'/assets/'+encodeURIComponent(p.assetId)+'?returnTo='+encodeURIComponent('/assets?type=ALL')}>{p.name}</Link><span>{p.role==='entitlement'?formatManwon(p.source.currentValue)+' · 수급권(인출 불가)':formatManwon(p.balance)}{p.linkedTo?' · 연결 잔액 제외':''}</span></div>)}</details></>}
        </section>;
    })}</div>{!snapshot.positions.length&&<section className="panel"><p>등록된 자산이 없습니다.</p><Link to="/assets?type=STOCK">첫 자산 등록 →</Link></section>}</>;
}
