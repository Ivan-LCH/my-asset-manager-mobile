// 입력/설정 허브 (/settings) — 분석에 쓰는 입력을 한곳에서 고친다 (UI 간소화 A안).
// 위: 빠진 항목만 모은 체크리스트. 아래: 접이식 섹션 ①~⑥. 섹션은 ?section=<id> 또는 #<id> 로 바로 열린다.
// 섹션마다 저장 버튼이 따로 있고, 저장 위치(키·필드)는 예전 화면과 같다.
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement } from '@/hooks/useRetirement'
import { usePensionSim } from '@/hooks/usePensionSim'
import { hasSpouse } from '@/lib/people'
import { formatManwon } from '@/lib/utils'
import { HUB_SECTIONS, hubLink, resolveHubSection, type HubSectionId } from '@/components/hub/sections'
import { hubMissing } from '@/components/hub/checklist'
import { HubSection } from '@/components/hub/HubSection'
import { PeopleSection, effectiveYears } from '@/components/hub/PeopleSection'
import { LivingSection, livingMonthly } from '@/components/hub/LivingSection'
import { LumpsumHubSection } from '@/components/hub/LumpsumHubSection'
import { InvestSection } from '@/components/hub/InvestSection'
import { TaxSection } from '@/components/hub/TaxSection'
import { retirementInputs } from '@/lib/analysisInputs'
import Settings from './Settings'

const BODIES: Record<HubSectionId, () => JSX.Element> = {
  people: PeopleSection, living: LivingSection, lumpsum: LumpsumHubSection, invest: InvestSection, tax: TaxSection, data: Settings,
}

export default function InputHubPage() {
  const { search, hash } = useLocation()
  const target = resolveHubSection(search, hash)
  const [open, setOpen] = useState<Set<HubSectionId>>(() => new Set(target ? [target] : []))
  const settings = useSettings(), retirement = useRetirement(), pension = usePensionSim()

  // URL로 지정한 섹션 열고 스크롤 (체크리스트·「수정」 링크·옛 URL 리다이렉트 공통)
  useEffect(() => {
    if (!target) return
    setOpen((s) => s.has(target) ? s : new Set(s).add(target))
    // 섹션 내용이 불러와지며 길어지므로 잠깐 몇 번 다시 맞춘다 (사용자가 스크롤하면 중단)
    let stopped = false
    const stop = () => { stopped = true }
    window.addEventListener('touchstart', stop, { once: true }); window.addEventListener('wheel', stop, { once: true })
    const scroll = () => {
      if (stopped) return
      const inner = hash && hash.slice(1) !== target ? document.getElementById(hash.slice(1)) : null
      ;(inner ?? document.getElementById(target))?.scrollIntoView({ block: 'start' })
    }
    const timers = [0, 250, 700].map((ms) => setTimeout(scroll, ms))
    return () => { timers.forEach(clearTimeout); window.removeEventListener('touchstart', stop); window.removeEventListener('wheel', stop) }
  }, [target, hash])
  const toggle = (id: HubSectionId) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const loading = settings.isPending || retirement.isPending || pension.isPending
  const missing = loading ? [] : hubMissing(settings.data, retirement.data, pension.data)
  const plan = retirementInputs(retirement.data ?? {}, settings.data ?? {}).plan
  const years = effectiveYears(retirement.data, settings.data)
  const summaries: Partial<Record<HubSectionId, string>> = loading ? {} : {
    people: `본인 은퇴 ${years.husband ?? '미입력'}${hasSpouse(settings.data ?? {}) ? ` · 와이프 ${years.wife ?? '미입력'}` : ''}`,
    living: `월 ${formatManwon(livingMonthly(plan))}`,
    lumpsum: `목돈 ${plan.lumpsum.length}건 · 긴급자금 ${plan.emergency.length}건`,
    invest: plan.linkCorpSim ? '법인 연동' : plan.linkPensionSim ? '연금 연동' : '등록 자산 기준',
    tax: '건보 세대·세금 추가정보·법인 입력',
    data: 'Drive·파일 백업, 합산 기준',
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" data-input-hub>
      <header>
        <h1 className="text-xl font-bold text-gray-100">입력/설정</h1>
        <p className="text-sm text-gray-400">분석에 쓰는 숫자는 모두 여기서 고쳐요.</p>
      </header>

      <section className="rounded-xl border border-gray-700 bg-gray-900/40 p-4" data-missing-checklist aria-label="빠진 항목">
        <h2 className="text-sm font-semibold text-gray-200 mb-2">빠진 항목</h2>
        {loading ? <p role="status" className="text-xs text-gray-500">확인하는 중…</p>
          : missing.length === 0 ? <p className="flex items-center gap-1.5 text-sm text-emerald-400" data-all-done><CheckCircle2 className="w-4 h-4" /> 모두 입력됨</p>
            : <ul className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <li key={m.key}><Link to={hubLink(m.section)} data-missing-item={m.key}
                  className="inline-block rounded-full border border-amber-600/50 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/20">{m.label} →</Link></li>
              ))}
            </ul>}
      </section>

      {HUB_SECTIONS.map(({ id, title }) => {
        const Body = BODIES[id]
        return (
          <HubSection key={id} id={id} title={title} summary={summaries[id]} open={open.has(id)} onToggle={() => toggle(id)}
            missing={missing.filter((m) => m.section === id).length}>
            <Body />
          </HubSection>
        )
      })}
    </div>
  )
}
