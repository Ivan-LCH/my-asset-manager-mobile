import type {Asset,PensionDetail,PensionSimPlan,PensionSource,LumpsumItem,StockDetail} from '@/types';
import type {PensionScheduleRow} from './pensionSim';
import {stockAccounts} from '@/planner/accounts';
import {linkedStocks,type StockLinkData} from './linkedStocks';
import {openingFunding,mergeFunding,withdrawFunding,scaleFunding,growFunding,type FundingPool} from './pensionFunding';
import { monthlyPension } from './monthlyPension';

export interface PensionAccountRow {
  id:string; name:string; opening:number; inflow:number; growth:number; paid:number; closing:number; pending:boolean;
  transferIn?:number; transferOut?:number; funding?:import('@/types').PensionWithdrawalFunding;
}
export interface PensionPayoutChange {
  sourceId:string; name:string; deposits:string[]; beforeBalance:number; deposit:number;
  previousMonthly:number; revisedMonthly:number; startYear:number; endYear:number;
  method:'proportional'|'remainingYears'|'ended';
}
export interface PensionLedgerRow extends PensionScheduleRow {
  opening:number; inflow:number; growth:number; paid:number; closing:number; shortfall:number;
  benefitAnnual:number;
  stockHusband:number;stockWife:number;
  pensionByOwner:{husband:{national:number;taxable:number;exempt:number};wife:{national:number;taxable:number;exempt:number}};
  entries:{id:string;name:string;requested:number;paid:number;funded:boolean;owner?:'husband'|'wife';accountId?:string;taxType?:PensionSource['taxType'];expectedStartYear?:number;funding?:import('@/types').PensionWithdrawalFunding}[];
  accounts:PensionAccountRow[];
  payoutChanges:PensionPayoutChange[];
}
/** No name-based guessing and no fallback from a deleted explicit reference. */
export function irpTargetSources(plan:PensionSimPlan,assets:Asset[]){
  return plan.sources.filter(s=>s.taxType==='irp'&&!assets.some(a=>a.id===s.id&&a.disposalDate));
}
export function irpTargetSource(plan:PensionSimPlan,assets:Asset[],sourceId?:string){
  const candidates=irpTargetSources(plan,assets);
  return sourceId?candidates.find(s=>s.id===sourceId):candidates.length===1?candidates[0]:undefined;
}
/** Allocations use their original receipt year and never create money beyond the lump sum. */
export function resolvedAllocations(plan:PensionSimPlan,lumpsums:LumpsumItem[]){
  const seen=new Set<string>();
  return plan.allocations.flatMap(a=>{
    const l=lumpsums.find(l=>l.id===a.lumpsumId);if(!l||seen.has(l.id))return [];seen.add(l.id);
    const irp=Math.min(Math.max(0,l.amount),Math.max(0,a.irpAmount));
    const stock=Math.min(Math.max(0,l.amount-irp),Math.max(0,a.stockAmount));
    return [{...a,irpAmount:irp,stockAmount:stock,year:l.receiveYear,name:l.name,taxKind:l.taxKind}];
  });
}

/** One annual ledger supplies both paid income and remaining pension capital. No writes. */
export function annualPension(plan:PensionSimPlan,assets:Asset[],from:number,to:number,options:{growth?:number;dividend?:number;simulation?:boolean;lumpsums?:LumpsumItem[];currentYear?:number;stockLink?:StockLinkData}={}):ReturnType<typeof monthlyPension>{
  if(plan.monthlyPlan&&options.simulation)return monthlyPension(plan,assets,from,to,options,annualPension);
  const current=options.currentYear??new Date().getFullYear();
  const notes:string[]=[];const live=assets.filter(a=>!a.disposalDate);const groups=stockAccounts(live);
  const fundedStockIds=new Set<string>();
  const allocations=options.simulation?resolvedAllocations(plan,options.lumpsums??[]):[];
  if(options.simulation&&plan.allocations.some(a=>!allocations.some(r=>r.lumpsumId===a.lumpsumId)))notes.push('원본이 없거나 중복된 목돈 분배는 제외했습니다. 기존 목돈 입력을 확인하세요.');
  if(options.simulation&&plan.allocations.some(a=>{const r=allocations.find(r=>r.lumpsumId===a.lumpsumId);return r&&(r.irpAmount!==a.irpAmount||r.stockAmount!==a.stockAmount)}))notes.push('목돈을 초과한 분배는 원본 금액 이내로 제한했습니다.');
  if(allocations.some(a=>a.year<current))notes.push('과거 목돈 분배는 현재 잔액에 포함된 것으로 보고 다시 입금하지 않습니다.');
  const sources:PensionSource[]=[...plan.sources];
  for(const a of live){
    const d=a.detail as StockDetail|undefined;
    if((a.type==='STOCK'||a.type==='SAVINGS')&&d?.isPensionLike&&!sources.some(s=>(live.find(p=>p.id===s.id)?.detail as PensionDetail)?.linkedStockId&&(groups.find(g=>g.name===(live.find(p=>p.id===s.id)?.detail as PensionDetail)?.linkedStockId||g.assets.some(m=>m.id===(live.find(p=>p.id===s.id)?.detail as PensionDetail)?.linkedStockId))?.assets.some(m=>m.id===a.id)))){
      sources.push({id:a.id,name:a.name,principal:a.currentValue,taxType:'irp',yieldRate:0,owner:a.ownership?.wife===100?'wife':'husband',expectedStartYear:d.pensionStartYear,expectedEndYear:(d.pensionStartYear||plan.startYear)+Math.max(1,plan.withdrawalYears)-1,expectedMonthlyPayout:d.pensionMonthly});
    }
  }
  type Source={s:PensionSource;key:string;funded:boolean;start:number;end:number;target:number;registered:boolean;merged?:boolean};
  const balances=new Map<string,number>(), rates=new Map<string,number>();const records:Source[]=[];
  const funding=new Map<string,FundingPool>();
  const accountNames=new Map<string,string>(),pendingAccounts=new Set<string>();
  let incomplete=false;
  for(const s of sources){
    const asset=live.find(a=>a.id===s.id),link=(asset?.detail as PensionDetail)?.linkedStockId;
    const group=link?groups.find(g=>g.name===link||g.assets.some(a=>a.id===link)):undefined;
    const funded=s.taxType!=='national'&&(!!link||s.taxType==='irp'||!(s.expectedMonthlyPayout&&s.expectedMonthlyPayout>0));
    const key=group?'account:'+group.id:'source:'+s.id;
    let principal=Math.max(0,s.principal);
    if(group){
      const aggregates=group.assets.filter(a=>(a.detail as StockDetail)?.isAccountLevel);
      const members=aggregates.length?aggregates:group.assets;
      principal=members.reduce((v,a)=>v+a.currentValue,0);
      group.assets.forEach(a=>fundedStockIds.add(a.id));
      if(aggregates.length&&group.assets.length>aggregates.length)notes.push(`${s.name}: 계좌 합계와 종목이 함께 있어 계좌 합계만 사용했습니다.`);
    }else if(link){principal=0;notes.push(`${s.name}: 연결 계좌를 찾을 수 없어 지급 가능액을 확정하지 못했습니다.`);}
    else if(asset?.type==='STOCK'&&funded)fundedStockIds.add(asset.id);
    const start=s.expectedStartYear||plan.startYear,end=s.expectedEndYear||(start+Math.max(1,plan.withdrawalYears)-1);
    if(!s.expectedStartYear&&!options.simulation){notes.push(`${s.name}: 수령 시작 연도 확인 필요`);continue;}
    if(end<start){notes.push(`${s.name}: 수령 종료 연도가 시작보다 빠릅니다.`);continue;}
    if(s.taxType==='national'&&!(s.expectedMonthlyPayout&&s.expectedMonthlyPayout>0))notes.push(`${s.name}: 국민연금 예상 지급액 확인 필요`);
    const rate=Math.max(-1,((options.growth??0)+(options.dividend??0))/100);
    const target=s.expectedMonthlyPayout&&s.expectedMonthlyPayout>0?s.expectedMonthlyPayout*12:
      options.simulation&&s.taxType!=='national'?principal*Math.pow(1+rate,Math.max(0,start-current))/Math.max(1,end-start+1):0;
    if(funded&&balances.has(key))notes.push(`${s.name}: 다른 연금과 같은 계좌를 사용합니다. 잔액은 한 번만 합산하고 동시 지급 요청을 비례 배분합니다.`);
    if(funded&&!balances.has(key)){balances.set(key,principal);rates.set(key,rate);accountNames.set(key,group?.name??s.name);}
    records.push({s,key,funded,start,end,target,registered:!!s.expectedMonthlyPayout&&s.expectedMonthlyPayout>0});
  }
  for(const [key,balance] of balances){
    const aliases=records.filter(r=>r.key===key),configured=aliases.filter(r=>plan.incomeTaxSettings?.sources?.[r.s.id]?.fundingKind);
    const r=configured[0]??aliases[0],config=plan.incomeTaxSettings?.sources?.[r.s.id]??{};
    const fingerprints=new Set(configured.map(r=>{const c=plan.incomeTaxSettings!.sources![r.s.id];return JSON.stringify([c.fundingKind,c.retirementPrincipal,c.exemptPrincipal,c.retirementTaxRate,c.firstReceiptYear])}));
    const conflict=fingerprints.size>1||new Set(aliases.map(r=>r.s.owner)).size>1;
    const pool=openingFunding(balance,conflict?{}:config,r.s.name,r.start<current?r.start:undefined);
    if(conflict){pool.enabled=true;notes.push(`${r.s.name}: 같은 계좌의 명의 또는 재원 설정이 충돌해 세금 재원을 미확정으로 처리했습니다.`);}
    if(pool.enabled&&pool.unknown>0)notes.push(`${r.s.name}: 현재 잔액의 재원 금액이 미입력·초과 또는 충돌 상태입니다. 세금은 미확정입니다.`);
    funding.set(key,pool);
  }
  const deposits:{key:string;amount:number;year:number;name:string;retirement:boolean;taxRate?:number}[]=[];
  for(const a of allocations.filter(a=>a.irpAmount>0&&a.year>=current)){
    const target=irpTargetSource(plan,assets,a.irpSourceId);
    const record=target?records.find(r=>r.s.id===target.id&&r.funded):undefined;
    // An orphan allocation remains capital, not invented pension income or spendable cash.
    const key=record?.key??'pending:'+a.lumpsumId;
    if(!record){
      incomplete=true;balances.set(key,0);rates.set(key,0);pendingAccounts.add(key);accountNames.set(key,a.name+' · IRP 연결 대기');
      notes.push(`${a.name}: 합산할 IRP를 선택하세요. 연결 전에는 입금 예정 원금만 보존하고 추가 연금·운용수익은 미산정입니다.`);
    }else if(!a.irpSourceId)notes.push(`${a.name}: 유일한 IRP인 ${record.s.name}에 자동 연결했습니다. 다른 계좌라면 목돈 분배에서 확인하세요.`);
    if(record&&a.year>record.end)notes.push(`${a.name}: IRP 수령 종료 후 입금입니다. 입금은 잔액에 보존하고 수령 기간 확인 전에는 지급하지 않습니다.`);
    deposits.push({key,amount:a.irpAmount,year:a.year,name:a.name,retirement:a.taxKind==='severance',taxRate:a.irpRetirementTaxRate});
  }
  const plannedTransfers=options.simulation?(plan.irpTransfers??[]):[];
  const transfers=plannedTransfers.filter(t=>{
    const src=records.find(r=>r.s.id===t.sourceId&&r.s.taxType==='irp'),dst=records.find(r=>r.s.id===t.targetId&&r.s.taxType==='irp');
    const duplicate=plannedTransfers.filter(x=>records.find(r=>r.s.id===x.sourceId)?.key===src?.key).length>1;
    const chain=plannedTransfers.some(x=>records.find(r=>r.s.id===x.sourceId)?.key===dst?.key);
    const ownerConflict=src&&dst&&records.some(r=>(r.key===src.key||r.key===dst.key)&&r.s.owner!==src.s.owner);
    const valid=src&&dst&&src.key!==dst.key&&src.s.owner===dst.s.owner&&!ownerConflict&&Number.isInteger(t.year)&&t.year>=current&&t.year<=2200&&!duplicate&&!chain;
    if(!valid){incomplete=true;notes.push('IRP 합산 계획 확인 필요: 같은 명의의 서로 다른 계좌·현재 이후 연도만 지원합니다. 중복·연쇄 합산은 실행하지 않습니다.');}
    return valid;
  });
  const redirected=new Map<string,string>();
  const stockInputs=options.simulation&&plan.stockInputMode==='assets'?linkedStocks(assets,fundedStockIds,options.stockLink):null;
  if(stockInputs)notes.push(...stockInputs.notes,'일반주식은 현재 자산 잔액·배당 예상액을 연결했습니다. 기존 수동 추가 금액은 합산하지 않습니다. 미래 목돈 배당에는 입력 배당률을 사용합니다.');
  else if(options.simulation)notes.push('일반주식은 기존 수동 투자금·배당률 기준입니다. 현재 계좌와 연결하려면 일반주식계좌에서 입력 기준을 변경하세요.');
  let hStock=options.simulation?(stockInputs?stockInputs.husband.balance:Math.max(0,plan.stockAccount.husband.extraAmount)):0,wStock=options.simulation?(stockInputs?stockInputs.wife.balance:Math.max(0,plan.stockAccount.wife.extraAmount)):0;
  let hLinkedBalance=stockInputs?.husband.balance??0,wLinkedBalance=stockInputs?.wife.balance??0;
  let hLinkedDividend=stockInputs?.husband.annualDividend??0,wLinkedDividend=stockInputs?.wife.annualDividend??0;
  const rows:PensionLedgerRow[]=[];
  for(let year=current;year<=to;year++){
    const opening=[...balances.values()].reduce((s,n)=>s+n,0);let inflow=0,growth=0,paid=0,shortfall=0,benefitAnnual=0;
    const accountOpening=new Map(balances),accountInflows=new Map<string,number>(),payoutChanges:PensionPayoutChange[]=[];
    const transferIn=new Map<string,number>(),transferOut=new Map<string,number>();
    const own={husband:{national:0,taxable:0,exempt:0},wife:{national:0,taxable:0,exempt:0}};
    const increase=(key:string,amount:number,names:string[])=>{
      const before=balances.get(key)??0;balances.set(key,before+amount);
      const active=records.filter(r=>r.key===key&&r.funded&&!r.merged&&r.end>=year);
      const totalTarget=active.reduce((sum,r)=>sum+r.target,0);
      for(const r of records.filter(r=>r.key===key&&r.funded&&!r.merged)){
        const start=Math.max(year,r.start),inflation=Math.pow(Math.max(0,1+(r.s.annualGrowthRate??0)/100),Math.max(0,start-r.start));
        const previousMonthly=r.target*inflation/12;
        let method:PensionPayoutChange['method']='ended';
        if(r.end>=year){
          if(r.registered&&before>0){r.target*=1+amount/before;method='proportional';}
          else {
            // No registered rate / depleted account: expose the remaining-period fallback.
            const share=totalTarget>0?r.target/totalTarget:1/Math.max(1,active.length);
            const projected=(before+amount)*Math.pow(1+(rates.get(key)??0),Math.max(0,r.start-year));
            r.target=inflation>0?projected*share/Math.max(1,r.end-start+1)/inflation:0;
            method='remainingYears';
            notes.push(`${r.s.name}: 등록 월수령액 또는 입금 직전 잔액이 없어 합산 잔액을 남은 수령 기간으로 나눈 추정액을 사용했습니다.`);
          }
        }
        payoutChanges.push({sourceId:r.s.id,name:r.s.name,deposits:names,beforeBalance:before,deposit:amount,previousMonthly,revisedMonthly:method==='ended'?0:r.target*inflation/12,startYear:start,endYear:r.end,method});
      }
    };
    const yearDeposits=deposits.filter(d=>d.year===year).map(d=>({...d,key:redirected.get(d.key)??d.key}));
    for(const d of yearDeposits){
      accountInflows.set(d.key,(accountInflows.get(d.key)??0)+d.amount);
      const pool=funding.get(d.key)??openingFunding(balances.get(d.key)??0,{},d.name);
      if(d.retirement){pool.enabled=true;pool.retirement.push({amount:d.amount,name:d.name,taxRate:d.taxRate,firstReceiptYear:pool.firstReceiptYear});}
      else pool.unknown+=d.amount;
      funding.set(d.key,pool);
    }
    for(const [key,amount] of accountInflows){increase(key,amount,yearDeposits.filter(d=>d.key===key).map(d=>d.name));inflow+=amount;}
    for(const t of transfers.filter(t=>t.year===year)){
      const src=records.find(r=>r.s.id===t.sourceId)!,dst=records.find(r=>r.s.id===t.targetId)!,amount=balances.get(src.key)??0;
      balances.set(src.key,0);transferOut.set(src.key,amount);transferIn.set(dst.key,(transferIn.get(dst.key)??0)+amount);
      mergeFunding(funding.get(dst.key)!,funding.get(src.key)!);
      redirected.set(src.key,dst.key);records.filter(r=>r.key===src.key).forEach(r=>{r.merged=true});
      increase(dst.key,amount,[src.s.name+' 계좌 합산']);
      notes.push(`${t.year}년 ${src.s.name} → ${dst.s.name}: 내부 이전으로 총자산은 늘지 않습니다. 합산 후 지급은 받는 계좌의 지급 기준으로 재산정합니다.`);
    }
    // Current values are the opening balance; withdrawals are made before annual investment returns.
    const requests=records.map(r=>({r,requested:!r.merged&&year>=r.start&&year<=r.end?r.target*Math.pow(1+(r.s.annualGrowthRate??0)/100,year-r.start):0}));
    const totals=new Map<string,number>();for(const {r,requested} of requests)if(r.funded)totals.set(r.key,(totals.get(r.key)??0)+requested);
    const paidFunding=new Map<string,import('@/types').PensionWithdrawalFunding>();
    for(const [key,total] of totals){const p=funding.get(key);if(p){const drawn=withdrawFunding(p,Math.min(balances.get(key)??0,total),year);if(p.enabled)paidFunding.set(key,drawn);}}
    const entries:PensionLedgerRow['entries']=[];
    for(const {r,requested} of requests){
      const available=r.funded?(balances.get(r.key)??0):requested;
      const amount=r.funded?requested*Math.min(1,available/(totals.get(r.key)||1)):requested;
      const who=own[r.s.owner??'husband'];
      if(r.s.taxType==='national')who.national+=amount;else if(r.s.taxType==='taxExempt')who.exempt+=amount;else who.taxable+=amount;
      if(r.funded){paid+=amount;shortfall+=Math.max(0,requested-amount);}else benefitAnnual+=amount;
      const drawn=paidFunding.get(r.key);
      entries.push({id:r.s.id,name:r.s.name,requested,paid:amount,funded:r.funded,owner:r.s.owner??'husband',accountId:r.funded?r.key:undefined,taxType:r.s.taxType,expectedStartYear:r.start,funding:drawn?scaleFunding(drawn,requested/(totals.get(r.key)||1)):undefined});
    }
    const accounts:PensionAccountRow[]=[];
    for(const [key,value] of balances){const withdrawal=entries.reduce((sum,e)=>sum+(e.accountId===key&&e.funded?e.paid:0),0);const change=Math.max(0,value-withdrawal)*(rates.get(key)??0);growth+=change;const closing=Math.max(0,value-withdrawal+change);balances.set(key,closing);
      const pool=funding.get(key);if(pool){growFunding(pool,change);if(pool.enabled&&change<0)notes.push(`${accountNames.get(key)}: 운용손실 이후 세무 원금 조정은 미확정입니다. 해당 인출 세금은 확정 합계에서 제외합니다.`);}
      accounts.push({id:key,name:accountNames.get(key)??key,opening:accountOpening.get(key)??0,inflow:accountInflows.get(key)??0,growth:change,paid:withdrawal,closing,pending:pendingAccounts.has(key),transferIn:transferIn.get(key)??0,transferOut:transferOut.get(key)??0,funding:pool?.enabled?scaleFunding(pool,1):undefined});
    }
    for(const a of allocations.filter(a=>a.year===year)){hStock+=a.stockAmount*plan.stockOwnership.husband/100;wStock+=a.stockAmount*plan.stockOwnership.wife/100;}
    const financialHusbandAnnual=hLinkedDividend+Math.max(0,hStock-hLinkedBalance)*plan.stockAccount.husband.dividendYield/100,financialWifeAnnual=wLinkedDividend+Math.max(0,wStock-wLinkedBalance)*plan.stockAccount.wife.dividendYield/100;
    hStock=Math.max(0,hStock*(1+plan.stockAccount.husband.growthRate/100));wStock=Math.max(0,wStock*(1+plan.stockAccount.wife.growthRate/100));
    const hg=Math.max(0,1+plan.stockAccount.husband.growthRate/100),wg=Math.max(0,1+plan.stockAccount.wife.growthRate/100);
    hLinkedBalance*=hg;wLinkedBalance*=wg;hLinkedDividend*=hg;wLinkedDividend*=wg;
    const nationalAnnual=own.husband.national+own.wife.national,exemptAnnual=own.husband.exempt+own.wife.exempt,taxableAnnual=own.husband.taxable+own.wife.taxable+nationalAnnual;
    const financialAnnual=financialHusbandAnnual+financialWifeAnnual;
    if(year>=from)rows.push({year,opening,inflow,growth,paid,closing:[...balances.values()].reduce((s,n)=>s+n,0),shortfall,benefitAnnual,stockHusband:hStock,stockWife:wStock,pensionByOwner:own,entries,accounts,payoutChanges,
      nationalAnnual,exemptAnnual,taxableAnnual,drawdownAnnual:taxableAnnual-nationalAnnual+exemptAnnual,financialAnnual,financialHusbandAnnual,financialWifeAnnual,totalAnnual:taxableAnnual+exemptAnnual+financialAnnual});
  }
  return {rows,notes:[...new Set(notes)],fundedStockIds,allocations,incomplete,stockInputs,sources};
}
