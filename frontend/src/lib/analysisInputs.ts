import type { Asset, PensionDetail, PensionSimPlan, RetirementPlan, Settings } from '@/types';
import { EMPTY_PENSION_PLAN, sourcesFromAssets } from './pensionSim';
import { normalizeSavedPlan } from './retirementPlan';
import { parseBirthYear } from './people';
import {stockAccounts} from '@/planner/accounts';

/** Read-only projection of existing inputs. Never saves defaults or marks a plan reviewed. */
export function retirementInputs(saved: Partial<RetirementPlan> = {}, settings: Partial<Settings> = {}) {
  const year = saved.retirementYear ?? settings.retirementYear;
  const missing: { label: string; to: string }[] = [];
  if (!Number.isInteger(year) || Number(year) < 1900) missing.push({label:'은퇴 예정 연도',to:'/settings'});
  if (parseBirthYear(settings.birthHusband)===null && !(Number(settings.currentAge)>0)) missing.push({label:'생년월 또는 기존 나이',to:'/settings'});
  if (!Array.isArray(saved.expenses)) missing.push({label:'생활비',to:'/analysis?tab=prep'});
  const plan = normalizeSavedPlan({...saved, retirementYear:year ?? new Date().getFullYear(), expenses:saved.expenses??[], medicalMonthly:saved.medicalMonthly??0});
  return {plan,missing,yearSource:saved.retirementYear!=null?'은퇴 입력':'설정',medicalMissing:saved.medicalMonthly==null};
}

/** Shared by the existing pension editor and annual/cash-flow views. */
export function pensionInputs(saved: PensionSimPlan | null | undefined, assets: Asset[], retirementYear?: number): PensionSimPlan {
  const live=assets.filter(a=>!a.disposalDate), pensions=live.filter(a=>a.type==='PENSION');
  const accounts=new Map<string,number>();
  for(const a of live.filter(a=>a.type==='STOCK')) {
    const account=(a.detail as {accountName?:string})?.accountName??'';
    if(account)accounts.set(account,(accounts.get(account)??0)+a.currentValue);
  }
  const existing=saved?.sources??[];
  for(const group of stockAccounts(live)){
    const total=group.assets.reduce((sum,a)=>sum+a.currentValue,0);
    for(const a of group.assets)accounts.set(a.id,total);
  }
  const currentSources=existing.map(s=>{const a=pensions.find(a=>a.id===s.id);return a?{...s,principal:a.currentValue}:s});
  const auto=sourcesFromAssets(pensions.map(a=>({...a,detail:a.detail as PensionDetail|undefined})),currentSources,accounts);
  // Keep truly manual sources; exclude sources of a known disposed asset.
  const manual=existing.filter(s=>!assets.some(a=>a.id===s.id));
  return {...EMPTY_PENSION_PLAN,...saved,
    startYear:saved?.startYear??retirementYear??new Date().getFullYear(),
    refYear:saved?.refYear??retirementYear??new Date().getFullYear(),
    sources:[...auto.map(s=>{const o=pensions.find(a=>a.id===s.id)?.ownership;return {...s,owner:o?.wife===100&&o.husband===0?'wife' as const:o?.husband===100&&o.wife===0?'husband' as const:existing.find(e=>e.id===s.id)?.owner??'husband' as const}}),...manual], allocations:saved?.allocations??[],
    stockAccount:{
      husband:{...EMPTY_PENSION_PLAN.stockAccount.husband,...saved?.stockAccount?.husband},
      wife:{...EMPTY_PENSION_PLAN.stockAccount.wife,...saved?.stockAccount?.wife},
    },
    stockOwnership:saved?.stockOwnership??EMPTY_PENSION_PLAN.stockOwnership,
  };
}

export function pensionInputNotes(saved:PensionSimPlan|null|undefined,assets:Asset[]){
  return assets.filter(a=>a.type==='PENSION'&&!a.disposalDate).flatMap(a=>{
    const o=a.ownership,old=saved?.sources.find(s=>s.id===a.id)?.owner;
    const owner=o?.wife===100&&o.husband===0?'wife':o?.husband===100&&o.wife===0?'husband':undefined;
    return !owner?[`${a.name}: 연금 수령인 단독 명의를 확인하세요. 명의 미확정·공동지분은 기존 분석 명의(없으면 남편)를 임시 사용합니다.`]
      :old&&old!==owner?[`${a.name}: 과거 분석 명의 대신 자산의 최신 명의(${owner==='wife'?'아내':'남편'})를 반영했습니다.`]:[];
  });
}
