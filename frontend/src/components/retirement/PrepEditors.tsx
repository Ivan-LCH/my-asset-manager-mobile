// 은퇴 준비 입력 편집기 — 기존 「생활비·목돈 입력」 화면(RetirementPrepPage)에서 그대로 옮김.
// 허브 ② 생활비·여행·의료 / ③ 목돈·행선지 / ④ 연금·주식 가정 섹션에서 쓴다.
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { AmountInput, TextInput, YearInput, TimesInput, Section, MoreInfo } from '@/components/sim'
import { formatManwon } from '@/lib/utils'
import type { ExpenseItem, TravelItem, EmergencyItem, PortfolioSettings } from '@/types'
import { uid, DEFAULT_EXPENSES } from '@/lib/retirementPlan'

// ── 월 생활비 섹션 ─────────────────────────────────────────
export function ExpensesSection({ items, onChange }: { items: ExpenseItem[]; onChange: (items: ExpenseItem[]) => void }) {
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
export function TravelSection({ items, onChange }: { items: TravelItem[]; onChange: (items: TravelItem[]) => void }) {
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

// ── 긴급자금 섹션 ──────────────────────────────────────────
export function EmergencySection({ items, onChange }: { items: EmergencyItem[]; onChange: (items: EmergencyItem[]) => void }) {
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
export function PortfolioSection({ value, onChange }: {
  value: PortfolioSettings; onChange: (patch: Partial<PortfolioSettings>) => void
}) {
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">📊 IRP 투자 포트폴리오 (배당률·상승률)</p>
      <MoreInfo>
        종목 입력 없이 <b>계좌 전체 배당률·상승률</b>만 입력합니다. 퇴직시점 잔액 성장·배당 산정 · 법인시뮬과 공유. 섹션 저장 버튼으로 저장.
      </MoreInfo>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">연평균 배당률</p>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal" aria-label="IRP 배당률"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
              value={value.dividendYield || ''} onChange={(e) => onChange({ dividendYield: Number(e.target.value) })} />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">연평균 주가상승률</p>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal" aria-label="IRP 상승률"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-cyan-300 text-right focus:outline-none focus:border-cyan-500"
              value={value.growthRate || ''} onChange={(e) => onChange({ growthRate: Number(e.target.value) })} />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
      </div>
    </Section>
  )
}
