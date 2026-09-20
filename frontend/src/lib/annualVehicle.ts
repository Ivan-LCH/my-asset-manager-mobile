import type {PensionSimPlan,Settings} from '@/types';
import {perPersonYearTaxHealth,type PersonProperty,type PersonVehicleResult,type HouseholdVehicleResult} from './pensionSim';
import {annualIncomeTax} from './incomeTax';
import type {PensionLedgerRow} from './annualPension';
import {annualHealth} from './annualHealth';
export function annualVehicle(plan:PensionSimPlan,row:PensionLedgerRow|undefined,props:{husband:PersonProperty;wife:PersonProperty},settings?:Partial<Settings>):HouseholdVehicleResult{
  const incomeTaxes=row?annualIncomeTax(row,plan,settings):null;
  const taxes=row?perPersonYearTaxHealth(row,plan,props.husband,props.wife,undefined,settings):{husbandTax:0,wifeTax:0,husbandHealth:0,wifeHealth:0};
  const person=(owner:'husband'|'wife'):PersonVehicleResult=>{
    const p=row?.pensionByOwner[owner]??{national:0,taxable:0,exempt:0};
    const financialIncome=row?(owner==='husband'?row.financialHusbandAnnual:row.financialWifeAnnual):0;
    const ft=incomeTaxes?.[owner];
    const pensionTax=(ft?.privateSeparateTax??0)+(ft?.retirementTax??0),grossAnnual=p.national+p.taxable+p.exempt+financialIncome;
    const totalAnnualTax=owner==='husband'?taxes.husbandTax:taxes.wifeTax;
    return {owner,irpPrincipal:plan.sources.filter(s=>s.owner===owner&&s.taxType==='irp').reduce((v,s)=>v+s.principal,0),exemptPrincipal:plan.sources.filter(s=>s.owner===owner&&s.taxType==='taxExempt').reduce((v,s)=>v+s.principal,0),
      annualPensionTaxable:p.national+p.taxable,annualPensionExempt:p.exempt,pensionTax,stockBalance:row?(owner==='husband'?row.stockHusband:row.stockWife):0,financialIncome,
      financialTax:ft?ft.totalTax-pensionTax:0,separatedTax:0,separatedDividend:ft?.selectedDividend??0,separatedDividendTax:ft?.selectedDividendTax??0,
      consolidatedFinancial:Math.max(0,(ft?.ordinaryFinancial??0)-20_000_000),comprehensiveTaxable:ft?.comprehensiveTaxable??0,comprehensiveTax:(ft?.comprehensiveNational??0)+(ft?.comprehensiveLocal??0),
      healthMonthly:owner==='husband'?taxes.husbandHealth:taxes.wifeHealth,totalAnnualTax,grossAnnual,netAnnual:grossAnnual-totalAnnualTax};
  };
  const husband=person('husband'),wife=person('wife');const sum=(key:keyof PersonVehicleResult)=>Number(husband[key])+Number(wife[key]);
  return {husband,wife,totals:{stockBalance:sum('stockBalance'),financialIncome:sum('financialIncome'),pensionTax:sum('pensionTax'),financialTax:sum('financialTax'),totalAnnualTax:sum('totalAnnualTax'),grossAnnual:sum('grossAnnual'),netAnnual:sum('netAnnual'),healthMonthly:row?annualHealth(row,plan,props).totalMonthly:0}};
}
