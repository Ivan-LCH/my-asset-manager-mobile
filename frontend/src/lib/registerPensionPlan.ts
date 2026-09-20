import {z} from 'zod'
import {db} from './db'
import type {PensionSimPlan,RetirementPlan} from '@/types'
import {monthIndex,type MonthlyPensionPlan} from './monthlyPensionPlan'

const month=z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/)
const amount=z.number().finite().min(0).max(1e13)
const account=z.object({
  sourceId:z.string().min(1),label:z.string().min(1).max(100),role:z.enum(['companyDC','personalIRP','insurance']),
  annualTotalReturn:z.number().finite().gt(-100).max(100),start:month.optional(),end:month.optional(),payout:z.enum(['none','amortized','fixed']),monthlyAmount:amount.optional(),annualIncrease:z.number().finite().min(0).max(100),
  contributions:z.array(z.object({month,amount,employerAmount:amount}).strict()).max(1200),
  fundingReview:z.string().optional(),payoutReview:z.string().optional(),taxReview:z.string().optional(),contributionReview:z.string().optional(),
}).strict()
const schema=z.object({
  kind:z.literal('pension-plan-registration'),version:z.literal(1),retirementDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),recordedAt:z.string(),
  accounts:z.array(account).min(1).max(20),transfers:z.array(z.object({sourceId:z.string(),targetId:z.string(),month}).strict()),deposits:z.array(z.object({lumpsumId:z.string(),targetId:z.string(),month}).strict()),notes:z.array(z.string()),
}).strict()
export function parsePensionRegistration(input:unknown){
  const p=schema.parse(input),ids=new Set(p.accounts.map(a=>a.sourceId))
  if(ids.size!==p.accounts.length)throw Error('중복 연금 계좌입니다.')
  if(Number.isNaN(Date.parse(p.retirementDate))||new Date(p.retirementDate).toISOString().slice(0,10)!==p.retirementDate)throw Error('퇴직일을 확인하세요.')
  for(const a of p.accounts){
    if(a.payout!=='none'&&(!a.start||!a.end||monthIndex(a.end)<monthIndex(a.start)))throw Error('연금 수령 기간을 확인하세요.')
    if(a.payout==='fixed'&&a.monthlyAmount==null)throw Error('월 수령액이 필요합니다.')
    if(a.role==='insurance'&&a.payout!=='fixed')throw Error('보험 지급액은 금융기관 조회액을 사용하세요.')
    if(new Set(a.contributions.map(c=>c.month)).size!==a.contributions.length||a.contributions.some(c=>c.employerAmount>c.amount))throw Error('납입 내역을 확인하세요.')
  }
  const seen=new Set<string>()
  for(const t of p.transfers){
    if(!ids.has(t.sourceId)||!ids.has(t.targetId)||t.sourceId===t.targetId||seen.has(t.sourceId)||p.transfers.some(x=>x.sourceId===t.targetId))throw Error('중복·연쇄·미연결 이전은 지원하지 않습니다.')
    if(p.accounts.find(a=>a.sourceId===t.sourceId)?.role!=='companyDC'||p.accounts.find(a=>a.sourceId===t.targetId)?.role!=='personalIRP')throw Error('회사 DC에서 개인IRP로의 이전만 지원합니다.')
    seen.add(t.sourceId)
    if(p.accounts.find(a=>a.sourceId===t.sourceId)!.contributions.some(c=>c.month>t.month))throw Error('이전 완료 뒤 회사 DC 납입이 있습니다.')
  }
  if(new Set(p.deposits.map(d=>d.lumpsumId)).size!==p.deposits.length||p.deposits.some(d=>!ids.has(d.targetId)||p.accounts.find(a=>a.sourceId===d.targetId)?.role==='insurance'))throw Error('목돈 연결을 확인하세요.')
  return p
}
export function pensionRegistrationSummary(input:unknown){
  const p=parsePensionRegistration(input)
  return [`퇴직일 ${p.retirementDate}`, ...p.accounts.map(a=>`${a.label}: ${a.payout==='none'?'퇴직 시 내부 이전':`${a.start} ~ ${a.end} · ${a.payout==='fixed'?`${(a.monthlyAmount??0).toLocaleString()}원/월 (임시)`:a.annualTotalReturn+'% 총수익률·잔액 기반 재산정'}`} · 향후 납입 ${a.contributions.reduce((s,c)=>s+c.amount,0).toLocaleString()}원`),'현재 자산·주식·이력·생활비·다른 연금은 보존합니다. 미확인 세금·계약 조건은 확정하지 않습니다.'].join('\n')
}
/** Read-modify-write in one transaction: never restore an older asset backup to apply a plan. */
export async function registerPensionPlan(input:unknown){
  const p=parsePensionRegistration(input)
  return db.transaction('rw',db.settings,db.pensionDetails,db.assets,db.table('plannerRecovery'),async()=>{
    const planRow=await db.settings.get('pension_sim_plan'),retRow=await db.settings.get('retirement_plan')
    if(!planRow||!retRow)throw Error('기존 연금·은퇴계획이 있는 브라우저에서 적용해 주세요.')
    const plan=JSON.parse(planRow.value) as PensionSimPlan,ret=JSON.parse(retRow.value) as RetirementPlan
    const ids=new Set(p.accounts.map(a=>a.sourceId)),oldDetails=await db.pensionDetails.bulkGet([...ids])
    const assets=await db.assets.bulkGet([...ids])
    if(assets.some(a=>!a||a.type!=='PENSION'||a.disposalDate)||oldDetails.some(d=>!d)||p.accounts.some(a=>!plan.sources.some(s=>s.id===a.sourceId)))throw Error('대상 연금 계좌가 일치하지 않습니다. 다른 데이터에 적용하지 않습니다.')
    for(const t of p.transfers){
      const src=assets.find(a=>a?.id===t.sourceId)!,dst=assets.find(a=>a?.id===t.targetId)!
      const owner=(a:typeof src)=>a.ownership?.husband===100?'husband':a.ownership?.wife===100?'wife':undefined
      if(!owner(src)||owner(src)!==owner(dst))throw Error('같은 단독 명의의 계좌만 이전할 수 있습니다.')
    }
    for(const d of p.deposits)if(!ret.lumpsum.some(l=>l.id===d.lumpsumId)||!plan.allocations.some(a=>a.lumpsumId===d.lumpsumId))throw Error('기존 목돈과 분배 연결이 없습니다.')
    const {kind:_,...monthlyPlan}=p
    if(JSON.stringify(plan.monthlyPlan)===JSON.stringify(monthlyPlan))return '이미 같은 계획이 등록되어 있습니다.'
    const year=Number(p.retirementDate.slice(0,4)),oldYear=await db.settings.get('retirementYear')
    await db.table('plannerRecovery').put({id:'before-pension-registration',createdAt:new Date().toISOString(),planRow,retRow,oldYear,oldDetails})
    plan.monthlyPlan=monthlyPlan as MonthlyPensionPlan
    plan.startYear=year;plan.refYear=year
    const personal=p.accounts.find(a=>a.role==='personalIRP'&&a.start&&a.end)
    if(personal)plan.withdrawalYears=Math.ceil((monthIndex(personal.end!)-monthIndex(personal.start!)+1)/12)
    plan.irpTransfers=[...(plan.irpTransfers??[]).filter(t=>!ids.has(t.sourceId)&&!ids.has(t.targetId)),...p.transfers.map(t=>({sourceId:t.sourceId,targetId:t.targetId,year:Number(t.month.slice(0,4))}))]
    for(const d of p.deposits){
      const lump=ret.lumpsum.find(l=>l.id===d.lumpsumId)!;lump.receiveYear=Number(d.month.slice(0,4))
      // Keep legacy exports consistent, without changing unrelated legacy fields.
      if('receive_year' in lump)(lump as unknown as Record<string,unknown>).receive_year=lump.receiveYear
      plan.allocations.find(a=>a.lumpsumId===d.lumpsumId)!.irpSourceId=d.targetId
    }
    for(const a of p.accounts){
      const s=plan.sources.find(s=>s.id===a.sourceId)!,detail=oldDetails.find(d=>d?.assetId===a.sourceId)!
      const start=a.start?Number(a.start.slice(0,4)):year,end=a.end?Number(a.end.slice(0,4)):year
      const fields={expectedStartYear:start,expectedEndYear:end,expectedMonthlyPayout:a.payout==='fixed'?a.monthlyAmount!:0,annualGrowthRate:a.annualIncrease}
      Object.assign(s,fields);if(a.role!=='insurance'){s.yieldRate=a.annualTotalReturn;s.taxType='irp';s.taxTypeManual=true}
      await db.pensionDetails.put({...detail,...fields,pensionType:a.role==='companyDC'?'회사 DC형 퇴직연금':a.role==='personalIRP'?'개인IRP':detail.pensionType})
    }
    // Expenses and every other saved retirement input survive unchanged.
    ret.retirementYear=year
    await db.settings.bulkPut([{key:'pension_sim_plan',value:JSON.stringify(plan)},{key:'retirement_plan',value:JSON.stringify(ret)},{key:'retirementYear',value:String(year)}])
    return '연금 계획 등록 완료 — 현재 자산·생활비는 유지했습니다.'
  })
}
export async function undoPensionRegistration(){
  await db.transaction('rw',db.settings,db.pensionDetails,db.table('plannerRecovery'),async()=>{
    const r=await db.table('plannerRecovery').get('before-pension-registration')
    if(!r)throw Error('되돌릴 연금 계획 등록이 없습니다.')
    await db.settings.bulkPut([r.planRow,r.retRow]);if(r.oldYear)await db.settings.put(r.oldYear);else await db.settings.delete('retirementYear')
    await db.pensionDetails.bulkPut(r.oldDetails)
    await db.table('plannerRecovery').delete('before-pension-registration')
  })
}
