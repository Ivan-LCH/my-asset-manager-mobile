import {Link} from 'react-router-dom'
import type {HoldingTaxResult} from '@/lib/holdingTax'
import {groupNotices} from '@/lib/analysisNotices'
// 기본은 접힌 요약줄 하나. 지급 부족·IRP 연결·세금 미반영 경고가 있으면 기존처럼 펼친 채 시작하되,
// 펼쳐도 '확인 필요'만 바로 보이고 '계산 가정'은 안쪽 details 로 접어 둔다.
export function AnalysisNotices({holding,notes,shortfall=false,incomplete=false}:{holding?:HoldingTaxResult;notes:string[];shortfall?:boolean;incomplete?:boolean}){
  const g=groupNotices({notes,holdingNotes:holding?.notes,holdingIncomplete:holding?.incomplete,shortfall,incomplete});
  if(!g)return null;
  return <details className="border border-amber-700/50 bg-amber-950/10 rounded-lg p-3 text-xs text-amber-200" open={g.open} data-analysis-notices>
    <summary className="cursor-pointer">{g.title}{g.summary&&<span className="ml-1.5 text-[11px] text-amber-300/70" data-notice-summary>· {g.summary}</span>}</summary>
    {incomplete&&<p className="mt-2"><Link className="underline" to="/analysis?tab=pension-sim">목돈 분배에서 합산할 퇴직IRP 선택 →</Link></p>}
    {shortfall&&<p className="mt-2">요청한 연금액보다 잔액이 부족한 연도가 있습니다. 수입에는 지급 가능한 금액만 반영했습니다. 아래 계좌 내역에서 부족액을 확인하세요.</p>}
    {g.actions.length>0&&<ul className="mt-2 space-y-1" data-notice-actions>{g.actions.map((s,i)=><li key={i}>{s}</li>)}</ul>}
    {g.assumptions.length>0&&<details className="mt-2 text-gray-400" data-notice-assumptions><summary className="cursor-pointer">계산 가정 {g.assumptions.length}건</summary><ul className="mt-1 space-y-1">{g.assumptions.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}
    {holding?.notes.some(n=>n.id)&&<div className="mt-2 flex flex-wrap gap-3">{[...new Map(holding.notes.filter(n=>n.id).map(n=>[n.id,n])).values()].map(n=><Link className="underline" key={n.id} to={'/assets/'+encodeURIComponent(n.id!)}>{n.name||'부동산'} 원본 확인 →</Link>)}</div>}
  </details>
}
