import type { PensionSimPlan, Settings, PensionSourceTaxSettings } from '@/types'
import type { PensionScheduleRow } from './pensionSim'
import { comprehensiveTax, separatedDividendTax } from './taxMath'
import { parseBirthYear } from './people'

const nn = (n: number | undefined) => Number.isFinite(n) ? Math.max(0, n!) : 0
const ratio = (n: number | undefined) => Math.min(100, nn(n)) / 100
const LIMIT = 20_000_000
export const INCOME_TAX_POLICY = 'KR-2026-income-v2'

/** Art.47-2: applies once to pensions included in comprehensive income only. */
export function statutoryPensionDeduction(gross: number) {
  const p = nn(gross)
  if (p <= 3_500_000) return p
  if (p <= 7_000_000) return 3_500_000 + (p - 3_500_000) * .4
  if (p <= 14_000_000) return 4_900_000 + (p - 7_000_000) * .2
  return Math.min(9_000_000, 6_300_000 + (p - 14_000_000) * .1)
}

export function privatePensionRate(age: number | null, lifetime = false) {
  return lifetime ? .03 : age != null && age >= 80 ? .03 : age != null && age >= 70 ? .04 : .05
}

export function retirementPensionFactor(receiptYears: number) {
  return receiptYears > 20 ? .5 : receiptYears > 10 ? .6 : .7
}

export interface PersonIncomeTax {
  owner: 'husband' | 'wife'; year: number; policy: string
  financialIncome: number; ordinaryFinancial: number; exceedsThreshold: boolean
  publicPension: number; publicPensionTaxable: number; privatePension: number
  retirementPension: number; exemptPension: number; unresolvedPension: number
  pensionDeduction: number; incomeDeduction: number; otherIncome: number
  grossUp: number; dividendCredit: number; generalNationalTax: number; comparisonNationalTax: number
  comprehensiveTaxable: number; comprehensiveNational: number; comprehensiveLocal: number
  privateMode: 'separate' | 'comprehensive'; privateSeparateTax: number; retirementTax: number
  selectedDividend: number; selectedDividendTax: number
  foreignIncome: number; foreignTaxPaid: number; foreignCreditNational: number; foreignCreditLocal: number
  nationalCredit: number; localCredit: number
  domesticWithholding: number; withholdingEstimated: boolean; withholdingTax: number
  additionalTax: number; domesticTax: number; totalTax: number
  incomplete: boolean; notes: string[]
}

/**
 * Annual cash liability, not a filing engine. No input mutation or automatic eligibility.
 * Public pension + elected private pension share the comprehensive base with financial income.
 * Deferred retirement pensions remain separate; unknown retirement tax is an explicit subtotal.
 */
export function annualIncomeTax(row: PensionScheduleRow, plan: PensionSimPlan, settings?: Partial<Settings>) {
  const own = row.pensionByOwner ?? {
    husband: { national: row.nationalAnnual, taxable: Math.max(0, row.taxableAnnual - row.nationalAnnual), exempt: row.exemptAnnual },
    wife: { national: 0, taxable: 0, exempt: 0 },
  }
  const person = (owner: 'husband' | 'wife'): PersonIncomeTax => {
    const config = plan.incomeTaxSettings?.people?.[owner] ?? {}
    const adjustment = plan.incomeTaxSettings?.years?.[String(row.year)]?.[owner] ?? {}
    const notes: string[] = []
    let incomplete = false
    const missing = (s: string) => { incomplete = true; notes.push(s) }
    const financialIncome = nn(owner === 'husband' ? row.financialHusbandAnnual : row.financialWifeAnnual)
    const selectedDividend = financialIncome * ratio(plan.stockAccount[owner].growthDividendRatio)
    const selectedTax = separatedDividendTax(selectedDividend)
    const ordinaryFinancial = financialIncome - selectedDividend
    const exceedsThreshold = ordinaryFinancial > LIMIT
    const foreignIncome = Math.min(ordinaryFinancial, nn(adjustment.foreignIncome))
    if (nn(adjustment.foreignIncome) > ordinaryFinancial) missing('국외 금융소득이 일반 금융소득을 초과해 일반 금융소득 범위로 제한했습니다.')
    const foreignTaxPaid = nn(adjustment.foreignTaxPaid)
    if (foreignTaxPaid > 0 && foreignIncome === 0) missing('외국납부세액은 있지만 국외 금융소득이 없습니다. 소득·귀속연도를 확인하세요.')
    if (foreignIncome > 0 && (adjustment.foreignTaxPaid == null || adjustment.foreignCreditNational == null || adjustment.foreignCreditLocal == null || adjustment.domesticWithholding == null)) {
      missing('국외소득: 외국납부액·국세/지방세 공제 가능액·전체 국내 기납부액을 이 연도에 확인하세요. 미입력 공제는 0, 국내 원천징수는 국내 소득만 추정합니다.')
    }
    if (financialIncome > 0 && config.eligibleDividendRatio == null) missing('배당공제 대상 비율 미확인: 확인 전에는 배당가산·공제 없이 추정합니다. ETF·해외 배당을 일괄 적격으로 지정하지 마세요.')
    if (selectedDividend > 0) missing('선택분리 배당은 기존 비율·세율 시나리오입니다. 적용 자격과 미래 제도 연장은 별도 확인이 필요합니다.')
    const eligibleDividend = Math.min(ordinaryFinancial - foreignIncome, ordinaryFinancial * ratio(config.eligibleDividendRatio))
    const grossUp = exceedsThreshold ? Math.round(Math.min(eligibleDividend, ordinaryFinancial - LIMIT) * .1) : 0

    const publicPension = nn(own[owner].national)
    if (publicPension > 0 && config.publicPensionTaxableRatio == null) missing('국민연금 과세대상 비율 미확인: 전액 과세 가정입니다. 연금기관 증명서의 과세대상액으로 확인하세요.')
    const publicPensionTaxable = publicPension * (config.publicPensionTaxableRatio == null ? 1 : ratio(config.publicPensionTaxableRatio))
    let privatePension = 0, retirementPension = 0, retirementTax = 0, unresolvedPension = 0
    let exemptPension = nn(own[owner].exempt) + publicPension - publicPensionTaxable
    let privateWithholding = 0, covered = 0
    const birth = parseBirthYear(owner === 'husband' ? settings?.birthHusband : settings?.birthWife)
    const age = birth == null ? null : row.year - birth
    const entries = (row.entries ?? []).filter(e => (e.owner ?? plan.sources.find(s => s.id === e.id)?.owner ?? 'husband') === owner)
    const addPrivate = (amount: number, lifetime = false) => {
      privatePension += amount
      privateWithholding += amount * privatePensionRate(age, lifetime) * 1.1
    }
    for (const e of entries) {
      const s = plan.sources.find(s => s.id === e.id) ?? (e.taxType ? {id:e.id,name:e.name??e.id,taxType:e.taxType,expectedStartYear:e.expectedStartYear} : undefined)
      const review=plan.monthlyPlan?.accounts.find(a=>a.sourceId===e.id)?.taxReview
      if(review&&nn(e.paid)>0){
        if(s?.taxType==='taxExempt')exemptPension-=nn(e.paid)
        else covered+=nn(e.paid)
        unresolvedPension+=nn(e.paid);missing(`${s?.name??e.name}: ${review}`);continue
      }
      if (s?.taxType === 'national' || s?.taxType === 'taxExempt') continue
      const paid = nn(e.paid)
      if (!paid) continue
      covered += paid
      if (!s) { unresolvedPension += paid; missing('연금 원천의 과세 구분을 찾지 못해 해당 세금은 미확정입니다.'); continue }
      const tax: PensionSourceTaxSettings = plan.incomeTaxSettings?.sourceYears?.[String(row.year)]?.[e.id] ?? plan.incomeTaxSettings?.sources?.[e.id] ?? {}
      if(e.funding){
        const f=e.funding
        exemptPension+=f.exempt;addPrivate(f.personal,tax.lifetime)
        if(f.unknown>0.01){unresolvedPension+=f.unknown;missing(`${s.name}: 현재 잔액 또는 유입금의 재원 미확인으로 자동 인출 세금은 미확정입니다.`)}
        for(const lot of f.retirement){
          retirementPension+=lot.amount
          const first=lot.firstReceiptYear
          if(lot.taxRate==null||!Number.isFinite(lot.taxRate)||lot.taxRate<0||lot.taxRate>100||first==null||!Number.isInteger(first)||first<1900||first>row.year){
            unresolvedPension+=lot.amount;missing(`${lot.name}: 이연퇴직소득세율 또는 첫 수령연도 미확정으로 퇴직금 세금은 합계에서 제외됩니다.`)
          }else retirementTax+=lot.amount*ratio(lot.taxRate)*retirementPensionFactor(row.year-first+1)*1.1
        }
        notes.push(`${s.name}: 재원 플래그·입금·계좌 합산을 연결해 과세제외 → 퇴직금 → 개인납입/수익 순서로 자동 인출했습니다. 기존 수동 인출 비율은 적용하지 않습니다.`)
        if(f.retirement.length>0)notes.push('여러 퇴직금의 같은 재원 내 인출은 잔액 비례 추정입니다. 연속 수령 및 정상 연금수령을 가정하며 실제 원천징수·수령연차·한도는 금융기관 확인이 필요합니다.')
        continue
      }
      const exempt = paid * ratio(tax.exemptShare)
      exemptPension += exempt
      if (s?.taxType === 'irp' && tax.retirementShare == null && exempt < paid) {
        unresolvedPension += paid - exempt
        missing(`${s.name}: IRP 인출의 퇴직금·개인납입·과세제외 재원 구분이 없어 세금 미확정입니다.`)
        continue
      }
      if (nn(tax.retirementShare) + nn(tax.exemptShare) > 100) missing(`${s?.name ?? '연금'}: 인출 재원 비율 합계가 100%를 초과해 제한했습니다.`)
      const retirement = Math.min(paid - exempt, paid * ratio(tax.retirementShare))
      retirementPension += retirement
      addPrivate(Math.max(0, paid - exempt - retirement), tax.lifetime)
      if (retirement > 0) {
        const first = tax.firstReceiptYear ?? s?.expectedStartYear ?? plan.startYear
        if (tax.retirementTaxRate == null || !Number.isFinite(tax.retirementTaxRate) || !Number.isInteger(first) || first < 1900 || first > row.year) {
          unresolvedPension += retirement
          missing(`${s?.name ?? 'IRP'}: 이연퇴직소득세율 또는 실제 첫 수령연도가 미확정이어서 퇴직금 재원 세금은 합계에서 제외됩니다.`)
        } else {
          retirementTax += retirement * ratio(tax.retirementTaxRate) * retirementPensionFactor(row.year - first + 1) * 1.1
          if (tax.firstReceiptYear == null) notes.push(`${s?.name ?? 'IRP'}: 등록 지급개시연도를 첫 실제 수령연도로 가정했습니다. 중단 연도가 있으면 연차를 확인하세요.`)
        }
      }
    }
    const unclassified = Math.max(0, nn(own[owner].taxable) - covered)
    if (unclassified > 1) {
      unresolvedPension += unclassified
      missing('개별 원천과 연결되지 않은 과세연금이 있어 해당 세금은 미확정입니다.')
    }
    if (privatePension > 0 && age == null) missing('생년월 미입력: 사적연금 원천징수는 70세 미만으로 추정합니다.')
    if (privatePension > 0 && age != null && age < 55) missing('55세 미만 사적연금: 연금수령 요건·예외를 확인하세요. 현재 연금수령 가정입니다.')
    if (privatePension > 0) notes.push('과세 사적연금은 연말 나이·연금계좌의 정상 연금수령 가정입니다. 실제 지급일의 나이·수령한도 초과·연금외수령·보험차익은 별도 확인이 필요합니다.')
    const privateMode = config.privatePensionMode ?? 'separate'
    const privateSeparateTax = privateMode === 'separate' ? Math.round(privatePension > 15_000_000 ? privatePension * .165 : privateWithholding) : 0
    if (privatePension > 0 && config.privatePensionMode == null) notes.push('사적연금은 분리과세 선택 가정입니다. 설정에서 종합합산으로 비교할 수 있습니다.')
    const combinedPension = publicPensionTaxable + (privateMode === 'comprehensive' ? privatePension : 0)
    const pensionDeduction = statutoryPensionDeduction(combinedPension)
    const otherIncome = owner === 'husband' ? nn(plan.otherIncome) : 0
    const otherBase = combinedPension - pensionDeduction + otherIncome
    const incomeDeduction = config.incomeDeduction == null ? 1_500_000 : nn(config.incomeDeduction)
    if (config.incomeDeduction == null && (combinedPension > 0 || otherIncome > 0 || exceedsThreshold)) notes.push('인적·기타 소득공제는 본인 150만원만 적용합니다. 기존 배우자·표준공제의 부부 절반 배분은 적용하지 않습니다.')
    if (otherIncome > 0) notes.push('기타 종합소득은 필요경비·근로소득공제 후 소득금액으로 입력한 것으로 계산합니다.')
    const comprehensiveTaxable = Math.max(0, Math.max(0, ordinaryFinancial - LIMIT) + grossUp + otherBase - incomeDeduction)
    const generalNationalTax = Math.round(Math.min(ordinaryFinancial, LIMIT) * .14 + comprehensiveTax(comprehensiveTaxable))
    const comparisonNationalTax = Math.round(ordinaryFinancial * .14 + comprehensiveTax(Math.max(0, otherBase - incomeDeduction)))
    const beforeCredits = exceedsThreshold ? Math.max(generalNationalTax, comparisonNationalTax) : comparisonNationalTax
    // Arts.17/56/62: 10% gross-up; credit limited to excess over comparison tax.
    const dividendCredit = Math.min(grossUp, Math.max(0, beforeCredits - comparisonNationalTax))
    const afterDividend = Math.max(0, beforeCredits - dividendCredit)
    // Confirmed credits, not unchecked foreign taxes. No cross-person/year carry-forward.
    const foreignCreditNational = foreignIncome > 0 ? Math.min(nn(adjustment.foreignCreditNational), foreignTaxPaid, afterDividend) : 0
    const foreignCreditLocal = foreignIncome > 0 ? Math.min(nn(adjustment.foreignCreditLocal), afterDividend * .1) : 0
    const nationalCredit = Math.min(nn(adjustment.nationalCredit), Math.max(0, afterDividend - foreignCreditNational))
    const localCredit = Math.min(nn(adjustment.localCredit), Math.max(0, afterDividend * .1 - foreignCreditLocal))
    if (foreignCreditNational < nn(adjustment.foreignCreditNational) || foreignCreditLocal < nn(adjustment.foreignCreditLocal)) missing('입력한 외국납부 공제를 납부액·국내 산출세액 범위로 제한했습니다. 국가별 법정 한도는 확인된 공제액을 입력해야 합니다.')
    const comprehensiveNational = Math.round(afterDividend - foreignCreditNational - nationalCredit)
    const comprehensiveLocal = Math.round(afterDividend * .1 - foreignCreditLocal - localCredit)
    retirementTax = Math.round(retirementTax)
    const domesticTax = comprehensiveNational + comprehensiveLocal + privateSeparateTax + retirementTax + selectedTax
    const withholdingEstimated = adjustment.domesticWithholding == null
    const domesticWithholding = withholdingEstimated
      ? Math.round((financialIncome - foreignIncome) * .154 + privateWithholding + retirementTax)
      : Math.round(nn(adjustment.domesticWithholding))
    if (withholdingEstimated && (publicPension > 0 || otherIncome > 0)) notes.push('공적연금·기타소득 기납부세액 미입력: 추가 납부액은 과대 추정될 수 있습니다. 총세금 부담은 기납부액과 별개입니다.')
    const paidForeign = Math.round(foreignTaxPaid)
    const totalTax = domesticTax + paidForeign
    const withholdingTax = domesticWithholding + paidForeign
    return {
      owner, year: row.year, policy: INCOME_TAX_POLICY, financialIncome, ordinaryFinancial, exceedsThreshold,
      publicPension, publicPensionTaxable, privatePension, retirementPension, exemptPension, unresolvedPension,
      pensionDeduction, incomeDeduction, otherIncome, grossUp, dividendCredit, generalNationalTax, comparisonNationalTax,
      comprehensiveTaxable, comprehensiveNational, comprehensiveLocal, privateMode, privateSeparateTax, retirementTax,
      selectedDividend, selectedDividendTax: selectedTax, foreignIncome, foreignTaxPaid: paidForeign,
      foreignCreditNational, foreignCreditLocal, nationalCredit, localCredit, domesticWithholding,
      withholdingEstimated, withholdingTax, additionalTax: domesticTax - domesticWithholding,
      domesticTax, totalTax, incomplete, notes: [...new Set(notes)],
    }
  }
  const husband = person('husband'), wife = person('wife')
  return { husband, wife, totalTax: husband.totalTax + wife.totalTax, incomplete: husband.incomplete || wife.incomplete }
}
