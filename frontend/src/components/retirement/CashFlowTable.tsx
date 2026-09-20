// 연도별 현금흐름 테이블 — RetirementPage 에서 추출 (UI 간소화 ④).
// 세로 모드(기본 폰)는 핵심 6열, 가로 모드에서 전체 열 표시.
import { fmtM, pnlColor } from '@/lib/retirementPlan'
import type { CashFlowRow } from '@/lib/retirementCashflow'

export function CashFlowTable({ rows, retirementYear, linkMode }: {
  rows: CashFlowRow[]
  retirementYear: number
  linkMode: 'none' | 'corp' | 'pension'
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">📊 연도별 현금흐름 <span className="text-xs font-normal text-gray-500">(단위: 만원 · /월=월, (연)=연간)</span></h3>
      <p className="text-xs text-amber-300 mb-2">배당 수입은 개인 세금 차감 전입니다. 월 수지는 연간 세금·일회성 지출 차감 전이며, 이 항목들은 누적 금액에 반영됩니다.</p>
      <div className="overflow-x-auto">
        <p className="text-xs text-gray-500 mb-2 landscape:hidden">📌 세로 모드: 핵심 6열만 표시. 전체 내역은 가로로 돌려보세요.</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 pr-2 font-medium whitespace-nowrap">연도(나이)</th>
              {/* 수입 그룹 (연한 초록 배경) */}
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">국민/월</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">연금/월</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">배당/월</th>
              {linkMode === 'corp' && <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">급여/월</th>}
              {linkMode === 'corp' && <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">가수금/월</th>}
              <th className="text-right py-2 px-1 font-medium bg-emerald-950/30">월수입</th>
              {/* 지출 그룹 (연한 빨강 배경) */}
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">생활비/월</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">여행+의료/월</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">건보/월</th>
              <th className="text-right py-2 px-1 font-medium bg-red-950/20">월지출</th>
              {/* 결과 그룹 */}
              <th className="text-right py-2 px-1 font-medium">+/-</th>
              <th className="text-right py-2 px-1 font-medium">세금(연)</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">목돈</th>
              <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">긴급지출</th>
              <th className="text-right py-2 pl-1 font-medium">누적</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isRetirementYear = row.year === retirementYear
              const hasEmergency     = row.emergencyAnnual > 0
              return (
                <tr
                  key={row.year}
                  className={`border-b border-gray-700/50 ${
                    isRetirementYear ? 'bg-blue-500/10' : 'hover:bg-gray-700/30'
                  }`}
                >
                  <td className={`py-2 pr-2 font-medium whitespace-nowrap ${isRetirementYear ? 'text-blue-400' : 'text-gray-300'}`}>
                    {row.year}<span className="text-gray-500">({row.age})</span>
                    {isRetirementYear && <span className="ml-1 text-xs text-blue-500">은퇴</span>}
                  </td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-blue-300 bg-emerald-950/30">
                    {row.nationalPensionMonthly > 0 ? fmtM(row.nationalPensionMonthly) : '—'}
                  </td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-300 bg-emerald-950/30">
                    {row.pensionMonthly > 0 ? fmtM(row.pensionMonthly) : '—'}
                  </td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-emerald-400 bg-emerald-950/30">
                    {row.dividendMonthly > 0 ? fmtM(row.dividendMonthly) : '—'}
                  </td>
                  {linkMode === 'corp' && <td className="hidden landscape:table-cell text-right py-2 px-1 text-blue-400 bg-emerald-950/30">
                    {row.corpSalaryMonthly > 0 ? fmtM(row.corpSalaryMonthly) : '—'}
                  </td>}
                  {linkMode === 'corp' && <td className="hidden landscape:table-cell text-right py-2 px-1 text-cyan-400 bg-emerald-950/30">
                    {row.corpReturnMonthly > 0 ? fmtM(row.corpReturnMonthly) : '—'}
                  </td>}
                  <td className="text-right py-2 px-1 font-semibold text-gray-100 bg-emerald-950/30">
                    {fmtM(row.totalIncome)}
                  </td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">{fmtM(row.expenseMonthly)}</td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">
                    {(row.travelMonthly + row.medicalMonthly) > 0 ? fmtM(row.travelMonthly + row.medicalMonthly) : '—'}
                  </td>
                  <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">
                    {row.healthInsuranceMonthly > 0 ? fmtM(row.healthInsuranceMonthly) : '—'}
                  </td>
                  <td className="text-right py-2 px-1 font-semibold text-gray-100 bg-red-950/20">
                    {fmtM(row.totalExpense)}
                  </td>
                  <td className={`text-right py-2 px-1 font-bold ${pnlColor(row.balance)}`}>
                    {row.balance >= 0 ? '+' : ''}{fmtM(row.balance)}
                  </td>
                  <td className={`text-right py-2 px-1 ${row.taxAnnual < 0 ? 'text-orange-400 font-semibold' : 'text-gray-600'}`}>
                    {row.taxAnnual < 0 ? fmtM(row.taxAnnual) : '—'}
                  </td>
                  <td className={`hidden landscape:table-cell text-right py-2 px-1 ${row.lumpsumReceived > 0 ? 'text-emerald-400 font-semibold' : 'text-gray-600'}`}>
                    {row.lumpsumReceived > 0 ? '+' : ''}{row.lumpsumReceived > 0 ? fmtM(row.lumpsumReceived) : '—'}
                  </td>
                  <td className={`hidden landscape:table-cell text-right py-2 px-1 ${hasEmergency ? 'text-orange-400 font-semibold' : 'text-gray-600'}`}>
                    {hasEmergency ? fmtM(row.emergencyAnnual) : '—'}
                  </td>
                  <td className={`text-right py-2 pl-1 font-semibold ${pnlColor(row.cumulative)}`}>
                    {row.cumulative >= 0 ? '+' : ''}{fmtM(row.cumulative)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
