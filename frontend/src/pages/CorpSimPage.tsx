import { useState, useEffect, useCallback } from 'react'
import { Save, ChevronDown, AlertTriangle } from 'lucide-react'
import { useCorpSim, useSaveCorpSim } from '@/hooks/useCorpSim'
import {
  EMPTY_CORP_PLAN, DEFAULT_CORP_TAX, grossDividend, computeCorp, computePersonal,
  sonAccumulation, returnMonths, recommendDividendForSon, shareSum, simulateRunway,
} from '@/lib/corpSim'
import { formatManwon } from '@/lib/utils'
import type { CorpSimPlan, CorpTaxParams } from '@/types'

// ── 헬퍼 ───────────────────────────────────────────────────
function numFmt(v: number) { return v > 0 ? Math.round(v).toLocaleString() : '' }
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate">{title}</span>
          {badge && <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-700 space-y-4">{children}</div>}
    </div>
  )
}

function AmountInput({ value, onChange, placeholder = '금액' }: {
  value: number; onChange: (v: number) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input
      type="text" inputMode="numeric"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
      placeholder={placeholder} value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => { const n = parseNum(raw); onChange(n); setRaw(n > 0 ? numFmt(n) : '') }}
    />
  )
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" inputMode="decimal"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
        value={value || ''} onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="text-xs text-gray-500 shrink-0">{suffix}</span>}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

function Kpi({ label, value, sub, color = 'text-gray-100' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
      <p className="text-[11px] sm:text-xs text-gray-500 mb-1 truncate">{label}</p>
      <p className={`text-[13px] sm:text-lg font-bold ${color} break-words`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="w-40 sm:w-48 shrink-0">{children}</div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function CorpSimPage() {
  const { data: saved } = useCorpSim()
  const saveMut = useSaveCorpSim()

  const [plan, setPlan] = useState<CorpSimPlan>(EMPTY_CORP_PLAN)
  const [dirty, setDirty] = useState(false)
  const [sonYears, setSonYears] = useState(10)

  useEffect(() => {
    if (saved) {
      setPlan({
        ...EMPTY_CORP_PLAN,
        ...saved,
        tax: { ...DEFAULT_CORP_TAX, ...(saved.tax ?? {}) },
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof CorpSimPlan>(key: K, val: CorpSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])
  const updateTax = useCallback(<K extends keyof CorpTaxParams>(key: K, val: CorpTaxParams[K]) => {
    setPlan((p) => ({ ...p, tax: { ...p.tax, [key]: val } }))
    setDirty(true)
  }, [])
  const handleSave = () => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })

  const corp = computeCorp(plan)
  const personal = computePersonal(plan)
  const accum = sonAccumulation(plan, sonYears)
  const months = returnMonths(plan)
  const recommend = recommendDividendForSon(plan)
  const shareOk = shareSum(plan) === 100
  const runway = simulateRunway(plan)
  const firstNet = runway.rows[0]?.net ?? 0

  // After 소득세 = 법인세 + 주주 배당세 총합(distributable × 15.4%)
  const afterTax = corp.corpTax + corp.distributable * plan.tax.dividendTaxRate
  const beforeTax = personal.dividendTax + personal.combinedExtra

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🏛️ 투자법인 시뮬레이터</h2>
        <button
          onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 self-start"
        >
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      {/* 면책 배너 */}
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/90 leading-relaxed">
          본 시뮬레이터의 모든 수치는 <b>입력 가정에 기반한 추정치</b>입니다. 세율·공식은 편집 가능하나,
          실제 세금·건강보험료는 개인 상황과 연도별 규정에 따라 다릅니다. 적용 전 <b>반드시 세무사·노무사에 확인</b>하세요.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="연간 법인 배당(세전)" value={formatManwon(corp.grossDividend)} sub={plan.targetDividendTotal > 0 ? '수동 지정' : `원금 × ${plan.dividendYield}%`} />
        <Kpi label="법인세(연)" value={formatManwon(corp.corpTax)} sub="초과누진 적용" color="text-red-400" />
        <Kpi label="아들 수령 배당(연·세후)" value={formatManwon(corp.perShare.son.net)} sub={`지분 ${plan.shareSon}%`} color="text-emerald-400" />
        <Kpi
          label="연간 현금 잔여"
          value={`${firstNet >= 0 ? '+' : ''}${formatManwon(firstNet)}`}
          sub={runway.sustainable ? '지속가능(원금 보존)' : '초과인출 → 원금 매도'}
          color={firstNet >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* 입력① 자산·운용 */}
      <Expander title="입력 ① 자산 · 운용" badge={`원금 ${formatManwon(plan.investAmount)}`} defaultOpen>
        <Section>
          <Row label="법인 운용 총자금"><AmountInput value={plan.investAmount} onChange={(v) => update('investAmount', v)} /></Row>
          <Row label="예상 배당수익률"><NumInput value={plan.dividendYield} onChange={(v) => update('dividendYield', v)} suffix="%" /></Row>
          <Row label="연 배당총액(0=자동)"><AmountInput value={plan.targetDividendTotal} onChange={(v) => update('targetDividendTotal', v)} placeholder="0" /></Row>
          <Row label="가수금 월 반환(생활비)"><AmountInput value={plan.monthlyReturn} onChange={(v) => update('monthlyReturn', v)} /></Row>
          <Row label="법인 연 유지비"><AmountInput value={plan.annualMaintCost} onChange={(v) => update('annualMaintCost', v)} /></Row>
        </Section>
      </Expander>

      {/* 입력② 지분·운영 */}
      <Expander title="입력 ② 지분 · 운영" badge={shareOk ? `지분 ${shareSum(plan)}%` : `⚠ 합 ${shareSum(plan)}%`}>
        <Section>
          <div className="grid grid-cols-3 gap-2">
            <Field label="부 지분(%)"><NumInput value={plan.shareHusband} onChange={(v) => update('shareHusband', v)} /></Field>
            <Field label="모 지분(%)"><NumInput value={plan.shareWife} onChange={(v) => update('shareWife', v)} /></Field>
            <Field label="자 지분(%)"><NumInput value={plan.shareSon} onChange={(v) => update('shareSon', v)} /></Field>
          </div>
          <Row label="대표(아내) 월급"><AmountInput value={plan.repSalaryMonthly} onChange={(v) => update('repSalaryMonthly', v)} /></Row>
          <Row label="직장건보(월·최저구간)"><AmountInput value={plan.employeeHealthMonthly} onChange={(v) => update('employeeHealthMonthly', v)} /></Row>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer py-1">
            <input type="checkbox" checked={plan.sonEmployed} onChange={(e) => update('sonEmployed', e.target.checked)} className="accent-blue-500" />
            아들 취업 상태 (건보 마진 한계 2천만 / 미취업 1천만)
          </label>
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">Before(개인 명의) 비교용</p>
            <Row label="개인명의 지역건보(연)"><AmountInput value={plan.personalHealthAnnual} onChange={(v) => update('personalHealthAnnual', v)} /></Row>
            <Row label="승계 비교 재산액"><AmountInput value={plan.giftTaxBase} onChange={(v) => update('giftTaxBase', v)} /></Row>
            <Row label="법인 설립비(초기)"><AmountInput value={plan.setupCost} onChange={(v) => update('setupCost', v)} /></Row>
          </div>
        </Section>
      </Expander>

      {/* 결과 상세 */}
      <Expander title="결과 — 법인 시나리오 상세" badge={`법인세 ${formatManwon(corp.corpTax)}`}>
        <Section>
          <Row label="배당총액(세전)"><span className="text-sm text-gray-100 text-right w-full block">{formatManwon(corp.grossDividend)}</span></Row>
          <Row label="법인세"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(corp.corpTax)}</span></Row>
          <Row label="배당가능(세후)"><span className="text-sm text-emerald-400 text-right w-full block">{formatManwon(corp.distributable)}</span></Row>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">주주</th>
                <th className="text-right py-2 px-2">지분</th>
                <th className="text-right py-2 px-2">배당(세전)</th>
                <th className="text-right py-2 px-2">배당소득세(15.4%)</th>
                <th className="text-right py-2 pl-2">수령(세후)</th>
              </tr></thead>
              <tbody>
                {([['부', plan.shareHusband, corp.perShare.husband], ['모', plan.shareWife, corp.perShare.wife], ['자', plan.shareSon, corp.perShare.son]] as const).map(([n, sh, ps]) => (
                  <tr key={n} className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-300">{n}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{sh}%</td>
                    <td className="text-right py-2 px-2 text-gray-200">{formatManwon(ps.gross)}</td>
                    <td className="text-right py-2 px-2 text-red-400">− {formatManwon(ps.gross * plan.tax.dividendTaxRate)}</td>
                    <td className="text-right py-2 pl-2 text-emerald-400 font-semibold">{formatManwon(ps.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Row label="건보·유지비(연)"><span className="text-sm text-gray-400 text-right w-full block">{formatManwon(corp.corpHealthAnnual + corp.maintAnnual)}</span></Row>
        </Section>
      </Expander>

      {/* 현금흐름 / 지속가능성 */}
      <Expander
        title="현금흐름 / 지속가능성"
        badge={runway.sustainable ? '지속가능' : '초과인출'}
        defaultOpen
      >
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            법인의 연간 배당 수입(현금 유입)이 가족이 빼는 돈(급여+가수금반환)을 커버하면 <b>원금(ETF) 보존 → 지속가능</b>.
            못하면 ETF 원금을 매도해 부족분을 메워야 → 원금 감소 → 배당도 줄고 → 가속적 고갈.
          </p>
          {(() => {
            const r0 = runway.rows[0]
            if (!r0) return null
            return (
              <>
                <Row label="현금 유입(배당수입)"><span className="text-sm text-emerald-400 text-right w-full block">{formatManwon(r0.cashIn)}</span></Row>
                <Row label="− 법인세"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(r0.tax)}</span></Row>
                <Row label="− 가족 인출(급여+가수금)"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(r0.familyDraw)}</span></Row>
                <Row label="= 연간 잔여"><span className={`text-sm font-bold text-right w-full block ${r0.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r0.net >= 0 ? '+' : ''}{formatManwon(r0.net)}</span></Row>
              </>
            )
          })()}

          {runway.sustainable ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-300">
              ✅ 지속가능 — 원금을 매도하지 않아도 됨. 잉여 {formatManwon(runway.rows[0]?.surplus ?? 0)}는 배당·재투자 가능.
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300 leading-relaxed">
              ⚠️ <b>초과인출</b> — 연간 {formatManwon(runway.annualShortfall)} 부족 → ETF 원금 매도로 메워야.
              현재 설정으론 원금이 매년 줄어 배당도 감소,{' '}
              <b>{runway.depletedYear ?? '?'}년 차 원금 고갈 예상</b>.
              급여·가수금반환을 줄이거나 수익률·원금을 늘려야 지속가능.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">연도</th>
                <th className="text-right py-2 px-2">잔존 원금</th>
                <th className="text-right py-2 px-2">배당수입</th>
                <th className="text-right py-2 pl-2">잔여(매도−)</th>
              </tr></thead>
              <tbody>
                {runway.rows.slice(0, 6).map((r) => (
                  <tr key={r.year} className={`border-b border-gray-700/50 ${r.principal <= 0 ? 'bg-red-500/5' : ''}`}>
                    <td className="py-2 pr-3 text-gray-300">{r.year}{r.principal <= 0 && <span className="ml-1 text-[10px] text-red-400">고갈</span>}</td>
                    <td className="text-right py-2 px-2 text-gray-200">{formatManwon(r.principal)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatManwon(r.cashIn)}</td>
                    <td className={`text-right py-2 pl-2 ${r.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.net >= 0 ? '+' : ''}{formatManwon(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Expander>

      {/* Before vs After */}
      <Expander title="Before vs After 대조" badge={`연간 차이 ${formatManwon((beforeTax + personal.personalHealthAnnual) - (afterTax + corp.corpHealthAnnual + corp.maintAnnual))}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 pr-3">구분</th>
              <th className="text-right py-2 px-2">개인 명의(Before)</th>
              <th className="text-right py-2 pl-2">법인 가동(After)</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">건강보험료(연)</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(personal.personalHealthAnnual)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">{formatManwon(corp.corpHealthAnnual)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">소득세(연·배당관련)</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(beforeTax)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">{formatManwon(afterTax)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">법인 유지비(연)</td>
                <td className="text-right py-2 px-2 text-gray-500">—</td>
                <td className="text-right py-2 pl-2 text-yellow-400">{formatManwon(corp.maintAnnual)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">자녀 승계(증여/상속 추정)</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(personal.giftTax)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">배당 출처 (별도 증여세 0)*</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-300">초기 비용(설립/명의)</td>
                <td className="text-right py-2 px-2 text-gray-500">0</td>
                <td className="text-right py-2 pl-2 text-yellow-400">{formatManwon(plan.setupCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600 mt-2">* 지분 증여(자본금 출자분)는 별도 증여세 공제 한도 적용. 승계는 대표직 승계·가업상속공제 등 사례별로 크게 달라짐.</p>
      </Expander>

      {/* 자녀 자금출처 */}
      <Expander title="자녀 자금출처 시뮬(배당 누적)" badge={`권고 배당총액 ${formatManwon(recommend)}`}>
        <Section>
          <Row label="시뮬 연수"><NumInput value={sonYears} onChange={setSonYears} suffix="년" /></Row>
          <p className="text-[11px] text-blue-400/90">
            아들 건보 마진 한계({plan.sonEmployed ? '2천만' : '1천만'})에 맞춘 권고 연 배당총액 ≈ {formatManwon(recommend)}.
            현재 설정({formatManwon(grossDividend(plan))})에서 아들 세후 연 {formatManwon(corp.perShare.son.net)}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">연도</th>
                <th className="text-right py-2 px-2">아들 배당(세후)</th>
                <th className="text-right py-2 pl-2">누적(자금출처)</th>
              </tr></thead>
              <tbody>
                {accum.map((r) => (
                  <tr key={r.year} className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-300">{r.year}</td>
                    <td className="text-right py-2 px-2 text-emerald-400">{formatManwon(r.sonDividend)}</td>
                    <td className="text-right py-2 pl-2 text-gray-100 font-semibold">{formatManwon(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Expander>

      {/* 세제 파라미터 */}
      <Expander title="세제 파라미터 (편집 가능)">
        <Section>
          <div className="grid grid-cols-2 gap-3">
            <Field label="법인세율(2억 이하)"><NumInput value={plan.tax.corpTaxRateLow * 100} onChange={(v) => updateTax('corpTaxRateLow', v / 100)} suffix="%" /></Field>
            <Field label="법인세율(2억 초과)"><NumInput value={plan.tax.corpTaxRateMid * 100} onChange={(v) => updateTax('corpTaxRateMid', v / 100)} suffix="%" /></Field>
            <Field label="법인세 구분 기준"><AmountInput value={plan.tax.corpTaxThreshold} onChange={(v) => updateTax('corpTaxThreshold', v)} /></Field>
            <Field label="배당소득세율"><NumInput value={plan.tax.dividendTaxRate * 100} onChange={(v) => updateTax('dividendTaxRate', v / 100)} suffix="%" /></Field>
            <Field label="금융소득종합과세 기준(연)"><AmountInput value={plan.tax.finIncomeCombinedThr} onChange={(v) => updateTax('finIncomeCombinedThr', v)} /></Field>
            <Field label="종합한계세율(추정)"><NumInput value={plan.tax.combinedMarginalRate * 100} onChange={(v) => updateTax('combinedMarginalRate', v / 100)} suffix="%" /></Field>
            <Field label="자녀 승계 세율(추정)"><NumInput value={plan.tax.giftTaxRate * 100} onChange={(v) => updateTax('giftTaxRate', v / 100)} suffix="%" /></Field>
          </div>
        </Section>
      </Expander>
    </div>
  )
}
