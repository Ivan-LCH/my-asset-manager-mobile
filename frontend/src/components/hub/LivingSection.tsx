// 허브 ② 생활비·여행·의료 — 기존 「생활비·목돈 입력」의 생활비 블록을 옮김. 저장: RetirementPlan(고친 키만).
import { AmountInput, MoreInfo } from '@/components/sim'
import { ExpensesSection, TravelSection } from '@/components/retirement/PrepEditors'
import { formatManwon } from '@/lib/utils'
import type { RetirementPlan } from '@/types'
import { useRetirementDraft } from './drafts'
import { SaveBar } from './SaveBar'

/** 월 지출 요약(헤더 배지용) — 기존 화면 배지와 같은 식 */
export const livingMonthly = (plan: Pick<RetirementPlan, 'expenses' | 'travel' | 'medicalMonthly'>) =>
  plan.expenses.reduce((s, e) => s + e.amount, 0) + plan.travel.reduce((s, t) => s + (t.phase1Times * t.costPerTrip) / 12, 0) + plan.medicalMonthly

export function LivingSection() {
  const { plan, update, dirty, save, saving, error, ready } = useRetirementDraft()
  if (!ready) return <p role="status" className="text-sm text-gray-400">불러오는 중…</p>
  return (
    <div className="space-y-5" data-living-editor>
      <p className="text-sm text-gray-300">한 달에 <b className="text-blue-300">{formatManwon(livingMonthly(plan))}</b> 정도 써요 (여행·의료 포함).</p>
      <div className="rounded border border-gray-700 p-3 text-xs space-y-2">
        <p className="font-semibold text-gray-200">금액 기준연도·물가상승률</p>
        <div className="flex flex-wrap gap-3">
          <label>기준연도 <input aria-label="생활비 기준연도" type="number" min="1900" max="2200" value={plan.expenseBaseYear??new Date().getFullYear()} onChange={e=>{const y=Number(e.target.value);if(Number.isInteger(y)&&y>=1900&&y<=2200)update('expenseBaseYear',y)}} className="w-20 bg-gray-800 border border-gray-600 rounded p-2" /></label>
          <label>연 증가율 <input aria-label="생활비 물가상승률" type="number" min="-99" max="100" step="0.1" placeholder="미설정" value={plan.expenseInflationRate??''} onChange={e=>{const n=e.target.value===''?undefined:Number(e.target.value);if(n==null||Number.isFinite(n)&&n>=-99&&n<=100){update('expenseInflationRate',n);if(plan.expenseBaseYear==null)update('expenseBaseYear',new Date().getFullYear())}}} className="w-20 bg-gray-800 border border-gray-600 rounded p-2" /> %</label>
        </div>
        <MoreInfo>미설정은 기존 고정 금액을 유지합니다. 기준연도 이후 생활비·여행비·의료비에만 복리 적용하며, 목돈·일회 지출·세금·건보에는 중복 적용하지 않습니다. 아래 입력값 자체는 바뀌지 않습니다.</MoreInfo>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpensesSection items={plan.expenses} onChange={(v) => update('expenses', v)} />
        <div className="space-y-5">
          <TravelSection items={plan.travel} onChange={(v) => update('travel', v)} />
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs font-semibold text-gray-400 mb-3">🏥 의료비 적립</p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">월 적립액</span>
              <div className="w-40"><AmountInput value={plan.medicalMonthly} onChange={(v) => update('medicalMonthly', v)} /></div>
              <span className="text-xs text-gray-500">/월</span>
            </div>
          </div>
        </div>
      </div>
      <SaveBar label="생활비·여행·의료" dirty={dirty} saving={saving} error={error} onSave={() => void save().catch(() => {})} />
    </div>
  )
}
