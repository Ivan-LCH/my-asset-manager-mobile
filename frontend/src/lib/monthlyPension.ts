import type {Asset,PensionDetail,PensionSimPlan,PensionWithdrawalFunding} from '@/types'
import type {annualPension,PensionAccountRow,PensionLedgerRow} from './annualPension'
import {stockAccounts} from '@/planner/accounts'
import {openingFunding,mergeFunding,growFunding,withdrawFunding,scaleFunding,type FundingPool} from './pensionFunding'
import {initialMonthlyPayout,monthIndex,monthLabel} from './monthlyPensionPlan'

type Engine=typeof annualPension
type Result={rows:PensionLedgerRow[];notes:string[];fundedStockIds:Set<string>;allocations:ReturnType<typeof import('./annualPension').resolvedAllocations>;incomplete:boolean;stockInputs:ReturnType<typeof import('./linkedStocks').linkedStocks>|null;sources:PensionSimPlan['sources']}
const emptyDraw=():PensionWithdrawalFunding=>({exempt:0,personal:0,unknown:0,retirement:[]})
function addDraw(a:PensionWithdrawalFunding,b:PensionWithdrawalFunding){a.exempt+=b.exempt;a.personal+=b.personal;a.unknown+=b.unknown;a.retirement.push(...b.retirement)}

/** Monthly override for explicitly registered accounts only; all other inputs remain legacy. */
export function monthlyPension(plan:PensionSimPlan,assets:Asset[],from:number,to:number,options:Parameters<Engine>[4],legacy:Engine):Result{
  const config=plan.monthlyPlan!, opt=options??{},current=opt.currentYear??new Date().getFullYear()
  const firstMonth=current*12+(opt.currentYear==null?new Date().getMonth():0)
  const groups=stockAccounts(assets.filter(a=>!a.disposalDate)),managed=new Set(config.accounts.map(a=>a.sourceId)),fundedStockIds=new Set<string>(),notes=[...config.notes]
  let incomplete=false
  const accounts=config.accounts.flatMap(c=>{
    const s=plan.sources.find(s=>s.id===c.sourceId),asset=assets.find(a=>a.id===c.sourceId&&!a.disposalDate)
    if(!s||!asset){notes.push(`${c.label}: 연결 자산 확인 필요`);incomplete=true;return []}
    const link=(asset.detail as PensionDetail)?.linkedStockId,group=groups.find(g=>g.name===link||g.assets.some(a=>a.id===link))
    if(link&&!group){notes.push(`${c.label}: 연결 계좌를 찾지 못해 잔액 미확정`);incomplete=true}
    group?.assets.forEach(a=>fundedStockIds.add(a.id))
    const aggregates=group?.assets.filter(a=>(a.detail as {isAccountLevel?:boolean})?.isAccountLevel)
    const balance=c.role==='insurance'?0:link?(group?(aggregates?.length?aggregates:group.assets).reduce((sum,a)=>sum+a.currentValue,0):0):s.principal
    const tax=plan.incomeTaxSettings?.sources?.[s.id]??{}
    // Employer DC gains remain employer retirement benefit until the transfer.
    const pool:FundingPool=openingFunding(balance,c.role==='companyDC'?{...tax,fundingKind:'retirement'}:c.fundingReview?{}:tax,c.label)
    pool.enabled=true
    for(const note of [c.fundingReview,c.payoutReview,c.taxReview,c.contributionReview])if(note)notes.push(`${c.label}: ${note}`)
    return [{c,s,balance,pool,base:undefined as number|undefined,closed:false,key:group?'account:'+group.id:'source:'+s.id}]
  })
  if(new Set(accounts.filter(a=>a.c.role!=='insurance').map(a=>a.key)).size!==accounts.filter(a=>a.c.role!=='insurance').length)throw Error('월별 계획에서 같은 계좌를 중복 연결할 수 없습니다.')
  const managedLumps=new Set(config.deposits.map(d=>d.lumpsumId))
  const basePlan={...plan,monthlyPlan:undefined,sources:plan.sources.filter(s=>!managed.has(s.id)),irpTransfers:plan.irpTransfers?.filter(t=>!managed.has(t.sourceId)&&!managed.has(t.targetId)),allocations:plan.allocations.map(a=>managedLumps.has(a.lumpsumId)?{...a,irpAmount:0}:a)}
  const base=legacy(basePlan,assets.filter(a=>!managed.has(a.id)&&!fundedStockIds.has(a.id)),from,to,opt) as Result
  for(const id of base.fundedStockIds)fundedStockIds.add(id)
  const rows:PensionLedgerRow[]=[]
  for(let year=current;year<=to;year++){
    const records=new Map(accounts.map(a=>[a.s.id,{id:a.key,name:a.c.label,opening:a.balance,inflow:0,growth:0,paid:0,closing:0,pending:false,transferIn:0,transferOut:0} as PensionAccountRow]))
    const entries=new Map(accounts.map(a=>[a.s.id,{id:a.s.id,name:a.c.label,requested:0,paid:0,funded:a.c.role!=='insurance',owner:a.s.owner,accountId:a.c.role!=='insurance'?a.key:undefined,taxType:a.s.taxType,expectedStartYear:a.c.start?Number(a.c.start.slice(0,4)):undefined,funding:emptyDraw()}]))
    for(let month=Math.max(firstMonth,year*12);month<year*12+12;month++){
      const label=monthLabel(month)
      // Month return on opening balance, then month-end contributions/transfers/payout.
      for(const a of accounts){
        if(a.closed||a.c.role==='insurance')continue
        const change=a.balance*(Math.pow(1+a.c.annualTotalReturn/100,1/12)-1)
        a.balance+=change;records.get(a.s.id)!.growth+=change
        if(a.c.role==='companyDC'&&a.pool.retirement.length>0&&change>=0)a.pool.retirement[0].amount+=change
        else growFunding(a.pool,change)
        for(const c of a.c.contributions.filter(c=>c.month===label)){
          a.balance+=c.amount;records.get(a.s.id)!.inflow+=c.amount
          if(a.c.role==='companyDC')a.pool.retirement.push({amount:c.amount,name:a.c.label,taxRate:plan.incomeTaxSettings?.sources?.[a.s.id]?.retirementTaxRate})
          else a.pool.unknown+=c.amount // Actual future tax-credit application is not yet known.
        }
      }
      for(const d of config.deposits.filter(d=>d.month===label)){
        const a=accounts.find(a=>a.s.id===d.targetId),l=opt.lumpsums?.find(l=>l.id===d.lumpsumId),allocation=plan.allocations.find(x=>x.lumpsumId===d.lumpsumId)
        if(!a||!l||!allocation||a.closed){incomplete=true;notes.push('퇴직 목돈 연결 확인 필요');continue}
        const amount=Math.min(Math.max(0,l.amount),Math.max(0,allocation.irpAmount))
        a.balance+=amount;records.get(a.s.id)!.inflow+=amount
        if(l.taxKind==='severance')a.pool.retirement.push({amount,name:l.name,taxRate:allocation.irpRetirementTaxRate})
        else a.pool.unknown+=amount
      }
      for(const t of config.transfers.filter(t=>t.month===label)){
        const src=accounts.find(a=>a.s.id===t.sourceId),dst=accounts.find(a=>a.s.id===t.targetId)
        if(!src||!dst||src===dst||src.closed||dst.closed||src.s.owner!==dst.s.owner){incomplete=true;notes.push('DC → IRP 내부 이전 연결 확인 필요');continue}
        // All DC lots, including employer investment returns, are deferred retirement benefit.
        if(src.c.role==='companyDC')src.pool=openingFunding(src.balance,{fundingKind:'retirement',retirementTaxRate:plan.incomeTaxSettings?.sources?.[src.s.id]?.retirementTaxRate},src.c.label)
        records.get(src.s.id)!.transferOut!+=src.balance;records.get(dst.s.id)!.transferIn!+=src.balance
        dst.balance+=src.balance;mergeFunding(dst.pool,src.pool);src.balance=0;src.closed=true
      }
      for(const a of accounts){
        const {c}=a
        if(a.closed||c.payout==='none'||!c.start||!c.end||month<monthIndex(c.start)||month>monthIndex(c.end))continue
        const elapsed=month-monthIndex(c.start)
        if(a.base==null){
          // Balance includes this month's growth; annuity factor starts before that growth.
          a.base=c.payout==='fixed'?c.monthlyAmount??0:initialMonthlyPayout(a.balance/Math.pow(1+c.annualTotalReturn/100,1/12),monthIndex(c.end)-month+1,c.annualTotalReturn,c.annualIncrease)/Math.pow(1+c.annualIncrease/100,Math.floor(elapsed/12))
        }
        const requested=a.base*Math.pow(1+c.annualIncrease/100,Math.floor(elapsed/12)),paid=c.role==='insurance'?requested:Math.min(a.balance,requested)
        const e=entries.get(a.s.id)!;e.requested+=requested;e.paid+=paid
        if(c.role==='insurance'){
          if(c.taxReview)e.funding.unknown+=paid
          else if(a.s.taxType==='taxExempt')e.funding.exempt+=paid
          else e.funding.personal+=paid
        }else{addDraw(e.funding,withdrawFunding(a.pool,paid,year));a.balance=Math.max(0,a.balance-paid);records.get(a.s.id)!.paid+=paid}
      }
    }
    if(year<from)continue
    const row=base.rows.find(r=>r.year===year)!
    if(!row)continue
    const own={husband:{...row.pensionByOwner.husband},wife:{...row.pensionByOwner.wife}}
    for(const a of accounts){const e=entries.get(a.s.id)!;const who=own[a.s.owner];if(a.s.taxType==='national')who.national+=e.paid;else if(a.s.taxType==='taxExempt')who.exempt+=e.paid;else who.taxable+=e.paid}
    const rs=accounts.filter(a=>a.c.role!=='insurance').map(a=>({...records.get(a.s.id)!,closing:a.balance,funding:scaleFunding(a.pool,1)}))
    const sum=(key:'opening'|'inflow'|'growth'|'paid'|'closing')=>rs.reduce((v,r)=>v+r[key],0)
    const es=[...entries.values()],benefit=es.filter(e=>!e.funded).reduce((v,e)=>v+e.paid,0),total=es.reduce((v,e)=>v+e.paid,0)
    rows.push({...row,opening:row.opening+sum('opening'),inflow:row.inflow+sum('inflow'),growth:row.growth+sum('growth'),paid:row.paid+sum('paid'),closing:row.closing+sum('closing'),shortfall:row.shortfall+es.filter(e=>e.funded).reduce((v,e)=>v+e.requested-e.paid,0),benefitAnnual:row.benefitAnnual+benefit,entries:[...row.entries,...es],accounts:[...row.accounts,...rs],pensionByOwner:own,nationalAnnual:own.husband.national+own.wife.national,exemptAnnual:own.husband.exempt+own.wife.exempt,taxableAnnual:own.husband.taxable+own.wife.taxable+own.husband.national+own.wife.national,drawdownAnnual:row.drawdownAnnual+total,totalAnnual:row.totalAnnual+total})
  }
  notes.push('월별 계획: 월초 잔액에 총수익률을 적용하고 월말 납입·이전·지급합니다. 보험 연금은 조회액 가정이며 납입액으로 지급액을 임의 증액하지 않습니다. 연간 금액 ÷ 12는 연평균 월액으로, 첫해 실제 수령월 월액과 다릅니다.')
  return {...base,rows,notes:[...new Set([...base.notes,...notes])],fundedStockIds,incomplete:base.incomplete||incomplete,sources:plan.sources,allocations:plan.allocations.flatMap(a=>{const l=opt.lumpsums?.find(l=>l.id===a.lumpsumId);return l?[{...a,year:l.receiveYear,name:l.name,taxKind:l.taxKind}]:[]})}
}
