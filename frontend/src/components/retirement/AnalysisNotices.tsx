import {Link} from 'react-router-dom'
import type {HoldingTaxResult} from '@/lib/holdingTax'
export function AnalysisNotices({holding,notes,shortfall=false,incomplete=false}:{holding?:HoldingTaxResult;notes:string[];shortfall?:boolean;incomplete?:boolean}){
  const list=[...new Set([...notes,...(holding?.notes.map(n=>(n.name?n.name+': ':'')+n.message)??[])])];
  if(!list.length&&!shortfall&&!incomplete)return null;
  return <details className="border border-amber-700/50 bg-amber-950/10 rounded-lg p-3 text-xs text-amber-200" open={holding?.incomplete||shortfall||incomplete} data-analysis-notices>
    <summary className="cursor-pointer">{incomplete?'IRP 연결 확인 필요 · 추가 연금 미산정':holding?.incomplete?'일부 세금 미반영 · 결과 확인 필요':shortfall?'연금 계좌 지급 부족이 있습니다':'계산에 사용한 가정·확인 사항'}</summary>
    {incomplete&&<p className="mt-2"><Link className="underline" to="/analysis?tab=pension-sim">목돈 분배에서 합산할 퇴직IRP 선택 →</Link></p>}
    {shortfall&&<p className="mt-2">요청한 연금액보다 잔액이 부족한 연도가 있습니다. 수입에는 지급 가능한 금액만 반영했습니다. 아래 계좌 내역에서 부족액을 확인하세요.</p>}
    <ul className="mt-2 space-y-1">{list.map((s,i)=><li key={i}>{s}</li>)}</ul>
    {holding?.notes.some(n=>n.id)&&<div className="mt-2 flex flex-wrap gap-3">{[...new Map(holding.notes.filter(n=>n.id).map(n=>[n.id,n])).values()].map(n=><Link className="underline" key={n.id} to={'/assets/'+encodeURIComponent(n.id!)}>{n.name||'부동산'} 원본 확인 →</Link>)}</div>}
  </details>
}
