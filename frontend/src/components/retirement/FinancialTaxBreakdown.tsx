import {Link} from 'react-router-dom'
import {annualIncomeTax} from '@/lib/incomeTax'
import {useSettings} from '@/hooks/useSettings'
import type {PensionScheduleRow} from '@/lib/pensionSim'
import type {PensionSimPlan} from '@/types'

const won=(value:number)=>Math.round(value).toLocaleString('ko-KR')+'원'
export function FinancialTaxBreakdown({row,plan}:{row:PensionScheduleRow;plan:PensionSimPlan}) {
  const {data:settings}=useSettings()
  const taxes=annualIncomeTax(row,plan,settings)
  const unresolved=taxes.husband.unresolvedPension+taxes.wife.unresolvedPension>0
  return <details className="my-3 rounded-lg border border-gray-700 p-3" data-financial-tax-total={taxes.totalTax} data-tax-incomplete={taxes.incomplete}>
    <summary className="cursor-pointer text-sm text-blue-300">연금·금융 종합세금 내역 · 연 {won(taxes.totalTax)}{unresolved?' + 미확정':''}</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['husband','wife'] as const).map(owner=>{
      const t=taxes[owner]
      const line=(label:string,amount:number,key:string)=><div className="flex flex-wrap justify-between gap-x-2 gap-y-1" data-tax-field={key} data-amount={amount}><dt className="text-gray-400">{label}</dt><dd className="tabular-nums text-gray-100">{won(amount)}</dd></div>
      return <section key={owner} data-financial-tax-owner={owner} className="min-w-0 rounded bg-gray-900/50 p-3 text-xs space-y-2">
        <h4 className="font-semibold text-gray-200">{owner==='husband'?'남편':'아내'} · {row.year}년</h4>
        <dl className="space-y-2">
          {line('연간 금융소득 (세전)',t.financialIncome,'income')}
          {t.publicPension>0&&line('국민연금 과세대상 지급액',t.publicPensionTaxable,'public-pension')}
          {t.privatePension>0&&line('사적연금 · '+(t.privateMode==='separate'?'분리과세':'종합합산'),t.privatePension,'private-pension')}
          {t.retirementPension>0&&line('퇴직금 재원 연금 · 분리',t.retirementPension,'retirement-pension')}
          {t.otherIncome>0&&line('기타 종합소득금액',t.otherIncome,'other-income')}
          {t.pensionDeduction>0&&line('합산 연금소득공제',t.pensionDeduction,'pension-deduction')}
        </dl>
        <p className={t.exceedsThreshold?'text-amber-300':'text-gray-400'}>{t.exceedsThreshold?'종합과세 검토 대상 · 일반 금융소득 2천만원 초과':'일반 금융소득 2천만원 이하'}</p>
        {t.unresolvedPension>0&&<p className="text-amber-200" role="status">재원·세율 미확정 연금 {won(t.unresolvedPension)}의 세금은 아래 소계에서 제외됩니다. 세금 0원이 아닙니다.</p>}
        <dl className="space-y-2 border-t border-gray-700 pt-2">
          {line(t.withholdingEstimated?'① 원천징수 예상액 (국내+해외)':'① 입력 기납부액 (국내+해외)',t.withholdingTax,'withholding')}
          {t.unresolvedPension>0?<div className="text-amber-200" data-tax-field="additional" data-unresolved="true"><dt>② 추가 납부·환급액</dt><dd>미확정 · 연금 재원과 세율 확인 필요</dd></div>:line(t.additionalTax<0?'② 정산 환급 예상액 (차감)':'② 추가 납부 예상액',t.additionalTax,'additional')}
          {line(t.unresolvedPension>0?'반영된 세금 소계 · 미확정 제외':'총 세금 부담 (① + ②)',t.totalTax,'total')}
        </dl>
        <details className="pt-1"><summary className="cursor-pointer text-blue-300">계산 근거 · 공제 내역</summary><dl className="mt-2 space-y-2">
          {line('인적·기타 소득공제',t.incomeDeduction,'income-deduction')}
          {line('종합과세 계산 과세표준',t.comprehensiveTaxable,'taxable-base')}
          {t.exceedsThreshold&&<>{line('일반 산출 (국세)',t.generalNationalTax,'general-tax')}{line('비교 산출 (국세)',t.comparisonNationalTax,'comparison-tax')}</>}
          {line('배당가산액 · 현금 수입 아님',t.grossUp,'gross-up')}
          {line('배당세액공제 (국세)',t.dividendCredit,'dividend-credit')}
          {line('종합·일반 금융 국세',t.comprehensiveNational,'national-tax')}
          {line('종합·일반 금융 지방세',t.comprehensiveLocal,'local-tax')}
          {t.privateSeparateTax>0&&line('사적연금 분리과세 (지방세 포함)',t.privateSeparateTax,'private-tax')}
          {t.retirementTax>0&&line('퇴직금 재원 연금세 (지방세 포함)',t.retirementTax,'retirement-tax')}
          {t.selectedDividend>0&&line('선택분리 배당세 (기존 가정)',t.selectedDividendTax,'selected-tax')}
          {t.foreignTaxPaid>0&&line('외국납부세액 · 총 부담에 포함',t.foreignTaxPaid,'foreign-paid')}
          {(t.foreignIncome>0||t.foreignCreditNational>0)&&line('확인된 외국납부 공제 (국세)',t.foreignCreditNational,'foreign-credit-national')}
          {(t.foreignIncome>0||t.foreignCreditLocal>0)&&line('확인된 외국납부 공제 (지방세)',t.foreignCreditLocal,'foreign-credit-local')}
          {t.nationalCredit>0&&line('기타 세액공제 (국세)',t.nationalCredit,'national-credit')}
          {t.localCredit>0&&line('기타 세액공제 (지방세)',t.localCredit,'local-credit')}
        </dl></details>
        {!t.unresolvedPension&&t.additionalTax===0&&t.totalTax>0&&<p className="text-gray-400">추가 납부 0원은 면세가 아닙니다. 원천징수액이 총 부담에 포함됩니다.</p>}
        {t.notes.length>0&&<details><summary className={t.incomplete?'cursor-pointer text-amber-200':'cursor-pointer text-gray-400'}>{t.incomplete?'확인이 필요한 정보':'계산에 사용한 가정'} {t.notes.length}건</summary><ul className="list-disc pl-4 mt-2 space-y-2 text-gray-400">{t.notes.map(note=><li key={note}>{note}</li>)}</ul></details>}
      </section>
    })}</div>
    <p className="mt-3 text-xs text-gray-400 leading-relaxed">국민연금과 종합합산 선택 사적연금은 공제 후 금융·기타소득과 함께 계산합니다. 배당가산·세액공제는 확인된 적격 비율에만 적용합니다. 해외 세액공제는 국가별 한도 검토가 끝난 입력액을 사용하며 자동 한도·이월 계산은 하지 않습니다. 2026년 기준의 미래 추정이며 신고 확정세액은 아닙니다.</p>
    <p className="mt-2 text-xs text-blue-200">이 금액은 소득세 합계에 이미 포함되어 연간 현금흐름에서 한 번만 차감합니다. 배당가산액은 수입에 더하지 않습니다. 실제 원천징수일·다음 해 신고 납부일을 재현한 현금흐름은 아닙니다.</p>
    <Link className="mt-2 inline-block text-xs text-blue-300 underline" to="/analysis?tab=pension-sim#income-tax-settings">세금 추가정보 확인·수정 →</Link>
  </details>
}
