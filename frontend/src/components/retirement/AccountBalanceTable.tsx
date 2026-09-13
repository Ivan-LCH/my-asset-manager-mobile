// 계좌 잔액 추이 표 (IRP + 일반주식계좌 + 부동산) — RetirementPage 에서 추출 (UI 간소화 ④).
import { simulateAccounts } from '@/lib/accountSim'
import { stockAccountBalances } from '@/lib/pensionSim'
import { formatManwon } from '@/lib/utils'

export function AccountBalanceTable({ rows, irpGrowthRate, irpDivYield, sb }: {
  rows: ReturnType<typeof simulateAccounts>
  irpGrowthRate: number
  irpDivYield: number
  sb: ReturnType<typeof stockAccountBalances> | null
}) {
  return (
    <div className="bg-gray-800 border border-cyan-700/40 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">💎 계좌 잔액 추이 <span className="text-xs font-normal text-gray-500">(IRP 상승률 {irpGrowthRate.toFixed(1)}% · 배당률 {irpDivYield}% / 주식 남편 {sb ? sb.husband.growthRate.toFixed(1) : 0}%·{sb ? sb.husband.dividendYield : 0}% · 와이프 {sb ? sb.wife.growthRate.toFixed(1) : 0}%·{sb ? sb.wife.dividendYield : 0}%)</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 pr-2 font-medium whitespace-nowrap">연도</th>
              <th className="text-right py-2 px-1 font-medium">IRP 잔액</th>
              <th className="hidden sm:table-cell text-right py-2 px-1 font-medium">IRP 성장</th>
              <th className="hidden sm:table-cell text-right py-2 px-1 font-medium">IRP 배당</th>
              <th className="hidden sm:table-cell text-right py-2 px-1 font-medium">IRP 연금</th>
              <th className="text-right py-2 px-1 font-medium">주식 잔액</th>
              <th className="hidden sm:table-cell text-right py-2 px-1 font-medium">주식 배당</th>
              <th className="text-right py-2 px-1 font-medium">부동산</th>
              <th className="text-right py-2 px-1 font-medium">총자산</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter((_, i) => i % 3 === 0).map((r) => (
              <tr key={r.year} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="py-2 pr-2 text-gray-400 whitespace-nowrap">{r.year}</td>
                <td className="text-right py-2 px-1 text-blue-300 font-semibold">{r.irpEnd > 0 ? formatManwon(r.irpEnd) : '소진'}</td>
                <td className="hidden sm:table-cell text-right py-2 px-1 text-cyan-400/70">{formatManwon(r.irpGrowth)}</td>
                <td className="hidden sm:table-cell text-right py-2 px-1 text-emerald-400/70">{formatManwon(r.irpDividend)}</td>
                <td className="hidden sm:table-cell text-right py-2 px-1 text-orange-400/70">{formatManwon(r.irpPension)}</td>
                <td className="text-right py-2 px-1 text-emerald-300 font-semibold">{formatManwon(r.stockEnd)}</td>
                <td className="hidden sm:table-cell text-right py-2 px-1 text-emerald-400/70">{formatManwon(r.stockDividend)}</td>
                <td className="text-right py-2 px-1 text-amber-300 font-semibold">{formatManwon(r.realEstateEnd)}</td>
                <td className="text-right py-2 px-1 text-gray-100 font-bold">{formatManwon(r.totalEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600 mt-2">
        IRP: 매년 주가상승 + 배당(연금 우선 충당, 남으면 재투자). 일반주식계좌: 매년 주가상승, 배당은 전액 수입(재투자 X). 총자산 = IRP + 주식 잔액 (현금·부동산 제외).
      </p>
    </div>
  )
}
