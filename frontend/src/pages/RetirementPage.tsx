import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RotateCcw, Save, ChevronDown } from 'lucide-react'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { useDividendSummary } from '@/hooks/useDividends'
import { useCorpSim } from '@/hooks/useCorpSim'
import { computeCorp, corpTaxOn, corpHealthMonthly, employerInsuranceMonthly, EMPTY_CORP_PLAN, DEFAULT_CORP_TAX } from '@/lib/corpSim'
import { calcPensionByYear, SIM_START_YEAR } from '@/lib/pensionCalc'
import { computePensionVehiclePerPerson, pensionSchedule, severanceTax, EMPTY_PENSION_PLAN } from '@/lib/pensionSim'
import { realEstatePropertyBases, stockDividendsByOwner } from '@/lib/healthInsurance'
import { usePensionSim } from '@/hooks/usePensionSim'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
import { formatMoney, formatManwon } from '@/lib/utils'
import type {
  Asset, StockDetail, SavingsDetail, PensionDetail,
  RetirementPlan, ExpenseItem, TravelItem, LumpsumItem, EmergencyItem,
  HealthInsuranceInputs,
} from '@/types'

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
  linkPensionSim:  false,
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
            {/* 과세 성격 — 현금 나머지의 세금 판정용 */}
            <div>
              <p className="text-[10px] text-gray-500 mb-1">과세 성격 (현금 수령분 세금)</p>
              <div className="flex gap-1">
                {([['severance', '퇴직/위로금'], ['rental', '전세금'], ['other', '기타']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => update(item.id, 'taxKind', v)}
                    className={`flex-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${(item.taxKind ?? 'other') === v ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                    {label}
                  </button>
                ))}
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
  taxMonthly:              number  // 배당소득세 + 급여소득세 (월)
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

/** 법인 연동 현금흐름 설정 (Phase 1/2 분기용) */
interface CorpCashFlow {
  salaryMonthly:      number
  phaseBoundaryYear:  number
  returnP1Monthly:    number
  divP1Monthly:       number
  divP2Monthly:       number
}

function buildCashFlow(
  plan: RetirementPlan,
  pensionMap: Map<number, number>,
  currentAge: number,
  stockDivMonthly: number,
  healthInsuranceMonthly: number,
  corpCF?: CorpCashFlow,
  corpLoanOutflow: number = 0,
  /** 연금시뮬 연동 시 1인별 결과에서 산출한 가구 합계 오버라이드 (세금/건보 1인별 정확). */
  linked?: {
    pensionByYear:   Map<number, number>  // 연도별 가구 연금(월) — 국민연금 65세 step-up 반영
    dividendMonthly: number  // 가구 금융소득(명의별)/12
    healthMonthly:   number  // 남편+와이프 건보(재산분 포함)
    taxMonthly:      number  // 남편+와이프 세금(대표연도 기준)/12
  },
  /** 목돈 수입 — 시뮬의 cash 처리 유입 항목 (plan.lumpsum 대체, 단일 소스). */
  lumpsumOverride?: LumpsumItem[],
  /** 목돈 퇴직소득세 맵 (receiveYear → 세금). cash 유입 중 severance 분. */
  lumpsumTaxByYear?: Map<number, number>,
): CashFlowRow[] {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + (100 - currentAge)
  const rows: CashFlowRow[] = []

  const expenseMonthly = plan.expenses.reduce((s, e) => s + num(e.amount), 0)
  const hiMonthly = linked ? linked.healthMonthly : healthInsuranceMonthly
  const lumpsum = lumpsumOverride ?? plan.lumpsum

  let cumulative = 0

  for (let year = SIM_START_YEAR; year <= endYear; year++) {
    const age = currentAge + (year - currentYear)

    // 여행비: phase1Until 이하면 phase1Times, 이후면 phase2Times
    const travelMonthly = plan.travel.reduce((s, t) => {
      const times = year <= num(t.phase1Until) ? num(t.phase1Times) : num(t.phase2Times)
      return s + (times * num(t.costPerTrip)) / 12
    }, 0)

    // 연금: 연동 시 pension sim 연도별 스케줄(국민연금 step-up 반영), 아니면 자산 기반 pensionMap
    const pensionMonthly = linked
      ? (linked.pensionByYear.get(year) ?? 0)
      : (pensionMap.get(year) ?? 0)

    const lumpsumMonthly = lumpsum.reduce((s, l) => {
      const ry = num(l.receiveYear), ue = num(l.useEndYear), amt = num(l.amount)
      if (ry > 0 && ue >= ry && year >= ry && year <= ue) {
        return s + amt / ((ue - ry + 1) * 12)
      }
      return s
    }, 0)

    const emergencyAnnual = plan.emergency.reduce((s, e) => (num(e.year) === year ? s + num(e.amount) : s), 0)
      + (year === SIM_START_YEAR ? corpLoanOutflow : 0)

    const lumpsumReceived = lumpsum.reduce((s, l) => (num(l.receiveYear) === year ? s + num(l.amount) : s), 0)
    // 목돈 퇴직소득세 (severance cash 유입, 수령년 일회)
    const lumpsumTaxAnnual = lumpsumTaxByYear?.get(year) ?? 0

    // 법인 Phase 분기: 가수금 소진 연도 기준
    const isPhase2 = corpCF ? year > corpCF.phaseBoundaryYear : false
    const corpSalaryMonthly = corpCF?.salaryMonthly ?? 0
    const corpReturnMonthly = corpCF ? (isPhase2 ? 0 : corpCF.returnP1Monthly) : 0
    const corpDiv = corpCF ? (isPhase2 ? corpCF.divP2Monthly : corpCF.divP1Monthly) : 0
    // 배당: 연동 시 pension sim 금융소득(명의별, 정상상태 flat), 아니면 실제 배당 풀 + 법인 배당
    const dividendMonthly = linked ? linked.dividendMonthly : (stockDivMonthly + corpDiv)

    // 세금: 연동 시 1인별 산정값, 아니면 근사(배당 15.4% + 급여 3%) + 목돈 퇴직소득세
    const taxMonthly = (linked ? linked.taxMonthly : (dividendMonthly * 0.154 + corpSalaryMonthly * 0.03))
      + lumpsumTaxAnnual / 12

    const totalExpense = expenseMonthly + travelMonthly + num(plan.medicalMonthly) + hiMonthly + taxMonthly
    const totalIncome  = pensionMonthly + lumpsumMonthly + dividendMonthly + corpSalaryMonthly + corpReturnMonthly
    const balance      = totalIncome - totalExpense

    cumulative += balance * 12 - emergencyAnnual - lumpsumMonthly * 12 + lumpsumReceived

    rows.push({
      year, age,
      pensionMonthly, dividendMonthly, corpSalaryMonthly, corpReturnMonthly,
      taxMonthly,
      expenseMonthly, travelMonthly,
      medicalMonthly: num(plan.medicalMonthly),
      healthInsuranceMonthly: hiMonthly,
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
        linkPensionSim:  saved.linkPensionSim ?? false,
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof RetirementPlan>(key: K, val: RetirementPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  // 연동 소득원 — 범인/연금 상호배타 라디오
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'
  const setLinkMode = useCallback((m: 'none' | 'corp' | 'pension') => {
    setPlan((p) => ({ ...p, linkCorpSim: m === 'corp', linkPensionSim: m === 'pension' }))
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
  const { data: rawCorpPlan } = useCorpSim()
  // 구버전 저장 데이터 방어: EMPTY_CORP_PLAN + DEFAULT_CORP_TAX 로 머지
  const corpPlan = rawCorpPlan
    ? { ...EMPTY_CORP_PLAN, ...rawCorpPlan, tax: { ...DEFAULT_CORP_TAX, ...(rawCorpPlan.tax ?? {}) } }
    : null
  const linked = plan.linkCorpSim && !!corpPlan

  // 법인 현금흐름 Phase 1/2 계산
  let corpCF: CorpCashFlow | undefined
  if (linked && corpPlan) {
    const ep = corpPlan
    const gross = ep.targetDividendTotal > 0 ? ep.targetDividendTotal : (ep.capitalContribution + ep.loanAmount) * (ep.dividendYield / 100)
    const salAnnual = (ep.repSalaryMonthly + ep.repSalaryHusbandMonthly) * 12
    const empInsAnnual = employerInsuranceMonthly(ep).total * 12
    // 급여 + 4대보험 사업주분 모두 법인 비용(공제)
    const corpTax = corpTaxOn(Math.max(0, gross - salAnnual - empInsAnnual), ep.tax)
    const cashAfterTax = gross - corpTax - salAnnual - empInsAnnual  // 급여·4대보험·법인세 후 잔여
    const returnAnnual = ep.monthlyReturn * 12
    const rMonths = ep.monthlyReturn > 0 ? Math.floor(ep.loanAmount / ep.monthlyReturn) : 0
    // 부부 지분(%) + 배당소득세 15.4% 후 실수령
    const coupleShare = (ep.shareHusband + ep.shareWife) / 100
    const netFactor = 1 - ep.tax.dividendTaxRate

    corpCF = {
      salaryMonthly: ep.repSalaryMonthly + ep.repSalaryHusbandMonthly,
      phaseBoundaryYear: SIM_START_YEAR + Math.ceil(rMonths / 12),
      returnP1Monthly: ep.monthlyReturn,
      divP1Monthly: Math.max(0, cashAfterTax - returnAnnual) * coupleShare * netFactor / 12,
      divP2Monthly: Math.max(0, cashAfterTax) * coupleShare * netFactor / 12,
    }
  }

  const pensionMap = calcPensionByYear(pensionLikeAssets, currentAge)

  // 1인별 STOCK 배당 (실제 주식자산 배당 × 계좌 명의)
  const { data: accountOwners = {} } = useStockAccountOwnership()
  const stockDiv = divSummary ? stockDividendsByOwner(allAssets, divSummary, accountOwners) : { husband: 0, wife: 0 }

  // ── 연금시뮬 연동 (linkMode==='pension') ──
  const { data: rawPensionSim } = usePensionSim()
  const realEstateAssets = allAssets.filter((a) => a.type === 'REAL_ESTATE')
  const pensionSimPlan = rawPensionSim ? { ...EMPTY_PENSION_PLAN, ...rawPensionSim } : null
  const pensionLinked = linkMode === 'pension' && !!pensionSimPlan
  // 국민연금 자산(확정급여) 추출
  const pensionAssetsAll = allAssets.filter((a) => a.type === 'PENSION')
  const nationals = (pensionSimPlan ? pensionAssetsAll
    .filter((a) => pensionSimPlan.sources.find((s) => s.id === a.id)?.taxType === 'national')
    .map((a) => {
      const d = a.detail as PensionDetail | undefined
      return d ? {
        expectedStartYear: d.expectedStartYear,
        expectedEndYear: d.expectedEndYear,
        expectedMonthlyPayout: d.expectedMonthlyPayout,
        annualGrowthRate: d.annualGrowthRate ?? 0,
      } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null) : [])
  const perPerson = (pensionLinked && pensionSimPlan)
    ? computePensionVehiclePerPerson(pensionSimPlan, {
        husbandProperty: realEstatePropertyBases(realEstateAssets).husband,
        wifeProperty: realEstatePropertyBases(realEstateAssets).wife,
        nationalPensions: nationals,
      })
    : null
  // 연도별 가구 연금(월) Map — 국민연금 65세 step-up 반영
  const pensionByYear = (pensionLinked && pensionSimPlan)
    ? new Map(pensionSchedule(pensionSimPlan, nationals, pensionSimPlan.startYear, pensionSimPlan.startYear + (pensionSimPlan.withdrawalYears || 1) - 1)
        .map((r) => [r.year, Math.round(r.totalAnnual / 12)]))
    : new Map<number, number>()
  const linkedOverride = perPerson ? {
    pensionByYear,
    dividendMonthly: (perPerson.husband.financialIncome + perPerson.wife.financialIncome) / 12,
    healthMonthly: perPerson.husband.healthMonthly + perPerson.wife.healthMonthly,
    taxMonthly: (perPerson.husband.totalAnnualTax + perPerson.wife.totalAnnualTax) / 12,
  } : undefined

  // 건강보험료: 연동 시 직장건보(급여×율×50%, 자동 산정), 미연동 시 지역건보
  const retirementYear    = plan.retirementYear
  const retirementPensionMonthly = pensionMap.get(retirementYear) ?? 0
  const hiResult = calcHealthInsurance(
    plan.healthInsurance,
    retirementPensionMonthly,
    stockDivMonthly,
  )
  const healthInsuranceMonthly = linked && corpPlan
    ? corpHealthMonthly(corpPlan)
    : hiResult.grandTotal

  // 목돈 수입 = 은퇴계획 목돈수입(단일 소스)에서 투자 분배 나머지 (이중계산 방지).
  // linkMode=pension → 개인 분배(IRP/주식) 제외분, corp → 법인 분배 제외분, none → 전액.
  const pensionAllocations = pensionSimPlan?.allocations ?? []
  const corpAllocations = corpPlan?.lumpsumCorp ?? []
  const cashLumpsum: LumpsumItem[] = (plan.lumpsum ?? []).map((l) => {
    let allocated = 0
    if (linkMode === 'pension') {
      const a = pensionAllocations.find((x) => x.lumpsumId === l.id)
      allocated = (a?.irpAmount ?? 0) + (a?.stockAmount ?? 0)
    } else if (linkMode === 'corp') {
      const c = corpAllocations.find((x) => x.lumpsumId === l.id)
      allocated = c?.corpAmount ?? 0
    }
    return { ...l, amount: Math.max(0, l.amount - allocated) }
  }).filter((l) => l.amount > 0)
  // 위로금/퇴직(severance) 현금 나머지 → 퇴직소득세 (수령년 일회)
  const lumpsumTaxByYear = new Map<number, number>()
  for (const l of cashLumpsum) {
    if (l.taxKind === 'severance' && l.amount > 0) {
      lumpsumTaxByYear.set(l.receiveYear, (lumpsumTaxByYear.get(l.receiveYear) ?? 0) + severanceTax(l.amount))
    }
  }

  const cashFlow = buildCashFlow(plan, pensionMap, currentAge, stockDivMonthly, healthInsuranceMonthly, corpCF, linked && corpPlan ? corpPlan.loanAmount : 0, linkedOverride, cashLumpsum, lumpsumTaxByYear)

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
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">연동 소득원</legend>
            {([
              ['none', '연동 안함'],
              ['corp', '🏛️ 법인 연동'],
              ['pension', '🪙 연금(IRP) 연동'],
            ] as const).map(([v, label]) => (
              <label key={v} className={`flex items-center gap-1.5 text-xs cursor-pointer ${linkMode === v ? 'text-blue-400' : 'text-gray-500'}`}>
                <input
                  type="radio"
                  name="retireLinkMode"
                  checked={linkMode === v}
                  onChange={() => setLinkMode(v)}
                  className="accent-blue-500"
                />
                {label}
              </label>
            ))}
          </fieldset>
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

      {/* 월 현금흐름 카드 (대표 연도 = 은퇴 연도) */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">📊 월 현금흐름 ({retirementYear}년 기준)</h3>
          <span className="text-[11px] text-gray-500">현황 뷰 — 수입·세금·건보는 시뮬에서 자동 반영</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* 월 수입 */}
          <div className="bg-emerald-950/20 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 mb-1">월 수입</p>
            <p className="text-base sm:text-xl font-bold text-emerald-400">
              {retirementRow ? formatManwon(retirementRow.totalIncome) : '-'}
            </p>
            <p className="text-[10px] text-gray-600 mt-1 leading-tight">
              {retirementRow ? [
                retirementRow.pensionMonthly > 0 ? `연금 ${fmtK(retirementRow.pensionMonthly)}` : null,
                retirementRow.dividendMonthly > 0 ? `배당 ${fmtK(retirementRow.dividendMonthly)}` : null,
                retirementRow.corpSalaryMonthly > 0 ? `급여 ${fmtK(retirementRow.corpSalaryMonthly)}` : null,
                retirementRow.corpReturnMonthly > 0 ? `가수금 ${fmtK(retirementRow.corpReturnMonthly)}` : null,
                retirementRow.lumpsumMonthly > 0 ? `목돈 ${fmtK(retirementRow.lumpsumMonthly)}` : null,
              ].filter(Boolean).join(' · ') : '-'}
            </p>
          </div>
          {/* 월 지출 */}
          <div className="bg-red-950/20 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 mb-1">월 지출</p>
            <p className="text-base sm:text-xl font-bold text-red-400">
              {retirementRow ? formatManwon(retirementRow.totalExpense) : '-'}
            </p>
            <p className="text-[10px] text-gray-600 mt-1 leading-tight">
              {retirementRow ? [
                `생활비 ${fmtK(retirementRow.expenseMonthly)}`,
                retirementRow.travelMonthly + retirementRow.medicalMonthly > 0 ? `여행·의료 ${fmtK(retirementRow.travelMonthly + retirementRow.medicalMonthly)}` : null,
                retirementRow.healthInsuranceMonthly > 0 ? `건보 ${fmtK(retirementRow.healthInsuranceMonthly)}` : null,
                retirementRow.taxMonthly > 0 ? `세금 ${fmtK(retirementRow.taxMonthly)}` : null,
              ].filter(Boolean).join(' · ') : '-'}
            </p>
          </div>
          {/* 월 여유/부족 */}
          <div className="bg-gray-900/40 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 mb-1">월 여유/부족</p>
            <p className={`text-base sm:text-xl font-bold ${pnlColor(retirementRow?.balance ?? 0)}`}>
              {retirementRow
                ? `${retirementRow.balance >= 0 ? '+' : ''}${formatManwon(retirementRow.balance)}`
                : '-'}
            </p>
            <p className="text-[10px] text-gray-600 mt-1">월 누적 × 12 = 연간</p>
          </div>
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

      {/* Expander 2: 목돈 수입(시뮬 cash 유입 표시) / 긴급자금 */}
      <Expander
        title="💎 목돈 수입(시뮬 연동) / 긴급자금"
        badge={`${cashLumpsum.length + plan.emergency.length}건`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 목돈 수입: 단일 소스 입력 + 투자분배 나머지 표시 */}
          <div className="space-y-2">
            <LumpsumSection items={plan.lumpsum ?? []} onChange={(v) => update('lumpsum', v)} />
            {cashLumpsum.length > 0 && linkMode !== 'none' && (
              <div className="bg-emerald-500/5 border border-emerald-700/30 rounded-lg p-2.5 space-y-1">
                <p className="text-[10px] font-semibold text-emerald-300">투자분배 후 현금 수령분 (목돈 수입으로 반영)</p>
                {cashLumpsum.map((l) => (
                  <p key={l.id} className="text-[11px] text-gray-300">
                    · {l.name || '목돈'} — 현금 {formatManwon(l.amount)}
                    {l.taxKind === 'severance' && <span className="text-orange-400"> (퇴직소득세 {formatManwon(lumpsumTaxByYear.get(l.receiveYear) ?? 0)})</span>}
                  </p>
                ))}
              </div>
            )}
          </div>
          <EmergencySection items={plan.emergency} onChange={(v) => update('emergency', v)} />
        </div>
      </Expander>

      {/* 건보·세금은 시뮬에서 산출 (이 페이지 입력 아님) */}
      <div className="bg-blue-500/5 border border-blue-700/30 rounded-xl p-3">
        <p className="text-[11px] text-blue-200/80 leading-relaxed">
          💡 세금·건보는 위 <b>연동 설정</b>(법인/연금)에서 자동 산출됩니다.
          {linkMode === 'none' && ' (현재 연동 안함 — 시뮬 페이지에서 설정하거나 연동하면 정확한 값이 반영됩니다.)'}
        </p>
      </div>

      {/* 연금시뮬 연동 시 1인별 세금·건보 요약 */}
      {perPerson && (
        <div className="bg-gray-800 border border-blue-700/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">🪙 연금시뮬 연동 — 1인별 세금·건보 (수령개시 이후 연간 기준)</h3>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🧑 남편</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.husband.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.husband.healthMonthly)}/월</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.husband.netAnnual)}</span></p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">👩 와이프</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.wife.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.wife.healthMonthly)}/월</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.wife.netAnnual)}</span></p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🏠 가구 합계</p>
              <p className="text-gray-300">세금 <span className="text-red-400 font-semibold">{formatManwon(perPerson.totals.totalAnnualTax)}</span></p>
              <p className="text-gray-300">건보 <span className="text-gray-100 font-semibold">{formatManwon(perPerson.totals.healthMonthly)}/월</span></p>
              <p className="text-gray-300">순취득 <span className="text-emerald-400 font-semibold">{formatManwon(perPerson.totals.netAnnual)}</span></p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            금융소득 2천만 한도·연금소득세·건보(부동산 명의 재산분 포함) 각자 적용. 연금·배당은 이 기준으로 현금흐름에 반영됨.
          </p>
        </div>
      )}

      {/* 1인별 STOCK 배당 (실제 주식자산 × 명의, 연금시뮬과 별개) */}
      {(stockDiv.husband > 0 || stockDiv.wife > 0) && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">📈 STOCK 자산 배당 (1인별, 월)</h3>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🧑 남편</p>
              <p className="text-emerald-400 font-semibold">{formatManwon(stockDiv.husband)}/월</p>
              <p className="text-gray-500">연 {formatManwon(stockDiv.husband * 12)}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">👩 와이프</p>
              <p className="text-pink-400 font-semibold">{formatManwon(stockDiv.wife)}/월</p>
              <p className="text-gray-500">연 {formatManwon(stockDiv.wife * 12)}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-gray-500 mb-1">🏠 가구 합계</p>
              <p className="text-gray-100 font-semibold">{formatManwon(stockDiv.husband + stockDiv.wife)}/월</p>
              <p className="text-gray-500">연 {formatManwon((stockDiv.husband + stockDiv.wife) * 12)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            실제 STOCK 자산의 배당 이력/예측을 각 자산의 명의 지분으로 분할. 현금흐름 표의 배당 라인은 가구 합계(연 15.4% 근사) 유지.
          </p>
        </div>
      )}

      {/* 연도별 현금흐름 테이블 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">📊 연도별 현금흐름 <span className="text-[11px] font-normal text-gray-500">(단위: 천원/월)</span></h3>
        <div className="overflow-x-auto">
          <p className="text-[11px] text-gray-500 mb-2 landscape:hidden">📌 세로 모드: 핵심 6열만 표시. 전체 내역은 가로로 돌려보세요.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-2 font-medium whitespace-nowrap">연도(나이)</th>
                {/* 수입 그룹 (연한 초록 배경) */}
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">연금/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">배당/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">급여/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-emerald-950/30">가수금/월</th>
                <th className="text-right py-2 px-1 font-medium bg-emerald-950/30">월수입</th>
                {/* 지출 그룹 (연한 빨강 배경) */}
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">생활비/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">여행+의료/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">건보/월</th>
                <th className="hidden landscape:table-cell text-right py-2 px-1 font-medium bg-red-950/20">세금/월</th>
                <th className="text-right py-2 px-1 font-medium bg-red-950/20">월지출</th>
                {/* 결과 그룹 */}
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
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-300 bg-emerald-950/30">
                      {row.pensionMonthly > 0 ? fmtK(row.pensionMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-emerald-400 bg-emerald-950/30">
                      {row.dividendMonthly > 0 ? fmtK(row.dividendMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-blue-400 bg-emerald-950/30">
                      {row.corpSalaryMonthly > 0 ? fmtK(row.corpSalaryMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-cyan-400 bg-emerald-950/30">
                      {row.corpReturnMonthly > 0 ? fmtK(row.corpReturnMonthly) : '—'}
                    </td>
                    <td className="text-right py-2 px-1 font-semibold text-gray-100 bg-emerald-950/30">
                      {fmtK(row.totalIncome)}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">{fmtK(row.expenseMonthly)}</td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">
                      {(row.travelMonthly + row.medicalMonthly) > 0 ? fmtK(row.travelMonthly + row.medicalMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-gray-400 bg-red-950/20">
                      {row.healthInsuranceMonthly > 0 ? fmtK(row.healthInsuranceMonthly) : '—'}
                    </td>
                    <td className="hidden landscape:table-cell text-right py-2 px-1 text-orange-400 bg-red-950/20">
                      {row.taxMonthly > 0 ? fmtK(row.taxMonthly) : '—'}
                    </td>
                    <td className="text-right py-2 px-1 font-semibold text-gray-100 bg-red-950/20">
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
