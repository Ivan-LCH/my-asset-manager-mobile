import { describe,it,expect } from 'vitest';
import { pensionInputs,retirementInputs } from './analysisInputs';
import { calcPensionByYear, SIM_START_YEAR } from './pensionCalc';
import { buildCashFlow } from './retirementCashflow';
import { EMPTY_PENSION_PLAN } from './pensionSim';
import type { Asset, PensionSimPlan } from '@/types';
const asset=(id:string,extra:Partial<Asset>={}):Asset=>({id,name:id,type:'PENSION',ownership:{husband:100,wife:0},createdAt:'2020-01-01',updatedAt:'2020-01-01',currentValue:100,acquisitionDate:'2020-01-01',acquisitionPrice:100,quantity:1,history:[],...extra});
describe('기존 입력의 읽기 전용 분석 연결',()=>{
  it('미입력 생활비·연금에는 예시 금액을 끼워 넣지 않는다',()=>{
    const r=retirementInputs();expect(r.plan.expenses).toEqual([]);expect(r.plan.medicalMonthly).toBe(0);expect(r.missing).toHaveLength(3);expect(pensionInputs(null,[]).sources).toEqual([]);
  });
  it('은퇴 연도는 기존 은퇴 입력 우선, 없으면 설정을 재사용하며 0 생활비도 보존한다',()=>{
    const settings={birthHusband:'1980.01',retirementYear:2030};const saved={expenses:[],medicalMonthly:0,retirementYear:2032,holdingTaxAnnual:123};const before=structuredClone(saved);
    const r=retirementInputs(saved,settings);expect(r.plan.retirementYear).toBe(2032);expect(r.plan.holdingTaxAnnual).toBe(123);expect(r.plan.holdingTaxAuto).toBe(false);expect(r.missing).toEqual([]);expect(saved).toEqual(before);
    expect(retirementInputs({expenses:[]},settings).plan.retirementYear).toBe(2030);
  });
  it('현재 연금 원금·단독 명의를 갱신하고 수동 원천·세율 분류는 보존한다',()=>{
    const saved={...EMPTY_PENSION_PLAN,sources:[{id:'p',name:'p',principal:999,taxType:'taxExempt',taxTypeManual:true,yieldRate:7,owner:'wife'},{id:'manual',name:'manual',principal:777,taxType:'taxable',yieldRate:3,owner:'husband'}]} as PensionSimPlan;
    const original=structuredClone(saved);
    const assets=[asset('p',{detail:{pensionType:'PERSONAL',linkedStockId:'account',expectedMonthlyPayout:5,expectedStartYear:2030,expectedEndYear:2060,annualGrowthRate:0}}),asset('a',{type:'STOCK',currentValue:80,detail:{accountName:'account',currency:'KRW',isPensionLike:false}}),asset('b',{type:'STOCK',currentValue:20,detail:{accountName:'account',currency:'KRW',isPensionLike:false}})];
    const resolved=pensionInputs(saved,assets);expect(resolved.sources[0]).toMatchObject({principal:100,taxType:'taxExempt',owner:'husband',yieldRate:7});expect(resolved.sources[1]).toEqual(saved.sources[1]);expect(saved).toEqual(original);
    expect(pensionInputs(JSON.parse(JSON.stringify(resolved)),assets).sources[0]).toMatchObject({taxType:'taxExempt',taxTypeManual:true});
    assets[1].currentValue=180;expect(pensionInputs(saved,assets).sources[0].principal).toBe(200);
  });
  it('처분 자산은 연금 원천 및 연결 계좌 합계에서 제외한다',()=>{
    const p=asset('p',{disposalDate:'2025-01-01'});const saved={...EMPTY_PENSION_PLAN,sources:[{id:'p',name:'old',principal:900,taxType:'irp',yieldRate:4,owner:'husband'}]} as PensionSimPlan;
    expect(pensionInputs(saved,[p]).sources).toEqual([]);
    expect([...calcPensionByYear([p],40).values()].every(v=>v===0)).toBe(true);
  });
  it('자산 직접 연금의 원금은 과거 시뮬 사본 대신 현재 자산을 사용한다',()=>{
    const saved={...EMPTY_PENSION_PLAN,sources:[{id:'p',name:'p',principal:999,taxType:'irp',yieldRate:4,owner:'husband'}]} as PensionSimPlan;
    expect(pensionInputs(saved,[asset('p',{currentValue:321})]).sources[0].principal).toBe(321);
  });
  it('분석은 올해부터 계산하고 등록 국민연금과 개인연금을 나눠도 총수입은 같다',()=>{
    const year=new Date().getFullYear();expect(SIM_START_YEAR).toBe(year);
    const plan=retirementInputs({expenses:[],retirementYear:year,medicalMonthly:0},{birthHusband:'1980.01'}).plan;
    const rows=buildCashFlow(plan,new Map([[year,300]]),40,0,0,undefined,0,undefined,[],undefined,new Map(),new Map([[year,100]]));
    expect(rows[0]).toMatchObject({year,nationalPensionMonthly:100,pensionMonthly:200,totalIncome:300});
  });
});
