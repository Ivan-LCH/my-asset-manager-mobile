import type {PensionLedgerRow} from '@/lib/annualPension'
import {formatManwon} from '@/lib/utils'
import {Fragment,useState} from 'react'
import {PensionIncomeDetails} from './PensionIncomeDetails'
export function PensionLedger({rows}:{rows:PensionLedgerRow[]}){
  const [selected,setSelected]=useState<number|null>(null)
  return <details className="bg-gray-800 border border-gray-700 rounded-xl p-4" data-pension-ledger>
    <summary className="cursor-pointer text-sm font-semibold">연금 계좌 잔액·지급 내역</summary>
    <p className="text-xs text-gray-400 my-3">기초 잔액 + 입금 + 운용 변동 − 실제 지급 = 기말 잔액. 국민연금·보험 지급형 수입은 계좌 인출이 아니므로 잔액에서 차감하지 않습니다. 현재 총자산이 아닌 연결 연금 계좌만의 전망입니다.</p>
    <p className="text-xs text-blue-300 mb-2">연도를 누르면 계좌별 입금·지급·잔액과 연금 재산정 근거가 나옵니다.</p>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['연도','기초','입금','운용','지급','기말','지급 부족'].map(t=><th key={t} className="p-2 whitespace-nowrap text-right">{t}</th>)}</tr></thead><tbody>{rows.map(r=><Fragment key={r.year}><tr className="border-t border-gray-700"><td className="p-2"><button aria-expanded={selected===r.year} aria-controls={'pension-year-'+r.year} className="text-blue-300 underline whitespace-nowrap" onClick={()=>setSelected(selected===r.year?null:r.year)}>{r.year}년 내역</button></td>{[r.opening,r.inflow,r.growth,r.paid,r.closing,r.shortfall].map((v,i)=><td key={i} className={'p-2 text-right whitespace-nowrap '+(i===5&&r.shortfall>0?'text-red-300':'')}>{formatManwon(v)}</td>)}</tr>{selected===r.year&&<tr><td colSpan={7} id={'pension-year-'+r.year} className="p-3 bg-gray-900/50"><div className="space-y-3 w-[calc(100vw-7rem)] sm:w-full sm:max-w-xl">
      {r.accounts.filter(a=>a.opening||a.inflow||a.closing||a.transferOut||a.transferIn).map(a=><div key={a.id} className="space-y-1" data-pension-account={a.id}><p className="font-semibold">{a.name}{a.pending?' · 추가 연금 미산정':''}</p><p>기초 {formatManwon(a.opening)} + 입금 {formatManwon(a.inflow)}{a.transferIn?` + 내부이전 ${formatManwon(a.transferIn)}`:''}{a.transferOut?` − 내부이전 ${formatManwon(a.transferOut)}`:''} + 운용 {formatManwon(a.growth)} − 지급 {formatManwon(a.paid)} = 기말 {formatManwon(a.closing)}</p>{a.funding&&<p className="text-gray-400">기말 재원: 과세제외 {formatManwon(a.funding.exempt)} · 퇴직금 {formatManwon(a.funding.retirement.reduce((sum,v)=>sum+v.amount,0))} · 개인납입/수익 {formatManwon(a.funding.personal)} · 미확인 {formatManwon(a.funding.unknown)}</p>}</div>)}
      <PensionIncomeDetails row={r} rows={rows}/>
    </div></td></tr>}</Fragment>)}</tbody></table></div>
  </details>
}
