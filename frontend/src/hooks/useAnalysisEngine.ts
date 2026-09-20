import {annualVehicle} from '@/lib/annualVehicle'
import {annualIncomeTax} from '@/lib/incomeTax'
import { annualPension } from '@/lib/annualPension'
import { annualHealth, type AnnualHealthResult } from '@/lib/annualHealth'
// 은퇴 분석 엔진 — RetirementPage의 파생 계산 전부를 훅으로 추출 (연도별 대시보드와 공유).
// 순수 리팩터: 계산 순서·산식은 RetirementPage 원본과 동일. plan(은퇴계획)과 저장된 시뮬 설정을 받아
// 현금흐름·연금 스케줄·1인별 세금/건보·보유세 자동 산출까지 한 번에 계산한다.
import { pensionInputs, pensionInputNotes } from '@/lib/analysisInputs'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useDividendSummary } from '@/hooks/useDividends'
import { useCorpSim } from '@/hooks/useCorpSim'
import { usePensionSim } from '@/hooks/usePensionSim'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
import { corpHealthMonthly, EMPTY_CORP_PLAN, mergeCorpTax } from '@/lib/corpSim'
import { buildCorpCashFlow } from '@/lib/corpCashFlow'
import { calcPensionByYear, SIM_START_YEAR } from '@/lib/pensionCalc'
import { resolveAge } from '@/lib/people'
import { pensionSchedule, severanceTax, EMPTY_PENSION_PLAN, sourcesFromAssets, stockAccountBalances, perPersonYearTaxHealth } from '@/lib/pensionSim'
import { calcHealthInsurance, realEstatePropertyBases, stockDividendsByOwner } from '@/lib/healthInsurance'
import { holdingTaxByYear, toHoldingTaxAssets } from '@/lib/holdingTax'
import { simulateAccounts } from '@/lib/accountSim'
import { buildCashFlow, type CorpCashFlow } from '@/lib/retirementCashflow'
import type { Asset, StockDetail, SavingsDetail, PensionDetail, RetirementPlan, LumpsumItem } from '@/types'

/** 은퇴 계획 → 현금흐름·세금·건보·보유세 등 분석 결과 일괄 산출. */
export function useAnalysisEngine(plan: RetirementPlan) {
  const assetQuery=useAssets(), settingsQuery=useSettings(), dividendQuery=useDividendSummary()
  const allAssets=(assetQuery.data??[]).filter(a=>!a.disposalDate)
  const settings=settingsQuery.data, divSummary=dividendQuery.data

  const currentAge = resolveAge(settings)
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'

  // 연금 수입 맵
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })
  let stockDivMonthly = divSummary?.totalMonthly ?? 0

  // ── 투자법인 연동 ──
  const corpQuery=useCorpSim(), rawCorpPlan=corpQuery.data
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
    corpCF = buildCorpCashFlow(corpPlan)
  }

  let pensionMap = calcPensionByYear(pensionLikeAssets, currentAge)
  let registeredNationalByYear=calcPensionByYear(pensionLikeAssets.filter(a=>a.type==='PENSION'&&/국민|national/i.test((a.detail as PensionDetail)?.pensionType??'')),currentAge)

  // 1인별 STOCK 배당 (실제 주식자산 배당 × 계좌 명의)
  const ownersQuery=useStockAccountOwnership(), accountOwners=ownersQuery.data??{}
  const stockDiv = divSummary ? stockDividendsByOwner(allAssets, divSummary, accountOwners) : { husband: 0, wife: 0 }

  // ── 연금시뮬 연동 (linkMode==='pension') ──
  const pensionQuery=usePensionSim(), rawPensionSim=pensionQuery.data
  const realEstateAssets: Asset[] = (assetQuery.data??[]).filter((a) => a.type === 'REAL_ESTATE')
  const pensionAssetsAll = allAssets.filter((a) => a.type === 'PENSION')
  // IRP 포트폴리오 상승률/배당률 (은퇴준비 IRP 포트폴리오에서) — 퇴직시점 잔액 성장·수령액 산정용
  const portfolioQuery=usePortfolio(), portfolio=portfolioQuery.data
  const irpGrowthRate = portfolio?.growthRate ?? 0
  const irpDivYield = portfolio?.dividendYield ?? 0
  // IRP 잔액(현재 PENSION 자산 가치 합)
  const irpAssets = allAssets.filter((a) => a.type === 'PENSION' && !a.disposalDate)
  const irpInitial = irpAssets.reduce((s, a) => s + a.currentValue, 0)

  const pensionSimPlan = rawPensionSim ? pensionInputs(rawPensionSim,assetQuery.data??[],plan.retirementYear) : null
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
  // 연도별 가구 연금(월) Map — 국민연금·개인연금 분리, 65세 step-up 반영
  // buildCashFlow의 전체 범위(SIM_START_YEAR ~ 100세)를 커버하도록 넓게 생성
  const schedFromYear = SIM_START_YEAR
  const schedToYear = new Date().getFullYear() + (100 - resolveAge(settings))
  const projection=annualPension(pensionLinked&&pensionSimPlan?pensionSimPlan:pensionInputs(null,assetQuery.data??[],plan.retirementYear),assetQuery.data??[],schedFromYear,schedToYear,{
    simulation:pensionLinked,growth:irpGrowthRate,dividend:irpDivYield,lumpsums:plan.lumpsum,stockLink:{dividends:divSummary?.items,owners:accountOwners},
  })
  const sched=projection.rows
  const perPerson=pensionLinked&&pensionSimPlan?annualVehicle(pensionSimPlan,sched.find(r=>r.year===pensionSimPlan.refYear),realEstatePropertyBases(realEstateAssets,pensionSimPlan.refYear),settings):null
  if(!pensionLinked){
    pensionMap=new Map(sched.map(r=>[r.year,(r.nationalAnnual+r.drawdownAnnual)/12]))
    registeredNationalByYear=new Map(sched.map(r=>[r.year,r.nationalAnnual/12]))
    stockDivMonthly=(divSummary?.items??[]).filter(r=>!projection.fundedStockIds.has(r.assetId)).reduce((sum,r)=>sum+r.monthlyKrw,0)
  }
  const analysisNotes=[...projection.notes,...pensionInputNotes(rawPensionSim,assetQuery.data??[])]
  analysisNotes.push(plan.expenseInflationRate==null?'생활비·여행비·의료비 물가상승률 미설정: 기존 고정 금액으로 계산합니다. 생활비·목돈 입력에서 확인하세요.':`생활비·여행비·의료비는 ${plan.expenseBaseYear??new Date().getFullYear()}년 금액 기준, 연 ${plan.expenseInflationRate}% 증가 가정입니다. 세금·건보·목돈·일회 지출에는 이 비율을 중복 적용하지 않습니다.`)
  if(projection.rows.some(r=>r.opening>0||r.inflow>0))analysisNotes.push(`연금 계좌 운용 가정: 상승률 ${irpGrowthRate}% + 배당률 ${irpDivYield}%. 미저장 기본값은 각각 0%이며 실제 수익을 보장하지 않습니다.`)
  if(!plan.holdingTaxAuto&&realEstateAssets.length)analysisNotes.push('수동 보유세 적용 중입니다. 재건축 날짜와 연동하려면 연도별 현금흐름의 보유세를 자동으로 선택하세요.')
  if(!plan.holdingTaxAuto&&plan.holdingTaxAnnual&&!plan.holdingTaxStartYear)analysisNotes.push('수동 보유세 개시 연도가 없어 은퇴 예정 연도부터 적용했습니다.')
  if(realEstateAssets.some(a=>(a.detail as {futureYear?:number})?.futureYear))analysisNotes.push('공사 중 토지의 건강보험 재산 과표는 별도 확인이 필요합니다. 주택으로 전환되기 전 주택 과표는 포함하지 않습니다.')
  if(linkMode==='pension'&&!pensionLinked)analysisNotes.push('저장된 연금 시뮬레이션이 없어 등록 자산 지급액으로 계산 중입니다. 세부 계산에서 연금 설정을 확인하세요.')
  if(linkMode==='corp'&&!linked)analysisNotes.push('저장된 법인 설정이 없어 법인 소득을 반영하지 못했습니다.')
  if(!pensionLinked&&sched.some(r=>r.drawdownAnnual>0||r.nationalAnnual>0))analysisNotes.push('기본 모드는 등록 지급액 기준입니다. 연금소득세는 미산정이므로 세금 합계를 확정 납부액으로 보지 마세요.')
  const nationalByYear = new Map(sched.map((r) => [r.year, r.nationalAnnual / 12]))
  const privateByYear  = new Map(sched.map((r) => [r.year, r.drawdownAnnual / 12]))
  // 배당도 연도별 (성장률 반영) — financialAnnual를 월로 변환
  const dividendByYear = new Map(sched.map((r) => [r.year, r.financialAnnual / 12]))
  // 건보·세금 연도별 재산정 — 매년 연금·배당 성장·재산(재건축 전환) 반영
  const healthByYear = new Map<number, number>()
  const healthDetailsByYear=new Map<number,AnnualHealthResult>()
  const taxByYear = new Map<number, number>()
  const incomeTaxDetailsByYear = new Map<number, ReturnType<typeof annualIncomeTax>>()
  // 1인별 연도별 맵 — 연도별 대시보드 상세 표시용
  const husbandTaxByYear = new Map<number, number>()
  const wifeTaxByYear = new Map<number, number>()
  const husbandHealthByYear = new Map<number, number>()
  const wifeHealthByYear = new Map<number, number>()
  if (pensionLinked && pensionSimPlan) {
    for (const r of sched) {
      const propsY = realEstatePropertyBases(realEstateAssets, r.year)
      const th = perPersonYearTaxHealth(r, pensionSimPlan, propsY.husband, propsY.wife, undefined, settings)
      incomeTaxDetailsByYear.set(r.year, annualIncomeTax(r, pensionSimPlan, settings))
      const health=annualHealth(r,pensionSimPlan,propsY)
      healthDetailsByYear.set(r.year,health)
      healthByYear.set(r.year,health.totalMonthly)
      taxByYear.set(r.year, th.husbandTax + th.wifeTax)
      husbandTaxByYear.set(r.year, th.husbandTax)
      wifeTaxByYear.set(r.year, th.wifeTax)
      husbandHealthByYear.set(r.year, th.husbandHealth)
      wifeHealthByYear.set(r.year, th.wifeHealth)
    }
  }
  if(pensionLinked)analysisNotes.push('건강보험은 2026년 제도 유지 가정의 지역가입 추정입니다. 공적연금과 사적연금·IRP 인출을 구분하며, 가입 형태·실제 부과 시차는 확인이 필요합니다.')
  if([...incomeTaxDetailsByYear.values()].some(t=>t.incomplete))analysisNotes.push('연금·금융 통합세금에 확인할 정보가 있습니다. 세금 상세에서 확인 후 연금 시뮬레이션의 세금 추가정보에 입력하세요. 재원·세율 미확정 IRP 세금은 합계에서 제외된 소계이며 세금 0원이 아닙니다.')
  if(pensionLinked&&!pensionSimPlan?.healthHouseholdMode)analysisNotes.push('건강보험 세대 설정이 없어 같은 지역가입 세대로 가정했습니다. 연금 시뮬레이션의 과세·수령 기준에서 확인하세요.')
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
  const pensionAllocations = projection.allocations
  const corpAllocations = corpPlan?.lumpsumCorp ?? []
  const cashLumpsum: LumpsumItem[] = (plan.lumpsum ?? []).map((l) => {
    let allocated = 0
    if (linkMode === 'pension') {
      const a = pensionAllocations.find((x) => x.lumpsumId === l.id)
      allocated = (a?.irpAmount ?? 0) + (a?.stockAmount ?? 0)
    } else if (linkMode === 'corp') {
      const c = corpAllocations.find((x) => x.lumpsumId === l.id)
      allocated = Math.min(l.amount,Math.max(0,c?.corpAmount ?? 0))
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
    registeredNationalByYear,
    new Map(sched.map(r=>[r.year,linked&&corpPlan?corpHealthMonthly(corpPlan):calcHealthInsurance({
      pensionAnnual:hi.autoLinkPension?(r.nationalAnnual+r.drawdownAnnual):hi.pensionIncome,
      dividendAnnual:hi.autoLinkDividend?stockDivMonthly*12:hi.interestDividendIncome,otherAnnual:hi.otherIncome,
      propertyTaxBase:hi.propertyTaxBase,rentalDeposit:hi.rentalDeposit,carValue:hi.carValue,scorePerPoint:hi.scorePerPoint,
    }).grandTotal])),
  )

  // Paid income and pension capital use the same annual ledger.
  const startYear=pensionSimPlan?.startYear??plan.retirementYear
  const sb=pensionSimPlan?stockAccountBalances(pensionSimPlan):null
  const accountSim=projection.rows
  // KPI
  const retirementRow = cashFlow.find((r) => r.year >= retirementYear)

  const queries=[assetQuery,settingsQuery,dividendQuery,corpQuery,ownersQuery,pensionQuery,portfolioQuery]
  return {
    projection, analysisNotes,
    isLoading:queries.some(q=>q.isPending), error:queries.find(q=>q.error)?.error,
    // 입력 스냅샷
    currentAge, linkMode, retirementYear,
    realEstateAssets,
    // 연동 시뮬
    corpPlan, pensionSimPlan, pensionLinked, incomeTaxDetailsByYear,
    // 연금·연도별 맵
    pensionMap, nationalByYear, privateByYear, dividendByYear, healthByYear, taxByYear,
    husbandTaxByYear, wifeTaxByYear, husbandHealthByYear, wifeHealthByYear, healthDetailsByYear,
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
