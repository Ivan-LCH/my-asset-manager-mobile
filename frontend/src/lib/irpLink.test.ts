import {describe,it,expect} from 'vitest';
import {annualPension,irpTargetSource} from './annualPension';
import {pensionInputs} from './analysisInputs';
import {EMPTY_PENSION_PLAN} from './pensionSim';
import type {Asset,LumpsumItem,PensionSimPlan,PensionDetail} from '@/types';

const irp=(id='irp',over:Partial<Asset>={}):Asset=>({id,name:id,type:'PENSION',currentValue:300_000_000,acquisitionDate:'2020-01-01',acquisitionPrice:300_000_000,quantity:1,ownership:{husband:100,wife:0},createdAt:'2020',updatedAt:'2020',history:[],detail:{pensionType:'IRP',expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:1_650_000,annualGrowthRate:0},...over});
const lump=(id='l',year=2031,amount=450_000_000):LumpsumItem=>({id,name:id,receiveYear:year,amount,taxKind:'severance'});
const make=(assets:Asset[],allocations:PensionSimPlan['allocations']=[{lumpsumId:'l',irpAmount:450_000_000,stockAmount:0,irpSourceId:'irp'}])=>pensionInputs({...EMPTY_PENSION_PLAN,startYear:2029,withdrawalYears:20,sources:[],allocations},assets);
const run=(p:PensionSimPlan,assets:Asset[],lumpsums=[lump()],extra={})=>annualPension(p,assets,2026,2052,{simulation:true,currentYear:2026,growth:0,dividend:0,lumpsums,...extra});

describe('목돈은 기존 IRP로 입금하고 같은 지급 기준으로 재산정',()=>{
  it('3억 + 4.5억은 한 계좌이고 월165만은 412.5만으로 재산정된다',()=>{
    const assets=[irp()],p=make(assets),before=JSON.stringify({assets,p}),r=run(p,assets);
    const y=r.rows.find(r=>r.year===2031)!;
    expect(y).toMatchObject({opening:300_000_000,inflow:450_000_000,paid:49_500_000,closing:700_500_000});
    expect(y.entries).toHaveLength(1);expect(y.entries[0].paid/12).toBe(4_125_000);
    expect(y.payoutChanges[0]).toMatchObject({beforeBalance:300_000_000,deposit:450_000_000,previousMonthly:1_650_000,revisedMonthly:4_125_000,method:'proportional'});
    expect(y.accounts).toHaveLength(1);expect(y.accounts[0].inflow).toBe(450_000_000);
    expect(r.rows.filter(r=>r.year<2031).every(r=>r.inflow===0&&r.paid===0)).toBe(true);
    expect(JSON.stringify({assets,p})).toBe(before);
    for(const row of r.rows){expect(row.opening+row.inflow+row.growth-row.paid).toBeCloseTo(row.closing,5);for(const a of row.accounts)expect(a.opening+a.inflow+a.growth-a.paid).toBeCloseTo(a.closing,5);}
  });
  it('기존 소액 IRP는 변경하지 않고 선택 계좌에만 입금한다',()=>{
    const assets=[irp(),irp('other',{currentValue:20_000_000,detail:{pensionType:'IRP',expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:100_000,annualGrowthRate:0}})];
    const y=run(make(assets),assets).rows.find(r=>r.year===2031)!;
    expect(y.entries.find(e=>e.id==='other')!.paid).toBe(1_200_000);expect(y.entries.find(e=>e.id==='irp')!.paid).toBe(49_500_000);
    expect(y.accounts.filter(a=>a.inflow>0)).toHaveLength(1);
  });
  it('실제 입금 연도까지 성장한 잔액을 비례 계산의 분모로 쓴다',()=>{
    const assets=[irp()],r=run(make(assets),assets,[lump()],{growth:10});const y=r.rows.find(r=>r.year===2031)!;
    const before=300_000_000*Math.pow(1.1,5);
    expect(y.payoutChanges[0].beforeBalance).toBeCloseTo(before,5);
    expect(y.entries[0].paid/12).toBeCloseTo(1_650_000*(before+450_000_000)/before,5);
  });
  it('수령 중 입금은 기존 인출 후 남은 잔액 기준이며 다음 해 다시 확대하지 않는다',()=>{
    const assets=[irp()],p=make(assets);const r=run(p,assets,[lump('l',2033)]).rows;
    const y=r.find(r=>r.year===2033)!,next=r.find(r=>r.year===2034)!;
    expect(y.opening).toBe(300_000_000-19_800_000*2);
    expect(y.entries[0].paid).toBeCloseTo(19_800_000*(1+450_000_000/y.opening),5);
    expect(next.entries[0].paid).toBe(y.entries[0].paid);expect(next.payoutChanges).toHaveLength(0);
  });
  it('같은 해 여러 목돈을 한 번 합산하며 소스 명의를 유지한다',()=>{
    const assets=[irp('irp',{ownership:{husband:0,wife:100}})];
    const p=make(assets,[{lumpsumId:'a',irpAmount:200_000_000,stockAmount:0,irpSourceId:'irp'},{lumpsumId:'b',irpAmount:250_000_000,stockAmount:0,irpSourceId:'irp'}]);
    const y=run(p,assets,[lump('a',2031,200_000_000),lump('b',2031,250_000_000)]).rows.find(r=>r.year===2031)!;
    expect(y.entries).toHaveLength(1);expect(y.pensionByOwner.wife.taxable).toBe(49_500_000);expect(y.pensionByOwner.husband.taxable).toBe(0);
  });
  it('같은 계좌를 두 연금이 공유해도 입금과 잔액을 한 번만 합산한다',()=>{
    const stock=irp('stock',{type:'STOCK',detail:{accountName:'account',currency:'KRW',isPensionLike:false}});
    const first=irp('irp',{detail:{...(irp().detail as PensionDetail),linkedStockId:'account'}});
    const second=irp('irp2',{detail:{...(irp().detail as PensionDetail),linkedStockId:'stock'}});
    const assets=[stock,first,second],y=run(make(assets),assets).rows.find(r=>r.year===2031)!;
    expect(y.accounts).toHaveLength(1);expect(y.inflow).toBe(450_000_000);expect(y.paid).toBe(99_000_000);expect(y.closing).toBe(651_000_000);
  });
  it('여러 계좌인데 연결 미지정이면 임의 18년 인출을 만들지 않고 원금을 보존한다',()=>{
    const assets=[irp(),irp('other')],p=make(assets,[{lumpsumId:'l',irpAmount:450_000_000,stockAmount:0}]),r=run(p,assets),y=r.rows.find(r=>r.year===2031)!;
    expect(r.incomplete).toBe(true);expect(y.paid).toBe(39_600_000);
    expect(y.accounts.find(a=>a.pending)).toMatchObject({inflow:450_000_000,paid:0,growth:0,closing:450_000_000});
    expect(y.entries.some(e=>e.id.startsWith('inflow:'))).toBe(false);
  });
  it('유일한 IRP는 자동 연결하지만 삭제된 명시적 연결을 다른 계좌로 대체하지 않는다',()=>{
    const assets=[irp()],p=make(assets);
    expect(irpTargetSource(p,assets)?.id).toBe('irp');expect(irpTargetSource(p,assets,'deleted')).toBeUndefined();
    p.allocations[0].irpSourceId='deleted';expect(run(p,assets).incomplete).toBe(true);
  });
  it('월수령액 미등록 계좌는 개별 남은 기간으로 나누며 숨은 전역 종료일을 쓰지 않는다',()=>{
    const assets=[irp('irp',{detail:{...(irp().detail as PensionDetail),expectedMonthlyPayout:0}})],y=run(make(assets),assets).rows.find(r=>r.year===2031)!;
    expect(y.paid).toBe(750_000_000/20);expect(y.payoutChanges[0].method).toBe('remainingYears');
  });
  it('잔액 0에서 새 입금이 들어와도 무한대 대신 남은 기간 분할로 전환한다',()=>{
    const assets=[irp('irp',{currentValue:0})],y=run(make(assets),assets).rows.find(r=>r.year===2031)!;
    expect(y.paid).toBe(450_000_000/20);expect(y.entries.every(e=>Number.isFinite(e.paid))).toBe(true);
  });
  it('종료 후 입금은 원금을 보존하지만 수령 종료일을 임의 연장하지 않는다',()=>{
    const assets=[irp()],y=run(make(assets),assets,[lump('l',2051)]).rows.find(r=>r.year===2051)!;
    expect(y.paid).toBe(0);expect(y.inflow).toBe(450_000_000);expect(y.closing).toBeGreaterThanOrEqual(450_000_000);expect(y.payoutChanges[0].method).toBe('ended');
  });
  it('과거 입금은 현재 잔액·등록 지급액에 이미 반영된 것으로 보고 다시 가산하지 않는다',()=>{
    const assets=[irp()],r=run(make(assets),assets,[lump('l',2025)]);
    expect(r.rows.every(r=>r.inflow===0&&r.payoutChanges.length===0)).toBe(true);
    expect(r.rows.find(r=>r.year===2031)!.paid).toBe(19_800_000);
  });
  it('연금 시뮬 미연동이면 목돈 인출을 기본 지급액에 몰래 추가하지 않는다',()=>{
    const assets=[irp()],r=run(make(assets),assets,[lump()],{simulation:false});
    expect(r.rows.find(r=>r.year===2031)!.paid).toBe(19_800_000);expect(r.rows.every(r=>r.inflow===0)).toBe(true);
  });
  it('지급 개시 전 입금은 수령액만 재설정하고 아직 수입을 만들지 않는다',()=>{
    const assets=[irp()],r=run(make(assets),assets,[lump('l',2029)]).rows;
    expect(r.find(r=>r.year===2029)!).toMatchObject({inflow:450_000_000,paid:0,closing:750_000_000});
    expect(r.find(r=>r.year===2030)!.paid).toBe(0);expect(r.find(r=>r.year===2031)!.paid).toBe(49_500_000);
  });
  it('연금형 주식의 기본 종료일은 조회 범위에 따라 바뀌지 않는다',()=>{
    const a=irp('stock',{type:'STOCK',detail:{accountName:'a',currency:'KRW',isPensionLike:true,pensionStartYear:2031,pensionMonthly:1000}}),p=make([a],[]);
    const full=annualPension(p,[a],2026,2055,{simulation:true,currentYear:2026}),part=annualPension(p,[a],2030,2033,{simulation:true,currentYear:2026});
    expect(part.rows).toEqual(full.rows.filter(r=>r.year>=2030&&r.year<=2033));
  });
});
