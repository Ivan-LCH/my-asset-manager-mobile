import { useSettings } from '@/hooks/useSettings'
import { Link } from 'react-router-dom'
import { retirementInputs } from '@/lib/analysisInputs'
// 은퇴 준비 — 입력 전용 페이지.
// 생활비/여행/의료비 + 목돈수입/긴급자금 + IRP 투자 포트폴리오.
// 결과는 연금시뮬 / 법인시뮬 / 현금흐름(은퇴계획)에서 확인.
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, RotateCcw, Save } from 'lucide-react'
import { Expander, AmountInput, TextInput, YearInput, TimesInput, Section, InfoNote } from '@/components/sim'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { usePortfolio, useSavePortfolio, DEFAULT_PORTFOLIO } from '@/hooks/usePortfolio'
import { formatManwon, cn } from '@/lib/utils'
import type {
  RetirementPlan, ExpenseItem, TravelItem, LumpsumItem, EmergencyItem,
  PortfolioSettings,
} from '@/types'
import { uid, DEFAULT_EXPENSES, normalizeSavedPlan } from '@/lib/retirementPlan'

// ── 유틸/헬퍼 ──────────────────────────────────────────────

// ── 월 생활비 섹션 ─────────────────────────────────────────
function ExpensesSection({ items, onChange }: { items: ExpenseItem[]; onChange: (items: ExpenseItem[]) => void }) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  const update = (id: string, field: keyof ExpenseItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">💰 월 생활비</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <TextInput value={item.name} onChange={(v) => update(item.id, 'name', v)} placeholder="항목명" />
            <div className="w-36 shrink-0"><AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} /></div>
            <button onClick={() => onChange(items.filter((i) => i.id !== item.id))} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <button onClick={() => onChange([...items, { id: uid(), name: '', amount: 0 }])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus className="w-3 h-3" /> 항목 추가</button>
          <button onClick={() => onChange(DEFAULT_EXPENSES.map((e) => ({ ...e, id: uid() })))} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"><RotateCcw className="w-3 h-3" /> 기본값</button>
        </div>
        <p className="text-sm font-bold text-gray-100">합계 <span className="text-blue-400">{formatManwon(total)}/월</span></p>
      </div>
    </Section>
  )
}

// ── 여행비 섹션 ────────────────────────────────────────────
function TravelSection({ items, onChange }: { items: TravelItem[]; onChange: (items: TravelItem[]) => void }) {
  const update = (id: string, field: keyof TravelItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">✈️ 여행비</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-gray-750 border border-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={item.name} onChange={(v) => update(item.id, 'name', v)} placeholder="여행 종류 (예: 국내여행)" />
              <div className="w-32 shrink-0"><AmountInput value={item.costPerTrip} onChange={(v) => update(item.id, 'costPerTrip', v)} placeholder="회당 금액" /></div>
              <button onClick={() => onChange(items.filter((i) => i.id !== item.id))} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <TimesInput value={item.phase1Times} onChange={(v) => update(item.id, 'phase1Times', v)} />
              <span>회/년</span>
              <YearInput value={item.phase1Until} onChange={(v) => update(item.id, 'phase1Until', v)} />
              <span>년까지, 이후</span>
              <TimesInput value={item.phase2Times} onChange={(v) => update(item.id, 'phase2Times', v)} />
              <span>회/년</span>
            </div>
            {item.costPerTrip > 0 && (
              <p className="text-xs text-blue-400">
                → ~{item.phase1Until}년: {formatManwon(item.phase1Times * item.costPerTrip / 12)}/월
                &nbsp;·&nbsp;
                이후: {formatManwon(item.phase2Times * item.costPerTrip / 12)}/월
              </p>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, { id: uid(), name: '', costPerTrip: 0, phase1Times: 4, phase1Until: 2045, phase2Times: 1 }])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus className="w-3 h-3" /> 추가</button>
    </Section>
  )
}

// ── 목돈 수입 섹션 ─────────────────────────────────────────
function LumpsumSection({ items, onChange }: { items: LumpsumItem[]; onChange: (items: LumpsumItem[]) => void }) {
  const update = (id: string, field: keyof LumpsumItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">💎 목돈 수입 (전세금·퇴직금 등)</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="bg-gray-750 rounded-lg border border-gray-700 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TextInput value={item.name} onChange={(v) => update(item.id, 'name', v)} placeholder="항목명 (예: 전세금 반환)" />
              <button onClick={() => onChange(items.filter((i) => i.id !== item.id))} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">수령 연도</p>
                <YearInput value={item.receiveYear} onChange={(v) => update(item.id, 'receiveYear', v)} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">금액</p>
                <AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} />
              </div>
            </div>
            <div className="flex gap-1">
              {([['other', '일반(비과세)'], ['severance', '퇴직소득세 적용']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => update(item.id, 'taxKind', v)}
                  className={`flex-1 px-1.5 py-0.5 text-xs rounded transition-colors ${(item.taxKind ?? 'other') === v ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600">{item.receiveYear}년에 {formatManwon(item.amount)} 일회 수령</p>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, { id: uid(), name: '', receiveYear: 2030, amount: 0 }])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus className="w-3 h-3" /> 추가</button>
    </Section>
  )
}

// ── 긴급자금 섹션 ──────────────────────────────────────────
function EmergencySection({ items, onChange }: { items: EmergencyItem[]; onChange: (items: EmergencyItem[]) => void }) {
  const update = (id: string, field: keyof EmergencyItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">🚨 긴급자금 (일회성 지출)</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:flex-1 min-w-0">
              <TextInput value={item.name} onChange={(v) => update(item.id, 'name', v)} placeholder="항목명 (예: 자녀 결혼자금)" />
            </div>
            <YearInput value={item.year} onChange={(v) => update(item.id, 'year', v)} />
            <div className="w-28 sm:w-36 shrink-0"><AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} /></div>
            <button onClick={() => onChange(items.filter((i) => i.id !== item.id))} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, { id: uid(), name: '', year: 2030, amount: 0 }])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus className="w-3 h-3" /> 추가</button>
    </Section>
  )
}

// ── IRP 투자 포트폴리오 섹션 ───────────────────────────────
function PortfolioSection({ value, onChange }: {
  value: PortfolioSettings; onChange: (patch: Partial<PortfolioSettings>) => void
}) {
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">📊 IRP 투자 포트폴리오 (배당률·상승률)</p>
      <InfoNote summary="배당률·상승률만 입력 → 퇴직시점 자동 산정">
        종목 입력 없이 <b>계좌 전체 배당률·상승률</b>만 입력합니다. 퇴직시점 잔액 성장·배당 산정 · 법인시뮬과 공유. 상단 저장 버튼으로 저장.
      </InfoNote>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">연평균 배당률</p>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
              value={value.dividendYield || ''} onChange={(e) => onChange({ dividendYield: Number(e.target.value) })} />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">연평균 주가상승률</p>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-cyan-300 text-right focus:outline-none focus:border-cyan-500"
              value={value.growthRate || ''} onChange={(e) => onChange({ growthRate: Number(e.target.value) })} />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function RetirementPrepPage() {
  const { data: saved } = useRetirement()
  const saveMut = useSaveRetirement()
  const {data:settings}=useSettings()
  const { data: portfolioSaved } = usePortfolio()
  const portfolioSaveMut = useSavePortfolio()
  const [plan, setPlan] = useState<RetirementPlan | null>(null)
  const [dirty, setDirty] = useState(false)
  const editedFields = useRef(new Set<keyof RetirementPlan>())
  const editVersion = useRef(0)
  const [portfolio, setPortfolio] = useState<PortfolioSettings>(DEFAULT_PORTFOLIO)
  const [portfolioDirty, setPortfolioDirty] = useState(false)

  useEffect(() => {
    if (saved && !dirty) {
      setPlan(retirementInputs(saved,settings).plan)
    }
  }, [saved,settings,dirty])

  useEffect(() => { if (portfolioSaved) setPortfolio(portfolioSaved) }, [portfolioSaved])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => (p ? { ...p, [key]: val } : p))
    editedFields.current.add(key)
    editVersion.current += 1
    setDirty(true)
  }, [])

  const updatePortfolio = useCallback((patch: Partial<PortfolioSettings>) => {
    setPortfolio((p) => ({ ...p, ...patch }))
    setPortfolioDirty(true)
  }, [])

  const handleSave = () => {
    if (plan && dirty) {
      const version = editVersion.current
      const patch = Object.fromEntries([...editedFields.current].map((key) => [key, plan[key]])) as Partial<RetirementPlan>
      saveMut.mutate(patch, { onSuccess: () => {
        // 저장 중 추가된 편집은 미저장 상태로 유지한다.
        if (editVersion.current === version) {
          editedFields.current.clear()
          setDirty(false)
        }
      } })
    }
    if (portfolioDirty) portfolioSaveMut.mutate(portfolio, { onSuccess: () => setPortfolioDirty(false) })
  }
  const anyDirty = dirty || portfolioDirty
  const saving = saveMut.isPending || portfolioSaveMut.isPending

  if (!plan) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {(saveMut.isError || portfolioSaveMut.isError) && (
        <p role="alert" className="rounded-lg border border-red-700 p-3 text-sm text-red-300">
          저장하지 못했습니다. 입력은 유지되어 있습니다. 다시 저장해 주세요.
        </p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100">📝 은퇴 준비 (입력)</h2>
          <p className="text-xs text-gray-500 mt-0.5">기존 생활비와 목돈만 수정하세요. 저장하면 분석 요약과 현금흐름에 함께 반영됩니다.</p>
        </div>
        <button onClick={handleSave} disabled={!anyDirty || saving}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 shrink-0">
          <Save className="w-4 h-4" />
          {saving ? '저장 중...' : anyDirty ? '저장' : '저장됨'}
        </button>
      </div>

      <Link className="inline-block text-sm text-blue-300" to="/analysis">← 분석 요약으로 돌아가기</Link>
      <Expander title="✏️ 💰 생활비 / 여행 / 의료비"
        badge={`월 ${formatManwon(plan.expenses.reduce((s, e) => s + e.amount, 0) + plan.travel.reduce((s, t) => s + (t.phase1Times * t.costPerTrip) / 12, 0) + plan.medicalMonthly)}`}>
        <div className="rounded border border-gray-700 p-3 mb-4 text-xs space-y-2">
          <p className="font-semibold text-gray-200">입력 금액의 기준연도·물가상승률</p>
          <div className="flex flex-wrap gap-3">
            <label>기준연도 <input aria-label="생활비 기준연도" type="number" min="1900" max="2200" value={plan.expenseBaseYear??new Date().getFullYear()} onChange={e=>{const y=Number(e.target.value);if(Number.isInteger(y)&&y>=1900&&y<=2200)update('expenseBaseYear',y)}} className="w-20 bg-gray-800 border border-gray-600 rounded p-2" /></label>
            <label>연 증가율 <input aria-label="생활비 물가상승률" type="number" min="-99" max="100" step="0.1" placeholder="미설정" value={plan.expenseInflationRate??''} onChange={e=>{const n=e.target.value===''?undefined:Number(e.target.value);if(n==null||Number.isFinite(n)&&n>=-99&&n<=100){update('expenseInflationRate',n);if(plan.expenseBaseYear==null)update('expenseBaseYear',new Date().getFullYear())}}} className="w-20 bg-gray-800 border border-gray-600 rounded p-2" /> %</label>
          </div>
          <p className="text-gray-400">미설정은 기존 고정 금액을 유지합니다. 기준연도 이후 생활비·여행비·의료비에만 복리 적용하며, 목돈·일회 지출·세금·건보에는 중복 적용하지 않습니다. 아래 입력값 자체는 바뀌지 않습니다.</p>
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
      </Expander>

      <Expander title="✏️ 💎 목돈 수입 / 긴급자금" badge={`${plan.lumpsum.length + plan.emergency.length}건`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LumpsumSection items={plan.lumpsum} onChange={(v) => update('lumpsum', v)} />
          <EmergencySection items={plan.emergency} onChange={(v) => update('emergency', v)} />
        </div>
      </Expander>

      <Expander title="📊 IRP 투자 포트폴리오" badge="배당률·상승률">
        <PortfolioSection value={portfolio} onChange={updatePortfolio} />
      </Expander>
    </div>
  )
}
