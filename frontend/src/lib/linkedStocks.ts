import type {Asset,Ownership,StockDetail} from '@/types';
import {stockAccounts} from '@/planner/accounts';

export interface StockLinkData {
  dividends?: {assetId:string;monthlyKrw:number}[];
  owners?: Record<string,Ownership>;
}
/** Read-only current holdings, excluding pension-funded accounts. Never add aggregate and positions twice. */
export function linkedStocks(assets:Asset[],fundedIds:Set<string>,data:StockLinkData={}){
  const result={husband:{balance:0,annualDividend:0},wife:{balance:0,annualDividend:0},accounts:[] as {id:string;name:string;balance:number;annualDividend:number}[],notes:[] as string[]};
  const dividends=new Map((data.dividends??[]).map(d=>[d.assetId,Math.max(0,d.monthlyKrw)*12]));
  for(const g of stockAccounts(assets)){
    if(g.assets.some(a=>fundedIds.has(a.id)||(a.detail as StockDetail)?.isPensionLike))continue;
    const aggregates=g.assets.filter(a=>(a.detail as StockDetail)?.isAccountLevel);
    const members=aggregates.length?aggregates:g.assets;
    if(aggregates.length&&g.assets.length>aggregates.length)result.notes.push(`${g.name}: 계좌 합계 행을 사용하며 같은 계좌의 종목을 중복 합산하지 않습니다.`);
    let balance=0,annualDividend=0;
    for(const a of members){
      const value=Math.max(0,a.currentValue),dividend=dividends.get(a.id)??0;
      const saved=data.owners?.[g.name]??a.ownership;
      const valid=!!saved&&Number.isFinite(saved.husband)&&Number.isFinite(saved.wife)&&saved.husband>=0&&saved.wife>=0&&Math.abs(saved.husband+saved.wife-100)<.001;
      const o=valid?saved!:{husband:50,wife:50};
      if(!valid)result.notes.push(`${g.name}: 주식 명의 미확인으로 50:50을 임시 적용했습니다.`);
      for(const who of ['husband','wife'] as const){result[who].balance+=value*o[who]/100;result[who].annualDividend+=dividend*o[who]/100;}
      balance+=value;annualDividend+=dividend;
    }
    result.accounts.push({id:g.id,name:g.name,balance,annualDividend});
    if(balance>0&&annualDividend===0)result.notes.push(`${g.name}: 연결된 배당 예상액은 0원입니다. 무배당 계좌인지 배당 정보 미입력인지 확인하세요.`);
  }
  result.notes=[...new Set(result.notes)];
  return result;
}
