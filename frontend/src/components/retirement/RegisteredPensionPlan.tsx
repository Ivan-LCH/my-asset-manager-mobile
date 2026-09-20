import type {MonthlyPensionPlan} from '@/lib/monthlyPensionPlan'
export function RegisteredPensionPlan({plan}:{plan?:MonthlyPensionPlan}){
  if(!plan)return null
  return <details className="rounded-xl bg-gray-800 border border-gray-700 p-4" data-registered-pension-plan>
    <summary className="cursor-pointer text-sm font-semibold">등록한 연금 계획 · 퇴직 {plan.retirementDate} · 월별 계산</summary>
    <p className="text-xs text-gray-400 mt-3">이 계획의 월별 조건을 분석에 우선 적용합니다. 현재 계좌 잔액·주식 운용내역은 바꾸지 않습니다. 세금은 미확인 항목이 있으면 일부만 계산됩니다.</p>
    {plan.accounts.map(a=><div key={a.sourceId} className="mt-3 text-sm"><p className="font-semibold">{a.label}</p>
      <p>{a.payout==='none'?'퇴직 시 개인IRP로 이전 · 별도 지급 없음':`${a.start} ~ ${a.end} · ${a.payout==='fixed'?`${a.monthlyAmount?.toLocaleString()}원/월 (임시 조회액)`:a.annualTotalReturn+'% 총수익률, 잔액으로 월액 재산정'} · 매 수령기념월 ${a.annualIncrease}% 증가`}</p>
      <p className="text-gray-400">등록 납입 합계 {a.contributions.reduce((s,c)=>s+c.amount,0).toLocaleString()}원 (회사 지원 {a.contributions.reduce((s,c)=>s+c.employerAmount,0).toLocaleString()}원 포함)</p>
      <details className="text-xs text-gray-400"><summary className="cursor-pointer">납입 일정</summary>{a.contributions.map(c=><p key={c.month}>{c.month}: {c.amount.toLocaleString()}원{c.employerAmount>0?` (회사 ${c.employerAmount.toLocaleString()}원)`:''}</p>)}</details>
      {[a.fundingReview,a.payoutReview,a.taxReview,a.contributionReview].filter(Boolean).map(n=><p key={n} className="text-xs text-amber-300">확인 필요: {n}</p>)}
    </div>)}
    <p className="text-xs text-gray-400 mt-3">연간 합계 ÷ 12는 연평균 월액입니다. 4월 개시 연도는 9개월, 종료 연도는 3개월만 수령합니다.</p>
  </details>
}
