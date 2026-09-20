import {useState} from 'react'
import {useLocation} from 'react-router-dom'
import type {IncomeTaxSettings, IncomeTaxYearAdjustment, PensionSimPlan, PersonIncomeTaxSettings, PensionSourceTaxSettings} from '@/types'
import {IrpFundingInterview} from './IrpFundingInterview'

const inputClass='mt-1 w-full min-w-0 rounded border border-gray-600 bg-gray-900 p-2 text-gray-100'
function OptionalNumber({label,value,onChange,max,placeholder}:{label:string;value?:number;onChange:(n:number|undefined)=>void;max?:number;placeholder?:string}) {
  return <label className="block text-xs text-gray-300">{label}<input className={inputClass} type="number" min="0" max={max} step="any" aria-label={label} placeholder={placeholder??'미확인 · 비워두기'} value={value??''} onChange={e=>onChange(e.target.value===''?undefined:Math.min(max??Number.MAX_SAFE_INTEGER,Math.max(0,Number(e.target.value))))}/></label>
}

/** Optional refinement, saved by the page's existing Save button. */
export function IncomeTaxSettingsEditor({plan,onChange,onTransfers,onSave,dirty,saving}:{plan:PensionSimPlan;onChange:(s:IncomeTaxSettings)=>void;onTransfers?:(s:NonNullable<PensionSimPlan['irpTransfers']>)=>void;onSave?:()=>void;dirty?:boolean;saving?:boolean}) {
  const {hash}=useLocation()
  const value=plan.incomeTaxSettings??{}
  const [yearOverride,setYearOverride]=useState<number|null>(null)
  const [sourceYearOnly,setSourceYearOnly]=useState(false)
  const year=yearOverride??plan.refYear
  const person=(owner:'husband'|'wife',patch:Partial<PersonIncomeTaxSettings>)=>onChange({...value,people:{...value.people,[owner]:{...value.people?.[owner],...patch}}})
  const yearly=(owner:'husband'|'wife',patch:Partial<IncomeTaxYearAdjustment>)=>onChange({...value,years:{...value.years,[year]:{...value.years?.[year],[owner]:{...value.years?.[year]?.[owner],...patch}}}})
  const source=(id:string,patch:Partial<PensionSourceTaxSettings>)=>{
    if(sourceYearOnly)onChange({...value,sourceYears:{...value.sourceYears,[year]:{...value.sourceYears?.[year],[id]:{...(value.sourceYears?.[year]?.[id]??value.sources?.[id]),...patch}}}})
    else onChange({...value,sources:{...value.sources,[id]:{...value.sources?.[id],...patch}}})
  }
  return <details id="income-tax-settings" open={hash==='#income-tax-settings'||undefined} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
    <summary className="cursor-pointer text-sm font-semibold text-blue-300">세금 추가정보 · 확인이 필요한 항목만</summary>
    <p className="my-3 text-xs text-gray-400">연금 지급액·명의·배당액은 기존 입력을 사용합니다. 아래는 세무 구분과 공제 정보만 보완합니다. 빈칸은 미확인, 0은 해당 없음입니다. 변경 후 상단 저장을 누르세요.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {(['husband','wife'] as const).map(owner=>{
        const p=value.people?.[owner]??{},label=owner==='husband'?'남편':'아내'
        return <section className="min-w-0 space-y-3 rounded bg-gray-900/50 p-3" key={owner}>
          <h3 className="text-sm font-semibold">{label} · 매년 적용할 가정</h3>
          <OptionalNumber label={`${label} 배당공제 대상 비율 (%)`} value={p.eligibleDividendRatio} max={100} onChange={n=>person(owner,{eligibleDividendRatio:n})}/>
          <p className="text-xs text-gray-400">일반 금융소득 중 적격 국내 배당만 포함합니다. ETF·해외 배당 등은 자동으로 대상이 되지 않습니다.</p>
          {plan.sources.some(s=>s.owner===owner&&s.taxType==='national')&&<OptionalNumber label={`${label} 국민연금 과세대상 비율 (%)`} value={p.publicPensionTaxableRatio} max={100} onChange={n=>person(owner,{publicPensionTaxableRatio:n})}/>}
          <OptionalNumber label={`${label} 인적·기타 소득공제 합계 (원/년)`} value={p.incomeDeduction} placeholder="미입력: 본인 1,500,000원만" onChange={n=>person(owner,{incomeDeduction:n})}/>
          <p className="text-xs text-gray-400">연금소득공제는 자동 계산하므로 넣지 마세요. 배우자·부양가족 공제는 소득·나이 요건을 확인하여 한 사람에게만 배정합니다.</p>
          <label className="block text-xs text-gray-300">{label} 사적연금 과세 선택<select aria-label={`${label} 사적연금 과세 선택`} className={inputClass} value={p.privatePensionMode??''} onChange={e=>person(owner,{privatePensionMode:(e.target.value||undefined) as PersonIncomeTaxSettings['privatePensionMode']})}><option value="">미선택 · 분리과세 가정</option><option value="separate">분리과세</option><option value="comprehensive">금융·공적연금과 종합합산</option></select></label>
        </section>
      })}
    </div>
    <label className="block my-3 text-xs text-gray-300">확인할 연도<input aria-label="세금 확인 연도" type="number" min="2000" max="2200" className={inputClass} value={year} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=2000&&n<=2200)setYearOverride(n)}}/></label>
    {plan.sources.some(s=>s.taxType==='irp'||s.taxType==='taxable')&&<details open={hash==='#income-tax-settings'||undefined} className="border-t border-gray-700 pt-3 mt-3">
      <summary className="cursor-pointer text-sm">IRP·사적연금의 인출 재원 확인</summary>
      <p className="text-xs text-gray-400 my-2">먼저 현재 잔액의 재원 구분을 선택하세요. 이름으로 추정하지 않습니다. 선택한 재원과 퇴직금 입금·계좌 합산을 연결해 인출 순서와 비율을 자동 계산합니다. 퇴직금 세율은 별도 확인이 필요합니다.</p>
      {!sourceYearOnly&&<IrpFundingInterview plan={plan} value={value} onChange={onChange} onSave={onSave} dirty={dirty} saving={saving}/>}
      <label className="text-xs text-gray-300"><input type="checkbox" checked={sourceYearOnly} onChange={e=>setSourceYearOnly(e.target.checked)}/> {year}년 세무 가정만 별도 입력 (재원 플래그·합산은 기본 설정에서 관리)</label>
      <details className="mt-3 border-t border-gray-700 pt-3"><summary className="cursor-pointer text-xs text-gray-400">전체 항목 직접 수정 · 고급</summary>
      {plan.sources.filter(s=>s.taxType==='irp'||s.taxType==='taxable').map(s=>{
        const p=sourceYearOnly?(value.sourceYears?.[year]?.[s.id]??value.sources?.[s.id]??{}):(value.sources?.[s.id]??{})
        const automatic=!!value.sources?.[s.id]?.fundingKind||plan.irpTransfers?.some(t=>t.sourceId===s.id||t.targetId===s.id)||plan.allocations.some(a=>a.irpAmount>0&&(a.irpSourceId===s.id||(!a.irpSourceId&&plan.sources.filter(x=>x.taxType==='irp').length===1&&s.taxType==='irp')))
        if(sourceYearOnly&&automatic)return <section key={s.id} className="my-3 rounded bg-gray-900/50 p-3 text-xs space-y-2"><h4 className="font-semibold">{s.name}</h4><p className="text-gray-400">자동 재원 계산 계좌입니다. 연도별 수동 비율로 덮어쓰지 않습니다. 현재 재원·세율·첫 수령연도는 기본 설정에서 확인하세요.</p><button type="button" className="text-blue-300 underline" onClick={()=>setSourceYearOnly(false)}>기본 재원 설정으로</button></section>
        return <section className="my-3 space-y-2 rounded bg-gray-900/50 p-3" key={s.id} data-tax-source={s.id}>
          <h4 className="text-xs font-semibold break-words">{s.name} · {s.owner==='wife'?'아내':'남편'} · {sourceYearOnly?`${year}년`:'현재 재원·기본 세무 가정'}</h4>
          {!sourceYearOnly&&s.taxType==='irp'&&<>
            <label className="block text-xs text-gray-300">현재 잔액의 재원 구분<select aria-label={`${s.name} 현재 잔액 재원 구분`} className={inputClass} value={p.fundingKind??''} onChange={e=>source(s.id,{fundingKind:(e.target.value||undefined) as PensionSourceTaxSettings['fundingKind']})}>
              <option value="">미확인 · 이름으로 판단하지 않음</option>
              <option value="retirement">전액 퇴직금 원금 (운용수익 없음 확인)</option>
              <option value="personal">전액 세액공제 받은 개인납입금·운용수익</option>
              <option value="exempt">전액 세액공제 받지 않은 원금</option>
              <option value="mixed">혼합 · 금액으로 구분</option>
            </select></label>
            <p className="text-xs text-gray-400">현재 잔액에 운용수익이 섞인 퇴직 IRP는 ‘혼합’을 선택합니다. 추가 예정 퇴직금은 여기 넣지 마세요. 목돈 분배에서 자동 연결합니다.</p>
            {p.fundingKind==='mixed'&&<div className="grid sm:grid-cols-2 gap-3">
              <OptionalNumber label={`${s.name} 현재 퇴직금 원금 (원)`} value={p.retirementPrincipal} onChange={n=>source(s.id,{retirementPrincipal:n})}/>
              <OptionalNumber label={`${s.name} 현재 과세제외 원금 (원)`} value={p.exemptPrincipal} onChange={n=>source(s.id,{exemptPrincipal:n})}/>
              <p className="text-xs text-gray-400 sm:col-span-2">두 금액 모두 확인해 입력하세요. 해당 없음은 0입니다. 현재 연결 잔액에서 뺀 나머지는 세액공제 받은 개인납입금·운용수익으로 계산합니다.</p>
            </div>}
            {s.taxType==='irp'&&onTransfers&&<div className="border-t border-gray-700 pt-2">
              <label className="block text-xs text-gray-300">퇴직 시 이 계좌를 합칠 곳 (선택)<select aria-label={`${s.name} 합칠 계좌`} className={inputClass} value={plan.irpTransfers?.find(t=>t.sourceId===s.id)?.targetId??''} onChange={e=>onTransfers([...(plan.irpTransfers??[]).filter(t=>t.sourceId!==s.id),...(e.target.value?[{sourceId:s.id,targetId:e.target.value,year:plan.irpTransfers?.find(t=>t.sourceId===s.id)?.year??plan.startYear}]:[])])}>
                <option value="">별도 계좌로 유지</option>
                {plan.irpTransfers?.find(t=>t.sourceId===s.id)&&!plan.sources.some(x=>x.id===plan.irpTransfers?.find(t=>t.sourceId===s.id)?.targetId&&x.owner===s.owner&&x.taxType==='irp')&&<option value={plan.irpTransfers.find(t=>t.sourceId===s.id)!.targetId}>연결 확인 필요 · 다시 선택</option>}
                {plan.sources.filter(x=>x.id!==s.id&&x.owner===s.owner&&x.taxType==='irp').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
              {plan.irpTransfers?.find(t=>t.sourceId===s.id)&&<label className="block text-xs text-gray-300 mt-2">합칠 연도<input aria-label={`${s.name} 합칠 연도`} className={inputClass} type="number" min={new Date().getFullYear()} max="2200" step="1" value={plan.irpTransfers.find(t=>t.sourceId===s.id)!.year} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=new Date().getFullYear()&&n<=2200)onTransfers(plan.irpTransfers!.map(t=>t.sourceId===s.id?{...t,year:n}:t))}}/></label>}
              <p className="text-xs text-gray-400 mt-1">같은 명의만 선택합니다. 합산 연도에는 목돈 입금 → 계좌 이전 → 수령 순서이며, 이후 받는 계좌의 지급 기준을 사용합니다. 실제 금융기관 이체를 실행하는 기능은 아닙니다.</p>
            </div>}
          </>}
          <details className="text-xs text-gray-400"><summary className="cursor-pointer">기존 수동 인출 비율 (자동 재원 미설정 계좌만)</summary>
          <div className="grid sm:grid-cols-2 gap-3">
            <OptionalNumber label={`${s.name} 퇴직금 재원 비율 (%)`} value={p.retirementShare} max={100} onChange={n=>source(s.id,{retirementShare:n})}/>
            <OptionalNumber label={`${s.name} 과세제외 원금 비율 (%)`} value={p.exemptShare} max={100} onChange={n=>source(s.id,{exemptShare:n})}/>
          </div><p>재원 플래그·퇴직금 유입·합산으로 자동 계산하는 계좌에는 적용하지 않습니다. 이전 저장값은 보존합니다.</p></details>
          <div className="grid sm:grid-cols-2 gap-3">
            <OptionalNumber label={`${s.name} 이연퇴직소득세율 (국세 %)`} value={p.retirementTaxRate} max={100} onChange={n=>source(s.id,{retirementTaxRate:n})}/>
            <OptionalNumber label={`${s.name} 실제 첫 수령연도`} value={p.firstReceiptYear} max={2200} placeholder={`등록 개시연도 ${s.expectedStartYear??plan.startYear} 가정`} onChange={n=>source(s.id,{firstReceiptYear:n==null?undefined:Math.round(n)})}/>
          </div>
          <p className="text-xs text-gray-400">이연퇴직소득세율 = 이연퇴직소득세 ÷ 이연퇴직소득 × 100. 현재 잔액의 퇴직금에 대한 세율입니다. 새 목돈의 세율은 목돈 분배에서 별도 입력합니다. 자동 재원 계산은 기본 설정의 세율·첫 수령연도를 사용하며, 모르면 비워두세요.</p>
          <label className="block text-xs text-gray-300"><input type="checkbox" checked={p.lifetime??false} onChange={e=>source(s.id,{lifetime:e.target.checked})}/> 중도해지 불가 종신계약 확인 (개인납입·운용수익 부분)</label>
          {sourceYearOnly&&value.sourceYears?.[year]?.[s.id]&&<button className="text-xs text-blue-300 underline" type="button" onClick={()=>{const next={...value.sourceYears?.[year]};delete next[s.id];onChange({...value,sourceYears:{...value.sourceYears,[year]:next}})}}>이 연도 재원 설정 해제 · 기본 가정 사용</button>}
        </section>
      })}
      </details>
    </details>}
    <details className="border-t border-gray-700 pt-3 mt-3">
      <summary className="cursor-pointer text-sm">{year}년 해외세금·실제 기납부액·세액공제 (해당할 때만)</summary>
      <p className="text-xs text-gray-400 my-2">증명자료·세무 검토로 확인한 금액을 원화로 입력합니다. 외국납부세액은 자동으로 전액 공제하지 않습니다. 국가별 공제한도·이월·지방세 적용을 검토한 공제 가능액을 입력하세요. 이 값은 다른 연도에 복사하지 않습니다.</p>
      <div className="grid gap-3 sm:grid-cols-2">{(['husband','wife'] as const).map(owner=>{
        const p=value.years?.[year]?.[owner]??{},label=owner==='husband'?'남편':'아내'
        const fields:[keyof IncomeTaxYearAdjustment,string][]=[['foreignIncome','금융소득에 포함된 국외소득'],['foreignTaxPaid','외국납부세액'],['foreignCreditNational','확인된 외국납부 공제액 (국세)'],['foreignCreditLocal','확인된 외국납부 공제액 (지방세)'],['domesticWithholding','전체 국내 기납부세액 (국세+지방세)'],['nationalCredit','기타 세액공제 (국세)'],['localCredit','기타 세액공제 (지방세)']]
        return <section key={owner} className="min-w-0 space-y-3 rounded bg-gray-900/50 p-3"><h4 className="text-sm">{label} · {year}년만</h4>{fields.map(([key,title])=><OptionalNumber key={key} label={`${label} ${title} (원)`} value={p[key]} onChange={n=>yearly(owner,{[key]:n})}/>)}<p className="text-xs text-gray-400">국내 기납부액은 연금·금융·기타소득을 모두 합친 금액입니다. 기타 세액공제에는 배당·외국납부 공제를 중복 입력하지 마세요.</p></section>
      })}</div>
    </details>
  </details>
}
