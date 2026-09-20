import type {AnnualHealthResult} from '@/lib/annualHealth'
import {formatManwon,formatMoney} from '@/lib/utils'
import {Link} from 'react-router-dom'
export function HealthBreakdown({value,summaryShown=false}:{value:AnnualHealthResult;summaryShown?:boolean}){
  const v=value;
  const joint=v.mode==='joint';
  const individualRows:[string,number,number][]=[
    ['소득분',v.husbandSeparate.incomeMonthly,v.wifeSeparate.incomeMonthly],
    ['재산분',v.husbandSeparate.propertyMonthly,v.wifeSeparate.propertyMonthly],
    ['장기요양',v.husbandSeparate.longTermCare,v.wifeSeparate.longTermCare],
    ...(!summaryShown||joint?[[joint?'개인별 참고액':'개인별 예상액',v.husbandSeparate.grandTotal,v.wifeSeparate.grandTotal] as [string,number,number]]:[]),
  ];
  return <div className="space-y-3 text-xs" data-health-breakdown data-monthly-health={v.totalMonthly}>
    {!summaryShown&&<p className="text-lg font-semibold">{formatMoney(v.totalMonthly)}/월 <span className="text-xs text-gray-400">생활비 반영액 · {joint?'같은 지역가입 세대':'각각 지역가입 세대'} · 장기요양 포함</span></p>}
    {v.assumed&&<p className="text-amber-300">{!summaryShown&&'가입 형태 미확인: 같은 지역가입 세대로 가정했습니다. '}직장가입자·피부양자이면 이 추정액을 사용할 수 없습니다. <Link className="underline" to="/analysis?tab=pension-sim">가입 가정 확인 →</Link></p>}
    <section data-health-individual-reference={joint?'true':'false'} className="space-y-2">
      <h3 className="font-semibold text-gray-200">{joint?'남편·아내 각각 계산하면 (별도 지역가입 세대 가정)':'남편·아내 보험료 구성'} · 월</h3>
      <table className="w-full text-right"><thead><tr><th className="text-left">항목</th><th>남편</th><th>아내</th></tr></thead><tbody>
        {individualRows.map(([label,h,w])=><tr key={label} className="border-t border-gray-700"><th className="text-left py-2 font-normal">{label}</th><td className="px-1 tabular-nums">{formatMoney(h)}</td><td className="tabular-nums">{formatMoney(w)}</td></tr>)}
      </tbody></table>
      {joint?<p className="text-gray-400">개인별 참고액 합계 {formatMoney(v.husbandSeparate.grandTotal+v.wifeSeparate.grandTotal)}/월. 실제 개인별 고지액이나 세대 보험료의 배분액이 아닙니다. 같은 세대는 소득·재산을 합산하고 재산 공제 1억 원을 한 번 적용해 등급을 정하므로, 각각 공제한 위 참고액의 합계와 다를 수 있습니다. 생활비에는 상단의 세대 합산액만 반영합니다.</p>:<p className="text-gray-400">각각 별도 지역가입 세대로 계산하며, 생활비에는 두 금액의 합계만 반영합니다.</p>}
    </section>
    <div className="overflow-x-auto"><table className="w-full text-right"><thead><tr><th className="text-left">반영 근거</th><th>남편</th><th>아내</th></tr></thead><tbody>{[
      ['공적연금(연, 50% 반영)',v.husband.publicPension,v.wife.publicPension],
      ['IRP·사적연금 지급(연, 건보 제외 가정)',v.husband.excludedPrivate,v.wife.excludedPrivate],
      ['이자·배당(연, 반영액)',v.husband.includedFinancial,v.wife.includedFinancial],
      ['기타소득(연, 반영액)',v.husband.other,v.wife.other],
      ['부동산 추정 과세표준',v.husband.propertyTaxBase,v.wife.propertyTaxBase],
    ].map(([label,h,w])=><tr key={label as string} className="border-t border-gray-700"><td className="text-left py-2 pr-2">{label}</td><td className="whitespace-nowrap px-1">{formatManwon(h as number)}</td><td className="whitespace-nowrap px-1">{formatManwon(w as number)}</td></tr>)}</tbody></table></div>
    {(joint?[{label:'생활비에 반영하는 세대 계산',p:v.joint}]:[{label:'남편 세대',p:v.husbandSeparate},{label:'아내 세대',p:v.wifeSeparate}]).map(({label,p})=><div key={label} className="bg-gray-900/40 rounded p-2 space-y-1" data-health-premium={p.grandTotal}><p className="font-semibold">{label}</p><p>재산 공제 후 {formatMoney(p.deductedProperty)} → {p.score}점</p>{joint&&<p>소득분 {formatMoney(p.incomeMonthly)} + 재산분 {formatMoney(p.propertyMonthly)} + 장기요양 {formatMoney(p.longTermCare)}</p>}</div>)}
    <p className="text-gray-400">IRP 입금·원금 인출을 새 금융소득으로 더하지 않습니다. 부동산은 시가 자체가 아닌 시가 × 75% × 60%의 추정 과세표준을 사용합니다. 공사 중 토지 과표는 미반영이므로 해당 기간은 과소 산정될 수 있습니다. 실제 공시가격·과세표준과 고지 내역 확인이 필요합니다.</p>
    <p className="text-gray-400">2026년 요율 7.19% · 점수당 211.5원 유지 가정. 연간 금융소득은 개인별 1천만 원 초과 시 전액 반영합니다. 소득·재산의 실제 부과 시차, 피부양자·직장 자격, 감면·주택부채 공제는 미반영입니다. 실제 고지액이나 미래 제도를 보장하지 않습니다.</p>
  </div>
}
