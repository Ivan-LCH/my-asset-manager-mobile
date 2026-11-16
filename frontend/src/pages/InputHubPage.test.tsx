// UI 간소화 A안 — 입력/설정 허브: 섹션 6개(고정 앵커), 빠진 항목 체크리스트, URL로 섹션 열기, 섹션별 단일 편집기
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import InputHubPage from './InputHubPage'
import { LumpsumHubSection } from '@/components/hub/LumpsumHubSection'
import { RetirementYearsSummary } from '@/components/retirement/RetirementYearsSummary'
import type { PensionSimPlan, RetirementPlan, Settings } from '@/types'

const SETTINGS = { birthHusband: '1975.03', birthWife: '1978.07', retirementYear: 2035, wifeRetirementYear: 2038 } as Partial<Settings>
const RETIREMENT = {
  expenses: [{ id: 'e', name: '식비', amount: 1_000_000 }], travel: [], medicalMonthly: 100_000, emergency: [],
  lumpsum: [{ id: 'j', name: '전세금 반환', receiveYear: 2030, amount: 600_000_000, taxKind: 'other' }],
} as unknown as Partial<RetirementPlan>
const PENSION = { sources: [], allocations: [{ lumpsumId: 'j', irpAmount: 0, stockAmount: 0, destination: 'cash' }], healthHouseholdMode: 'joint' } as unknown as PensionSimPlan

function render(node: ReactNode, url: string, data: { settings?: unknown; retirement?: unknown; pension?: unknown } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['settings'], data.settings ?? SETTINGS)
  qc.setQueryData(['retirement'], data.retirement ?? RETIREMENT)
  qc.setQueryData(['pension-sim'], data.pension === undefined ? PENSION : data.pension)
  qc.setQueryData(['assets'], [])
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}>{node}</MemoryRouter></QueryClientProvider>)
}
const sectionTag = (html: string, id: string) => html.match(new RegExp(`<section[^>]*data-hub-section="${id}"[^>]*>`))?.[0]

describe('입력/설정 허브', () => {
  it('섹션 ①~⑥ 이 고정 id 로 모두 보이고, 입력이 다 있으면 「모두 입력됨」', () => {
    const html = render(<InputHubPage />, '/settings')
    for (const id of ['people', 'living', 'lumpsum', 'invest', 'tax', 'data']) expect(sectionTag(html, id)).toContain(`id="${id}"`)
    for (const title of ['① 인물·은퇴', '② 생활비·여행·의료', '③ 목돈·행선지', '④ 연금·주식 가정', '⑤ 세금·건보', '⑥ 합산·백업']) expect(html).toContain(title)
    expect(html).toContain('data-all-done')
    expect(html).toContain('모두 입력됨')
    // 아무 섹션도 지정하지 않으면 모두 접힘 (편집기 미표시)
    expect(html).not.toContain('data-people-editor')
  })
  it('빠진 항목만 체크리스트에 — 각 항목은 해당 섹션 링크', () => {
    const html = render(<InputHubPage />, '/settings', {
      settings: { birthWife: '1978.07' },
      retirement: { lumpsum: [{ id: 'k', name: '퇴직금', receiveYear: 2031, amount: 1e8, taxKind: 'severance' }] },
      pension: { ...PENSION, allocations: [], healthHouseholdMode: undefined },
    })
    expect(html).not.toContain('모두 입력됨')
    const items = [...html.matchAll(/<a [^>]*data-missing-item="[^"]+"[^>]*>/g)].map(([tag]) => [tag.match(/data-missing-item="([^"]+)"/)![1], tag.match(/href="([^"]+)"/)![1]])
    expect(items).toEqual([
      ['birth', '/settings?section=people'], ['retirementYear', '/settings?section=people'], ['wifeRetirementYear', '/settings?section=people'],
      ['expenses', '/settings?section=living'], ['medical', '/settings?section=living'],
      ['lumpsum:k', '/settings?section=lumpsum'], ['health', '/settings?section=tax'],
    ])
    expect(sectionTag(html, 'people')).toBeDefined()
    expect(html).toMatch(/빠짐 3/)   // ① 헤더 배지
  })
  it.each([['/settings?section=people'], ['/settings#people'], ['/settings?section=retirement']])('%s → ① 인물·은퇴 열림 + 은퇴 연도 편집기', (url) => {
    const html = render(<InputHubPage />, url)
    expect(sectionTag(html, 'people')).toContain('data-open="true"')
    expect(sectionTag(html, 'living')).not.toContain('data-open')
    expect(html).toContain('data-people-editor')
    expect(html).toContain('aria-label="본인 은퇴 연도"')
    expect(html).toContain('aria-label="와이프 은퇴 연도"')
    // 표시값 = 분석이 쓰는 값 (설정 2035 / 2038)
    expect(html).toMatch(/aria-label="본인 은퇴 연도"[^>]*value="2035"/)
    expect(html).toContain('인물·은퇴 저장')
  })
  it('은퇴 입력(RetirementPlan)에 값이 있으면 그 값을 보여 준다 (우선순위 유지)', () => {
    const html = render(<InputHubPage />, '/settings?section=people', { retirement: { ...RETIREMENT, retirementYear: 2033, wifeRetirementYear: 2036 } })
    expect(html).toMatch(/aria-label="본인 은퇴 연도"[^>]*value="2033"/)
    expect(html).toMatch(/aria-label="와이프 은퇴 연도"[^>]*value="2036"/)
  })
})

describe('③ 목돈·행선지 = 목돈 단일 편집기', () => {
  it('일반 목돈 카드(행선지·명의·배당주 비율)와 섹션 저장 버튼', () => {
    const html = render(<LumpsumHubSection />, '/settings?section=lumpsum')
    expect(html).toContain('data-general-lumpsum="j"')
    expect(html).toContain('행선지')
    expect(html).toContain('목돈·행선지 저장')
  })
  it('퇴직금에는 IRP 분배 입력이 붙는다', () => {
    const html = render(<LumpsumHubSection />, '/settings?section=lumpsum', {
      retirement: { ...RETIREMENT, lumpsum: [{ id: 's', name: '희망퇴직금', receiveYear: 2031, amount: 3e8, taxKind: 'severance' }] },
    })
    expect(html).toContain('data-severance-lumpsum="s"')
    expect(html).toContain('→ 퇴직IRP (연금으로 굴림)')
  })
})

describe('은퇴 연도 읽기 전용 표시', () => {
  it('입력 없이 값 + 「수정」(허브 ①) 링크', () => {
    const html = renderToStaticMarkup(<MemoryRouter><RetirementYearsSummary husband={2035} wife={2038} spouse /></MemoryRouter>)
    expect(html).not.toContain('<input')
    expect(html).toContain('2035')
    expect(html).toContain('2038')
    expect(html).toContain('href="/settings?section=people"')
  })
})
