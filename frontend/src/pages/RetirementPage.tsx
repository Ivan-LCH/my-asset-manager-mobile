// 은퇴 생활비 계획 — 현금흐름 뷰(결과 중심). 입력은 은퇴 준비(준비 탭)에서.
// 순수 계산: lib/retirementCashflow·lib/retirementPlan, 표·카드: components/retirement (UI 간소화 ④).
import { useState, useEffect, useCallback } from 'react'
import { Save } from 'lucide-react'
import { AmountInput, InfoTooltip } from '@/components/sim'
import { MonthlyCashflowCard, CashFlowTable, AccountBalanceTable } from '@/components/retirement'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { useDividendSummary } from '@/hooks/useDividends'
import { useCorpSim } from '@/hooks/useCorpSim'
import { computeCorp, corpTaxOn, corpHealthMonthly, employerInsuranceMonthly, EMPTY_CORP_PLAN, mergeCorpTax } from '@/lib/corpSim'
import { calcPensionByYear, SIM_START_YEAR } from '@/lib/pensionCalc'
import { resolveAge } from '@/lib/people'
import { computePensionVehiclePerPerson, pensionSchedule, severanceTax, EMPTY_PENSION_PLAN, sourcesFromAssets, stockAccountBalances, perPersonYearTaxHealth } from '@/lib/pensionSim'
import { calcHealthInsurance, realEstatePropertyBases, stockDividendsByOwner } from '@/lib/healthInsurance'
import { simulateAccounts } from '@/lib/accountSim'
import { usePensionSim } from '@/hooks/usePensionSim'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
import { EMPTY_PLAN, DEFAULT_EXPENSES, DEFAULT_HI, num } from '@/lib/retirementPlan'
import { buildCashFlow, type CorpCashFlow } from '@/lib/retirementCashflow'
import { formatManwon } from '@/lib/utils'
import type {
  StockDetail, SavingsDetail, PensionDetail,
  RetirementPlan, LumpsumItem,
} from '@/types'

// ── 메인 페이지 ────────────────────────────────────────────
export default function RetirementPage() {
  const { data: allAssets = [] } = useAssets()
  const { data: settings }       = useSettings()
  const { data: saved }          = useRetirement()
  const saveMut                  = useSaveRetirement()

  const currentAge = resolveAge(settings)

  const [plan, setPlan]   = useState<RetirementPlan>(EMPTY_PLAN)
  const [dirty, setDirty] = useState(false)

  // 저장된 데이터 로드
  useEffect(() => {
    if (saved && Object.keys(saved).length > 0) {
      setPlan({
        expenses:       saved.expenses       ?? DEFAULT_EXPENSES,
        travel:         saved.travel         ?? [],
        medicalMonthly: saved.medicalMonthly ?? 200_000,
        lumpsum:        (saved.lumpsum ?? []).map((l) => ({
          ...l,
          // 구버전 정규화: useEndYear 제거, taxKind 'rental' → 'other'
          taxKind: ((l as { taxKind?: string }).taxKind === 'rental' ? 'other' : (l.taxKind ?? 'other')) as LumpsumItem['taxKind'],
        })),
        emergency:      saved.emergency      ?? [],
        retirementYear:  saved.retirementYear  ?? new Date().getFullYear() + 10,
        healthInsurance: saved.healthInsurance  ? { ...DEFAULT_HI, ...saved.healthInsurance } : DEFAULT_HI,
        linkCorpSim:     saved.linkCorpSim ?? false,
        linkPensionSim:  saved.linkPensionSim ?? false,
        holdingTaxAnnual:    saved.holdingTaxAnnual    ?? 4_100_000,
        holdingTaxStartYear: saved.holdingTaxStartYear ?? 2030,
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  // 연동 소득원 — 범인/연금 상호배타 라디오
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'
  const setLinkMode = useCallback((m: 'none' | 'corp' | 'pension') => {
    setPlan((p) => ({ ...p, linkCorpSim: m === 'corp', linkPensionSim: m === 'pension' }))
    setDirty(true)
  }, [])

  const handleSave = () => {
    saveMut.mutate(plan, { onSuccess: () => setDirty(false) })
  }

  // 연금 수입 맵
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })
  const { data: divSummary } = useDividendSummary()
  const stockDivMonthly = divSummary?.totalMonthly ?? 0

  // ── 투자법인 연동 ──
  const { data: rawCorpPlan } = useCorpSim()
  // 구버전 저장 데이터 방어: EMPTY_CORP_PLAN + DEFAULT_CORP_TAX 로 머지
  // + 목돈 분배(corpInflow)를 가수금(loanAmount)에 합산 — CorpSimPage와 일치
  const corpAllocTotal = (rawCorpPlan?.lumpsumCorp ?? []).reduce((s, c) => s + c.corpAmount, 0)
  const corpPlan = rawCorpPlan
    ? { ...EMPTY_CORP_PLAN, ...rawCorpPlan, tax: mergeCorpTax(rawCorpPlan.tax),
        loanAmount: (rawCorpPlan.loanAmount ?? EMPTY_CORP_PLAN.loanAmount) + corpAllocTotal }
    : null
  const linked = plan.linkCorpSim && !!corpPlan

  // 법인 현금흐름 Phase 1/2 계산
  let corpCF: CorpCashFlow | undefined
  if (linked && corpPlan) {
    const ep = corpPlan
    const gross = ep.targetDividendTotal > 0 ? ep.targetDividendTotal : (ep.capitalContribution + ep.loanAmount) * (ep.dividendYield / 100)
    const salAnnual = (ep.repSalaryMonthly + ep.repSalaryHusbandMonthly) * 12
    const empInsAnnual = employerInsuranceMonthly(ep).total * 12
    // 급여 + 4대보험 사업주분 모두 법인 비용(공제)
    const corpTax = corpTaxOn(Math.max(0, gross - salAnnual - empInsAnnual), ep.tax)
    const cashAfterTax = gross - corpTax - salAnnual - empInsAnnual  // 급여·4대보험·법인세 후 잔여
    const returnAnnual = ep.monthlyReturn * 12
    const rMonths = ep.monthlyReturn > 0 ? Math.floor(ep.loanAmount / ep.monthlyReturn) : 0
    // 부부 지분(%) + 배당소득세 15.4% 후 실수령
    const coupleShare = (ep.shareHusband + ep.shareWife) / 100
    const netFactor = 1 - ep.tax.dividendTaxRate

    corpCF = {
      salaryMonthly: ep.repSalaryMonthly + ep.repSalaryHusbandMonthly,
      phaseBoundaryYear: SIM_START_YEAR + Math.ceil(rMonths / 12),
      returnP1Monthly: ep.monthlyReturn,
      divP1Monthly: Math.max(0, cashAfterTax - returnAnnual) * coupleShare * netFactor / 12,
      divP2Monthly: Math.max(0, cashAfterTax) * coupleShare * netFactor / 12,
    }
  }

  const pensionMap = calcPensionByYear(pensionLikeAssets, currentAge)

  // 1인별 STOCK 배당 (실제 주식자산 배당 × 계좌 명의)
  const { data: accountOwners = {} } = useStockAccountOwnership()
  const stockDiv = divSummary ? stockDividendsByOwner(allAssets, divSummary, accountOwners) : { husband: 0, wife: 0 }

  // ── 연금시뮬 연동 (linkMode==='pension') ──
  const { data: rawPensionSim } = usePensionSim()
  const realEstateAssets = allAssets.filter((a) => a.type === 'REAL_ESTATE')
  const pensionAssetsAll = allAssets.filter((a) => a.type === 'PENSION')
  // IRP 포트폴리오 상승률/배당률 (은퇴준비 IRP 포트폴리오에서) — 퇴직시점 잔액 성장·수령액 산정용
  const { data: portfolio } = usePortfolio()
  const irpGrowthRate = portfolio?.growthRate ?? 0
  const irpDivYield = portfolio?.dividendYield ?? 0
  // IRP 잔액(현재 PENSION 자산 가치 합)
  const irpAssets = allAssets.filter((a) => a.type === 'PENSION' && !a.disposalDate)
  const irpInitial = irpAssets.reduce((s, a) => s + a.currentValue, 0)

  const pensionSimPlanBase = rawPensionSim ? { ...EMPTY_PENSION_PLAN, ...rawPensionSim } : null
  // sources 보강 — 자산 detail의 expectedMonthlyPayout(비과세·과세 연금저축 등록 월수령액) 주입
  const pensionSimPlan = (() => {
    if (!pensionSimPlanBase) return null
    const stockByAccount = new Map<string, number>()
    for (const s of allAssets.filter((a) => a.type === 'STOCK')) {
      const acct = (s.detail as { accountName?: string } | undefined)?.accountName ?? ''
      if (acct) stockByAccount.set(acct, (stockByAccount.get(acct) ?? 0) + s.currentValue)
    }
    const augmented = sourcesFromAssets(
      pensionAssetsAll.map((a) => ({
        id: a.id, name: a.name, currentValue: a.currentValue,
        detail: {
          pensionType: (a.detail as { pensionType?: string })?.pensionType,
          linkedStockId: (a.detail as { linkedStockId?: string })?.linkedStockId,
          expectedMonthlyPayout: (a.detail as { expectedMonthlyPayout?: number })?.expectedMonthlyPayout,
          expectedStartYear: (a.detail as { expectedStartYear?: number })?.expectedStartYear,
          expectedEndYear: (a.detail as { expectedEndYear?: number })?.expectedEndYear,
          annualGrowthRate: (a.detail as { annualGrowthRate?: number })?.annualGrowthRate,
        },
      })),
      pensionSimPlanBase.sources,
      stockByAccount,
    )
    // stockAccount(남편/와이프 각 계좌 배당률·상승률)는 plan 자체에 저장 → 그대로 사용
    return { ...pensionSimPlanBase, sources: augmented }
  })()
  const pensionLinked = linkMode === 'pension' && !!pensionSimPlan
  // 국민연금 자산(확정급여) 추출
  const nationals = (pensionSimPlan ? pensionAssetsAll
    .filter((a) => pensionSimPlan.sources.find((s) => s.id === a.id)?.taxType === 'national')
    .map((a) => {
      const d = a.detail as PensionDetail | undefined
      return d ? {
        expectedStartYear: d.expectedStartYear,
        expectedEndYear: d.expectedEndYear,
        expectedMonthlyPayout: d.expectedMonthlyPayout,
        annualGrowthRate: d.annualGrowthRate ?? 0,
      } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null) : [])
  const perPerson = (pensionLinked && pensionSimPlan)
    ? computePensionVehiclePerPerson(pensionSimPlan, {
        husbandProperty: realEstatePropertyBases(realEstateAssets, pensionSimPlan.refYear).husband,
        wifeProperty: realEstatePropertyBases(realEstateAssets, pensionSimPlan.refYear).wife,
        nationalPensions: nationals,
        irpGrowthRate,
      })
    : null
  // 연도별 가구 연금(월) Map — 국민연금·개인연금 분리, 65세 step-up 반영
  // buildCashFlow의 전체 범위(SIM_START_YEAR ~ 100세)를 커버하도록 넓게 생성
  const schedFromYear = SIM_START_YEAR
  const schedToYear = new Date().getFullYear() + (100 - resolveAge(settings))
  const sched = (pensionLinked && pensionSimPlan)
    ? pensionSchedule(pensionSimPlan, nationals, schedFromYear, schedToYear, { irpGrowthRate })
    : []
  const nationalByYear = new Map(sched.map((r) => [r.year, Math.round(r.nationalAnnual / 12)]))
  const privateByYear  = new Map(sched.map((r) => [r.year, Math.round(r.drawdownAnnual / 12)]))
  // 배당도 연도별 (성장률 반영) — financialAnnual를 월로 변환
  const dividendByYear = new Map(sched.map((r) => [r.year, Math.round(r.financialAnnual / 12)]))
  // 건보·세금 연도별 재산정 — 매년 연금·배당 성장·재산(재건축 전환) 반영
  const healthByYear = new Map<number, number>()
  const taxByYear = new Map<number, number>()
  if (pensionLinked && pensionSimPlan) {
    for (const r of sched) {
      const propsY = realEstatePropertyBases(realEstateAssets, r.year)
      const th = perPersonYearTaxHealth(r, pensionSimPlan, propsY.husband, propsY.wife)
      healthByYear.set(r.year, th.husbandHealth + th.wifeHealth)
      taxByYear.set(r.year, th.husbandTax + th.wifeTax)
    }
  }
  const linkedOverride = perPerson ? {
    nationalByYear,
    privateByYear,
    dividendByYear,
    healthByYear,
    taxByYear,
  } : undefined

  // 건강보험료: 연동 시 직장건보(급여×율×50%, 자동 산정), 미연동 시 지역건보
  // (lib/healthInsurance 공식 60등급 표 — 연금시뮬과 동일 기준)
  const retirementYear    = plan.retirementYear
  const retirementPensionMonthly = pensionMap.get(retirementYear) ?? 0
  const hi = plan.healthInsurance
  const hiResult = calcHealthInsurance({
    pensionAnnual:  hi.autoLinkPension   ? retirementPensionMonthly * 12 : hi.pensionIncome,
    dividendAnnual: hi.autoLinkDividend  ? stockDivMonthly * 12          : hi.interestDividendIncome,
    otherAnnual:    hi.otherIncome,
    propertyTaxBase: hi.propertyTaxBase,
    rentalDeposit:  hi.rentalDeposit,
    carValue:       hi.carValue,
    scorePerPoint:  hi.scorePerPoint,
  })
  const healthInsuranceMonthly = linked && corpPlan
    ? corpHealthMonthly(corpPlan)
    : hiResult.grandTotal

  // 목돈 수입 = 은퇴계획 목돈수입(단일 소스)에서 투자 분배 나머지 (이중계산 방지).
  // linkMode=pension → 개인 분배(IRP/주식) 제외분, corp → 법인 분배 제외분, none → 전액.
  const pensionAllocations = pensionSimPlan?.allocations ?? []
  const corpAllocations = corpPlan?.lumpsumCorp ?? []
  const cashLumpsum: LumpsumItem[] = (plan.lumpsum ?? []).map((l) => {
    let allocated = 0
    if (linkMode === 'pension') {
      const a = pensionAllocations.find((x) => x.lumpsumId === l.id)
      allocated = (a?.irpAmount ?? 0) + (a?.stockAmount ?? 0)
    } else if (linkMode === 'corp') {
      const c = corpAllocations.find((x) => x.lumpsumId === l.id)
      allocated = c?.corpAmount ?? 0
    }
    return { ...l, amount: Math.max(0, l.amount - allocated) }
  }).filter((l) => l.amount > 0)
  // 위로금/퇴직(severance) 현금 나머지 → 퇴직소득세 (수령년 일회)
  const lumpsumTaxByYear = new Map<number, number>()
  for (const l of cashLumpsum) {
    if (l.taxKind === 'severance' && l.amount > 0) {
      lumpsumTaxByYear.set(l.receiveYear, (lumpsumTaxByYear.get(l.receiveYear) ?? 0) + severanceTax(l.amount))
    }
  }

  const cashFlow = buildCashFlow(plan, pensionMap, currentAge, stockDivMonthly, healthInsuranceMonthly, corpCF, linked && corpPlan ? corpPlan.loanAmount : 0, linkedOverride, cashLumpsum, lumpsumTaxByYear)

  // 계좌 잔액 추적 (IRP + 일반주식계좌) — 연도별 시장가치 변화
  // IRP 퇴직시점 잔액 = 현재 PENSION 자산합 + 목돈 IRP분배 → 수령개시(startYear)까지 성장
  const startYear = pensionSimPlan?.startYear ?? plan.retirementYear
  const withYears = pensionSimPlan?.withdrawalYears ?? 30
  const irpInflow = (pensionSimPlan?.allocations ?? []).reduce((s, a) => s + a.irpAmount, 0)
  const yearsToStart = Math.max(0, startYear - new Date().getFullYear())
  const irpProjected = (irpInitial + irpInflow) * Math.pow(1 + irpGrowthRate / 100, yearsToStart)
  // 일반주식계좌 (남편/와이프 각 계좌) — 잔액·배당률·상승률을 stockAccountBalances에서 산출
  const sb = pensionSimPlan ? stockAccountBalances(pensionSimPlan) : null
  const accountSim = simulateAccounts({
    irpInitial: irpProjected,
    irpGrowthRate,
    irpDividendYield: irpDivYield,
    irpMonthlyPension: irpProjected / withYears / 12,
    stockAccounts: sb
      ? [
          { initial: sb.husband.total, growthRate: sb.husband.growthRate, dividendYield: sb.husband.dividendYield },
          { initial: sb.wife.total,    growthRate: sb.wife.growthRate,    dividendYield: sb.wife.dividendYield },
        ]
      : [],
    realEstateItems: realEstateAssets.map((a) => ({
      currentValue: a.currentValue,
      futureValue: (a.detail as PensionDetail | undefined && a.detail as { futureValue?: number })?.futureValue,
      futureYear: (a.detail as { futureYear?: number })?.futureYear,
    })),
    fromYear: startYear,
    toYear: startYear + withYears - 1,
  })

  // KPI
  const retirementRow = cashFlow.find((r) => r.year >= retirementYear)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🌅 은퇴 생활비 계획</h2>
        <div className="flex items-center justify-between gap-3">
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
              ['none', '연동 안함'],
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
      <MonthlyCashflowCard retirementRow={retirementRow} retirementYear={retirementYear} linkMode={linkMode} />

      {/* 건보·세금은 시뮬에서 산출 (이 페이지 입력 아님) */}
      <div className="bg-blue-500/5 border border-blue-700/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/80 leading-relaxed">
          💡 세금·건보는 위 <b>연동 설정</b>(법인/연금)에서 자동 산출됩니다.
          {linkMode === 'none' && ' (현재 연동 안함 — 시뮬 페이지에서 설정하거나 연동하면 정확한 값이 반영됩니다.)'}
        </p>
      </div>

      {/* 보유세(재산세+종부세) — 시뮬 외 수동 항목, 개시 연도부터 세금(연)에 합산 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-200">🏠 보유세 (재산세 + 종부세)</h3>
          <InfoTooltip text={
            "매탄주공 입주(29년 말) 이후 부과되는\n재산세 + 종합부동산세의 연간 추정치입니다.\n\n" +
            "개시 연도부터 매년 세금(연)에 합산되어\n누적 자산에서 차감됩니다."
          } />
        </div>
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
          기본 410만원 / 2030년~ (매탄주공 입주 이후). 비우면 미반영.
        </p>
      </div>

      {/* 연금시뮬 연동 시 1인별 세금·건보 요약 */}
      {perPerson && (
        <div className="bg-gray-800 border border-blue-700/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">🪙 연금시뮬 연동 — 1인별 세금·건보 (수령개시 이후 연간 기준)</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🧑 남편</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.husband.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.husband.healthMonthly)}/월</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.husband.netAnnual)}</span></p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">👩 와이프</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.wife.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.wife.healthMonthly)}/월</span></p>
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
            금융소득 2천만 한도·연금소득세·건보(부동산 명의 재산분 포함) 각자 적용. 연금·배당은 이 기준으로 현금흐름에 반영됨.
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
      <CashFlowTable rows={cashFlow} retirementYear={retirementYear} linkMode={linkMode} />

      {/* 계좌 잔액 추이 (IRP + 일반주식계좌) */}
      {accountSim.length > 0 && (
        <AccountBalanceTable rows={accountSim} irpGrowthRate={irpGrowthRate} irpDivYield={irpDivYield} sb={sb} />
      )}
    </div>
  )
}
