import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RotateCcw, Save, ChevronDown } from 'lucide-react'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { useDividendSummary } from '@/hooks/useDividends'
import { useCorpSim } from '@/hooks/useCorpSim'
import { computeCorp, salariedCount } from '@/lib/corpSim'
import { formatMoney, formatManwon } from '@/lib/utils'
import type {
  Asset, PensionDetail, StockDetail, SavingsDetail,
  RetirementPlan, ExpenseItem, TravelItem, LumpsumItem, EmergencyItem,
  HealthInsuranceInputs,
} from '@/types'

// ── 연금 시뮬레이션 (PensionPage와 동일 로직) ──────────────
const SIM_START_YEAR = 2029

function calcPensionByYear(assets: Asset[], currentAge: number): Map<number, number> {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + (100 - currentAge)
  const map = new Map<number, number>()
  for (let year = SIM_START_YEAR; year <= endYear; year++) {
    let monthly = 0
    for (const a of assets) {
      if (a.type === 'PENSION') {
        const d = a.detail as PensionDetail | undefined
        if (!d) continue
        if (year >= d.expectedStartYear && year <= d.expectedEndYear) {
          const elapsed = year - d.expectedStartYear
          monthly += d.expectedMonthlyPayout * Math.pow(1 + (d.annualGrowthRate ?? 0) / 100, elapsed)
        }
      }
      if (a.type === 'STOCK' || a.type === 'SAVINGS') {
        const d = a.detail as (StockDetail & SavingsDetail) | undefined
        if (!d?.isPensionLike) continue
        if (d.pensionStartYear && year >= d.pensionStartYear) monthly += d.pensionMonthly ?? 0
      }
    }
    map.set(year, monthly)
  }
  return map
}

// ── 건강보험료 계산 (2025년 지역가입자 기준) ───────────────
// 재산 점수표: 재산세 과세표준 5,000만원 공제 후 구간별 점수 (단위: 만원)
const PROPERTY_SCORE_TABLE: [number, number][] = [
  [0,      22],  [450,    30],  [900,    40],  [1_350,  50],
  [1_800,  65],  [2_400,  80],  [3_000,  95],  [3_600, 113],
  [4_800, 133],  [6_000, 165],  [9_000, 205],  [12_000, 248],
  [15_000, 290], [18_000, 330], [21_000, 369], [24_000, 406],
  [27_000, 441], [30_000, 484], [36_000, 530], [42_000, 571],
  [48_000, 610], [54_000, 645],
]

function getPropertyScore(taxBase: number): number {
  const baseMan = taxBase / 10_000
  const deducted = Math.max(0, baseMan - 5_000) // 5천만원 공제
  for (let i = PROPERTY_SCORE_TABLE.length - 1; i >= 0; i--) {
    if (deducted >= PROPERTY_SCORE_TABLE[i][0]) return PROPERTY_SCORE_TABLE[i][1]
  }
  return 0
}

interface HealthResult {
  incomeMonthly:    number  // 소득보험료
  propertyMonthly:  number  // 재산보험료
  carMonthly:       number  // 자동차보험료
  healthTotal:      number  // 건강보험료 합계
  longTermCare:     number  // 장기요양보험료
  grandTotal:       number  // 최종 납부액
  isMinimum:        boolean // 최저보험료 적용 여부
}

function calcHealthInsurance(
  hi: HealthInsuranceInputs,
  pensionAutoMonthly: number,  // 연금 자동연동 값 (월)
  dividendAutoMonthly: number, // 배당 자동연동 값 (월)
): HealthResult {
  const RATE          = 0.0709   // 보험료율 7.09%
  const SCORE_PER_PT  = hi.scorePerPoint || 208.4
  const LONG_TERM     = 0.1295   // 장기요양보험료율 12.95%
  const MIN_HEALTH    = 19_780   // 최저 건강보험료 (월)

  // 소득 합산 (연간, 반영률 적용)
  const pensionAnnual   = hi.autoLinkPension   ? pensionAutoMonthly * 12   : hi.pensionIncome
  const dividendAnnual  = hi.autoLinkDividend  ? dividendAutoMonthly * 12  : hi.interestDividendIncome
  const totalIncome = dividendAnnual * 1.0   // 이자·배당 100%
                    + pensionAnnual   * 0.5   // 연금소득 50%
                    + hi.otherIncome  * 1.0   // 기타 100%

  const incomeMonthly = totalIncome > 0 ? (totalIncome / 12) * RATE : 0

  // 재산 점수 (임차보증금 30% 반영)
  const propertyBase    = hi.propertyTaxBase + hi.rentalDeposit * 0.3
  const propertyScore   = getPropertyScore(propertyBase)
  const propertyMonthly = propertyScore * SCORE_PER_PT

  // 자동차 (사용연수 무관, 4천만원 이상만 단순 계산 — 점수표 간소화)
  let carMonthly = 0
  if (hi.carValue >= 40_000_000) {
    const carScore = hi.carValue < 60_000_000 ? 45
                   : hi.carValue < 80_000_000 ? 62 : 80
    carMonthly = carScore * SCORE_PER_PT
  }

  const rawHealth   = incomeMonthly + propertyMonthly + carMonthly
  const isMinimum   = rawHealth < MIN_HEALTH
  const healthTotal = Math.max(rawHealth, MIN_HEALTH)
  const longTermCare = Math.round(healthTotal * LONG_TERM)
  const grandTotal  = Math.round(healthTotal) + longTermCare

  return { incomeMonthly, propertyMonthly, carMonthly, healthTotal, longTermCare, grandTotal, isMinimum }
}

const DEFAULT_HI: HealthInsuranceInputs = {
  interestDividendIncome: 0,
  pensionIncome:          0,
  otherIncome:            0,
  propertyTaxBase:        0,
  rentalDeposit:          0,
  carValue:               0,
  scorePerPoint:          208.4,
  autoLinkPension:        true,
  autoLinkDividend:       true,
}

// ── 기본값 (2인 가구) ──────────────────────────────────────
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

const EMPTY_PLAN: RetirementPlan = {
  expenses:        DEFAULT_EXPENSES,
  travel:          [],
  medicalMonthly:  200_000,
  lumpsum:         [],
  emergency:       [],
  retirementYear:  new Date().getFullYear() + 10,
  healthInsurance: DEFAULT_HI,
  linkCorpSim:     false,
}

// ── 유틸 ───────────────────────────────────────────────────
function numFmt(v: number | string) {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
  return isNaN(n) ? '' : n.toLocaleString()
}
function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }
/** 안전 숫자 변환 (undefined/문자열/NaN → 0). 가져온 plan 항목의 누락 필드 대비 */
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
/** 천원 단위 숫자만(표 셀용 — '천원' 접미사 없음). 단위는 표 상단에 표시. */
const fmtK = (v: number): string =>
  Number.isFinite(v) ? Math.round(v / 1000).toLocaleString('ko-KR') : '—'

function pnlColor(v: number) {
  if (v > 0) return 'text-emerald-400'
  if (v < 0) return 'text-red-400'
  return 'text-gray-400'
}

// ── 섹션 래퍼 ─────────────────────────────────────────────
function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

// ── Expander ───────────────────────────────────────────────
function Expander({
  title, badge, children, defaultOpen = false,
}: {
  title: string
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate">{title}</span>
          {badge && <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">{badge}</span>}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-700 space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ── 인풋 ──────────────────────────────────────────────────
function AmountInput({
  value, onChange, placeholder = '금액',
}: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
        focus:outline-none focus:border-blue-500 text-right"
      placeholder={placeholder}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => { const n = parseNum(raw); onChange(n); setRaw(n > 0 ? numFmt(n) : '') }}
    />
  )
}

function TextInput({
  value, onChange, placeholder = '',
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
        focus:outline-none focus:border-blue-500"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ── 정보 툴팁 ──────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-4 h-4 rounded-full bg-gray-600 hover:bg-gray-500 text-gray-300 text-[10px] font-bold
          flex items-center justify-center leading-none transition-colors shrink-0"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-64
          bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 shadow-2xl
          text-[11px] text-gray-300 leading-relaxed whitespace-pre-line pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}

function YearInput({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" inputMode="decimal"
      className="w-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
        focus:outline-none focus:border-blue-500"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

// ── 월 생활비 섹션 ─────────────────────────────────────────
function ExpensesSection({
  items, onChange,
}: { items: ExpenseItem[]; onChange: (items: ExpenseItem[]) => void }) {
  const total = items.reduce((s, i) => s + i.amount, 0)

  const update = (id: string, field: keyof ExpenseItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))

  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">💰 월 생활비</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <TextInput
              value={item.name}
              onChange={(v) => update(item.id, 'name', v)}
              placeholder="항목명"
            />
            <div className="w-36 shrink-0">
              <AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} />
            </div>
            <button
              onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <button
            onClick={() => onChange([...items, { id: uid(), name: '', amount: 0 }])}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="w-3 h-3" /> 항목 추가
          </button>
          <button
            onClick={() => onChange(DEFAULT_EXPENSES.map((e) => ({ ...e, id: uid() })))}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> 기본값
          </button>
        </div>
        <p className="text-sm font-bold text-gray-100">
          합계 <span className="text-blue-400">{formatManwon(total)}/월</span>
        </p>
      </div>
    </Section>
  )
}

// ── 여행비 섹션 ────────────────────────────────────────────
function TimesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" inputMode="decimal"
      min={0}
      className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
        focus:outline-none focus:border-blue-500 text-center"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function TravelSection({
  items, onChange,
}: { items: TravelItem[]; onChange: (items: TravelItem[]) => void }) {
  const update = (id: string, field: keyof TravelItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))

  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">✈️ 여행비</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-gray-750 border border-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TextInput
                value={item.name}
                onChange={(v) => update(item.id, 'name', v)}
                placeholder="여행 종류 (예: 국내여행)"
              />
              <div className="w-32 shrink-0">
                <AmountInput value={item.costPerTrip} onChange={(v) => update(item.id, 'costPerTrip', v)} placeholder="회당 금액" />
              </div>
              <button
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
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
      <button
        onClick={() => onChange([...items, { id: uid(), name: '', costPerTrip: 0, phase1Times: 4, phase1Until: 2045, phase2Times: 1 }])}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus className="w-3 h-3" /> 추가
      </button>
    </Section>
  )
}

// ── 목돈 수입 섹션 ─────────────────────────────────────────
function LumpsumSection({
  items, onChange,
}: { items: LumpsumItem[]; onChange: (items: LumpsumItem[]) => void }) {
  const update = (id: string, field: keyof LumpsumItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))

  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">💎 목돈 수입 (전세금·퇴직금 등)</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="bg-gray-750 rounded-lg border border-gray-700 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TextInput
                value={item.name}
                onChange={(v) => update(item.id, 'name', v)}
                placeholder="항목명 (예: 전세금 반환)"
              />
              <button
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">수령 연도</p>
                <YearInput value={item.receiveYear} onChange={(v) => update(item.id, 'receiveYear', v)} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">사용 종료 연도</p>
                <YearInput value={item.useEndYear} onChange={(v) => update(item.id, 'useEndYear', v)} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">금액</p>
                <AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} />
              </div>
            </div>
            {item.receiveYear > 0 && item.useEndYear >= item.receiveYear && item.amount > 0 && (
              <p className="text-[11px] text-blue-400">
                → 월 {formatManwon(item.amount / ((item.useEndYear - item.receiveYear + 1) * 12))} 환산
                ({item.useEndYear - item.receiveYear + 1}년간)
              </p>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: uid(), name: '', receiveYear: 2030, amount: 0, useEndYear: 2040 }])}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus className="w-3 h-3" /> 추가
      </button>
    </Section>
  )
}

// ── 긴급자금 섹션 ──────────────────────────────────────────
function EmergencySection({
  items, onChange,
}: { items: EmergencyItem[]; onChange: (items: EmergencyItem[]) => void }) {
  const update = (id: string, field: keyof EmergencyItem, val: string | number) =>
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: val } : i)))

  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">🚨 긴급자금 (일회성 지출)</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:flex-1 min-w-0">
              <TextInput
                value={item.name}
                onChange={(v) => update(item.id, 'name', v)}
                placeholder="항목명 (예: 아들 결혼)"
              />
            </div>
            <YearInput value={item.year} onChange={(v) => update(item.id, 'year', v)} />
            <div className="w-28 sm:w-36 shrink-0">
              <AmountInput value={item.amount} onChange={(v) => update(item.id, 'amount', v)} />
            </div>
            <button
              onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: uid(), name: '', year: 2030, amount: 0 }])}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus className="w-3 h-3" /> 추가
      </button>
    </Section>
  )
}

// ── 건강보험료 계산기 섹션 ─────────────────────────────────
function HealthInsuranceSection({
  hi, onChange, result, pensionAutoMonthly, dividendAutoMonthly,
}: {
  hi: HealthInsuranceInputs
  onChange: (v: HealthInsuranceInputs) => void
  result: HealthResult
  pensionAutoMonthly: number
  dividendAutoMonthly: number
}) {
  const set = (field: keyof HealthInsuranceInputs, val: number | boolean) =>
    onChange({ ...hi, [field]: val })

  return (
    <Section>
      <p className="text-[11px] text-gray-500 -mt-1">
        2025년 기준 · 점수당 {hi.scorePerPoint}원 · 결과는 예측값이며 실제와 차이가 있을 수 있습니다
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 소득 입력 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">소득 (연간)</p>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 w-36 shrink-0">
              <input
                type="checkbox"
                checked={hi.autoLinkDividend}
                onChange={(e) => set('autoLinkDividend', e.target.checked)}
                className="rounded"
              />
              배당소득 자동연동
            </label>
            {hi.autoLinkDividend ? (
              <span className="text-xs text-blue-400 font-medium">
                {formatManwon(dividendAutoMonthly * 12)}/년 (자동)
              </span>
            ) : (
              <div className="flex-1">
                <AmountInput
                  value={hi.interestDividendIncome}
                  onChange={(v) => set('interestDividendIncome', v)}
                  placeholder="이자·배당소득 (연)"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 w-36 shrink-0">
              <input
                type="checkbox"
                checked={hi.autoLinkPension}
                onChange={(e) => set('autoLinkPension', e.target.checked)}
                className="rounded"
              />
              연금소득 자동연동
            </label>
            {hi.autoLinkPension ? (
              <span className="text-xs text-blue-400 font-medium">
                {formatManwon(pensionAutoMonthly * 12)}/년 (자동) · 50% 반영
              </span>
            ) : (
              <div className="flex-1">
                <AmountInput
                  value={hi.pensionIncome}
                  onChange={(v) => set('pensionIncome', v)}
                  placeholder="연금소득 (연)"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 w-36 shrink-0">
              기타소득 (연)
              <InfoTooltip text={
                "사업소득, 근로소득, 기타소득 등\n연간 합계금액을 입력합니다.\n\n100% 반영됩니다."
              } />
            </span>
            <div className="flex-1">
              <AmountInput
                value={hi.otherIncome}
                onChange={(v) => set('otherIncome', v)}
                placeholder="사업·기타소득"
              />
            </div>
          </div>
        </div>

        {/* 재산·차량 입력 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">재산 · 자동차</p>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 w-36 shrink-0">
              재산세 과세표준
              <InfoTooltip text={
                "집값(실거래가)이 아닌 과세표준을 입력해야 합니다.\n\n" +
                "과세표준 = 공시가격 × 공정시장가액비율(약 43%)\n공시가격 ≈ 실거래가의 60~70%\n\n" +
                "확인 방법:\n• 위택스(wetax.go.kr) 재산세 고지서\n• 부동산공시가격알리미(realtyprice.kr)"
              } />
            </span>
            <div className="flex-1">
              <AmountInput
                value={hi.propertyTaxBase}
                onChange={(v) => set('propertyTaxBase', v)}
                placeholder="토지·건물·주택 합산"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 w-36 shrink-0">
              임차보증금
              <InfoTooltip text={
                "전세·월세 보증금을 입력합니다.\n\n" +
                "보증금의 30%만 재산점수에 반영됩니다.\n(예: 보증금 1억 → 3천만원으로 계산)"
              } />
            </span>
            <div className="flex-1">
              <AmountInput
                value={hi.rentalDeposit}
                onChange={(v) => set('rentalDeposit', v)}
                placeholder="전세·보증금 (30% 반영)"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 w-36 shrink-0">
              차량가액
              <InfoTooltip text={
                "차량의 현재 시가를 입력합니다.\n\n" +
                "4천만원 미만이면 보험료에 반영되지 않습니다.\n4천만~6천만: 점수 45\n6천만~8천만: 점수 62\n8천만 이상: 점수 80"
              } />
            </span>
            <div className="flex-1">
              <AmountInput
                value={hi.carValue}
                onChange={(v) => set('carValue', v)}
                placeholder="4천만원 이상 시 부과"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400 w-36 shrink-0">
              점수당 금액
              <InfoTooltip text={
                "재산·자동차 점수 1점당 보험료(원)입니다.\n\n" +
                "기본값: 208.4원 (2025년 기준)\n매년 건강보험공단에서 고시하며 변동될 수 있습니다."
              } />
            </span>
            <input
              type="number" inputMode="decimal"
              step="0.1"
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
                focus:outline-none focus:border-blue-500 text-right"
              value={hi.scorePerPoint}
              onChange={(e) => set('scorePerPoint', parseFloat(e.target.value) || 208.4)}
            />
          </div>
        </div>
      </div>

      {/* 계산 결과 */}
      <div className={`rounded-xl p-4 ${result.isMinimum ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-blue-500/10 border border-blue-500/20'}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-gray-500 mb-0.5">소득 보험료</p>
            <p className="font-semibold text-gray-200">{formatManwon(result.incomeMonthly)}/월</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">재산 보험료</p>
            <p className="font-semibold text-gray-200">{formatManwon(result.propertyMonthly)}/월</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">장기요양보험료</p>
            <p className="font-semibold text-gray-200">{formatManwon(result.longTermCare)}/월</p>
          </div>
          <div>
            <p className="text-gray-500 mb-0.5">
              월 총 납부액
              {result.isMinimum && <span className="ml-1 text-yellow-400">(최저)</span>}
            </p>
            <p className="text-lg font-bold text-blue-400">{formatManwon(result.grandTotal)}/월</p>
          </div>
        </div>
        {result.isMinimum && (
          <p className="text-[11px] text-yellow-500 mt-2">
            ※ 산출된 보험료가 최저보험료(19,780원)보다 낮아 최저보험료가 적용됩니다.
          </p>
        )}
      </div>
    </Section>
  )
}

// ── 연도별 현금흐름 테이블 ─────────────────────────────────
interface CashFlowRow {
  year:                    number
  age:                     number
  pensionMonthly:          number
  dividendMonthly:         number
  corpSalaryMonthly:       number
  corpReturnMonthly:       number
  expenseMonthly:          number
  travelMonthly:           number
  medicalMonthly:          number
  healthInsuranceMonthly:  number
  totalExpense:            number
  lumpsumMonthly:          number
  lumpsumReceived:         number
  totalIncome:             number
  balance:                 number
  emergencyAnnual:         number
  cumulative:              number
}

function buildCashFlow(
  plan: RetirementPlan,
  pensionMap: Map<number, number>,
  currentAge: number,
  dividendMonthly: number,
  healthInsuranceMonthly: number,
  corpSalaryMonthly: number = 0,
  corpReturnMonthly: number = 0,
  corpLoanOutflow: number = 0,
): CashFlowRow[] {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + (100 - currentAge)
  const rows: CashFlowRow[] = []

  const expenseMonthly = plan.expenses.reduce((s, e) => s + num(e.amount), 0)

  let cumulative = 0

  for (let year = SIM_START_YEAR; year <= endYear; year++) {
    const age = currentAge + (year - currentYear)

    // 여행비: phase1Until 이하면 phase1Times, 이후면 phase2Times
    const travelMonthly = plan.travel.reduce((s, t) => {
      const times = year <= num(t.phase1Until) ? num(t.phase1Times) : num(t.phase2Times)
      return s + (times * num(t.costPerTrip)) / 12
    }, 0)

    const pensionMonthly = pensionMap.get(year) ?? 0

    const lumpsumMonthly = plan.lumpsum.reduce((s, l) => {
      const ry = num(l.receiveYear), ue = num(l.useEndYear), amt = num(l.amount)
      if (ry > 0 && ue >= ry && year >= ry && year <= ue) {
        return s + amt / ((ue - ry + 1) * 12)
      }
      return s
    }, 0)

    const emergencyAnnual = plan.emergency.reduce((s, e) => (num(e.year) === year ? s + num(e.amount) : s), 0)
      + (year === SIM_START_YEAR ? corpLoanOutflow : 0)  // 법인 가수금 최초 유출(1회)

    // 목돈수입: 수령 연도에 전액 일회성 유입(긴급자금의 역방향).
    // totalIncome 의 월 분할(lumpsumMonthly)은 표시용 → 누적에서는 빼고 수령액으로 대체.
    const lumpsumReceived = plan.lumpsum.reduce((s, l) => (num(l.receiveYear) === year ? s + num(l.amount) : s), 0)

    const totalExpense = expenseMonthly + travelMonthly + num(plan.medicalMonthly) + healthInsuranceMonthly
    const totalIncome  = pensionMonthly + lumpsumMonthly + dividendMonthly + corpSalaryMonthly + corpReturnMonthly
    const balance      = totalIncome - totalExpense

    cumulative += balance * 12 - emergencyAnnual - lumpsumMonthly * 12 + lumpsumReceived

    rows.push({
      year, age,
      pensionMonthly, dividendMonthly, corpSalaryMonthly, corpReturnMonthly,
      expenseMonthly, travelMonthly,
      medicalMonthly: num(plan.medicalMonthly),
      healthInsuranceMonthly,
      totalExpense, lumpsumMonthly, lumpsumReceived, totalIncome, balance,
      emergencyAnnual, cumulative,
    })
  }
  return rows
}

// ── 메인 페이지 ────────────────────────────────────────────
export default function RetirementPage() {
  const { data: allAssets = [] } = useAssets()
  const { data: settings }       = useSettings()
  const { data: saved }          = useRetirement()
  const saveMut                  = useSaveRetirement()

  const currentAge = settings?.currentAge ?? 40

  const [plan, setPlan]   = useState<RetirementPlan>(EMPTY_PLAN)
  const [dirty, setDirty] = useState(false)

  // 저장된 데이터 로드
  useEffect(() => {
    if (saved && Object.keys(saved).length > 0) {
      setPlan({
        expenses:       saved.expenses       ?? DEFAULT_EXPENSES,
        travel:         saved.travel         ?? [],
        medicalMonthly: saved.medicalMonthly ?? 200_000,
        lumpsum:        saved.lumpsum        ?? [],
        emergency:      saved.emergency      ?? [],
        retirementYear:  saved.retirementYear  ?? new Date().getFullYear() + 10,
        healthInsurance: saved.healthInsurance  ? { ...DEFAULT_HI, ...saved.healthInsurance } : DEFAULT_HI,
        linkCorpSim:     saved.linkCorpSim ?? false,
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  const handleSave = () => {
    saveMut.mutate(plan, { onSuccess: () => setDirty(false) })
  }

  // 연금 수입 맵
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })
  const { data: divSummary } = useDividendSummary()
  const stockDivMonthly = divSummary?.totalMonthly ?? 0

  // ── 투자법인 연동 ──
  const { data: corpPlan } = useCorpSim()
  const linked = plan.linkCorpSim && !!corpPlan
  const corp = linked ? computeCorp(corpPlan!) : null
  const corpDivMonthly = corp ? (corp.perShare.husband.net + corp.perShare.wife.net) / 12 : 0
  const corpSalaryMonthly = linked ? corpPlan!.repSalaryMonthly + corpPlan!.repSalaryHusbandMonthly : 0
  const corpReturnMonthly = linked ? corpPlan!.monthlyReturn : 0
  const totalDivMonthly = stockDivMonthly + corpDivMonthly

  const pensionMap = calcPensionByYear(pensionLikeAssets, currentAge)

  // 건강보험료: 연동 시 직장건보(급여 기준), 미연동 시 지역건보(재산+소득 점수)
  const retirementYear    = plan.retirementYear
  const retirementPensionMonthly = pensionMap.get(retirementYear) ?? 0
  const hiResult = calcHealthInsurance(
    plan.healthInsurance,
    retirementPensionMonthly,
    stockDivMonthly,
  )
  const healthInsuranceMonthly = linked
    ? salariedCount(corpPlan!) * corpPlan!.employeeHealthMonthly
    : hiResult.grandTotal

  const cashFlow = buildCashFlow(plan, pensionMap, currentAge, totalDivMonthly, healthInsuranceMonthly, corpSalaryMonthly, corpReturnMonthly, linked ? corpPlan!.loanAmount : 0)

  // KPI
  const retirementRow = cashFlow.find((r) => r.year >= retirementYear)
  const totalExpenseMonthly = (plan.expenses.reduce((s, e) => s + num(e.amount), 0))
    + plan.travel.reduce((s, t) => s + (num(t.phase1Times) * num(t.costPerTrip)) / 12, 0)
    + num(plan.medicalMonthly)
    + healthInsuranceMonthly

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🌅 은퇴 생활비 계획</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-gray-400 whitespace-nowrap">은퇴 예상 연도</span>
            <input
              type="number" inputMode="decimal"
              className="w-20 sm:w-24 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-blue-300
                font-semibold focus:outline-none focus:border-blue-500 text-center"
              value={plan.retirementYear || ''}
              onChange={(e) => { update('retirementYear', Number(e.target.value)); }}
            />
            <span className="text-xs sm:text-sm text-gray-500">년</span>
          </div>
          <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${linked ? 'text-blue-400' : 'text-gray-500'}`}>
            <input type="checkbox" checked={plan.linkCorpSim} onChange={(e) => update('linkCorpSim', e.target.checked)} className="accent-blue-500" />
            🏛️ 법인 연동
          </label>
          <button
            onClick={handleSave}
            disabled={!dirty || saveMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500
              text-white transition-colors disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">월 예상 지출</p>
          <p className="text-[13px] sm:text-lg font-bold text-gray-100">{formatManwon(totalExpenseMonthly)}</p>
          <p className="text-[11px] text-gray-600 mt-0.5">생활비 + 여행 + 의료</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">연금 수령</p>
          <p className="text-[13px] sm:text-lg font-bold text-gray-100">
            {retirementRow ? formatManwon(retirementRow.pensionMonthly) : '-'}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">{retirementYear}년 기준</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">월 여유/부족</p>
          <p className={`text-[13px] sm:text-lg font-bold ${pnlColor(retirementRow?.balance ?? 0)}`}>
            {retirementRow
              ? `${retirementRow.balance >= 0 ? '+' : ''}${formatManwon(retirementRow.balance)}`
              : '-'}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">목돈 제외 기준</p>
        </div>
      </div>

      {/* Expander 1: 생활비 / 여행 / 의료비 */}
      <Expander
        title="✏️ 💰 생활비 / 여행 / 의료비 적립"
        badge={`월 ${formatManwon(plan.expenses.reduce((s, e) => s + num(e.amount), 0) + plan.travel.reduce((s, t) => s + (num(t.phase1Times) * num(t.costPerTrip)) / 12, 0) + num(plan.medicalMonthly))}`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExpensesSection items={plan.expenses} onChange={(v) => update('expenses', v)} />
          <div className="space-y-5">
            <TravelSection items={plan.travel} onChange={(v) => update('travel', v)} />
            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs font-semibold text-gray-400 mb-3">🏥 의료비 적립</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">월 적립액</span>
                <div className="w-40">
                  <AmountInput
                    value={plan.medicalMonthly}
                    onChange={(v) => update('medicalMonthly', v)}
                  />
                </div>
                <span className="text-xs text-gray-500">/월</span>
              </div>
            </div>
          </div>
        </div>
      </Expander>

      {/* Expander 2: 목돈 수입 / 긴급자금 */}
      <Expander
        title="✏️ 💎 목돈 수입 / 긴급자금"
        badge={`${plan.lumpsum.length + plan.emergency.length}건`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LumpsumSection  items={plan.lumpsum}   onChange={(v) => update('lumpsum', v)} />
          <EmergencySection items={plan.emergency} onChange={(v) => update('emergency', v)} />
        </div>
      </Expander>

      {/* Expander 3: 건강보험료 */}
      <Expander
        title="✏️ 🏥 건강보험료 계산 (지역가입자)"
        badge={`월 ${formatManwon(healthInsuranceMonthly)}`}
      >
        <HealthInsuranceSection
          hi={plan.healthInsurance}
          onChange={(v) => update('healthInsurance', v)}
          result={hiResult}
          pensionAutoMonthly={retirementPensionMonthly}
          dividendAutoMonthly={stockDivMonthly}
        />
      </Expander>

      {/* 연도별 현금흐름 테이블 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">📊 연도별 현금흐름 <span className="text-[11px] font-normal text-gray-500">(단위: 천원/월)</span></h3>
        <div className="overflow-x-auto">
          <p className="text-[11px] text-gray-500 mb-2 landscape:hidden">📌 세로 모드: 핵심 6열만 표시. 전체 내역은 가로로 돌려보세요.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-2 font-medium whitespace-nowrap">연도(나이)</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">연금/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">배당/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">급여/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">가수금/월</th>
                <th className="text-right py-2 px-1 font-medium">월수입</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">생활비/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">여행/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">의료/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">건보/월</th>
                <th className="text-right py-2 px-1 font-medium">월지출</th>
                <th className="text-right py-2 px-1 font-medium">+/-</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">목돈</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium">긴급지출</th>
                <th className="text-right py-2 pl-1 font-medium">누적</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.map((row) => {
                const isRetirementYear = row.year === retirementYear
                const hasEmergency     = row.emergencyAnnual > 0
                return (
                  <tr
                    key={row.year}
                    className={`border-b border-gray-700/50 ${
                      isRetirementYear ? 'bg-blue-500/10' : 'hover:bg-gray-700/30'
                    }`}
                  >
                    <td className={`py-2 pr-2 font-medium whitespace-nowrap ${isRetirementYear ? 'text-blue-400' : 'text-gray-300'}`}>
                      {row.year}<span className="text-gray-500">({row.age})</span>
                      {isRetirementYear && <span className="ml-1 text-[10px] text-blue-500">은퇴</span>}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-300">
                      {row.pensionMonthly > 0 ? fmtK(row.pensionMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-emerald-400">
                      {row.dividendMonthly > 0 ? fmtK(row.dividendMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-blue-400">
                      {row.corpSalaryMonthly > 0 ? fmtK(row.corpSalaryMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-cyan-400">
                      {row.corpReturnMonthly > 0 ? fmtK(row.corpReturnMonthly) : '—'}
                    </td>
                    <td className="text-right py-2 px-1 font-semibold text-gray-100">
                      {fmtK(row.totalIncome)}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400">{fmtK(row.expenseMonthly)}</td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400">
                      {row.travelMonthly > 0 ? fmtK(row.travelMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400">
                      {row.medicalMonthly > 0 ? fmtK(row.medicalMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400">
                      {row.healthInsuranceMonthly > 0 ? fmtK(row.healthInsuranceMonthly) : '—'}
                    </td>
                    <td className="text-right py-2 px-1 font-semibold text-gray-100">
                      {fmtK(row.totalExpense)}
                    </td>
                    <td className={`text-right py-2 px-1 font-bold ${pnlColor(row.balance)}`}>
                      {row.balance >= 0 ? '+' : ''}{fmtK(row.balance)}
                    </td>
                    <td className={`hidden landscape:table-cell text-right py-2 px-1 ${row.lumpsumReceived > 0 ? 'text-emerald-400 font-semibold' : 'text-gray-600'}`}>
                      {row.lumpsumReceived > 0 ? '+' : ''}{row.lumpsumReceived > 0 ? fmtK(row.lumpsumReceived) : '—'}
                    </td>
                    <td className={`hidden landscape:table-cell text-right py-2 px-1 ${hasEmergency ? 'text-orange-400 font-semibold' : 'text-gray-600'}`}>
                      {hasEmergency ? fmtK(row.emergencyAnnual) : '—'}
                    </td>
                    <td className={`text-right py-2 pl-1 font-semibold ${pnlColor(row.cumulative)}`}>
                      {row.cumulative >= 0 ? '+' : ''}{fmtK(row.cumulative)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
