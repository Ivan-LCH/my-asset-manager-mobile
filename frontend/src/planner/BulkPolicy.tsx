import { useState } from 'react';
import type { AssetPolicy } from './model';
/** 그룹의 미확인 항목을 현재 분류 그대로 확인 완료로 표시. 분류·수익 가정·연결·명의·세율은 바꾸지 않는다. */
export function confirmGroupDefaults(policies: AssetPolicy[]): { next: AssetPolicy[]; count: number } {
    const next = policies.map(p => p.confirmed ? p : { ...p, confirmed: true });
    return { next, count: next.filter((p, i) => p !== policies[i]).length };
}
/** Only fill missing assumptions. Existing per-asset exceptions, tax rates and confirmations remain untouched. */
export default function BulkPolicy({ policies, onApply, confirmDisabledReason }: { policies: AssetPolicy[]; onApply: (next: AssetPolicy[])=>void; confirmDisabledReason?: string }) {
    const [growth,setGrowth]=useState(''),[dividend,setDividend]=useState(''),[message,setMessage]=useState(''),[confirmMessage,setConfirmMessage]=useState('');
    const pending=policies.filter(p=>!p.confirmed).length;
    return <><section className="panel" data-bulk-confirm><h2>이 그룹 기본값 확인</h2><p className="muted">미확인 {pending}건의 현재 분류(기본값 포함)를 ‘확인 완료’로만 표시합니다. 분류·수익 가정·연결·명의·세율은 바꾸지 않으며, 빈 수익 가정은 분석에서 계속 확인 필요로 남습니다.</p>{confirmDisabledReason&&<p className="notice">{confirmDisabledReason}</p>}<button type="button" disabled={!!confirmDisabledReason||!pending} onClick={()=>{
      const {next,count}=confirmGroupDefaults(policies);
      if(!count){setConfirmMessage('확인할 미확인 항목이 없습니다.');return;}
      if(window.confirm(`${count}개 항목을 현재 분류 그대로 확인 완료로 표시합니다. 분류·수익 가정·연결은 바꾸지 않습니다. 초안에 적용할까요?`)){onApply(next);setConfirmMessage(`${count}개 항목을 초안에서 확인 완료로 표시했습니다. 저장해야 반영됩니다.`);}
    }}>이 그룹 기본값 확인 ({pending}건)</button>{confirmMessage&&<p role="status">{confirmMessage}</p>}</section>
    <details className="panel"><summary>선택 그룹의 빈 수익 가정만 채우기</summary><p>이미 입력한 종목별 값·세율·명의·확인 상태는 바꾸지 않습니다.</p><div className="form-grid"><label className="field"><span>가격 상승률 (연 %, 빈 값만)</span><input type="number" min="-99" max="100" value={growth} onChange={e=>setGrowth(e.target.value)}/></label><label className="field"><span>배당률 (연 %, 빈 값만)</span><input type="number" min="0" max="100" value={dividend} onChange={e=>setDividend(e.target.value)}/></label></div><button type="button" onClick={()=>{
      const g=growth.trim()===''?null:Number(growth),d=dividend.trim()===''?null:Number(dividend);
      if((g!==null&&(!Number.isFinite(g)||g< -99||g>100))||(d!==null&&(!Number.isFinite(d)||d<0||d>100))){setMessage('비율 범위를 확인하세요.');return;}
      const next=policies.map(p=>['investment','pension'].includes(p.role)?{...p,annualGrowth:p.annualGrowth??g,dividendYield:p.dividendYield??d}:p);
      const count=next.filter((p,i)=>p.annualGrowth!==policies[i].annualGrowth||p.dividendYield!==policies[i].dividendYield).length;
      if(!count){setMessage('채울 빈 가정이 없습니다.');return;}
      if(window.confirm(`${count}개 항목의 빈 값만 채웁니다. 가격 상승률 ${g??'변경 없음'}%, 배당률 ${d??'변경 없음'}%. 기존 예외·명의·세율·확인 상태는 보존합니다. 초안에 적용할까요?`)){onApply(next);setMessage('초안에 적용했습니다. 각 항목의 근거를 확인한 뒤 저장하세요.');}
    }}>변경 미리보기·초안 적용</button>{message&&<p role="status">{message}</p>}</details></>;
}
