import type {PensionSourceTaxSettings, PensionWithdrawalFunding} from '@/types'

/** Current-value ledger; tax buckets survive transfers. No name-based classification. */
export interface FundingPool extends PensionWithdrawalFunding {enabled:boolean;firstReceiptYear?:number}
const valid=(n:number|undefined):n is number=>n!=null&&Number.isFinite(n)&&n>=0
export const fundingTotal=(p:PensionWithdrawalFunding)=>p.exempt+p.personal+p.unknown+p.retirement.reduce((s,r)=>s+r.amount,0)
export function openingFunding(balance:number,config:PensionSourceTaxSettings,name:string,firstReceiptYear?:number):FundingPool{
  const p:FundingPool={enabled:!!config.fundingKind,exempt:0,personal:0,unknown:0,retirement:[],firstReceiptYear:config.firstReceiptYear??firstReceiptYear}
  let retirement=0
  if(config.fundingKind==='retirement')retirement=balance
  else if(config.fundingKind==='personal')p.personal=balance
  else if(config.fundingKind==='exempt')p.exempt=balance
  else if(config.fundingKind==='mixed'&&valid(config.retirementPrincipal)&&valid(config.exemptPrincipal)&&config.retirementPrincipal+config.exemptPrincipal<=balance){
    retirement=config.retirementPrincipal;p.exempt=config.exemptPrincipal;p.personal=balance-retirement-p.exempt
  }else p.unknown=balance
  if(retirement>0)p.retirement.push({amount:retirement,name,taxRate:config.retirementTaxRate,firstReceiptYear:config.firstReceiptYear??firstReceiptYear})
  return p
}
export function mergeFunding(target:FundingPool,source:FundingPool){
  target.enabled=true;target.exempt+=source.exempt;target.personal+=source.personal;target.unknown+=source.unknown
  target.retirement.push(...source.retirement.map(r=>({...r})))
  source.exempt=source.personal=source.unknown=0;source.retirement=[];source.enabled=true
}
/** Unknown opening composition cannot justify treating a withdrawal as tax-free. */
export function withdrawFunding(pool:FundingPool,requested:number,year:number):PensionWithdrawalFunding{
  const out:PensionWithdrawalFunding={exempt:0,personal:0,unknown:0,retirement:[]}
  const total=fundingTotal(pool),amount=Math.min(Math.max(0,requested),total)
  if(amount>0){pool.firstReceiptYear??=year;pool.retirement.forEach(r=>{r.firstReceiptYear??=pool.firstReceiptYear})}
  if(pool.unknown>0.01){
    out.unknown=amount
    // This is only a capital reconciliation, NOT a taxable withdrawal ratio.
    const remain=total>0?Math.max(0,1-amount/total):0
    pool.exempt*=remain;pool.personal*=remain;pool.unknown*=remain
    pool.retirement.forEach(r=>{r.amount*=remain})
    return out
  }
  let rest=amount
  out.exempt=Math.min(rest,pool.exempt);pool.exempt-=out.exempt;rest-=out.exempt
  // Multiple deferred-tax lots are allocated pro rata within the same legal bucket.
  const retirement=pool.retirement.reduce((s,r)=>s+r.amount,0),take=Math.min(rest,retirement)
  for(const r of pool.retirement){
    const paid=retirement>0?take*r.amount/retirement:0
    if(paid>0){r.firstReceiptYear??=year;out.retirement.push({...r,amount:paid});r.amount-=paid}
  }
  rest-=take;out.personal=Math.min(rest,pool.personal);pool.personal-=out.personal
  return out
}
export function scaleFunding(p:PensionWithdrawalFunding,share:number):PensionWithdrawalFunding{
  return {exempt:p.exempt*share,personal:p.personal*share,unknown:p.unknown*share,retirement:p.retirement.map(r=>({...r,amount:r.amount*share}))}
}
export function growFunding(pool:FundingPool,change:number){
  if(change>=0)pool.personal+=change
  else {
    // Do not invent tax basis after a loss. Keep capital intact and request reconciliation.
    const balance=Math.max(0,fundingTotal(pool)+change)
    pool.exempt=pool.personal=0;pool.retirement=[];pool.unknown=balance
  }
}
