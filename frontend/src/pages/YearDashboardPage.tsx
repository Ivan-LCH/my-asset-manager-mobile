// 연도별 대시보드 — 선택 연도의 수입·세금·건보료·생활비 스냅샷.
// +/− 스위처로 연도를 바꾸면 즉시 재계산 (미저장 순수 상태).
// 파생 계산은 hooks/useAnalysisEngine (RetirementPage 현금흐름과 동일 엔진·가정 공유).
import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useRetirement } from '@/hooks/useRetirement'
import { useSettings } from '@/hooks/useSettings'
import { useAnalysisEngine } from '@/hooks/useAnalysisEngine'
import { EMPTY_PLAN, normalizeSavedPlan, fmtM, pnlColor } from '@/lib/retirementPlan'
import { SIM_START_YEAR } from '@/lib/pensionCalc'
import { formatManwon } from '@/lib/utils'
import { estimateHoldingTax, toHoldingTaxAssets } from '@/lib/holdingTax'
import { hasSpouse } from '@/lib/people'

/** 라인 행 — 0원이면 렌더 생략 (지저분함 방지) */
function Line({ label, monthly, note, tone }: { label: string; monthly: number; note?: string; tone?: string }) {
  if (monthly <= 0) return null
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40 last:border-0">
      <span className="text-xs text-gray-400">{label}{note && <span className="text-gray-600"> · {note}</span>}</span>
      <span className={`text-sm font-semibold ${tone ?? 'text-gray-200'}`}>{formatManwon(monthly)}{note ? '' : '/월'}</span>
    </div>
  )
}

export default function YearDashboardPage() {
  const { data: saved } = useRetirement()
  const { data: settings } = useSettings()
  const plan = useMemo(
    () => (saved && Object.keys(saved).length > 0 ? normalizeSavedPlan(saved) : EMPTY_PLAN),
    [saved],
  )
  const eng = useAnalysisEngine(plan)
  const [yearOverride, setYearOverride] = useState<number | null>(null)

  const firstYear = SIM_START_YEAR
  const lastYear = eng.cashFlow.length > 0 ? eng.cashFlow[eng.cashFlow.length - 1].year : SIM_START_YEAR
  const clamp = (y: number) => Math.min(lastYear, Math.max(firstYear, y))
  const year = yearOverride ?? clamp(plan.retirementYear)
  const row = eng.cashFlow.find((r) => r.year === year)
  const currentYear = new Date().getFullYear()
  const age = eng.currentAge + (year - currentYear)
  const withWife = hasSpouse(settings ?? {})

  // 세금 구성 — 표 합계(|taxAnnual|)와 동일 소스: 소득세 + 보유세 + 퇴직소득세
  const incomeTax = eng.pensionLinked
    ? (eng.taxByYear.get(year) ?? 0)
    : row ? (row.dividendMonthly * 0.154 + row.corpSalaryMonthly * 0.03) * 12 : 0
  const holdAuto = plan.holdingTaxAuto
  const holdDetail = estimateHoldingTax(toHoldingTaxAssets(eng.realEstateAssets), year)
  const holdAnnual = holdAuto
    ? holdDetail.total
    : year >= (plan.holdingTaxStartYear ?? Infinity) ? (plan.holdingTaxAnnual ?? 0) : 0
  const severanceAnnual = eng.lumpsumTaxByYear.get(year) ?? 0
  const taxSum = incomeTax + holdAnnual + severanceAnnual

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-screen-xl mx-auto">
      {/* ── 연도 스위처 (스티키) ── */}
      <div className="sticky top-11 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setYearOverride(clamp(year - 1))}
            disabled={year <= firstYear}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 border border-gray-600
              text-gray-200 hover:bg-gray-700 disabled:opacity-30 transition-colors"
            aria-label="이전 연도"
          >
            <Minus className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[110px]">
            <p className="text-2xl font-bold text-blue-300 leading-tight tabular-nums">{year}년</p>
            <p className="text-xs text-gray-500">남편 {age}세{withWife ? '' : ' · 미혼(단독)'} · {firstYear}~{lastYear}</p>
          </div>
          <button
            onClick={() => setYearOverride(clamp(year + 1))}
            disabled={year >= lastYear}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 border border-gray-600
              text-gray-200 hover:bg-gray-700 disabled:opacity-30 transition-colors"
            aria-label="다음 연도"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!row ? (
        <p className="text-sm text-gray-500 text-center py-8">해당 연도 데이터가 없습니다.</p>
      ) : (
        <>
          {/* ── ① KPI ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 수입</p>
              <p className="text-lg font-bold text-emerald-400">{formatManwon(row.totalIncome)}</p>
            </div>
            <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 지출</p>
              <p className="text-lg font-bold text-red-400">{formatManwon(row.totalExpense)}</p>
            </div>
            <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 여유/부족</p>
              <p className={`text-lg font-bold ${pnlColor(row.balance)}`}>
                {row.balance >= 0 ? '+' : ''}{formatManwon(row.balance)}
              </p>
            </div>
            <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">연 누적 (세후)</p>
              <p className={`text-lg font-bold ${pnlColor(row.cumulative)}`}>{formatManwon(row.cumulative)}</p>
            </div>
          </div>

          {/* ── ② 수입 상세 ── */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">💰 수입 상세 ({year}년)</h3>
            <Line label="국민연금" monthly={row.nationalPensionMonthly} tone="text-emerald-400" />
            <Line label="개인연금 (IRP·퇴직·연금저축)" monthly={row.pensionMonthly} tone="text-emerald-400" />
            <Line label="배당 (성장률 반영)" monthly={row.dividendMonthly} tone="text-emerald-400" />
            <Line label="법인 급여" monthly={row.corpSalaryMonthly} tone="text-emerald-400" />
            <Line label="가수금 반환 (비과세)" monthly={row.corpReturnMonthly} tone="text-emerald-400" />
            <Line label="목돈 수입" monthly={row.lumpsumReceived} note={`${year}년 일회`} tone="text-emerald-400" />
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-gray-700">
              <span className="text-xs text-gray-300 font-semibold">월 수입 합계</span>
              <span className="text-base font-bold text-emerald-400">{formatManwon(row.totalIncome)}</span>
            </div>
          </div>

          {/* ── ③ 세금 상세 (연) ── */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">🧾 세금 상세 (연납)</h3>
            <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
              <span className="text-xs text-gray-400">
                소득세 (연금·금융)
                {eng.pensionLinked
                  ? <span className="text-gray-600"> · 남편 {fmtM(eng.husbandTaxByYear.get(year) ?? 0)} / 와이프 {fmtM(eng.wifeTaxByYear.get(year) ?? 0)}</span>
                  : <span className="text-gray-600"> · 근사 (배당 15.4% + 급여 3%)</span>}
              </span>
              <span className="text-sm font-semibold text-red-300">{formatManwon(incomeTax)}</span>
            </div>
            <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
              <span className="text-xs text-gray-400">
                보유세 (재산세+종부세)
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${holdAuto ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
                  {holdAuto ? '자동' : '수동'}
                </span>
                {holdAuto && (
                  <span className="text-gray-600"> · 재산세 {fmtM(holdDetail.husband.propertyTax + holdDetail.wife.propertyTax)} · 종부세 {fmtM(holdDetail.husband.comprehensiveTax + holdDetail.wife.comprehensiveTax)}</span>
                )}
              </span>
              <span className="text-sm font-semibold text-red-300">{formatManwon(holdAnnual)}</span>
            </div>
            {severanceAnnual > 0 && (
              <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
                <span className="text-xs text-gray-400">퇴직소득세 (목돈 수령)</span>
                <span className="text-sm font-semibold text-red-300">{formatManwon(severanceAnnual)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-gray-700">
              <span className="text-xs text-gray-300 font-semibold">연납 세금 합계</span>
              <span className="text-base font-bold text-red-400">{formatManwon(taxSum)}</span>
            </div>
          </div>

          {/* ── ④ 건강보험 상세 (월) ── */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">🏥 건강보험 (월)</h3>
            {eng.pensionLinked ? (
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-gray-500 mb-1">🧑 남편</p>
                  <p className="text-sm font-semibold text-gray-100">{formatManwon(eng.husbandHealthByYear.get(year) ?? 0)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-gray-500 mb-1">👩 와이프</p>
                  <p className="text-sm font-semibold text-gray-100">{formatManwon(eng.wifeHealthByYear.get(year) ?? 0)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2.5">
                  <p className="text-gray-500 mb-1">🏠 합계</p>
                  <p className="text-sm font-semibold text-gray-100">{formatManwon(row.healthInsuranceMonthly)}</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-lg font-bold text-gray-100">{formatManwon(row.healthInsuranceMonthly)}<span className="text-xs text-gray-500 font-normal"> /월 · 가구</span></p>
                <p className="text-xs text-gray-600 mt-1">🪙 연금시뮬 연동 시 1인별(소득분·재산분)로 표시됩니다.</p>
              </div>
            )}
          </div>

          {/* ── ⑤ 생활비 상세 (월) ── */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">🏠 생활비 상세 (월)</h3>
            {plan.expenses.filter((e) => e.amount > 0).map((e) => (
              <Line key={e.id} label={e.name} monthly={e.amount} tone="text-red-300" />
            ))}
            <Line label="여행 (연 횟수 환산)" monthly={row.travelMonthly} tone="text-red-300" />
            <Line label="의료" monthly={row.medicalMonthly} tone="text-red-300" />
            {row.emergencyAnnual > 0 && (
              <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
                <span className="text-xs text-gray-400">긴급 지출</span>
                <span className="text-sm font-semibold text-red-300">{formatManwon(row.emergencyAnnual)}<span className="text-xs text-gray-500 font-normal"> /연</span></span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-gray-700">
              <span className="text-xs text-gray-300 font-semibold">월 지출 합계 (건보 포함)</span>
              <span className="text-base font-bold text-red-400">{formatManwon(row.totalExpense)}</span>
            </div>
          </div>

          <p className="text-xs text-gray-600 text-center leading-relaxed">
            세금·건보·보유세는 현행 세율 기반 근사 추정입니다 (공시가격=시가×75% 등 가정 포함). 실제 납부액과 다를 수 있으니 세무사 확인 필수.
          </p>
        </>
      )}
    </div>
  )
}
