// Residential holding-tax estimate, verified against NTS guidance 2026-09-16.
// Simplified ordinary individual rules; no special one-home/age/holding-period relief.
// Sources and unsupported cases: docs/redesign/15-analysis-reconciliation.md
import type {Asset,RealEstateDetail} from '@/types'
import {propertyAtYear,type PropertyTimingInput} from './propertyTiming'
export const MARKET_TO_OFFICIAL=0.75, HOUSING_ASSESSED_RATIO=0.6, URBAN_TAX_RATE_METRO=0.0014
export const DEDUCTION_ONE_HOUSE_OWNED=1_200_000_000, DEDUCTION_GENERAL=900_000_000
export interface HoldingTaxAssetInput extends PropertyTimingInput {
  id?:string;name?:string;ownership:{husband:number;wife:number};isOwned?:boolean
}
export interface HoldingTaxBreakdown {
  propertyTax:number;educationTax:number;urbanPropertyTax:number;comprehensiveTax:number;agriculturalTax:number;total:number
}
export interface HoldingTaxOptions {marketToOfficial?:number;urbanRate?:number}
export interface HoldingTaxResult {
  husband:HoldingTaxBreakdown;wife:HoldingTaxBreakdown;total:number;constructionTax:number;
  incomplete:boolean;notes:{id?:string;name?:string;message:string}[]
}
export function toHoldingTaxAssets(assets:Asset[]):HoldingTaxAssetInput[]{
  return assets.filter(a=>a.type==='REAL_ESTATE').map(a=>{
    const d=a.detail as RealEstateDetail|undefined;
    return {id:a.id,name:a.name,currentValue:a.currentValue,acquisitionDate:a.acquisitionDate,disposalDate:a.disposalDate,
      futureValue:d?.futureValue,futureYear:d?.futureYear,housingTaxStartDate:d?.housingTaxStartDate,
      constructionHoldingTaxAnnual:d?.constructionHoldingTaxAnnual,ownership:a.ownership??{husband:50,wife:50},isOwned:d?.isOwned};
  })
}
export function housingPropertyTax(base:number):number{
  if(base<=0)return 0
  if(base<=60_000_000)return base*.001
  if(base<=150_000_000)return base*.0015-30_000
  if(base<=300_000_000)return base*.0025-180_000
  return base*.004-630_000
}
export function comprehensiveTaxGross(taxable:number,multi=false):number{
  const limits=[300_000_000,600_000_000,1_200_000_000,2_500_000_000,5_000_000_000,9_400_000_000,Infinity]
  const rates=multi?[.005,.007,.01,.02,.03,.04,.05]:[.005,.007,.01,.013,.015,.02,.027]
  let tax=0,previous=0
  for(let i=0;i<limits.length;i++){tax+=Math.max(0,Math.min(taxable,limits[i])-previous)*rates[i];previous=limits[i];if(taxable<=previous)break}
  return tax
}
export function estimateHoldingTax(assets:HoldingTaxAssetInput[],year:number,opts:HoldingTaxOptions={}):HoldingTaxResult{
  const blank=():HoldingTaxBreakdown=>({propertyTax:0,educationTax:0,urbanPropertyTax:0,comprehensiveTax:0,agriculturalTax:0,total:0})
  const states=assets.map(a=>({a,state:propertyAtYear(a,year)}))
  const res:HoldingTaxResult={husband:blank(),wife:blank(),total:0,constructionTax:0,
    incomplete:states.some(({state})=>state.incomplete),
    notes:states.flatMap(({a,state})=>state.notes.map(message=>({id:a.id,name:a.name,message})))}
  const houses=states.filter(({state})=>state.held&&state.housing)
  const officials={husband:0,wife:0},counts={husband:0,wife:0}
  for(const {a,state} of houses){
    const official=Math.max(0,state.value)*(opts.marketToOfficial??MARKET_TO_OFFICIAL),base=official*HOUSING_ASSESSED_RATIO
    for(const owner of ['husband','wife'] as const){
      const share=a.ownership[owner]/100
      // Calculate each house first, then apportion: splitting shares must not reduce property tax.
      res[owner].propertyTax+=housingPropertyTax(base)*share
      res[owner].urbanPropertyTax+=base*(opts.urbanRate??URBAN_TAX_RATE_METRO)*share
      officials[owner]+=official*share
      if(share>0)counts[owner]++
    }
  }
  if(houses.length)res.notes.push({message:'일반 개인 주택 기준 추정: 인별 9억 공제, 공시가격=시가×75%, 과표비율 60%. 1세대1주택 특례·세액공제·세부담상한·합산배제·지역자원시설세는 별도 확인 필요.'})
  for(const owner of ['husband','wife'] as const){
    const p=res[owner],official=officials[owner],taxable=Math.max(0,official-DEDUCTION_GENERAL)*HOUSING_ASSESSED_RATIO
    const gross=comprehensiveTaxGross(taxable,counts[owner]>=3)
    // NTS: actual property tax × standard-tax-equivalent on comp. base / standard-tax-equivalent on aggregated property base.
    const denominator=housingPropertyTax(official*HOUSING_ASSESSED_RATIO)
    const credit=denominator>0?p.propertyTax*Math.min(1,housingPropertyTax(taxable*HOUSING_ASSESSED_RATIO)/denominator):0
    p.comprehensiveTax=Math.max(0,gross-credit)
    p.educationTax=p.propertyTax*.2
    p.agriculturalTax=p.comprehensiveTax*.2
    for(const field of ['propertyTax','educationTax','urbanPropertyTax','comprehensiveTax','agriculturalTax'] as const)p[field]=Math.round(p[field])
    p.total=p.propertyTax+p.educationTax+p.urbanPropertyTax+p.comprehensiveTax+p.agriculturalTax
  }
  for(const {a,state} of states){
    const annual=state.manualAnnual??0
    res.constructionTax+=annual
    const husband=Math.round(annual*a.ownership.husband/100)
    res.husband.total+=husband;res.wife.total+=annual-husband
  }
  res.total=res.husband.total+res.wife.total
  return res
}
export function holdingTaxByYear(assets:HoldingTaxAssetInput[],fromYear:number,toYear:number,opts?:HoldingTaxOptions):Map<number,number>{
  const map=new Map<number,number>()
  for(let y=fromYear;y<=toYear;y++)map.set(y,estimateHoldingTax(assets,y,opts).total)
  return map
}
