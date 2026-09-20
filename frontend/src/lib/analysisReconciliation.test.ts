import {describe,it,expect} from 'vitest';
import {annualPension,resolvedAllocations} from './annualPension';
import {annualVehicle} from './annualVehicle';
import {pensionInputs,retirementInputs} from './analysisInputs';
import {propertyAtYear} from './propertyTiming';
import {estimateHoldingTax} from './holdingTax';
import {realEstatePropertyBases} from './healthInsurance';
import {buildCashFlow} from './retirementCashflow';
import {EMPTY_PENSION_PLAN} from './pensionSim';
import {DEFAULT_PORTFOLIO} from '@/hooks/usePortfolio';
import type {Asset,PensionSimPlan,LumpsumItem} from '@/types';
const asset=(id:string,over:Partial<Asset>={}):Asset=>({id,name:id,type:'PENSION',currentValue:1200,acquisitionDate:'2020-01-01',acquisitionPrice:0,quantity:1,ownership:{husband:100,wife:0},createdAt:'2020',updatedAt:'2020',history:[],...over});
const plan=(over:Partial<PensionSimPlan>={}):PensionSimPlan=>({...EMPTY_PENSION_PLAN,sources:[],allocations:[],startYear:2026,refYear:2026,withdrawalYears:3,...over});
const p=asset('p',{detail:{pensionType:'IRP',expectedStartYear:2026,expectedEndYear:2030,expectedMonthlyPayout:100,annualGrowthRate:0}});
const opts={currentYear:2026,simulation:true,growth:0};
describe('기존 분석 금액·시점 대사',()=>{
  it('저장하지 않은 운용수익률로 가상 수익을 만들지 않는다',()=>{
    expect(DEFAULT_PORTFOLIO).toEqual({growthRate:0,dividendYield:0});
  });
  it.each(['2030-05-31','2030-06-01','2030-06-02'])('주택 전환일 %s의 과세기준일 경계',date=>{
    const input={currentValue:100,futureValue:200,futureYear:2030,housingTaxStartDate:date,constructionHoldingTaxAnnual:20};
    const s=propertyAtYear(input,2030);expect(s.housing).toBe(date<='2030-06-01');expect(s.value).toBe(200);
    expect(propertyAtYear(input,2031).housing).toBe(true);
  });
  it('공사 중 미입력과 명시적 0, 수동 세액을 구분하고 주택 전환 후 수동액을 중복하지 않는다',()=>{
    const input={currentValue:100000000,futureValue:200000000,futureYear:2030,ownership:{husband:50,wife:50}};
    expect(estimateHoldingTax([input],2029)).toMatchObject({incomplete:true,total:0});
    expect(estimateHoldingTax([{...input,constructionHoldingTaxAnnual:0}],2029)).toMatchObject({incomplete:false,total:0});
    expect(estimateHoldingTax([{...input,constructionHoldingTaxAnnual:123}],2029)).toMatchObject({incomplete:false,total:123});
    expect(estimateHoldingTax([{...input,constructionHoldingTaxAnnual:123}],2031).total).toBe(estimateHoldingTax([input],2031).total);
  });
  it('취득·처분일을 과세기준일과 연말 잔액에서 별도로 적용한다',()=>{
    const a={currentValue:100,acquisitionDate:'2028-06-02'};expect(propertyAtYear(a,2028)).toMatchObject({held:false,endValue:100});
    expect(propertyAtYear({...a,acquisitionDate:'2020-01-01',disposalDate:'2028-06-02'},2028)).toMatchObject({held:true,endValue:0});
    expect(propertyAtYear({...a,acquisitionDate:'2020-01-01',disposalDate:'2028-06-01'},2028).held).toBe(false);
  });
  it('공동 명의가 재산세 누진 구간을 낮추지 않으며 부부 종부세는 인별 공제를 쓴다',()=>{
    const a={currentValue:1800000000,ownership:{husband:100,wife:0}};
    const single=estimateHoldingTax([a],2030,{marketToOfficial:1}),joint=estimateHoldingTax([{...a,ownership:{husband:50,wife:50}}],2030,{marketToOfficial:1});
    expect(joint.husband.propertyTax+joint.wife.propertyTax).toBe(single.husband.propertyTax);
    expect(joint.husband.comprehensiveTax+joint.wife.comprehensiveTax).toBe(0);
    expect(single.husband.comprehensiveTax).toBeGreaterThan(0);
  });
  it('연금 계좌는 잔액 범위에서 지급하고 다음 해 재지급하지 않는다',()=>{
    const r=annualPension(pensionInputs(plan(),[p]),[p],2026,2028,opts).rows;
    expect(r[0]).toMatchObject({opening:1200,paid:1200,closing:0,shortfall:0});
    expect(r[1]).toMatchObject({paid:0,drawdownAnnual:0,shortfall:1200,closing:0});
    for(const row of r)expect(row.opening+row.inflow+row.growth-row.paid).toBeCloseTo(row.closing,8);
  });
  it('같은 연결 주식 계좌를 두 연금이 사용해도 원금은 한 번만 잡고 지급액 합계를 제한한다',()=>{
    const stock=asset('s',{type:'STOCK',currentValue:1200,detail:{accountName:'account',currency:'KRW',isPensionLike:false}});
    const assets=[stock,{...p,detail:{...p.detail,linkedStockId:'account'}},{...p,id:'p2',detail:{...p.detail,linkedStockId:'s'}}] as Asset[];
    const r=annualPension(pensionInputs(plan(),assets),assets,2026,2026,opts);
    expect(r.rows[0]).toMatchObject({opening:1200,paid:1200,closing:0,shortfall:1200});expect(r.fundedStockIds.has('s')).toBe(true);
  });
  it('국민연금과 보험 지급형 연금은 원금 인출로 차감하지 않고 저장 종료연도를 따른다',()=>{
    const assets=[{...p,id:'n',detail:{...(p.detail as object),pensionType:'NATIONAL',expectedEndYear:2027}},{...p,id:'b',detail:{...(p.detail as object),pensionType:'PERSONAL'}}] as Asset[];
    const r=annualPension(pensionInputs(plan(),assets),assets,2026,2028,opts).rows;
    expect(r[0]).toMatchObject({opening:0,paid:0,closing:0,nationalAnnual:1200,drawdownAnnual:1200});expect(r[2].nationalAnnual).toBe(0);
  });
  it('미래 목돈은 수령 연도에만 들어오고 분배가 원본 금액을 초과하지 않는다',()=>{
    const l={id:'l',name:'l',amount:1200,receiveYear:2028,taxKind:'other'} as LumpsumItem;
    const pp=plan({allocations:[{lumpsumId:'l',irpAmount:900,stockAmount:900}]});
    expect(resolvedAllocations(pp,[l])[0]).toMatchObject({irpAmount:900,stockAmount:300});
    const r=annualPension(pp,[],2026,2028,{...opts,lumpsums:[l]}).rows;expect(r[0].inflow).toBe(0);expect(r[1].inflow).toBe(0);expect(r[2].inflow).toBe(900);
  });
  it('과거 목돈은 현재 잔액에 다시 가산하지 않는다',()=>{
    const l={id:'l',name:'l',amount:1200,receiveYear:2025,taxKind:'other'} as LumpsumItem;
    const pp=plan({allocations:[{lumpsumId:'l',irpAmount:1200,stockAmount:0}]});
    expect(annualPension(pp,[],2026,2028,{...opts,lumpsums:[l]}).rows.every(r=>r.inflow===0&&r.paid===0)).toBe(true);
  });
  it('아내 명의 연금의 수입·세금 표시와 계좌 지급액이 일치한다',()=>{
    const pp=pensionInputs(plan(),[p]);pp.sources[0].owner='wife';const r=annualPension(pp,[p],2026,2026,opts).rows[0];
    const v=annualVehicle(pp,r,{husband:{propertyTaxBase:0,rentalDeposit:0},wife:{propertyTaxBase:0,rentalDeposit:0}});
    expect(v.husband.annualPensionTaxable).toBe(0);expect(v.wife.annualPensionTaxable).toBe(1200);expect(v.totals.grossAnnual).toBe(r.totalAnnual);
  });
  it('건보 재산 과표는 같은 전환일·공시가격 가정을 사용하고 받은 보증금을 더하지 않는다',()=>{
    const a=asset('house',{type:'REAL_ESTATE',currentValue:100000000,detail:{address:'',loanAmount:0,tenantDeposit:90000000,isOwned:false,hasTenant:true,futureYear:2028,housingTaxStartDate:'2028-09-01',futureValue:200000000}});
    expect(realEstatePropertyBases([a],2028).husband.propertyTaxBase).toBe(0);
    expect(realEstatePropertyBases([a],2029).husband).toEqual({propertyTaxBase:90000000,rentalDeposit:0});
  });
  it('기본 모드 건보도 연도별 연금 변화에 맞는 맵을 사용한다',()=>{
    const y=new Date().getFullYear(),p=retirementInputs({expenses:[],retirementYear:y}).plan;
    const rows=buildCashFlow(p,new Map(),40,0,10,undefined,0,undefined,undefined,undefined,undefined,undefined,new Map([[y,20],[y+1,30]]));
    expect(rows[0].healthInsuranceMonthly).toBe(20);expect(rows[1].healthInsuranceMonthly).toBe(30);
  });
  it('화면 조회 시작 연도를 바꿔도 같은 연도의 잔액·지급이 변하지 않는다',()=>{
    const pp=pensionInputs(plan(),[p]);
    const whole=annualPension(pp,[p],2026,2030,{...opts,growth:-20}).rows;
    const part=annualPension(pp,[p],2028,2030,{...opts,growth:-20}).rows;
    expect(part).toEqual(whole.filter(r=>r.year>=2028));
    expect(whole.every(r=>r.closing>=0&&r.paid>=0)).toBe(true);
  });
  it('저장된 수동 보유세에 개시연도가 없으면 은퇴 연도부터 적용한다',()=>{
    const y=new Date().getFullYear(),plan=retirementInputs({expenses:[],retirementYear:y+1,holdingTaxAnnual:123,holdingTaxAuto:false}).plan;
    const rows=buildCashFlow(plan,new Map(),40,0,0);expect(rows[0].holdingTaxAnnual).toBe(0);expect(rows[1].holdingTaxAnnual).toBe(123);
  });
});
