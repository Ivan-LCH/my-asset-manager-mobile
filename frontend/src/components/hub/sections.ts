// 입력/설정 허브 — 섹션 목록·링크·옛 URL 리다이렉트 (UI 간소화 A안).
// 섹션 id는 URL(?section=… 또는 #…)과 DOM id로 함께 쓰이므로 바꾸지 않는다.
export const HUB_PATH = '/settings'

export const HUB_SECTIONS = [
  { id: 'people',  title: '① 인물·은퇴',          aliases: ['retirement', 'person', 'birth'] },
  { id: 'living',  title: '② 생활비·여행·의료',    aliases: ['expenses', 'expense', 'prep', 'travel', 'medical'] },
  { id: 'lumpsum', title: '③ 목돈·행선지',        aliases: ['allocation', 'allocations', 'emergency', 'severance'] },
  { id: 'invest',  title: '④ 연금·주식 가정',      aliases: ['pension', 'stock', 'portfolio', 'dividend', 'holding-tax', 'link'] },
  { id: 'tax',     title: '⑤ 세금·건보',          aliases: ['health', 'income-tax-settings', 'corp', 'corp-sim', 'corp-inputs'] },
  { id: 'data',    title: '⑥ 합산·백업',          aliases: ['backup', 'totals', 'drive'] },
] as const

export type HubSectionId = typeof HUB_SECTIONS[number]['id']

/** 허브 섹션 링크. hash 를 주면 섹션 안의 세부 위치(예: income-tax-settings)까지 연다. */
export const hubLink = (id: HubSectionId, hash?: string) => `${HUB_PATH}?section=${id}${hash ? '#' + hash : ''}`

function findSection(key: string | null | undefined): HubSectionId | null {
  if (!key) return null
  const k = key.replace(/^#/, '').toLowerCase()
  return HUB_SECTIONS.find((s) => s.id === k || (s.aliases as readonly string[]).includes(k))?.id ?? null
}

/** URL(?section= 우선, 없으면 #해시)에서 열 섹션을 찾는다. */
export function resolveHubSection(search: string, hash = ''): HubSectionId | null {
  return findSection(new URLSearchParams(search).get('section')) ?? findSection(hash)
}

/** 분석 탭 값 */
export const ANALYSIS_TABS = ['year', 'cashflow', 'advanced'] as const
export type AnalysisTab = typeof ANALYSIS_TABS[number]
export const advancedLink = (sim: 'pension' | 'corp') => `/analysis?tab=advanced&sim=${sim}`

/**
 * 옛 분석 탭 URL → 새 위치. 그대로 두면 되는 경우 null.
 * - ?tab=prep → 허브 ② 생활비 (#lumpsum 등 해시가 섹션이면 그 섹션)
 * - ?tab=pension-sim → 분석 › 고급 › 연금 시뮬 결과 (#income-tax-settings 는 허브 ⑤ 세금 추가정보)
 * - ?tab=corp-sim → 분석 › 고급 › 법인 시뮬 결과
 */
export function legacyAnalysisRedirect(search: string, hash = ''): string | null {
  const tab = new URLSearchParams(search).get('tab')
  if (tab === 'prep') return hubLink(findSection(hash) ?? 'living')
  if (tab === 'pension-sim') return hash === '#income-tax-settings' ? hubLink('tax', 'income-tax-settings') : advancedLink('pension')
  if (tab === 'corp-sim') return advancedLink('corp')
  return null
}
