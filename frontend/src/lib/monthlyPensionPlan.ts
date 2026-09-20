/** Explicit planning assumptions, not actual transactions or insurer quotations. */
export interface MonthlyPensionAccount {
  sourceId: string
  label: string
  role: 'companyDC' | 'personalIRP' | 'insurance'
  annualTotalReturn: number
  start?: string // YYYY-MM, inclusive
  end?: string
  payout: 'none' | 'amortized' | 'fixed'
  monthlyAmount?: number
  annualIncrease: number // each receipt anniversary, not January
  contributions: {month:string; amount:number; employerAmount:number}[]
  fundingReview?: string
  payoutReview?: string
  taxReview?: string
  contributionReview?: string
}
export interface MonthlyPensionPlan {
  version: 1
  retirementDate: string
  recordedAt: string
  accounts: MonthlyPensionAccount[]
  transfers: {sourceId:string;targetId:string;month:string}[]
  deposits: {lumpsumId:string;targetId:string;month:string}[]
  notes: string[]
}
export const monthIndex=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1
export const monthLabel=(n:number)=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`
/** Month-end payment; effective annual total return includes reinvested dividends. */
export function initialMonthlyPayout(balance:number,months:number,annualReturn:number,annualIncrease:number){
  const rate=Math.pow(1+annualReturn/100,1/12)
  let presentValue=0
  for(let i=0;i<months;i++)presentValue+=Math.pow(1+annualIncrease/100,Math.floor(i/12))/Math.pow(rate,i+1)
  return presentValue>0?balance/presentValue:0
}
