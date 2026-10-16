// 4단계 — 모바일 하단 탭에 설정 진입점 복구 (f25c21a에서 제거됐던 회귀)
import { describe, it, expect } from 'vitest'
import { TABS } from './bottomTabs'

const activeLabels = (p: string) => TABS.filter((t) => t.match(p)).map((t) => t.label)

describe('하단 탭', () => {
  it('홈·자산·분석·설정 4개', () => {
    expect(TABS.map((t) => [t.to, t.label])).toEqual([
      ['/', '홈'], ['/assets', '자산'], ['/analysis', '분석'], ['/settings', '설정'],
    ])
  })
  it('경로별 활성 탭은 정확히 하나', () => {
    expect(activeLabels('/settings')).toEqual(['설정'])
    expect(activeLabels('/')).toEqual(['홈'])
    expect(activeLabels('/assets/abc')).toEqual(['자산'])
    expect(activeLabels('/stock')).toEqual(['자산'])
    expect(activeLabels('/plan')).toEqual(['분석'])
    expect(activeLabels('/pension/sim')).toEqual(['분석'])
  })
})
