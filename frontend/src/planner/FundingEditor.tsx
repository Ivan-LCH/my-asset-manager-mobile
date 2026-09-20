import { stockAccounts, accountFundingIds } from './accounts';
import type { Flow, Snapshot, AssetPolicy } from './model';
export default function FundingEditor({ flow, snapshot, policies, onChange }: { flow: Flow; snapshot: Snapshot; policies: AssetPolicy[]; onChange: (value: Partial<Flow>)=>void }) {
    const accounts=stockAccounts(snapshot.positions.map(p=>p.source));
    const linked=(snapshot.positions.find(p=>p.assetId===flow.assetId)?.source.detail as any)?.linkedStockId;
    const selected=accounts.find(g=>g.assets.some(a=>a.id===flow.withdrawalAccountAssetId));
    return <fieldset className="date-editor"><legend>실제 출금 원천 · 지급액 원천과 별도</legend>
      <label className="field"><span>출금할 주식 계좌</span><select aria-label="출금할 주식 계좌" value={selected?.id??''} onChange={e=>{
        const group=accounts.find(g=>g.id===e.target.value);
        onChange({withdrawalAccountAssetId:group?.id,withdrawalAssetIds:group ? accountFundingIds(group,snapshot.positions,policies) : undefined,confirmed:false});
      }}><option value="">지급액 원천 자산에서 직접 인출</option>{accounts.map(g=><option key={g.id} value={g.id}>{g.name} · {g.assets.length}개 기록</option>)}</select></label>
      {linked&&!flow.withdrawalAssetIds&&<p className="notice">기존 연결 계좌가 있습니다. 실제 출금 계좌를 선택해야 계산할 수 있습니다. 잔액을 연금 기록에 복사하지 않습니다.</p>}
      {flow.withdrawalAssetIds&&<><p>아래 순서대로 실제 잔액 한도 내에서 인출합니다. 계좌 구성이 바뀌면 다시 선택해 확인하세요.</p><ol>{flow.withdrawalAssetIds.map((id,index)=><li key={id}><span>{snapshot.positions.find(p=>p.assetId===id)?.name??'없는 자산 · 재연결 필요'}</span><button type="button" className="secondary" disabled={!index} aria-label={`${index+1}번째 출금 원천 위로`} onClick={()=>{const ids=[...flow.withdrawalAssetIds!];[ids[index-1],ids[index]]=[ids[index],ids[index-1]];onChange({withdrawalAssetIds:ids,confirmed:false});}}>위로</button></li>)}</ol>{!flow.withdrawalAssetIds.length&&<p role="alert">출금 원천이 비었습니다. 계좌를 선택하세요.</p>}</>}
      <p className="muted">출금 목록은 계획 사본에 저장됩니다. 종목별 제외·중복 연결은 먼저 자산 연결에서 검토하세요.</p>
    </fieldset>;
}
