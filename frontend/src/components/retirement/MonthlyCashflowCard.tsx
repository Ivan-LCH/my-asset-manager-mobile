// 월 현금흐름 요약 카드 (대표 연도 = 은퇴 연도) — RetirementPage 에서 추출 (UI 간소화 ④).
import { formatManwon } from '@/lib/utils'
import { fmtM, pnlColor } from '@/lib/retirementPlan'
import type { CashFlowRow } from '@/lib/retirementCashflow'

export function MonthlyCashflowCard({ retirementRow, retirementYear, linkMode }: {
  retirementRow: CashFlowRow | undefined
  retirementYear: number
  linkMode: 'none' | 'corp' | 'pension'
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">📊 월 현금흐름 ({retirementYear}년 기준)</h3>
        <span className="text-xs text-amber-300">연간 세금·일회성 지출 차감 전 예상 월수지</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {/* 월 수입 */}
        <div className="bg-emerald-950/20 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">월 수입</p>
          <p className="text-base sm:text-xl font-bold text-emerald-400">
            {retirementRow ? formatManwon(retirementRow.totalIncome) : '-'}
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-tight">
            {retirementRow ? [
              retirementRow.nationalPensionMonthly > 0 ? `국민 ${fmtM(retirementRow.nationalPensionMonthly)}` : null,
              retirementRow.pensionMonthly > 0 ? `연금 ${fmtM(retirementRow.pensionMonthly)}` : null,
              retirementRow.dividendMonthly > 0 ? `배당 ${fmtM(retirementRow.dividendMonthly)}` : null,
              ...(linkMode === 'corp' ? [
                retirementRow.corpSalaryMonthly > 0 ? `급여 ${fmtM(retirementRow.corpSalaryMonthly)}` : null,
                retirementRow.corpReturnMonthly > 0 ? `가수금 ${fmtM(retirementRow.corpReturnMonthly)}` : null,
              ] : []),
            ].filter(Boolean).join(' · ') : '-'}
          </p>
        </div>
        {/* 월 지출 */}
        <div className="bg-red-950/20 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">월 지출</p>
          <p className="text-base sm:text-xl font-bold text-red-400">
            {retirementRow ? formatManwon(retirementRow.totalExpense) : '-'}
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-tight">
            {retirementRow ? [
              `생활비 ${fmtM(retirementRow.expenseMonthly)}`,
              retirementRow.travelMonthly + retirementRow.medicalMonthly > 0 ? `여행·의료 ${fmtM(retirementRow.travelMonthly + retirementRow.medicalMonthly)}` : null,
              retirementRow.healthInsuranceMonthly > 0 ? `건보 ${fmtM(retirementRow.healthInsuranceMonthly)}` : null,
            ].filter(Boolean).join(' · ') : '-'}
          </p>
        </div>
        {/* 월 여유/부족 */}
        <div className="bg-gray-900/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">월 여유/부족</p>
          <p className={`text-base sm:text-xl font-bold ${pnlColor(retirementRow?.balance ?? 0)}`}>
            {retirementRow
              ? `${retirementRow.balance >= 0 ? '+' : ''}${formatManwon(retirementRow.balance)}`
              : '-'}
          </p>
          <p className="text-xs text-gray-600 mt-1">월 누적 × 12 − 세금(연) = 연 누적</p>
        </div>
      </div>
    </div>
  )
}
