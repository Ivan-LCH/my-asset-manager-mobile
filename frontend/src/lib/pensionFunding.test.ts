import {describe,it,expect} from 'vitest'
import {openingFunding,withdrawFunding,growFunding,fundingTotal} from './pensionFunding'
import {annualPension} from './annualPension'
import {annualIncomeTax} from './incomeTax'
import {EMPTY_PENSION_PLAN} from './pensionSim'
import type {PensionSimPlan,PensionSource,LumpsumItem} from '@/types'
const source=(id:string,principal=100_000_000):PensionSource=>({id,name:id,principal,taxType:'irp',owner:'husband',yieldRate:0,expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:1_000_000})
function plan():PensionSimPlan{return {...EMPTY_PENSION_PLAN,startYear:2031,refYear:2031,sources:[source('ret'),source('personal',50_000_000)],allocations:[{lumpsumId:'l',irpSourceId:'ret',irpAmount:450_000_000,stockAmount:0,irpRetirementTaxRate:20}],irpTransfers:[{sourceId:'ret',targetId:'personal',year:2031}],incomeTaxSettings:{sources:{ret:{fundingKind:'retirement',retirementTaxRate:10,firstReceiptYear:2031},personal:{fundingKind:'mixed',retirementPrincipal:0,exemptPrincipal:10_000_000}}}}}
const lump:LumpsumItem={id:'l',name:'new retirement',receiveYear:2031,amount:450_000_000,taxKind:'severance'}
const run=(p=plan(),lumpsums=[lump],to=2035)=>annualPension(p,[],2031,to,{currentYear:2031,simulation:true,growth:0,dividend:0,lumpsums})
describe('명시적 재원 플래그와 순차 인출',()=>{
  it('이름이 아닌 플래그를 사용하고 혼합 재원의 인출 순서를 지킨다',()=>{
    const unknown=openingFunding(100,{},'퇴직IRP');expect(unknown.unknown).toBe(100)
    const p=openingFunding(100,{fundingKind:'mixed',retirementPrincipal:60,exemptPrincipal:10,retirementTaxRate:5},'계좌');
    expect(withdrawFunding(p,30,2031)).toMatchObject({exempt:10,personal:0,unknown:0,retirement:[{amount:20,taxRate:5,firstReceiptYear:2031}]});
    expect(withdrawFunding(p,60,2032)).toMatchObject({exempt:0,personal:20,retirement:[{amount:40,firstReceiptYear:2031}]});expect(fundingTotal(p)).toBe(10)
  })
  it('혼합 미입력·초과는 미확인이며 명시적 0만 확인값이다',()=>{
    for(const config of [{fundingKind:'mixed' as const},{fundingKind:'mixed' as const,retirementPrincipal:101,exemptPrincipal:0}])expect(openingFunding(100,config,'a').unknown).toBe(100)
    expect(openingFunding(100,{fundingKind:'mixed',retirementPrincipal:0,exemptPrincipal:0},'a').personal).toBe(100)
  })
  it('운용수익은 개인납입/수익 재원, 손실 후 세무원금은 확정하지 않는다',()=>{
    const p=openingFunding(100,{fundingKind:'retirement'},'a');growFunding(p,10);expect(p.personal).toBe(10);expect(p.retirement[0].amount).toBe(100)
    growFunding(p,-20);expect(fundingTotal(p)).toBe(90);expect(withdrawFunding(p,30,2031).unknown).toBe(30);expect(fundingTotal(p)).toBeCloseTo(60)
  })
  it('미확인 재원이 섞이면 전액 비과세나 추정 퇴직금 비율을 만들지 않는다',()=>{
    const p=openingFunding(100,{},'a');p.retirement.push({amount:450,name:'추가'});expect(withdrawFunding(p,55,2031).unknown).toBe(55);expect(fundingTotal(p)).toBeCloseTo(495)
  })
})
describe('퇴직금 추가 → 같은 명의 계좌 합산 → 자동 인출·과세',()=>{
  it('시뮬레이션 미연동이면 예정 입금과 계좌 합산을 적용하지 않는다',()=>{
    const p=plan(),row=annualPension(p,[],2031,2031,{currentYear:2031,simulation:false,lumpsums:[lump]}).rows[0]
    expect(row.inflow).toBe(0);expect(row.entries.map(e=>e.paid)).toEqual([12_000_000,12_000_000]);expect(row.accounts.every(a=>!a.transferIn&&!a.transferOut)).toBe(true)
  })
  it('4.5억은 한 번 입금하고 합산은 자산 증가 없이 원천별 잔액을 보존한다',()=>{
    const p=plan(),before=JSON.stringify(p),result=run(p),row=result.rows[0]
    expect(row).toMatchObject({opening:150_000_000,inflow:450_000_000,paid:144_000_000,closing:456_000_000})
    expect(row.entries.find(e=>e.id==='ret')!.paid).toBe(0)
    const e=row.entries.find(e=>e.id==='personal')!
    expect(e.funding!.exempt).toBe(10_000_000);expect(e.funding!.personal).toBe(0)
    expect(e.funding!.retirement.reduce((s,r)=>s+r.amount,0)).toBeCloseTo(134_000_000)
    expect(row.accounts.find(a=>a.id==='source:ret')).toMatchObject({closing:0,transferOut:550_000_000})
    for(const r of result.rows){expect(r.opening+r.inflow+r.growth-r.paid).toBeCloseTo(r.closing,5);for(const a of r.accounts){expect(a.opening+a.inflow+(a.transferIn??0)-(a.transferOut??0)+a.growth-a.paid).toBeCloseTo(a.closing,5);if(a.funding)expect(fundingTotal(a.funding)).toBeCloseTo(a.closing,5)}}
    expect(JSON.stringify(p)).toBe(before)
  })
  it('기존/추가 퇴직금 세율을 섞어 덮어쓰지 않고 실제 인출 재원으로 세금을 계산한다',()=>{
    const p=plan(),row=run(p).rows[0],tax=annualIncomeTax(row,p,{birthHusband:'1966.01'}).husband
    expect(tax.retirementPension).toBeCloseTo(134_000_000);expect(tax.exemptPension).toBe(10_000_000);expect(tax.privatePension).toBe(0)
    expect(tax.retirementTax).toBeCloseTo(Math.round(134_000_000*(100*.1+450*.2)/550*.7*1.1),0)
    expect(tax.unresolvedPension).toBe(0)
  })
  it('새 퇴직금의 세율은 기존 세율로 자동 대체하지 않는다',()=>{
    const p=plan();delete p.allocations[0].irpRetirementTaxRate
    const tax=annualIncomeTax(run(p).rows[0],p).husband
    expect(tax.unresolvedPension).toBeCloseTo(134_000_000*450/550);expect(tax.notes.some(n=>n.includes('new retirement'))).toBe(true)
  })
  it('세율 0은 미입력과 다르며 퇴직금 소진 뒤에는 개인 재원을 사용한다',()=>{
    const p=plan();p.allocations[0].irpRetirementTaxRate=0;p.incomeTaxSettings!.sources!.ret.retirementTaxRate=0
    const rows=run(p).rows;expect(annualIncomeTax(rows[0],p).husband.unresolvedPension).toBe(0)
    expect(rows[rows.length-1].entries.find(e=>e.id==='personal')!.funding!.personal).toBeGreaterThan(0)
  })
  it('다른 명의·삭제된 연결·자기 자신·연쇄 합산은 실행하지 않는다',()=>{
    for(const kind of ['wife','missing','self','cycle']){
      const p=plan();if(kind==='wife')p.sources[1].owner='wife';if(kind==='missing')p.irpTransfers![0].targetId='missing';if(kind==='self')p.irpTransfers![0].targetId='ret';if(kind==='cycle')p.irpTransfers!.push({sourceId:'personal',targetId:'ret',year:2032})
      const r=run(p);expect(r.incomplete).toBe(true);expect(r.rows[0].accounts.every(a=>!a.transferIn&&!a.transferOut)).toBe(true)
    }
  })
  it('합산 후 옛 계좌를 향한 미래 입금은 받는 계좌로 연결한다',()=>{
    const p=plan();const rows=run(p,[{...lump,receiveYear:2032}]).rows
    expect(rows[1].accounts.find(a=>a.id==='source:ret')!.closing).toBe(0)
    expect(rows[1].accounts.find(a=>a.id==='source:personal')!.inflow).toBe(450_000_000)
    expect(rows.reduce((s,r)=>s+r.inflow,0)).toBe(450_000_000)
  })
  it('조회 구간을 잘라도 이전 연도의 재원 차감을 유지한다',()=>{
    const p=plan(),full=run(p).rows,part=annualPension(p,[],2033,2035,{currentYear:2031,simulation:true,lumpsums:[lump]})
    expect(part.rows).toEqual(full.filter(r=>r.year>=2033))
  })
  it('기존 수동 인출 비율은 새 플래그가 있을 때만 자동 계산으로 대체된다',()=>{
    const p=plan();p.incomeTaxSettings!.sources!.personal.retirementShare=0;p.incomeTaxSettings!.sources!.personal.exemptShare=100
    expect(annualIncomeTax(run(p).rows[0],p).husband.retirementPension).toBeGreaterThan(0)
    const old={...p,sources:[source('ret')],allocations:[],irpTransfers:[],incomeTaxSettings:{sources:{ret:{retirementShare:100,retirementTaxRate:10,firstReceiptYear:2031}}}}
    const row=run(old,[]).rows[0];expect(row.entries[0].funding).toBeUndefined();expect(annualIncomeTax(row,old).husband.retirementPension).toBe(12_000_000)
  })
})
