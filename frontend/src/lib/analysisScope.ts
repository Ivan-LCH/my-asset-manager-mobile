// 은퇴 분석(연 단위)에 합산 기준(설정 › 합산 기준) 적용 — 순수 함수.
// 판정은 홈 합계와 같은 스냅샷(buildSnapshot/resolvePolicy)과 excludedReason을 그대로 쓴다. 산식은 바꾸지 않고 입력만 거른다.
// 고정 규칙 (4단계 1 후속):
//  1. 부동산: 합산 제외·동일 잔액 연결이어도 보유세·건강보험 재산 산정에는 남긴다 (분석에서 부동산은 세금·건보에만 쓰임).
//  2. 수급권(국민연금 등): 분석에는 원래 잔액이 없으므로 지급 일정·저장된 연금 시뮬 소스를 그대로 둔다.
//  3. 연결 연금(linkedStockId 래퍼, 예: 퇴직IRP): 홈과 같이 제외 설정을 무시한다 — 돈은 계좌 종목에 있다.
//  4. 그 밖의 자산(개인연금·주식·예금 등): 잔액·지급·배당과 저장된 연금 시뮬 소스·월별 계획 계좌까지 뺀다.
// 기준일 뒤 취득('future')은 기존 분석 처리를 유지한다 (대상 아님).
import type { Asset, DividendSummary, PensionSimPlan } from '@/types';
import type { Snapshot } from '@/planner/model';
import { defaultPolicy } from '@/planner/model';
import { excludedReason, excludedSummary, type ExcludedItem } from '@/planner/totals';

export interface AnalysisScope {
  /** 분석 입력에서 뺄 자산 id (규칙 4) */
  dropIds: Set<string>;
  /** 뺀 자산 중 주식이 있는지 — 주식 입력이 수동이면 효과가 없다는 안내용 */
  droppedStock: boolean;
  notes: string[];
}

export const EMPTY_SCOPE: AnalysisScope = { dropIds: new Set(), droppedStock: false, notes: [] };

/** 스냅샷(usePlanner().data.current)에서 분석 제외 대상과 안내 문구를 만든다. 스냅샷이 없으면 아무것도 빼지 않는다. */
export function analysisScope(snapshot: Snapshot | null | undefined): AnalysisScope {
  if (!snapshot) return EMPTY_SCOPE;
  const dropIds = new Set<string>(), dropped: ExcludedItem[] = [], notes: string[] = [];
  const realEstate: string[] = [], entitlements: string[] = [], wrappers: string[] = [];
  let droppedStock = false;
  for (const p of snapshot.positions) {
    const reason = excludedReason(p, snapshot.plan.asOfDate);
    // 래퍼 자체의 기본 상태(linkedAccount → 'linked')는 제외 설정이 아니다 — 저장된 제외·연결만 본다
    if (reason !== 'excluded' && !(reason === 'linked' && p.linkedTo)) continue;
    if (p.linkedAccount) wrappers.push(`${p.name}(${p.linkedAccount})`);
    else if (p.source.type === 'REAL_ESTATE') realEstate.push(p.name);
    else if (p.role === 'entitlement' || defaultPolicy(p.source).role === 'entitlement') entitlements.push(p.name);
    else {
      dropIds.add(p.assetId);
      if (p.source.type === 'STOCK') droppedStock = true;
      dropped.push({ assetId: p.assetId, name: p.name, type: p.source.type, amount: Math.round(p.source.currentValue || 0), reason });
    }
  }
  if (dropped.length) notes.push(`합산 기준에서 뺀 자산은 은퇴 분석에서도 잔액·연금 지급·배당을 반영하지 않습니다. ${excludedSummary(dropped)}`);
  if (realEstate.length) notes.push(`${realEstate.join(', ')}: 합산 기준에서 뺀 부동산이지만 보유 중이므로 보유세·건강보험 재산 산정에는 포함합니다.`);
  if (entitlements.length) notes.push(`${entitlements.join(', ')}: 합산 기준에서 뺀 수급권은 평가액만 빠집니다. 은퇴 분석에는 원래 잔액이 없으므로 연금 지급은 그대로 반영합니다.`);
  if (wrappers.length) notes.push(`${wrappers.join(', ')}: 연결 계좌 연금은 홈 합계와 같이 합산 제외 설정을 적용하지 않고 계좌 종목 합계로 분석합니다. 이 돈을 빼려면 합산 기준에서 계좌의 종목을 제외하세요.`);
  return { dropIds, droppedStock, notes };
}

export interface AnalysisInputs {
  assets: Asset[];
  dividends: DividendSummary | undefined;
  pensionSim: PensionSimPlan | null | undefined;
}

/** 분석 입력 3종(자산·배당 요약·저장된 연금 시뮬)을 scope로 한 번에 거른다. 뺄 것이 없으면 입력을 그대로 돌려준다. */
export function scopeInputs(inputs: AnalysisInputs, scope: AnalysisScope): AnalysisInputs & { notes: string[] } {
  const drop = scope.dropIds;
  const notes = [...scope.notes];
  if (!drop.size) return { ...inputs, notes };
  const { dividends, pensionSim } = inputs;
  const assets = inputs.assets.filter(a => !drop.has(a.id));
  let div = dividends;
  if (dividends) {
    const items = dividends.items.filter(i => !drop.has(i.assetId));
    div = { ...dividends, items, totalAnnual: items.reduce((s, i) => s + i.annualKrw, 0), totalMonthly: items.reduce((s, i) => s + i.monthlyKrw, 0) };
  }
  let sim = pensionSim;
  if (pensionSim) {
    // 저장 소스를 거르지 않으면 analysisInputs의 "수동 소스"로 살아남는다. 월별 계획 계좌도 거르지 않으면 "연결 자산 확인 필요"가 남는다.
    const m = pensionSim.monthlyPlan;
    sim = {
      ...pensionSim,
      sources: pensionSim.sources.filter(s => !drop.has(s.id)),
      ...(pensionSim.irpTransfers ? { irpTransfers: pensionSim.irpTransfers.filter(t => !drop.has(t.sourceId) && !drop.has(t.targetId)) } : {}),
      ...(m ? { monthlyPlan: { ...m,
        accounts: m.accounts.filter(c => !drop.has(c.sourceId)),
        transfers: m.transfers.filter(t => !drop.has(t.sourceId) && !drop.has(t.targetId)),
        deposits: m.deposits.filter(d => !drop.has(d.targetId)) } } : {}),
    };
    if (scope.droppedStock && pensionSim.stockInputMode !== 'assets')
      notes.push('합산 기준에서 뺀 주식의 배당은 제외했습니다. 연금 시뮬레이션의 일반 주식 입력이 수동이면 그 잔액·배당 가정에는 영향이 없습니다.');
  }
  return { assets, dividends: div, pensionSim: sim, notes };
}
