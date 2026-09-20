import {getPropertyScore} from './healthInsurance';
import type {PensionScheduleRow,PersonProperty} from './pensionSim';
import type {PensionSimPlan} from '@/types';

// Explicit planning policy, not a prediction of 2031 law or an NHIS assessment.
// Sources and exclusions are recorded in docs/redesign/16-irp-linked-payout.md.
export const REGIONAL_POLICY_2026={year:2026,rate:.0719,point:211.5,careRate:.009448/.0719,minimum:20_160,maximum:4_591_740};
export function regionalPremium(assessedAnnual:number,propertyTaxBase:number,rentalDeposit=0){
  const p=REGIONAL_POLICY_2026,base=Math.max(0,propertyTaxBase)+Math.max(0,rentalDeposit)*.3;
  const score=getPropertyScore(base),incomeMonthly=assessedAnnual<=3_360_000?p.minimum:assessedAnnual/12*p.rate;
  const propertyMonthly=score*p.point,healthTotal=Math.min(p.maximum,incomeMonthly+propertyMonthly);
  const longTermCare=Math.round(healthTotal*p.careRate);
  return {assessedAnnual,propertyTaxBase:base,deductedProperty:Math.max(0,base-100_000_000),score,incomeMonthly,propertyMonthly,healthTotal,longTermCare,grandTotal:Math.round(healthTotal)+longTermCare};
}
export function annualHealth(row:PensionScheduleRow,plan:PensionSimPlan,props:{husband:PersonProperty;wife:PersonProperty}){
  const own=row.pensionByOwner??{husband:{national:row.nationalAnnual,taxable:Math.max(0,row.taxableAnnual-row.nationalAnnual),exempt:row.exemptAnnual},wife:{national:0,taxable:0,exempt:0}};
  const person=(who:'husband'|'wife')=>{
    const p=own[who],financial=Math.max(0,who==='husband'?row.financialHusbandAnnual:row.financialWifeAnnual);
    const publicPension=Math.max(0,p.national),other=who==='husband'?Math.max(0,plan.otherIncome):0;
    const includedFinancial=financial>10_000_000?financial:0;
    return {publicPension,excludedPrivate:Math.max(0,p.taxable+p.exempt),financial,includedFinancial,other,assessedAnnual:publicPension*.5+includedFinancial+other,...props[who]};
  };
  const husband=person('husband'),wife=person('wife');
  const h=regionalPremium(husband.assessedAnnual,husband.propertyTaxBase,husband.rentalDeposit),w=regionalPremium(wife.assessedAnnual,wife.propertyTaxBase,wife.rentalDeposit);
  const joint=regionalPremium(husband.assessedAnnual+wife.assessedAnnual,husband.propertyTaxBase+wife.propertyTaxBase,husband.rentalDeposit+wife.rentalDeposit);
  const confirmed=plan.healthHouseholdMode==='joint'||plan.healthHouseholdMode==='separate';
  const mode=confirmed?plan.healthHouseholdMode!:'joint';
  return {mode,assumed:!confirmed,husband,wife,husbandSeparate:h,wifeSeparate:w,joint,totalMonthly:mode==='joint'?joint.grandTotal:h.grandTotal+w.grandTotal,policy:REGIONAL_POLICY_2026};
}
export type AnnualHealthResult=ReturnType<typeof annualHealth>;
