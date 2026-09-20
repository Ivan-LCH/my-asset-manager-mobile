import {describe,it,expect} from 'vitest'
import {annualIncomeTax,statutoryPensionDeduction,privatePensionRate,retirementPensionFactor} from './incomeTax'
import {EMPTY_PENSION_PLAN,perPersonYearTaxHealth,type PensionScheduleRow} from './pensionSim'
import type {PensionSimPlan,IncomeTaxSettings} from '@/types'

function fixture(p:{public?:number;private?:number;retirement?:number;financial?:number;owner?:'husband'|'wife';year?:number;tax?:IncomeTaxSettings}={}) {
  const owner=p.owner??'husband',pub=p.public??0,priv=p.private??0,ret=p.retirement??0,fin=p.financial??0
  const plan:PensionSimPlan={...EMPTY_PENSION_PLAN,sources:[
    {id:'pub',name:'PUBLIC',owner,taxType:'national',yieldRate:0,principal:0},
    {id:'priv',name:'PRIVATE',owner,taxType:'taxable',yieldRate:0,principal:0},
    {id:'ret',name:'RETIREMENT',owner,taxType:'irp',yieldRate:0,principal:0,expectedStartYear:2026},
  ],allocations:[],incomeTaxSettings:p.tax}
  const row:PensionScheduleRow={year:p.year??2031,nationalAnnual:pub,taxableAnnual:pub+priv+ret,exemptAnnual:0,drawdownAnnual:priv+ret,financialAnnual:fin,financialHusbandAnnual:owner==='husband'?fin:0,financialWifeAnnual:owner==='wife'?fin:0,totalAnnual:pub+priv+ret+fin,
    pensionByOwner:{husband:{national:0,taxable:0,exempt:0},wife:{national:0,taxable:0,exempt:0},[owner]:{national:pub,taxable:priv+ret,exempt:0}},
    entries:[{id:'pub',paid:pub,owner},{id:'priv',paid:priv,owner},{id:'ret',paid:ret,owner}]}
  return {plan,row}
}
const settings={birthHusband:'1966.01',birthWife:'1966.01'}
const calc=(p:Parameters<typeof fixture>[0])=>{const {plan,row}=fixture(p);return annualIncomeTax(row,plan,settings)[p?.owner??'husband']}

describe('연금·금융 통합 소득세',()=>{
  it.each([[0,0],[3_500_000,3_500_000],[7_000_000,4_900_000],[14_000_000,6_300_000],[41_000_000,9_000_000],[100_000_000,9_000_000]])('연금소득공제 %i → %i',(income,deduction)=>expect(statutoryPensionDeduction(income)).toBe(deduction))
  it('국민연금 공제 후 본인공제·기본세율·지방세를 적용한다',()=>{
    const t=calc({public:12_000_000,tax:{people:{husband:{publicPensionTaxableRatio:100}}}})
    expect(t.pensionDeduction).toBe(5_900_000)
    expect(t.comprehensiveTaxable).toBe(4_600_000)
    expect(t.totalTax).toBe(303_600)
  })
  it('국민연금 과세 제외 비율과 명시적인 0을 보존한다',()=>{
    expect(calc({public:12_000_000,tax:{people:{husband:{publicPensionTaxableRatio:50}}}}).publicPensionTaxable).toBe(6_000_000)
    expect(calc({public:12_000_000,tax:{people:{husband:{publicPensionTaxableRatio:0}}}}).totalTax).toBe(0)
    expect(calc({public:12_000_000}).incomplete).toBe(true)
  })
  it('금융과 공적연금은 한 과세표준에서 누진 계산한다',()=>{
    const t=calc({public:48_000_000,financial:30_000_000})
    expect(t.generalNationalTax).toBe(8_665_000)
    expect(t.comparisonNationalTax).toBe(8_565_000)
    expect(t.totalTax).toBe(9_531_500)
    expect(t.totalTax).toBeGreaterThan(calc({public:48_000_000}).totalTax+calc({financial:30_000_000}).totalTax)
  })
  it('사적연금 1500만원 경계와 종합/분리 선택',()=>{
    expect(calc({private:15_000_000}).privateSeparateTax).toBe(825_000)
    expect(calc({private:15_000_001}).privateSeparateTax).toBe(2_475_000)
    const separate=calc({public:12_000_000,private:20_000_000})
    const combined=calc({public:12_000_000,private:20_000_000,tax:{people:{husband:{privatePensionMode:'comprehensive'}}}})
    expect(separate.totalTax).toBe(3_603_600)
    expect(combined.totalTax).toBe(2_310_000)
    expect(combined.privateSeparateTax).toBe(0)
    expect(combined.pensionDeduction).toBe(8_100_000)
  })
  it.each([[69,.05],[70,.04],[79,.04],[80,.03]])('나이 %i의 사적연금 국세율 %i',(age,rate)=>expect(privatePensionRate(age)).toBe(rate))
  it('종신계약은 2026년 기준 3%를 적용한다',()=>expect(privatePensionRate(65,true)).toBe(.03))
  it.each([[10,.7],[11,.6],[20,.6],[21,.5]])('퇴직연금 %i년차 감면계수 %i',(year,factor)=>expect(retirementPensionFactor(year)).toBe(factor))
  it('IRP 계좌 전체를 개인연금으로 합산하지 않고 퇴직금 재원을 구분한다',()=>{
    const tax:IncomeTaxSettings={sources:{ret:{retirementShare:75,exemptShare:5,retirementTaxRate:10,firstReceiptYear:2026}}}
    const t=calc({retirement:20_000_000,tax})
    expect(t.retirementPension).toBe(15_000_000)
    expect(t.privatePension).toBe(4_000_000)
    expect(t.exemptPension).toBe(1_000_000)
    expect(t.retirementTax).toBe(1_155_000)
    expect(t.privateSeparateTax).toBe(220_000)
    expect(t.totalTax).toBe(1_375_000)
  })
  it('IRP 재원·세율 미확인과 확인된 0을 구별한다',()=>{
    expect(calc({retirement:20_000_000}).unresolvedPension).toBe(20_000_000)
    expect(calc({retirement:20_000_000,tax:{sources:{ret:{retirementShare:100}}}}).unresolvedPension).toBe(20_000_000)
    expect(calc({retirement:20_000_000,tax:{sources:{ret:{retirementShare:100,retirementTaxRate:0}}}}).unresolvedPension).toBe(0)
    expect(calc({retirement:20_000_000,tax:{sources:{ret:{retirementShare:0}}}}).privatePension).toBe(20_000_000)
    expect(calc({retirement:20_000_000,tax:{sources:{ret:{exemptShare:100}}}}).totalTax).toBe(0)
  })
  it('재원 연도별 덮어쓰기는 해당 연도에만 적용한다',()=>{
    const tax:IncomeTaxSettings={sources:{ret:{retirementShare:100,retirementTaxRate:10}},sourceYears:{'2031':{ret:{retirementShare:0,exemptShare:100}}}}
    expect(calc({retirement:20_000_000,tax}).totalTax).toBe(0)
    expect(calc({retirement:20_000_000,tax,year:2032}).retirementTax).toBe(1_540_000)
  })
  it('연금형 주식 등 원장 자동 원천의 과세 구분도 연결한다',()=>{
    const {row,plan}=fixture({retirement:12_000_000,tax:{sources:{ret:{retirementShare:100,retirementTaxRate:10}}}})
    row.entries=row.entries?.map(e=>e.id==='ret'?{...e,taxType:'irp' as const,name:'AUTO',expectedStartYear:2026}:e)
    plan.sources=plan.sources.filter(s=>s.id!=='ret')
    const t=annualIncomeTax(row,plan,settings).husband
    expect(t.unresolvedPension).toBe(0);expect(t.retirementTax).toBe(924_000)
  })
  it('배당가산은 적격 배당과 2천만원 초과분 중 작은 금액의 10%',()=>{
    const tax:IncomeTaxSettings={people:{husband:{eligibleDividendRatio:100}}}
    const low=calc({financial:20_000_000,tax}),high=calc({financial:100_000_000,tax})
    expect(low.grossUp).toBe(0)
    expect(high.grossUp).toBe(8_000_000)
    expect(high.dividendCredit).toBe(3_800_000)
    expect(high.totalTax).toBe(15_400_000)
    expect(calc({financial:100_000_000,tax:{people:{husband:{eligibleDividendRatio:10}}}}).totalTax).toBe(16_632_000)
    expect(calc({financial:100_000_000}).totalTax).toBe(17_468_000)
  })
  it('배당가산과 선택분리·해외 배당을 중복하지 않는다',()=>{
    const {row,plan}=fixture({financial:60_000_000,tax:{people:{husband:{eligibleDividendRatio:100}},years:{'2031':{husband:{foreignIncome:30_000_000}}}}})
    const copy={...plan,stockAccount:{...plan.stockAccount,husband:{...plan.stockAccount.husband,growthDividendRatio:50}}}
    const t=annualIncomeTax(row,copy,settings).husband
    expect(t.ordinaryFinancial).toBe(30_000_000)
    expect(t.grossUp).toBe(0)
    expect(t.selectedDividend).toBe(30_000_000)
  })
  it('외국납부액 자체가 아닌 확인된 공제액을 반영, 국내외 부담 보존',()=>{
    const tax:IncomeTaxSettings={people:{husband:{eligibleDividendRatio:0}},years:{'2031':{husband:{foreignIncome:30_000_000,foreignTaxPaid:4_500_000,foreignCreditNational:4_200_000,foreignCreditLocal:420_000,domesticWithholding:0}}}}
    const t=calc({financial:30_000_000,tax})
    expect(t.domesticTax).toBe(0)
    expect(t.totalTax).toBe(4_500_000)
    expect(t.withholdingTax+t.additionalTax).toBe(t.totalTax)
    expect(calc({financial:30_000_000,tax,year:2032}).totalTax).toBe(4_620_000)
    expect(calc({financial:30_000_000,tax:{years:{'2031':{husband:{foreignIncome:30_000_000,foreignTaxPaid:4_500_000}}}}}).totalTax).toBe(9_120_000)
  })
  it('기납부액은 총세금을 바꾸지 않고 정산액만 변경, 환급도 표시',()=>{
    const t=calc({financial:30_000_000,tax:{years:{'2031':{husband:{domesticWithholding:5_000_000}}}}})
    expect(t.totalTax).toBe(4_620_000)
    expect(t.additionalTax).toBe(-380_000)
    expect(t.withholdingTax+t.additionalTax).toBe(t.totalTax)
  })
  it('세액공제를 소득공제로 빼지 않으며 국세·지방세 구분',()=>{
    const t=calc({public:12_000_000,tax:{years:{'2031':{husband:{nationalCredit:70_000,localCredit:7_000}}}}})
    expect(t.comprehensiveTaxable).toBe(4_600_000)
    expect(t.totalTax).toBe(226_600)
  })
  it('명의별 계산·공제·기납부액은 다른 배우자에게 전달되지 않는다',()=>{
    const {row,plan}=fixture({public:12_000_000,financial:21_000_000,owner:'wife',tax:{years:{'2031':{husband:{domesticWithholding:9_000_000,foreignCreditNational:1_000_000}}}}})
    const before=JSON.stringify({row,plan})
    const t=annualIncomeTax(row,plan,settings),prop={propertyTaxBase:0,rentalDeposit:0}
    const yearly=perPersonYearTaxHealth(row,plan,prop,prop,undefined,settings)
    expect(t.husband.totalTax).toBe(0)
    expect(t.wife.totalTax).toBe(3_537_600)
    expect(yearly.wifeTax).toBe(t.wife.totalTax)
    expect(JSON.stringify({row,plan})).toBe(before)
  })
})
