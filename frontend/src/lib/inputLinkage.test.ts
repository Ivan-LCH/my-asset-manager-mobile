import {describe,it,expect} from 'vitest';
import type {Asset,PensionSimPlan} from '@/types';
import {pensionInputs,pensionInputNotes,retirementInputs} from './analysisInputs';
import {annualPension} from './annualPension';
import {linkedStocks} from './linkedStocks';
import {EMPTY_PENSION_PLAN} from './pensionSim';
import {buildCashFlow,expenseFactor} from './retirementCashflow';
const stockDetail=(accountName:string)=>({accountName,currency:'KRW',isPensionLike:false});
const asset=(id:string,extra:Partial<Asset>={}):Asset=>({id,name:id,type:'STOCK',currentValue:100_000_000,quantity:1,acquisitionPrice:100_000_000,acquisitionDate:'2020-01-01',createdAt:'2020',updatedAt:'2020',history:[],ownership:{husband:100,wife:0},detail:stockDetail(id),...extra});
const pension=(owner:'husband'|'wife')=>asset('p',{type:'PENSION',ownership:owner==='wife'?{husband:0,wife:100}:{husband:100,wife:0},detail:{pensionType:'NATIONAL',expectedMonthlyPayout:1_000_000,expectedStartYear:2031,expectedEndYear:2090,annualGrowthRate:0}});
const saved:PensionSimPlan={...EMPTY_PENSION_PLAN,sources:[{id:'p',name:'p',principal:1,taxType:'national',owner:'husband',yieldRate:0},{id:'manual',name:'manual',principal:0,taxType:'taxExempt',owner:'wife',yieldRate:0}]};
describe('최신 명의·현재 주식·생활비 연결',()=>{
  it('아내 단독 명의를 연금 지급 원장에 반영하고 기존 수동 원천을 보존한다',()=>{
    const assets=[pension('wife')],before=JSON.stringify({saved,assets});const p=pensionInputs(saved,assets);
    expect(p.sources[0].owner).toBe('wife');expect(p.sources[1]).toEqual(saved.sources[1]);
    const r=annualPension(p,assets,2031,2031,{currentYear:2026}).rows[0];
    expect(r.pensionByOwner.wife.national).toBe(12_000_000);expect(r.pensionByOwner.husband.national).toBe(0);
    expect(pensionInputNotes(saved,assets)[0]).toContain('최신 명의');expect(JSON.stringify({saved,assets})).toBe(before);
  });
  it('명의를 다시 남편으로 변경하면 예전 아내 설정이 덮어쓰지 않는다',()=>{
    const p=pensionInputs({...saved,sources:[{...saved.sources[0],owner:'wife'}]},[pension('husband')]);expect(p.sources[0].owner).toBe('husband');
  });
  it('연금의 공동·미확정 명의는 임의로 분할하지 않고 경고한다',()=>{
    const a={...pension('wife'),ownership:{husband:50,wife:50}};
    expect(pensionInputs(saved,[a]).sources[0].owner).toBe('husband');expect(pensionInputNotes(saved,[a])[0]).toContain('확인');
  });
  it('주식 계좌 명의와 배당을 연결하며 원본을 변경하지 않는다',()=>{
    const a=[asset('a')],data={dividends:[{assetId:'a',monthlyKrw:100_000}],owners:{a:{husband:0,wife:100}}},before=JSON.stringify({a,data});const r=linkedStocks(a,new Set(),data);
    expect(r.wife).toEqual({balance:100_000_000,annualDividend:1_200_000});expect(r.husband.balance).toBe(0);expect(JSON.stringify({a,data})).toBe(before);
  });
  it('IRP 계좌 전체·연금성 계좌·처분 자산은 일반주식에서 제외한다',()=>{
    const a=[asset('funded',{detail:stockDetail('irp')}),asset('same',{detail:stockDetail('irp')}),asset('pension',{detail:{...stockDetail('pension'),isPensionLike:true}}),asset('disposed',{disposalDate:'2025-01-01'}),asset('normal')];
    const r=linkedStocks(a,new Set(['funded']));expect(r.accounts.map(a=>a.id)).toEqual(['normal']);
  });
  it('계좌 합계와 종목을 중복 합산하지 않고 무배당·미입력 확인을 안내한다',()=>{
    const a=[asset('total',{detail:{...stockDetail('a'),isAccountLevel:true}}),asset('position',{detail:stockDetail('a')})];const r=linkedStocks(a,new Set());expect(r.husband.balance).toBe(100_000_000);expect(r.notes).toHaveLength(2);
  });
  it('현재 연결액은 수동 추가액을 대체하고 미래 목돈은 입금 연도부터 더한다',()=>{
    const assets=[asset('a')];const p={...EMPTY_PENSION_PLAN,stockInputMode:'assets',sources:[],stockOwnership:{husband:100,wife:0},allocations:[{lumpsumId:'l',irpAmount:0,stockAmount:50_000_000}],stockAccount:{husband:{extraAmount:999_000_000,growthRate:10,dividendYield:4},wife:{extraAmount:0,growthRate:0,dividendYield:0}}} as PensionSimPlan;
    const run=annualPension(p,assets,2026,2028,{simulation:true,currentYear:2026,stockLink:{dividends:[{assetId:'a',monthlyKrw:100_000}]},lumpsums:[{id:'l',name:'l',amount:50_000_000,receiveYear:2027}]});
    expect(run.rows[0].financialAnnual).toBe(1_200_000);expect(run.rows[0].stockHusband).toBeCloseTo(110_000_000);
    expect(run.rows[1].financialAnnual).toBeCloseTo(1_320_000+2_000_000);expect(run.rows[1].stockHusband).toBeCloseTo(176_000_000);
    expect(run.rows[2].financialAnnual).toBeCloseTo((1_320_000+2_000_000)*1.1);expect(p.stockAccount.husband.extraAmount).toBe(999_000_000);
    const manual=annualPension({...p,stockInputMode:'manual'},assets,2026,2026,{simulation:true,currentYear:2026});expect(manual.rows[0].financialAnnual).toBe(999_000_000*.04);
  });
  it('현재 시세·배당이 바뀌면 연결 결과를 다시 산출한다',()=>{
    const a=asset('a'),first=linkedStocks([a],new Set(),{dividends:[{assetId:'a',monthlyKrw:100}]});
    const next=linkedStocks([{...a,currentValue:200_000_000}],new Set(),{dividends:[{assetId:'a',monthlyKrw:200}]});expect(next.husband.balance).toBe(first.husband.balance*2);expect(next.husband.annualDividend).toBe(first.husband.annualDividend*2);
  });
  it('지출 증가율은 기준연도 이후 반복 지출에만 적용한다',()=>{
    const current=new Date().getFullYear();const p=retirementInputs({expenses:[{id:'e',name:'e',amount:100}],medicalMonthly:20,travel:[{id:'t',name:'t',costPerTrip:120,phase1Times:1,phase1Until:2100,phase2Times:0}],emergency:[{id:'x',name:'x',year:current+1,amount:50}],expenseBaseYear:current,expenseInflationRate:10}).plan;
    const r=buildCashFlow(p,new Map(),40,0,30);expect(r[0].expenseMonthly).toBe(100);expect(r[1].expenseMonthly).toBeCloseTo(110);expect(r[1].medicalMonthly).toBeCloseTo(22);expect(r[1].travelMonthly).toBeCloseTo(11);expect(r[1].healthInsuranceMonthly).toBe(30);expect(r[1].emergencyAnnual).toBe(50);expect(r[1].totalExpense).toBeCloseTo(173);expect(p.expenses[0].amount).toBe(100);
    expect(expenseFactor(p,current-1)).toBe(1);expect(expenseFactor({...p,expenseInflationRate:undefined},current+20)).toBe(1);expect(expenseFactor({...p,expenseInflationRate:0},current+20)).toBe(1);
  });
});
