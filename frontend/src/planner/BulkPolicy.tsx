import { useState } from 'react';
import type { AssetPolicy } from './model';
/** Only fill missing assumptions. Existing per-asset exceptions, tax rates and confirmations remain untouched. */
export default function BulkPolicy({ policies, onApply }: { policies: AssetPolicy[]; onApply: (next: AssetPolicy[])=>void }) {
    const [growth,setGrowth]=useState(''),[dividend,setDividend]=useState(''),[message,setMessage]=useState('');
    return <details className="panel"><summary>선택 그룹의 빈 수익 가정만 채우기</summary><p>이미 입력한 종목별 값·세율·명의·확인 상태는 바꾸지 않습니다.</p><div className="form-grid"><label className="field"><span>가격 상승률 (연 %, 빈 값만)</span><input type="number" min="-99" max="100" value={growth} onChange={e=>setGrowth(e.target.value)}/></label><label className="field"><span>배당률 (연 %, 빈 값만)</span><input type="number" min="0" max="100" value={dividend} onChange={e=>setDividend(e.target.value)}/></label></div><button type="button" onClick={()=>{
      const g=growth.trim()===''?null:Number(growth),d=dividend.trim()===''?null:Number(dividend);
      if((g!==null&&(!Number.isFinite(g)||g< -99||g>100))||(d!==null&&(!Number.isFinite(d)||d<0||d>100))){setMessage('비율 범위를 확인하세요.');return;}
      const next=policies.map(p=>['investment','pension'].includes(p.role)?{...p,annualGrowth:p.annualGrowth??g,dividendYield:p.dividendYield??d}:p);
      const count=next.filter((p,i)=>p.annualGrowth!==policies[i].annualGrowth||p.dividendYield!==policies[i].dividendYield).length;
      if(!count){setMessage('채울 빈 가정이 없습니다.');return;}
      if(window.confirm(`${count}개 항목의 빈 값만 채웁니다. 가격 상승률 ${g??'변경 없음'}%, 배당률 ${d??'변경 없음'}%. 기존 예외·명의·세율·확인 상태는 보존합니다. 초안에 적용할까요?`)){onApply(next);setMessage('초안에 적용했습니다. 각 항목의 근거를 확인한 뒤 저장하세요.');}
    }}>변경 미리보기·초안 적용</button>{message&&<p role="status">{message}</p>}</details>;
}
