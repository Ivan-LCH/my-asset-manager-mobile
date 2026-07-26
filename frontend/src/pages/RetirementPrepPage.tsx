// 은퇴 준비 — 입력 전용 페이지.
// 생활비/여행/의료비 + 목돈수입/긴급자금 + IRP 투자 포트폴리오.
// 결과는 연금시뮬 / 법인시뮬 / 현금흐름(은퇴계획)에서 확인.
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RotateCcw, Save, ChevronDown, RefreshCw } from 'lucide-react'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { usePortfolio, useSavePortfolio, DEFAULT_PORTFOLIO } from '@/hooks/usePortfolio'
import { blendedYield } from '@/lib/corpSim'
import { formatManwon, cn } from '@/lib/utils'
import type {
  RetirementPlan, ExpenseItem, TravelItem, LumpsumItem, EmergencyItem,
  PortfolioHolding, PortfolioYield, PensionSimPlan,
} from '@/types'
import { EMPTY_PENSION_PLAN } from '@/lib/pensionSim'

const uid = () => Math.random().toString(36).slice(2, 9)

const DEFAULT_EXPENSES: ExpenseItem[] = [
  { id: uid(), name: '식비',       amount: 600_000 },
  { id: uid(), name: '주거관리비', amount: 200_000 },
  { id: uid(), name: '교통비',     amount: 150_000 },
  { id: uid(), name: '통신비',     amount: 80_000  },
  { id: uid(), name: '문화/여가',  amount: 200_000 },
  { id: uid(), name: '의복/미용',  amount: 100_000 },
  { id: uid(), name: '경조사비',   amount: 100_000 },
  { id: uid(), name: '기타잡비',   amount: 150_000 },
]

// ── 유틸/헬퍼 ──────────────────────────────────────────────
function numFmt(v: number | string) {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
  return isNaN(n) ? '' : n.toLocaleString()
}
function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

function Expander({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 text-left hover:bg-gray-750 transition-colors">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate">{title}</span>
          {badge && <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-gray-700 space-y-5">{children}</div>}
    </div>
  )
}

function AmountInput({ value, onChange, placeholder = '금액' }: {
  value: number; onChange: (v: number) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input type="text" inputMode="numeric"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 text-right"
      placeholder={placeholder} value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => { const n = parseNum(raw); onChange(n); setRaw(n > 0 ? numFmt(n) : '') }} />
  )
}

function TextInput({ value, onChange, placeholder = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input type="text"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)} />
  )
}

function YearInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" inputMode="decimal"
      className="w-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
  )
}

function TimesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" inputMode="decimal" min={0}
      className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 text-center"
      value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
  )
}

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
              <p className="text-[11px] text-blue-400">
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
                <p className="text-[10px] text-gray-500 mb-1">수령 연도</p>
                <YearInput value={item.receiveYear} onChange={(v) => update(item.id, 'receiveYear', v)} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">금액</p>
                <AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} />
              </div>
            </div>
            <div className="flex gap-1">
              {([['other', '일반(비과세)'], ['severance', '퇴직소득세 적용']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => update(item.id, 'taxKind', v)}
                  className={`flex-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${(item.taxKind ?? 'other') === v ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600">{item.receiveYear}년에 {formatManwon(item.amount)} 일회 수령</p>
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
              <TextInput value={item.name} onChange={(v) => update(item.id, 'name', v)} placeholder="항목명 (예: 아들 결혼)" />
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
function PortfolioSection() {
  const { data: saved } = usePortfolio()
  const saveMut = useSavePortfolio()
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(DEFAULT_PORTFOLIO.holdings)
  const [yieldVal, setYieldVal] = useState(0)
  const [yields, setYields] = useState<PortfolioYield[]>([])
  const [manual, setManual] = useState<{ ticker: string; yield: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (saved) {
      setHoldings(saved.holdings)
      setYieldVal(saved.blendedYield)
      setManual(saved.manualYields ?? [])
    }
  }, [saved])

  const manualYieldOf = (ticker: string) => manual.find((m) => m.ticker === ticker)?.yield
  const setManualYield = (ticker: string, y: number) => {
    setManual((prev) => [...prev.filter((m) => m.ticker !== ticker), { ticker, yield: y }])
    setDirty(true)
  }
  // 단일 종목 자동 산정 — 티커 입력/Enter 시 배당률+상승률 fetch & 저장
  const autoFetchOne = async (ticker: string, idx: number) => {
    try {
      const r = await fetch(`/api/yield?ticker=${encodeURIComponent(ticker)}`)
      if (!r.ok) return
      const d = await r.json()
      // 배당률 저장 (manual=false → 자동값)
      const newYields = [...yieldEntries()]
      const yi = newYields.findIndex((y) => y.ticker === ticker)
      const yieldVal = d.avg3yYield ?? 0
      if (yieldVal > 0) {
        if (yi >= 0) newYields[yi] = { ticker, yield: yieldVal, manual: false }
        else newYields.push({ ticker, yield: yieldVal, manual: false })
      }
      // 상승률 + 종목명 저장
      const growth = d.avg3yGrowth
      const name = d.name
      const p = [...holdings]
      if (idx < p.length) p[idx] = { ...p[idx], growthRate: growth ?? p[idx].growthRate, name: name ?? p[idx].name }
      setHoldings(p)
      // blendedYield 갱신
      const blended = blendedYield(newYields, p)
      setYieldVal(Math.round(blended * 100) / 100)
      setYields(newYields)
      setDirty(true)
    } catch { /* 폴백: 수동 입력 대기 */ }
  }
  // yields 배열을 PortfolioYield[]로 변환 (yieldEntries 헬퍼)
  const yieldEntries = (): PortfolioYield[] => {
    return holdings.map((h) => {
      const m = manualYieldOf(h.ticker)
      if (typeof m === 'number') return { ticker: h.ticker, yield: m, manual: true }
      const f = yields.find((v) => v.ticker === h.ticker)
      return { ticker: h.ticker, yield: f?.yield ?? 0 }
    })
  }
  const fetchYields = async () => {
    setLoading(true); setError('')
    const tickers = holdings.map((h) => h.ticker).filter(Boolean)
    if (tickers.length === 0) { setError('종목을 먼저 입력하세요.'); setLoading(false); return }
    const manualMap = new Map(manual.map((m) => [m.ticker, m.yield]))
    const results: PortfolioYield[] = await Promise.all(tickers.map(async (t) => {
      if (manualMap.has(t)) return { ticker: t, yield: manualMap.get(t) as number, manual: true }
      try {
        const r = await fetch(`/api/yield?ticker=${encodeURIComponent(t)}`)
        if (!r.ok) return { ticker: t, yield: 0 }
        const d = await r.json()
        return { ticker: t, yield: d.avg3yYield ?? 0 }
      } catch { return { ticker: t, yield: 0 } }
    }))
    // growthRate도 자동 산정
    const newHoldings = [...holdings]
    for (let i = 0; i < tickers.length; i++) {
      try {
        const r = await fetch(`/api/yield?ticker=${encodeURIComponent(tickers[i])}`)
        if (r.ok) {
          const d = await r.json()
          if (d.avg3yGrowth != null) {
            const idx = newHoldings.findIndex((h) => h.ticker === tickers[i])
            if (idx >= 0) newHoldings[idx] = { ...newHoldings[idx], growthRate: d.avg3yGrowth }
          }
        }
      } catch { /* growth 폴백: 수동값 유지 */ }
    }
    setHoldings(newHoldings)
    setYields(results)
    setYieldVal(Math.round(blendedYield(results, holdings) * 100) / 100)
    setDirty(true); setLoading(false)
    const ok = results.filter((r) => r.yield > 0).length
    if (ok === 0) setError(`${tickers.length}개 종목 조회 실패. 행별 수동 입력하세요.`)
    else if (ok < tickers.length) setError(`${tickers.length - ok}개 종목 조회 실패 (수동 입력 필요).`)
  }

  return (
    <Section>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400">📊 IRP 투자 포트폴리오 (종목·비중·배당률·상승률)</p>
        <button onClick={() => {
          // 저장 시 auto-fetched 배당률도 manualYields에 병합 → 영구 저장
          const allYields = yieldEntries().filter((y) => y.yield > 0).map((y) => ({ ticker: y.ticker, yield: y.yield }))
          saveMut.mutate({ holdings, blendedYield: yieldVal, manualYields: allYields }, { onSuccess: () => setDirty(false) })
        }}
          disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />{saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        IRP 계좌의 종목·비중. 티커 입력 후 Enter → 배당률·상승률 자동 산정 (Yahoo 3년 평균). 수동 수정 가능.
      </p>
      <div className="space-y-2">
        {holdings.map((h, i) => {
          const m = manualYieldOf(h.ticker)
          const y = yields.find((v) => v.ticker === h.ticker)?.yield
          const effective = typeof m === 'number' ? m : y
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="w-28 shrink-0">
                <input type="text"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  value={h.ticker}
                  onChange={(e) => { const p = [...holdings]; p[i] = { ...p[i], ticker: e.target.value.toUpperCase() }; setHoldings(p); setDirty(true) }}
                  onBlur={(e) => { const t = e.target.value.trim().toUpperCase(); if (t) void autoFetchOne(t, i) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                  placeholder="TICKER" />
                {h.name && h.name !== h.ticker && (
                  <p className="text-[9px] text-gray-500 truncate mt-0.5">{h.name}</p>
                )}
              </div>
              <input type="number" inputMode="decimal"
                className="w-16 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-gray-100 text-center focus:outline-none focus:border-blue-500"
                value={h.weight || ''}
                onChange={(e) => { const p = [...holdings]; p[i] = { ...p[i], weight: Number(e.target.value) }; setHoldings(p); setDirty(true) }} />
              <span className="text-xs text-gray-500">비중</span>
              <input type="number" inputMode="decimal" placeholder="수동%"
                className={cn('w-20 bg-gray-700 border rounded-lg px-2 py-2 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500',
                  typeof m === 'number' ? 'border-emerald-600 text-emerald-300' : 'border-gray-600')}
                value={effective ?? ''}
                onChange={(e) => h.ticker && setManualYield(h.ticker, Number(e.target.value))}
                title="조회 실패 시 수동 배당률 입력" />
              <input type="number" inputMode="decimal" placeholder="상승%"
                className="w-16 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-cyan-300 text-right focus:outline-none focus:border-cyan-500"
                value={h.growthRate ?? ''}
                onChange={(e) => { const p = [...holdings]; p[i] = { ...p[i], growthRate: Number(e.target.value) }; setHoldings(p); setDirty(true) }}
                title="연평균 주가상승률(%)" />
              <button onClick={() => { setHoldings(holdings.filter((_, j) => j !== i)); setDirty(true) }} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0 text-xs">삭제</button>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => { setHoldings([...holdings, { ticker: '', weight: 1 }]); setDirty(true) }}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">＋ 종목 추가</button>
        <span className="text-xs text-blue-400 font-semibold">가중평균 배당 {yieldVal > 0 ? `${yieldVal}%` : '-'} · 상승률 {(() => {
          const hs = holdings.filter((h) => h.weight > 0 && (h.growthRate ?? 0) > 0)
          const tw = hs.reduce((s, h) => s + h.weight, 0)
          return tw > 0 ? `${(hs.reduce((s, h) => s + (h.growthRate ?? 0) * h.weight / tw, 0)).toFixed(1)}%` : '-'
        })()}</span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </Section>
  )
}

// ── 과세 기준 설정 섹션 (PensionSimPlan 편집) ─────────────
function PensionSettingsSection() {
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const [plan, setPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (saved) setPlan({ ...EMPTY_PENSION_PLAN, ...saved })
  }, [saved])

  const update = useCallback(<K extends keyof PensionSimPlan>(key: K, val: PensionSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  return (
    <Section>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400">⚙️ 과세 기준 (종합소득공제 등)</p>
        <button onClick={() => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })}
          disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />{saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>
      <p className="text-[11px] text-gray-600">수령개시연도·기간·월수령액은 연금 자산(/pension)에서 개별 설정. 아래는 과세 계산 공통 기준.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-gray-500 mb-1">기타 종합소득(연)</p>
          <AmountInput value={plan.otherIncome} onChange={(v) => update('otherIncome', v)} placeholder="남편 근로/사업" />
        </div>
      </div>
      <p className="text-[11px] text-gray-600">연금소득공제 1,200만원은 법정 고정액으로 자동 적용.</p>
      <div className="border-t border-gray-700 pt-2">
        <p className="text-xs font-semibold text-gray-400 mb-1.5">종합소득공제 (1인별 자동)</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={plan.spouseDependent} onChange={(e) => update('spouseDependent', e.target.checked)} className="accent-blue-500" />
            배우자 부양
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={plan.useStandardDeduction} onChange={(e) => update('useStandardDeduction', e.target.checked)} className="accent-blue-500" />
            표준공제 100만 사용
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            부양가족 수
            <button type="button" onClick={() => update('dependents', Math.max(0, plan.dependents - 1))} className="w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200">−</button>
            <span className="w-5 text-center text-gray-100">{plan.dependents}</span>
            <button type="button" onClick={() => update('dependents', Math.min(5, plan.dependents + 1))} className="w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200">+</button>
          </label>
        </div>
        <p className="text-[11px] text-gray-600 mt-1">1인별 공제 = 본인 150만 + (배우자·부양가족·표준) ÷ 2</p>
      </div>
    </Section>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function RetirementPrepPage() {
  const { data: saved } = useRetirement()
  const saveMut = useSaveRetirement()
  const [plan, setPlan] = useState<RetirementPlan | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (saved && Object.keys(saved).length > 0) {
      setPlan({
        expenses: saved.expenses ?? DEFAULT_EXPENSES,
        travel: saved.travel ?? [],
        medicalMonthly: saved.medicalMonthly ?? 200_000,
        lumpsum: (saved.lumpsum ?? []).map((l) => ({
          ...l,
          taxKind: ((l as { taxKind?: string }).taxKind === 'rental' ? 'other' : (l.taxKind ?? 'other')) as LumpsumItem['taxKind'],
        })),
        emergency: saved.emergency ?? [],
        retirementYear: saved.retirementYear ?? new Date().getFullYear() + 10,
        healthInsurance: saved.healthInsurance ?? { interestDividendIncome: 0, pensionIncome: 0, otherIncome: 0, propertyTaxBase: 0, rentalDeposit: 0, carValue: 0, scorePerPoint: 208.4, autoLinkPension: true, autoLinkDividend: true },
        linkCorpSim: saved.linkCorpSim ?? false,
        linkPensionSim: saved.linkPensionSim ?? false,
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => (p ? { ...p, [key]: val } : p))
    setDirty(true)
  }, [])

  const handleSave = () => {
    if (plan) saveMut.mutate(plan, { onSuccess: () => setDirty(false) })
  }

  if (!plan) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100">📝 은퇴 준비 (입력)</h2>
          <p className="text-xs text-gray-500 mt-0.5">생활비·목돈·IRP 포트폴리오 입력. 결과는 연금시뮬 / 법인시뮬 / 현금흐름에서 확인.</p>
        </div>
        <button onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 shrink-0">
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <Expander title="✏️ 💰 생활비 / 여행 / 의료비"
        badge={`월 ${formatManwon(plan.expenses.reduce((s, e) => s + e.amount, 0) + plan.travel.reduce((s, t) => s + (t.phase1Times * t.costPerTrip) / 12, 0) + plan.medicalMonthly)}`}
        defaultOpen>
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

      <Expander title="✏️ 💎 목돈 수입 / 긴급자금" badge={`${plan.lumpsum.length + plan.emergency.length}건`} defaultOpen>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LumpsumSection items={plan.lumpsum} onChange={(v) => update('lumpsum', v)} />
          <EmergencySection items={plan.emergency} onChange={(v) => update('emergency', v)} />
        </div>
      </Expander>

      <Expander title="⚙️ 과세 기준 설정" badge="공제">
        <PensionSettingsSection />
      </Expander>

      <Expander title="📊 IRP 투자 포트폴리오" badge="종목·비중·배당률">
        <PortfolioSection />
      </Expander>
    </div>
  )
}
