import type {PensionLedgerRow} from '@/lib/annualPension'
import {formatManwon,formatMoney} from '@/lib/utils'
import {Link} from 'react-router-dom'

/** The same paid entries as the cash-flow engine, not a second calculation. */
export function PensionIncomeDetails({row,rows=[row]}:{row:PensionLedgerRow;rows?:PensionLedgerRow[]}){
  const changes=rows.filter(r=>r.year<=row.year).flatMap(r=>r.payoutChanges.map(c=>({...c,year:r.year})))
  return <div className="space-y-3 text-xs" data-pension-income-detail={row.year}>
    <p className="text-gray-400">{row.year}년 예상 지급 가능액 기준입니다. IRP 추가 입금은 수입에 더하지 않으며, 아래 수령액에만 반영합니다.</p>
    {row.entries.filter(e=>e.requested>0||e.paid>0).map(e=><div key={e.id} className="flex justify-between gap-3 border-b border-gray-700 py-2" data-pension-source={e.id} data-paid-annual={e.paid}>
      <div className="min-w-0 break-words"><p>{e.name}</p><p className="text-gray-500">{e.owner==='wife'?'아내':'남편'} · {e.funded?'계좌 잔액에서 인출':'등록 지급액'}{e.paid<e.requested?' · 잔액 부족':''}</p>{e.funding&&<p className="text-gray-400 mt-1" data-pension-funding={e.id}>연간 인출 재원: 과세제외 {formatMoney(e.funding.exempt)} · 퇴직금 {formatMoney(e.funding.retirement.reduce((sum,v)=>sum+v.amount,0))} · 개인납입/수익 {formatMoney(e.funding.personal)}{e.funding.unknown>0?` · 미확인 ${formatMoney(e.funding.unknown)}`:''}</p>}</div>
      <p className="shrink-0 text-right">{formatMoney(e.paid/12)}/월<br/><span className="text-gray-500">연 {formatMoney(e.paid)}</span></p>
    </div>)}
    {changes.map((c,i)=><div key={c.sourceId+':'+c.year+':'+i} className="rounded bg-blue-950/20 p-3 space-y-1" data-pension-payout-change>
      <p className="font-semibold">{c.year}년 {c.deposits.join(' · ')} → {c.name}</p>
      <p>입금 직전 예상 잔액 {formatManwon(c.beforeBalance)} + 입금 {formatManwon(c.deposit)} = 합산 {formatManwon(c.beforeBalance+c.deposit)}</p>
      <p>월수령액 {formatMoney(c.previousMonthly)} → {formatMoney(c.revisedMonthly)} ({c.startYear}~{c.endYear}년 기준)</p>
      <p className="text-gray-400">{c.method==='proportional'?'기존 월수령액 × (입금 전 잔액 + 추가 입금) ÷ 입금 전 잔액. 미래 수익률·연 증가율은 기존 설정을 사용하며 지급 시 잔액으로 제한합니다.':c.method==='remainingYears'?'기존 지급 비율을 산정할 수 없어, 지급 개시 시점의 예상 합산 잔액을 남은 수령 기간으로 나눈 추정입니다.':'수령 종료 후 입금입니다. 잔액은 보존하지만 수령 기간 확인 전에는 추가 지급하지 않습니다.'}</p>
    </div>)}
    <Link className="inline-block text-blue-300 underline" to="/analysis?tab=pension-sim">IRP 연결·수령 기준 확인 →</Link>
  </div>
}
