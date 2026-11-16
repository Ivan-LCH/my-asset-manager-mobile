// UI 간소화 A안 — 허브 섹션 URL·옛 분석 탭 리다이렉트
import { describe, it, expect } from 'vitest'
import { HUB_SECTIONS, hubLink, resolveHubSection, legacyAnalysisRedirect } from './sections'

describe('허브 섹션 URL', () => {
  it('섹션 6개, id 고정', () => {
    expect(HUB_SECTIONS.map((s) => s.id)).toEqual(['people', 'living', 'lumpsum', 'invest', 'tax', 'data'])
  })
  it('?section= 우선, 없으면 #해시, 별칭도 인식', () => {
    expect(resolveHubSection('?section=lumpsum')).toBe('lumpsum')
    expect(resolveHubSection('', '#tax')).toBe('tax')
    expect(resolveHubSection('?section=retirement')).toBe('people')
    expect(resolveHubSection('', '#income-tax-settings')).toBe('tax')
    expect(resolveHubSection('?section=invest', '#people')).toBe('invest')
    expect(resolveHubSection('?section=nope')).toBeNull()
    expect(resolveHubSection('')).toBeNull()
  })
  it('hubLink', () => {
    expect(hubLink('people')).toBe('/settings?section=people')
    expect(hubLink('tax', 'income-tax-settings')).toBe('/settings?section=tax#income-tax-settings')
  })
})

describe('옛 분석 탭 리다이렉트', () => {
  it.each([
    ['?tab=prep', '', '/settings?section=living'],
    ['?tab=prep', '#lumpsum', '/settings?section=lumpsum'],
    ['?tab=pension-sim', '', '/analysis?tab=advanced&sim=pension'],
    ['?tab=pension-sim', '#income-tax-settings', '/settings?section=tax#income-tax-settings'],
    ['?tab=corp-sim', '', '/analysis?tab=advanced&sim=corp'],
  ])('%s%s → %s', (search, hash, to) => {
    expect(legacyAnalysisRedirect(search, hash)).toBe(to)
  })
  it.each(['', '?tab=year', '?tab=cashflow', '?tab=advanced&sim=corp'])('%s 는 그대로', (search) => {
    expect(legacyAnalysisRedirect(search)).toBeNull()
  })
})
