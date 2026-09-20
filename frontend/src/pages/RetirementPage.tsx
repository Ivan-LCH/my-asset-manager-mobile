import { useRef } from 'react'
import { AnalysisNotices } from '@/components/retirement/AnalysisNotices'
import { PensionLedger } from '@/components/retirement/PensionLedger'
import { useSettings } from '@/hooks/useSettings'
import { retirementInputs } from '@/lib/analysisInputs'
// 은퇴 생활비 계획 — 현금흐름 뷰(결과 중심). 입력은 은퇴 준비(준비 탭)에서.
// 파생 계산은 hooks/useAnalysisEngine (연도별 대시보드와 공유), 표·카드: components/retirement.
import { useState, useEffect, useCallback } from 'react'
import { Save } from 'lucide-react'
import { AmountInput, InfoTooltip } from '@/components/sim'
import { MonthlyCashflowCard, CashFlowTable, AccountBalanceTable } from '@/components/retirement'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { useAnalysisEngine } from '@/hooks/useAnalysisEngine'
import { estimateHoldingTax, toHoldingTaxAssets } from '@/lib/holdingTax'
import { EMPTY_PLAN, normalizeSavedPlan } from '@/lib/retirementPlan'
import { formatManwon } from '@/lib/utils'
import type { RetirementPlan } from '@/types'

// ── 메인 페이지 ────────────────────────────────────────────
export default function RetirementPage() {
  const { data: saved } = useRetirement()
  const saveMut = useSaveRetirement()
  const {data:settings}=useSettings()
  const editedFields=useRef(new Set<keyof RetirementPlan>())
  const editVersion=useRef(0)

  const [plan, setPlan]   = useState<RetirementPlan>(EMPTY_PLAN)
  const [dirty, setDirty] = useState(false)

  // 저장된 데이터 로드 (구버전 정규화 포함 — lib/retirementPlan.normalizeSavedPlan)
  useEffect(() => {
    if (saved && !dirty) {
      setPlan(retirementInputs(saved,settings).plan)
    }
  }, [saved,settings,dirty])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    editedFields.current.add(key);editVersion.current++
    setDirty(true)
  }, [])

  // 연동 소득원 — 범인/연금 상호배타 라디오
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'
  const setLinkMode = useCallback((m: 'none' | 'corp' | 'pension') => {
    setPlan((p) => ({ ...p, linkCorpSim: m === 'corp', linkPensionSim: m === 'pension' }))
    editedFields.current.add('linkCorpSim');editedFields.current.add('linkPensionSim');editVersion.current++
    setDirty(true)
  }, [])

  const handleSave = () => {
    const version=editVersion.current
    const patch=Object.fromEntries([...editedFields.current].map(key=>[key,plan[key]])) as Partial<RetirementPlan>
    saveMut.mutate(patch,{onSuccess:()=>{if(version===editVersion.current){editedFields.current.clear();setDirty(false)}}})
  }

  // 파생 계산 전부 — 엔진 훅 (RetirementPage·연도별 대시보드 공유)
  const eng = useAnalysisEngine(plan)
  const {
    retirementYear, retirementRow, cashFlow, accountSim,
    perPerson, stockDiv, linkMode: engLinkMode,
    realEstateAssets, autoHoldingTaxByYear, irpGrowthRate, irpDivYield, sb,
  } = eng

  // 보유세 자동 계산값 (은퇴 연도 기준) — 미리보기·자동 모드 표시용
  const autoHold = estimateHoldingTax(toHoldingTaxAssets(realEstateAssets), retirementYear)
  const autoAnnual = autoHoldingTaxByYear.get(retirementYear) ?? autoHold.total
  const hasRebuild = realEstateAssets.some((a) => (a.detail as { futureYear?: number } | undefined)?.futureYear)

  if(eng.isLoading)return <p role="status" className="p-6">분석에 연결된 입력을 불러오는 중…</p>
  if(eng.error)return <p role="alert" className="p-6 text-red-300">분석 입력을 읽지 못했습니다. 새로고침 후 확인해 주세요.</p>
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🌅 은퇴 생활비 계획</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-gray-400 whitespace-nowrap">은퇴 예상 연도</span>
            <input
              type="number" inputMode="decimal"
              className="w-20 sm:w-24 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-blue-300
                font-semibold focus:outline-none focus:border-blue-500 text-center"
              value={plan.retirementYear || ''}
              onChange={(e) => { update('retirementYear', Number(e.target.value)); }}
            />
            <span className="text-xs sm:text-sm text-gray-500">년</span>
          </div>
          <div className="flex items-center gap-1.5">
            {([
              ['none', '등록 자산'],
              ['corp', '🏛️ 법인'],
              ['pension', '🪙 연금'],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setLinkMode(v)}
                className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                  linkMode === v
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saveMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500
              text-white transition-colors disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
          </button>
        </div>
      </div>

      {/* 월 현금흐름 카드 (대표 연도 = 은퇴 연도) */}
      <MonthlyCashflowCard retirementRow={retirementRow} retirementYear={retirementYear} linkMode={engLinkMode} />
      <AnalysisNotices holding={plan.holdingTaxAuto?autoHold:undefined} notes={eng.analysisNotes} incomplete={eng.projection.incomplete} shortfall={eng.projection.rows.some(r=>r.shortfall>0)}/>

      {/* 건보·세금은 시뮬에서 산출 (이 페이지 입력 아님) */}
      <div className="bg-blue-500/5 border border-blue-700/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/80 leading-relaxed">
          💡 세금·건보는 위 <b>연동 설정</b>(법인/연금)에서 자동 산출됩니다.
          {linkMode === 'none' && ' (현재 연동 안함 — 등록 연금과 배당을 사용합니다. 세금·건보는 간이 추정이며 연동 시에도 실제 납부액과 다를 수 있습니다.)'}
        </p>
      </div>

      {/* 보유세(재산세+종부세) — 자동: 부동산 자산에서 산출 / 수동: 직접 입력 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 whitespace-nowrap">🏠 보유세 (재산세 + 종부세)</h3>
            <InfoTooltip text={
              (plan.holdingTaxAuto
                ? "부동산 자산(명의 지분·재건축 입주 연도 반영)에서\n재산세+종합부동산세를 연도별로 자동 계산합니다.\n\n"
                : "직접 입력한 연간 금액을 부과 개시 연도부터\n세금(연)에 합산합니다.\n\n") +
              "가정: 공시가격=시가×75%, 주택 과표 60%,\n도시지역분 0.14%, 종부세는 인별 일반공제 9억.\n1세대1주택 특례·경감·세부담상한 등 미반영 —\n근사 추정이므로 세무사 확인 필수."
            } />
          </div>
          <div className="flex items-center rounded-lg overflow-hidden border border-gray-600 shrink-0">
            {([['auto', '자동'], ['manual', '수동']] as const).map(([v, label]) => {
              const isAuto = v === 'auto'
              const active = plan.holdingTaxAuto === isAuto
              return (
                <button
                  key={v}
                  onClick={() => update('holdingTaxAuto', isAuto)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {plan.holdingTaxAuto ? (
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-gray-100">{formatManwon(autoAnnual)}</span>
              <span className="text-xs text-gray-400">/년 · {retirementYear}년 기준 (자동)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              재산세(본세) {formatManwon(autoHold.husband.propertyTax + autoHold.wife.propertyTax)} · 교육세 {formatManwon(autoHold.husband.educationTax + autoHold.wife.educationTax)} · 도시재산세 {formatManwon(autoHold.husband.urbanPropertyTax + autoHold.wife.urbanPropertyTax)} · 종부세 {formatManwon(autoHold.husband.comprehensiveTax + autoHold.wife.comprehensiveTax)}
              {' '}· 남편 {formatManwon(autoHold.husband.total)} / 와이프 {formatManwon(autoHold.wife.total)}
              {' '}· 농어촌특별세 {formatManwon(autoHold.husband.agriculturalTax+autoHold.wife.agriculturalTax)} · 공사 중 확인 세액 {formatManwon(autoHold.constructionTax)}
            </p>
            {hasRebuild && (
              <p className="text-xs text-amber-300 mt-1">재건축 가치는 입주 예정 연도, 주택 보유세는 별도 전환일과 6월 1일 기준으로 반영합니다. 미입력 공사 중 세금은 면제가 아니라 미확정입니다.</p>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">연간 보유세</span>
              <div className="flex-1">
                <AmountInput
                  value={plan.holdingTaxAnnual ?? 0}
                  onChange={(v) => update('holdingTaxAnnual', v)}
                  placeholder="재산세 + 종부세 합계 (연)"
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">부과 개시</span>
              <input
                type="number" inputMode="decimal"
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
                  focus:outline-none focus:border-blue-500 text-center"
                value={plan.holdingTaxStartYear ?? ''}
                onChange={(e) => update('holdingTaxStartYear', Number(e.target.value) || undefined)}
              />
              <span className="text-xs text-gray-500">년~</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              자동 계산 시: {formatManwon(autoAnnual)}/년 ({retirementYear}년 기준) — '자동'으로 전환하면 자산에서 매년 산출됩니다.
            </p>
          </div>
        )}
      </div>

      {/* 연금시뮬 연동 시 1인별 세금·건보 요약 */}
      {perPerson && (
        <div className="bg-gray-800 border border-blue-700/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">🪙 연금시뮬 연동 — 명의별 세금·세대별 건보 ({eng.pensionSimPlan?.refYear}년)</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🧑 남편</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.husband.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{eng.pensionSimPlan?.healthHouseholdMode==='separate'?formatManwon(perPerson.husband.healthMonthly)+'/월':'세대 합산'}</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.husband.netAnnual)}</span></p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">👩 와이프</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.wife.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{eng.pensionSimPlan?.healthHouseholdMode==='separate'?formatManwon(perPerson.wife.healthMonthly)+'/월':'세대 합산'}</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.wife.netAnnual)}</span></p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🏠 가구 합계</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.totals.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.totals.healthMonthly)}/월</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.totals.netAnnual)}</span></p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            세금은 명의별 간이 추정, 건강보험은 선택한 지역가입 세대 가정으로 계산합니다. 같은 연도의 분석 요약·연금 상세·현금흐름에 같은 지급액과 보험료를 반영합니다.
          </p>
        </div>
      )}

      {/* 1인별 STOCK 배당 (실제 주식자산 × 명의, 연금시뮬과 별개) */}
      {(stockDiv.husband > 0 || stockDiv.wife > 0) && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">📈 STOCK 자산 배당 (1인별, 월)</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🧑 남편</p>
              <p className="text-emerald-400 font-semibold">{formatManwon(stockDiv.husband)}/월</p>
              <p className="text-gray-500">연 {formatManwon(stockDiv.husband * 12)}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">👩 와이프</p>
              <p className="text-pink-400 font-semibold">{formatManwon(stockDiv.wife)}/월</p>
              <p className="text-gray-500">연 {formatManwon(stockDiv.wife * 12)}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🏠 가구 합계</p>
              <p className="text-gray-100 font-semibold">{formatManwon(stockDiv.husband + stockDiv.wife)}/월</p>
              <p className="text-gray-500">연 {formatManwon((stockDiv.husband + stockDiv.wife) * 12)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            실제 STOCK 자산의 배당 이력/예측을 각 자산의 명의 지분으로 분할. 현금흐름 표의 배당 라인은 가구 합계(연 15.4% 근사) 유지.
          </p>
        </div>
      )}

      {/* 연도별 현금흐름 테이블 */}
      <CashFlowTable rows={cashFlow} retirementYear={retirementYear} linkMode={engLinkMode} />

      {/* 계좌 잔액 추이 (IRP + 일반주식계좌) */}
      {accountSim.length > 0 && (
        <PensionLedger rows={accountSim}/>
      )}
    </div>
  )
}
