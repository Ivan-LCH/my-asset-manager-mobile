import 'fake-indexeddb/auto'
import {beforeEach,describe,expect,it} from 'vitest'
import {annualPension} from './annualPension'
import {annualIncomeTax} from './incomeTax'
import {EMPTY_PENSION_PLAN} from './pensionSim'
import {EMPTY_PLAN} from './retirementPlan'
import {monthLabel,type MonthlyPensionPlan} from './monthlyPensionPlan'
import {parsePensionRegistration,registerPensionPlan,undoPensionRegistration} from './registerPensionPlan'
import {db,exportBackup,importBackup,getAllAssets,getPensionSim,getRetirement} from './db'
import {pensionInputs} from './analysisInputs'
import type {Asset,PensionSimPlan} from '@/types'

// Only synthetic fixtures: no private account IDs or names.
const contributions=(from:number,to:number,amount:number,employerAmount=0)=>Array.from({length:to-from+1},(_,i)=>({month:monthLabel(from+i),amount,employerAmount}))
function monthly():MonthlyPensionPlan{return {version:1,recordedAt:'2026-09-18',retirementDate:'2029-03-31',accounts:[
  {sourceId:'dc',label:'DC',role:'companyDC',annualTotalReturn:5,payout:'none',annualIncrease:0,contributions:[{month:'2026-12',amount:12000000,employerAmount:12000000},{month:'2027-12',amount:12000000,employerAmount:12000000},{month:'2028-12',amount:12000000,employerAmount:12000000},{month:'2029-03',amount:3000000,employerAmount:3000000}]},
  {sourceId:'irp',label:'IRP',role:'personalIRP',annualTotalReturn:5,payout:'amortized',start:'2029-04',end:'2059-03',annualIncrease:2,contributions:contributions(2027*12,2029*12+2,500000),fundingReview:'미공제 원금 확인 필요'},
  {sourceId:'insurance',label:'Insurance',role:'insurance',annualTotalReturn:0,payout:'fixed',start:'2029-04',end:'2049-03',monthlyAmount:1160000,annualIncrease:0,contributions:contributions(2026*12+9,2029*12+2,1000000,150000),payoutReview:'55세 조회액 잠정',taxReview:'과세 구분 확인 필요'},
],transfers:[{sourceId:'dc',targetId:'irp',month:'2029-03'}],deposits:[{lumpsumId:'severance',targetId:'irp',month:'2029-03'}],notes:[]}}
function fixture(){
  const assets=['dc','irp','insurance'].map((id,i)=>({id,type:'PENSION',name:id,currentValue:[250000000,20000000,12000000][i],acquisitionDate:'2020-01-01',acquisitionPrice:0,quantity:1,ownership:{husband:100,wife:0},detail:{expectedStartYear:2031,expectedEndYear:2051,expectedMonthlyPayout:100000,annualGrowthRate:0,pensionType:'퇴직연금'}} as Asset))
  const plan:PensionSimPlan={...structuredClone(EMPTY_PENSION_PLAN),monthlyPlan:monthly(),sources:assets.map(a=>({id:a.id,name:a.name,principal:a.currentValue,taxType:a.id==='insurance'?'taxExempt':'irp',owner:'husband',yieldRate:4,taxTypeManual:true})),allocations:[{lumpsumId:'severance',irpSourceId:'irp',irpAmount:450000000,stockAmount:0}]}
  const lump={id:'severance',name:'Severance',amount:450000000,receiveYear:2029,taxKind:'severance' as const}
  return {assets,plan,lump}
}
const run=()=>{const {assets,plan,lump}=fixture();return annualPension(plan,assets,2026,2060,{currentYear:2026,simulation:true,growth:10,dividend:4,lumpsums:[lump]})}
describe('월별 연금 계획',()=>{
  it('개시 9개월·종료 3개월, 360회 수령과 매년 4월 증가',()=>{
    const rows=run().rows,get=(y:number,id='irp')=>rows.find(r=>r.year===y)!.entries.find(e=>e.id===id)!.paid
    expect(get(2028)).toBe(0);const first=get(2029)/9
    expect(get(2030)).toBeCloseTo(first*3+first*1.02*9,3)
    expect(get(2059)).toBeCloseTo(first*Math.pow(1.02,29)*3,3)
    expect(get(2060)).toBe(0)
    expect(get(2029,'insurance')).toBe(1160000*9)
    expect(get(2049,'insurance')).toBe(1160000*3)
    expect(get(2050,'insurance')).toBe(0)
    expect(rows.find(r=>r.year===2059)!.accounts.find(a=>a.id==='source:irp')!.closing).toBeLessThan(.01)
  })
  it('DC 이전은 내부 이동이며 납입금과 목돈은 한 번만 가산',()=>{
    const rows=run().rows
    expect(rows.reduce((s,r)=>s+r.inflow,0)).toBe(39000000+13500000+450000000)
    for(const r of rows)expect(r.opening+r.inflow+r.growth-r.paid-r.closing).toBeCloseTo(0,4)
    const r=rows.find(r=>r.year===2029)!,dc=r.accounts.find(a=>a.id==='source:dc')!,irp=r.accounts.find(a=>a.id==='source:irp')!
    expect(dc.transferOut).toBe(irp.transferIn);expect(dc.closing).toBe(0)
    expect(rows.every(r=>r.entries.find(e=>e.id==='dc')!.paid===0)).toBe(true)
  })
  it('총수익률 5%에 공통 배당률 4%를 중복 가산하지 않음',()=>{
    const r=run().rows[0].accounts.find(a=>a.id==='source:irp')!
    expect(r.closing).toBeCloseTo(20000000*1.05,4)
  })
  it('미확인 재원과 보험 과세 구분을 0원·비과세 확정으로 만들지 않음',()=>{
    const {plan}=fixture(),row=run().rows.find(r=>r.year===2029)!,tax=annualIncomeTax(row,plan)
    expect(tax.incomplete).toBe(true)
    expect(tax.husband.unresolvedPension).toBeCloseTo(row.entries.reduce((s,e)=>s+e.paid,0),2)
    expect(tax.husband.exemptPension).toBe(0)
  })
  it('부분 연도 조회가 전체 조회와 동일',()=>{
    const {plan,assets,lump}=fixture(),full=run()
    const part=annualPension(plan,assets,2030,2032,{currentYear:2026,simulation:true,lumpsums:[lump]})
    expect(part.rows).toEqual(full.rows.filter(r=>r.year>=2030&&r.year<=2032))
  })
})
describe('현재 데이터 보존 등록·내보내기·가져오기',()=>{
  beforeEach(async()=>{await Promise.all(db.tables.map(t=>t.clear()))})
  async function seed(){
    const {plan,assets,lump}=fixture();delete plan.monthlyPlan
    for(const a of assets){const {detail,...row}=a;await db.assets.put({...row,createdAt:'2020-01-01',updatedAt:'2026-09-18'});await db.pensionDetails.put({assetId:a.id,...detail} as any)}
    await db.settings.bulkPut([{key:'pension_sim_plan',value:JSON.stringify(plan)},{key:'retirement_plan',value:JSON.stringify({...EMPTY_PLAN,expenses:[{id:'food',name:'Food',amount:1234567}],lumpsum:[lump],retirementYear:2031,linkPensionSim:true})},{key:'unrelated',value:'preserve'}])
    return exportBackup()
  }
  const payload=()=>({kind:'pension-plan-registration',...monthly()})
  it('현재 자산·생활비 보존, 입력 자동연결 후에도 월별 조건 유지, 백업 왕복',async()=>{
    const before=await seed();await registerPensionPlan(payload());const after=await exportBackup()
    expect(after.tables.assets).toEqual(before.tables.assets)
    expect((await getRetirement()).expenses).toEqual([{id:'food',name:'Food',amount:1234567}])
    expect((await db.settings.get('unrelated'))?.value).toBe('preserve')
    const p=pensionInputs(await getPensionSim(),await getAllAssets())
    expect(p.monthlyPlan).toEqual(monthly())
    expect(p.sources.find(s=>s.id==='irp')!.expectedMonthlyPayout).toBe(0)
    expect(p.sources.find(s=>s.id==='insurance')!.expectedMonthlyPayout).toBe(1160000)
    await importBackup(after)
    expect((await exportBackup()).tables).toEqual(after.tables)
    expect(await registerPensionPlan(payload())).toContain('이미')
  })
  it('잘못된 대상은 원자적으로 거절하고 되돌리면 등록 전과 같음',async()=>{
    const before=await seed(),bad=payload();bad.accounts[0].sourceId='missing'
    await expect(registerPensionPlan(bad)).rejects.toThrow()
    expect((await exportBackup()).tables).toEqual(before.tables)
    await registerPensionPlan(payload());await undoPensionRegistration()
    expect((await exportBackup()).tables).toEqual(before.tables)
  })
  it('미지원 중복 및 비정상 입력 거절',()=>{
    const bad=payload();bad.accounts[0].annualTotalReturn=-100
    expect(()=>parsePensionRegistration(bad)).toThrow()
    const dup=payload();dup.transfers.push({...dup.transfers[0]})
    expect(()=>parsePensionRegistration(dup)).toThrow()
  })
})
