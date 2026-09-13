// 은퇴 분석 엔진 — RetirementPage의 파생 계산 전부를 훅으로 추출 (연도별 대시보드와 공유).
// 순수 리팩터: 계산 순서·산식은 RetirementPage 원본과 동일. plan(은퇴계획)과 저장된 시뮬 설정을 받아
// 현금흐름·연금 스케줄·1인별 세금/건보·보유세 자동 산출까지 한 번에 계산한다.
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useDividendSummary } from '@/hooks/useDividends'
import { useCorpSim } from '@/hooks/useCorpSim'
import { usePensionSim } from '@/hooks/usePensionSim'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
import { computeCorp, corpTaxOn, corpHealthMonthly, employerInsuranceMonthly, EMPTY_CORP_PLAN, mergeCorpTax } from '@/lib/corpSim'
import { calcPensionByYear, SIM_START_YEAR } from '@/lib/pensionCalc'
import { resolveAge } from '@/lib/people'
import { computePensionVehiclePerPerson, pensionSchedule, severanceTax, EMPTY_PENSION_PLAN, sourcesFromAssets, stockAccountBalances, perPersonYearTaxHealth } from '@/lib/pensionSim'
import { calcHealthInsurance, realEstatePropertyBases, stockDividendsByOwner } from '@/lib/healthInsurance'
import { holdingTaxByYear, toHoldingTaxAssets } from '@/lib/holdingTax'
import { simulateAccounts } from '@/lib/accountSim'
import { buildCashFlow, type CorpCashFlow } from '@/lib/retirementCashflow'
import type { Asset, StockDetail, SavingsDetail, PensionDetail, RetirementPlan, LumpsumItem } from '@/types'

/** 은퇴 계획 → 현금흐름·세금·건보·보유세 등 분석 결과 일괄 산출. */
export function useAnalysisEngine(plan: RetirementPlan) {
  const { data: allAssets = [] } = useAssets()
  const { data: settings } = useSettings()
  const { data: divSummary } = useDividendSummary()

  const currentAge = resolveAge(settings)
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'

  // 연금 수입 맵
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })
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
  const realEstateAssets: Asset[] = allAssets.filter((a) => a.type === 'REAL_ESTATE')
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

  // ── 보유세 자동 산출 (재산세+종부세) — 부동산 자산에서 연도별 ──
  const autoHoldingTaxByYear = holdingTaxByYear(toHoldingTaxAssets(realEstateAssets), schedFromYear, schedToYear)

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

  const cashFlow = buildCashFlow(
    plan, pensionMap, currentAge, stockDivMonthly, healthInsuranceMonthly,
    corpCF, linked && corpPlan ? corpPlan.loanAmount : 0, linkedOverride, cashLumpsum, lumpsumTaxByYear,
    plan.holdingTaxAuto ? autoHoldingTaxByYear : undefined,
  )

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

  return {
    // 입력 스냅샷
    currentAge, linkMode, retirementYear,
    realEstateAssets,
    // 연동 시뮬
    corpPlan, pensionSimPlan, pensionLinked,
    // 연금·연도별 맵
    pensionMap, nationalByYear, privateByYear, dividendByYear, healthByYear, taxByYear,
    // 1인별
    perPerson, stockDiv,
    // 목돈
    cashLumpsum, lumpsumTaxByYear,
    // 현금흐름·계좌
    cashFlow, retirementRow, accountSim, corpCF,
    // 보유세
    autoHoldingTaxByYear,
    // IRP·주식계좌 설정
    irpGrowthRate, irpDivYield, sb, startYear,
  }
}
