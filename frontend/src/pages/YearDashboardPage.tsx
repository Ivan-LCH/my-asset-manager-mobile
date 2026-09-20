import { Link } from 'react-router-dom'
import { AnalysisNotices } from '@/components/retirement/AnalysisNotices'
import { PensionLedger } from '@/components/retirement/PensionLedger'
import { PensionIncomeDetails } from '@/components/retirement/PensionIncomeDetails'
import { HealthBreakdown } from '@/components/retirement/HealthBreakdown'
import { FinancialTaxBreakdown } from '@/components/retirement/FinancialTaxBreakdown'
import { retirementInputs } from '@/lib/analysisInputs'
import { expenseFactor } from '@/lib/retirementCashflow'
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
import { formatManwon, formatMoney } from '@/lib/utils'
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
    () => retirementInputs(saved,settings).plan,
    [saved,settings],
  )
  const eng = useAnalysisEngine(plan)
  const [yearOverride, setYearOverride] = useState<number | null>(null)

  const firstYear = SIM_START_YEAR
  const lastYear = eng.cashFlow.length > 0 ? eng.cashFlow[eng.cashFlow.length - 1].year : SIM_START_YEAR
  const clamp = (y: number) => Math.min(lastYear, Math.max(firstYear, y))
  const year = yearOverride ?? clamp(plan.retirementYear)
  const row = eng.cashFlow.find((r) => r.year === year)
  const healthDetail = eng.pensionLinked ? eng.healthDetailsByYear.get(year) : undefined
  const pensionRow = eng.projection.rows.find(r => r.year === year)
  const incomeTaxDetail = eng.incomeTaxDetailsByYear.get(year)
  const currentYear = new Date().getFullYear()
  const age = eng.currentAge + (year - currentYear)
  const withWife = hasSpouse(settings ?? {})

  // 세금 구성 — 표 합계(|taxAnnual|)와 동일 소스: 소득세 + 보유세 + 퇴직소득세
  const incomeTax = row?.incomeTaxAnnual ?? 0
  const holdAuto = plan.holdingTaxAuto
  const holdDetail = estimateHoldingTax(toHoldingTaxAssets(eng.realEstateAssets), year)
  const holdAnnual = row?.holdingTaxAnnual ?? 0
  const severanceAnnual = row?.lumpsumTaxAnnual ?? 0
  const taxSum = incomeTax + holdAnnual + severanceAnnual
  const pensionTaxUnknown=(!eng.pensionLinked&&!!row&&(row.nationalPensionMonthly+row.pensionMonthly)>0)||!!incomeTaxDetail&&(incomeTaxDetail.husband.unresolvedPension>0||incomeTaxDetail.wife.unresolvedPension>0)

  if(eng.isLoading)return <p role="status" className="p-6">분석에 연결된 입력을 불러오는 중…</p>
  if(eng.error)return <p role="alert" className="p-6 text-red-300">분석 입력을 읽지 못했습니다. 새로고침 후 확인해 주세요.</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-analysis-year={year} data-monthly-income={row.totalIncome} data-monthly-expense={row.totalExpense} data-annual-tax={taxSum}>
            <button aria-controls="analysis-income" onClick={()=>{const el=document.getElementById('analysis-income') as HTMLDetailsElement;el.open=true;el.scrollIntoView({block:'nearest'})}} className="text-left bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 수입</p>
              <p className="text-lg font-bold text-emerald-400">{formatManwon(row.totalIncome)}</p>
            </button>
            <button aria-controls="analysis-expenses" onClick={()=>{const el=document.getElementById('analysis-expenses') as HTMLDetailsElement;el.open=true;el.scrollIntoView({block:'nearest'})}} className="text-left bg-red-950/20 border border-red-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 지출</p>
              <p className="text-lg font-bold text-red-400">{formatManwon(row.totalExpense)}</p>
            </button>
            <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">월 여유/부족 (세전)</p>
              <p className={`text-lg font-bold ${pnlColor(row.balance)}`}>
                {row.balance >= 0 ? '+' : ''}{formatManwon(row.balance)}
              </p>
            </div>
            <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">{pensionTaxUnknown?'미확정 연금세 제외 누적':'입력 기준 누적'}</p>
              <p className={`text-lg font-bold ${pnlColor(row.cumulative)}`}>{formatManwon(row.cumulative)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-blue-300"><a href="#analysis-income" onClick={()=>{const d=document.getElementById('analysis-income') as HTMLDetailsElement|null;if(d)d.open=true}}>수입 내역 보기</a><a href="#analysis-tax" onClick={()=>{const d=document.getElementById('analysis-tax') as HTMLDetailsElement|null;if(d)d.open=true}}>세금 근거 보기</a><Link to="/analysis?tab=prep">생활비 수정 →</Link></div>
          <AnalysisNotices holding={holdAuto?holdDetail:undefined} notes={eng.analysisNotes} incomplete={eng.projection.incomplete} shortfall={eng.projection.rows.some(r=>r.shortfall>0)}/>
          {/* ── ② 수입 상세 ── */}
          <details id="analysis-income" className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-200">💰 수입 상세 ({year}년)</summary><div className="mt-3">
            <Line label="국민연금" monthly={row.nationalPensionMonthly} tone="text-emerald-400" />
            <Line label="개인연금 (IRP·퇴직·연금저축)" monthly={row.pensionMonthly} tone="text-emerald-400" />
            {eng.linkMode!=='corp'&&eng.projection.rows.find(r=>r.year===year)&&<details className="my-2 border border-gray-700 rounded p-3"><summary className="cursor-pointer text-xs text-blue-300">연금별 월수령액·추가 입금 근거</summary><div className="mt-3"><PensionIncomeDetails row={eng.projection.rows.find(r=>r.year===year)!} rows={eng.projection.rows}/></div></details>}
            <Line label="배당 (성장률 반영)" monthly={row.dividendMonthly} tone="text-emerald-400" />
            <Line label="법인 급여" monthly={row.corpSalaryMonthly} tone="text-emerald-400" />
            <Line label="가수금 반환 (비과세)" monthly={row.corpReturnMonthly} tone="text-emerald-400" />
            <Line label="목돈 수입" monthly={row.lumpsumReceived} note={`${year}년 일회`} tone="text-emerald-400" />
            <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-gray-700">
              <span className="text-xs text-gray-300 font-semibold">월 수입 합계</span>
              <span className="text-base font-bold text-emerald-400">{formatManwon(row.totalIncome)}</span>
            </div>
          </div></details>

          {/* ── ③ 세금 상세 (연) ── */}
          <details id="analysis-tax" className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-200">🧾 세금 상세 · 연 {formatManwon(taxSum)}{pensionTaxUnknown||(holdAuto&&holdDetail.incomplete)?' + 미확정':' (추정)'}</summary><div className="mt-3">
            <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
              <span className="text-xs text-gray-400">
                소득세 (연금·금융{eng.pensionLinked&&(eng.pensionSimPlan?.otherIncome??0)>0?'·기타':''})
                {eng.pensionLinked
                  ? <span className="text-gray-600"> · 남편 {fmtM(eng.husbandTaxByYear.get(year) ?? 0)} / 와이프 {fmtM(eng.wifeTaxByYear.get(year) ?? 0)}</span>
                  : <span className="text-gray-600"> · 근사 (배당 {((eng.corpCF?.dividendTaxRate ?? 0.154) * 100).toFixed(1)}% + 급여 3%)</span>}
              </span>
              <span className="text-sm font-semibold text-red-300">{pensionTaxUnknown?(incomeTax>0?formatManwon(incomeTax)+' + 연금세 미확정':'연금세 미확정'):formatManwon(incomeTax)}</span>
            </div>
            {eng.pensionLinked && eng.pensionSimPlan && pensionRow && <FinancialTaxBreakdown row={pensionRow} plan={eng.pensionSimPlan}/>}
            <div className="flex items-baseline justify-between py-1.5 border-b border-gray-700/40">
              <span className="text-xs text-gray-400">
                보유세 (재산세+종부세)
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${holdAuto ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
                  {holdAuto ? '자동' : '수동'}
                </span>
                {holdAuto && (
                  <span className="text-gray-600"> · 재산세 {fmtM(holdDetail.husband.propertyTax + holdDetail.wife.propertyTax)} · 종부세 {fmtM(holdDetail.husband.comprehensiveTax + holdDetail.wife.comprehensiveTax)}</span>
                )}
                {holdAuto&&holdDetail.constructionTax>0&&<span className="text-amber-200"> · 공사 중 확인 세액 {fmtM(holdDetail.constructionTax)}</span>}
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
              <span className="text-xs text-gray-300 font-semibold">{pensionTaxUnknown||(holdAuto&&holdDetail.incomplete)?'반영된 세금 소계 (미확정 제외)':'연간 세금 추정 합계'}</span>
              <span className="text-base font-bold text-red-400">{formatManwon(taxSum)}</span>
            </div>
          </div></details>

          {/* ── ④ 건강보험 상세 (월) ── */}
          <details id="analysis-health" className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-200" data-health-summary data-monthly-health={row.healthInsuranceMonthly}>
              🏥 건강보험 · 월 예상
              <span className="block mt-1 text-lg tabular-nums">{formatMoney(row.healthInsuranceMonthly)}<span className="text-xs font-normal text-gray-400"> /월</span></span>
              <span className={`block mt-1 text-xs font-normal ${healthDetail?.assumed ? 'text-amber-300' : 'text-gray-400'}`}>
                {healthDetail
                  ? healthDetail.assumed ? '가입 형태 미확인 · 같은 지역가입 세대로 합산 가정'
                    : healthDetail.mode === 'joint' ? '같은 지역가입 세대 · 세대 합산' : '별도 지역가입 세대 · 두 세대 합계'
                  : eng.pensionLinked ? '세대별 계산 근거 미확인' : eng.linkMode === 'corp' ? '법인 연동 기준 추정' : '기존 입력 기준 추정'}
                {healthDetail && ' · 장기요양 포함'}
              </span>
              {healthDetail?.mode === 'separate' && <span className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-normal text-gray-200">
                <span data-health-person-summary={healthDetail.husbandSeparate.grandTotal}>남편 {formatMoney(healthDetail.husbandSeparate.grandTotal)}/월</span>
                <span data-health-person-summary={healthDetail.wifeSeparate.grandTotal}>아내 {formatMoney(healthDetail.wifeSeparate.grandTotal)}/월</span>
              </span>}
            </summary><div className="mt-3">
            {healthDetail ? <HealthBreakdown value={healthDetail} summaryShown/> : eng.pensionLinked ? (
              <p className="text-xs text-amber-300">세대별 계산 근거를 확인할 수 없습니다. 가입 가정과 연금 연동 상태를 확인해 주세요.</p>
            ) : (
              <div>
                <p className="text-xs text-gray-400 mt-1">🪙 연금시뮬 연동 시 지역가입 세대별 보험료와 명의별 소득·재산 근거를 확인할 수 있습니다. 직장가입·피부양자 계산은 별도 확인이 필요합니다.</p>
              </div>
            )}
          </div></details>

          {/* ── ⑤ 생활비 상세 (월) ── */}
          <details id="analysis-expenses" className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-200">🏠 생활비 상세 (월)</summary><div className="mt-3">
            {plan.expenses.filter((e) => e.amount > 0).map((e) => (
              <Line key={e.id} label={e.name} monthly={e.amount*expenseFactor(plan,year)} tone="text-red-300" />
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
          </div></details>

          <PensionLedger rows={eng.projection.rows}/>
          <p className="text-xs text-gray-400">누적 금액은 올해부터 입력된 현금흐름을 합한 값입니다. 현재 자산 잔액이 아니며, 미입력 소득·미확정 세금은 포함하지 않습니다.</p>
          <p className="text-xs text-gray-600 text-center leading-relaxed">
            세금·건보·보유세는 앱에 저장된 간이 모형의 추정입니다 (공시가격=시가×75% 등 가정 포함). 실제 납부액과 다를 수 있으니 세무사 확인 필수.
          </p>
        </>
      )}
    </div>
  )
}
