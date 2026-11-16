import type {DependentAnalysis,DependentResult,DependentStatus} from '@/lib/nhiDependent'
import {DEPENDENT_INCOME_LIMIT,DEPENDENT_PROPERTY_HARD_LIMIT,DEPENDENT_PROPERTY_INCOME_LIMIT,DEPENDENT_PROPERTY_LIMIT,FINANCIAL_INCOME_EXEMPTION} from '@/lib/nhiDependent'
import {formatManwon} from '@/lib/utils'
import {Link} from 'react-router-dom'
import {hubLink} from '@/components/hub/sections'

const STATUS:Record<DependentStatus,{label:string;cls:string}>={
  eligible:{label:'가능',cls:'text-emerald-400'},ineligible:{label:'불가',cls:'text-red-400'},unknown:{label:'재산 미확인',cls:'text-amber-300'},
}
const won=(v:number)=>`${formatManwon(v)} (${Math.round(v).toLocaleString('ko-KR')}원)`

function Basis({r}:{r:DependentResult}){
  const i=r.income
  return <ul className="space-y-0.5 text-gray-300">
    <li>공적연금 100% 반영 {formatManwon(i.publicPension)} · 사적연금(IRP·연금저축) 제외 {formatManwon(i.privatePensionExcluded)}</li>
    <li>금융소득 {formatManwon(i.financial)} → 반영 {formatManwon(i.includedFinancial)} <span className="text-gray-500">(연 {formatManwon(FINANCIAL_INCOME_EXEMPTION)} {i.financial>FINANCIAL_INCOME_EXEMPTION?'초과: 전액 반영':'이하: 0 반영'})</span></li>
    <li>기타소득 {formatManwon(i.other)}</li>
    <li className="font-semibold">반영 소득 {formatManwon(i.countable)} / 상한 {formatManwon(r.incomeLimit)} <span className={STATUS[r.status].cls}>· {STATUS[r.status].label}</span></li>
    <li>재산 과표 추정 {r.propertyBase==null?'자료 없음(재산 기준 미적용)':formatManwon(r.propertyBase)}</li>
  </ul>
}

const BADGE:Record<DependentStatus,string>={eligible:'bg-emerald-500/20 text-emerald-300',ineligible:'bg-red-500/20 text-red-300',unknown:'bg-amber-500/20 text-amber-200'}
/** 가능/불가 배지 — 근거는 패널 안에 접어 둔다 */
export function DependentBadge({status}:{status:DependentStatus}){
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[status]}`} data-dependent-badge={status}>{STATUS[status].label}</span>
}

/** 건강보험 피부양자 계획 모형 — 표시 전용. 저장된 배분·배당률은 바꾸지 않는다. 결과는 배지, 근거·권고·기준은 접힘. */
export function DependentPanel({value,year}:{value:DependentAnalysis;year:number}){
  const v=value
  const head=v.status==='no-spouse'?'미혼(단독) 가정 — 피부양자 경로 없음':v.status==='wife-year-missing'?'와이프 은퇴 연도 미입력':v.status==='not-later'?'와이프가 먼저/같은 해 은퇴 — 피부양자 경로 미적용':`${v.window!.start}~${v.window!.end}년`
  const cur=v.years.find(y=>y.year===year)
  return <div className="space-y-3 text-xs" data-dependent-panel data-dependent-status={v.status}>
    <p className="text-gray-300">피부양자 기간(남편 은퇴 ≤ 연도 &lt; 와이프 은퇴): <b>{head}</b>
      {v.status==='wife-year-missing'&&<> <Link className="text-blue-300 underline" to={hubLink('people')}>와이프 은퇴 연도 입력 →</Link></>}</p>
    {v.status==='active'&&<>
      {cur?<div className="bg-gray-900/40 rounded p-2 space-y-2" data-dependent-year={year}>
        <p className="font-semibold text-gray-200">{year}년 · 현재 저장 가정 <DependentBadge status={cur.current.status}/>
          {cur.rebalance.allocation&&<> · 재배분 권고 후 <DependentBadge status={cur.rebalance.result.status}/></>}</p>
        <details data-dependent-basis><summary className="cursor-pointer text-gray-400">판정 근거</summary>
        <Basis r={cur.current}/>
        <p className="text-gray-400">{cur.current.reason}</p>
        <div className="border-t border-gray-700 pt-2 space-y-1" data-dependent-rebalance>
          <p className="font-semibold text-gray-200">목돈(전세 등) 배당 재배분 권고 · 남편 몫 증권 (저장값 미변경)</p>
          {!v.jeonseFound?<p className="text-gray-400">증권 배분이 있는 일반 목돈(목돈 분배에서 명의·배당 비율 지정)이 없고, 기존 데이터에서 이름에 "전세"/"보증금"이 포함된 목돈도 없어 재배분하지 않았습니다.</p>
          :cur.jeonseStock<=0&&cur.jeonseCash<=0?<p className="text-gray-400">이 연도에는 아직 수령 전이거나 배분된 대상 목돈이 없습니다.</p>
          :cur.rebalance.allocation?<>
            <table className="w-full text-right"><tbody>
              <tr><th className="text-left font-normal">배당투자 (남편 몫)</th><td>{won(cur.rebalance.allocation.dividendAmount)}</td></tr>
              <tr><th className="text-left font-normal">일반(성장)투자 (남편 몫) · 배당 0% 가정</th><td>{won(cur.rebalance.allocation.growthAmount)}</td></tr>
              <tr><th className="text-left font-normal">현금 · 이자 0% 가정(변경 없음)</th><td>{won(cur.rebalance.allocation.cashAmount)}</td></tr>
            </tbody></table>
            <p className="text-gray-300">적용 시 금융소득 {formatManwon(cur.rebalance.result.income.financial)} (1천만 원 절벽 대비 {cur.rebalance.result.income.financial<=FINANCIAL_INCOME_EXEMPTION?'이하':'초과'}) · 반영 소득 {formatManwon(cur.rebalance.result.income.countable)} / 상한 {formatManwon(cur.rebalance.result.incomeLimit)} · <span className={STATUS[cur.rebalance.result.status].cls}>{STATUS[cur.rebalance.result.status].label}</span></p>
          </>
          :cur.rebalance.mode==='none'?<p className="text-gray-400">대상 목돈의 남편 몫 증권 원금이 없거나(와이프 명의 등) 연금 시뮬레이션 연동이 꺼져 주식 배분을 알 수 없습니다. 현금은 그대로 두고 재배분을 권고하지 않습니다.</p>
          :<p className="text-red-300">배당을 0으로 줄여도 요건을 맞출 수 없어 재배분을 권고하지 않습니다. {cur.rebalance.baseline.reason}</p>}
        </div>
        </details>
      </div>:<p className="text-gray-400">선택한 {year}년은 피부양자 기간이 아닙니다. 아래 표에서 기간별 결과를 확인하세요.</p>}
      <details><summary className="cursor-pointer text-gray-400">연도별 결과</summary>
      <div className="overflow-x-auto"><table className="w-full text-right"><thead><tr><th className="text-left">연도</th><th>현재 가정</th><th>반영 소득</th><th>권고 배당</th><th>권고 일반</th><th>권고 후</th></tr></thead><tbody>
        {v.years.map(y=><tr key={y.year} className="border-t border-gray-700"><td className="text-left py-1">{y.year}</td>
          <td className={STATUS[y.current.status].cls}>{STATUS[y.current.status].label}</td><td>{formatManwon(y.current.income.countable)}</td>
          <td>{y.rebalance.allocation?formatManwon(y.rebalance.allocation.dividendAmount):'—'}</td><td>{y.rebalance.allocation?formatManwon(y.rebalance.allocation.growthAmount):'—'}</td>
          <td className={STATUS[y.rebalance.result.status].cls}>{STATUS[y.rebalance.result.status].label}</td></tr>)}
      </tbody></table></div>
      </details>
    </>}
    <details className="text-gray-400"><summary className="cursor-pointer">ⓘ 대상 목돈·판정 기준</summary>
    {v.jeonseItems.length>0&&<p className="text-gray-400">재배분 대상 목돈: {v.jeonseItems.map(j=>`${j.name||'목돈'}(${j.receiveYear}년 ${formatManwon(j.amount)} · ${j.basis==='keyword'?'이름 기준':'분배 설정 기준'}${j.husbandShare===0?' · 와이프 명의':j.husbandShare===1?' · 남편 명의':''}${(j.dividendRatio??100)<100?` · 배당 ${Math.round(j.dividendRatio!)}%`:''})`).join(', ')}</p>}
    <p className="text-gray-400">기준(2022 부과체계 개편 후, 시행규칙 별표 1의2·제44조 실무 해석): 소득 {formatManwon(DEPENDENT_INCOME_LIMIT)} 이하 · 재산 과표 {formatManwon(DEPENDENT_PROPERTY_LIMIT)} 이하는 소득만 / {formatManwon(DEPENDENT_PROPERTY_LIMIT)} 초과~{formatManwon(DEPENDENT_PROPERTY_HARD_LIMIT)} 이하는 소득 {formatManwon(DEPENDENT_PROPERTY_INCOME_LIMIT)} 이하 / {formatManwon(DEPENDENT_PROPERTY_HARD_LIMIT)} 초과 불가.</p>
    {v.notes.map(n=><p key={n} className="text-gray-400">{n}</p>)}
    </details>
    <p className="text-amber-300/80">계획 모형이며 공단의 자격 판정이 아닙니다.</p>
  </div>
}
