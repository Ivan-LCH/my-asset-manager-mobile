// 4단계 — 분석 주의문: 기본 접힘 + 요약줄, 경고 시 자동 펼침, 계산 가정은 안쪽에 접힘
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AnalysisNotices } from './AnalysisNotices'

const NOTES = [
  '연금 계좌 운용 가정: 상승률 3% + 배당률 2%. 미저장 기본값은 각각 0%이며 실제 수익을 보장하지 않습니다.',
  '퇴직 목돈 연결 확인 필요',
  '수동 보유세 개시 연도가 없어 은퇴 예정 연도부터 적용했습니다.',
]
const render = (props: Parameters<typeof AnalysisNotices>[0]) =>
  renderToStaticMarkup(<MemoryRouter><AnalysisNotices {...props} /></MemoryRouter>)
/** 바깥 details 여는 태그 */
const outerTag = (html: string) => html.match(/<details[^>]*data-analysis-notices[^>]*>/)![0]
/** 안쪽 계산 가정 details 여는 태그 + 내용 */
const inner = (html: string) => html.match(/<details[^>]*data-notice-assumptions[^>]*>[\s\S]*?<\/details>/)?.[0]

describe('AnalysisNotices', () => {
  it('경고 없음 → 접힌 채 요약줄만', () => {
    const html = render({ notes: NOTES })
    expect(outerTag(html)).not.toMatch(/\sopen/)
    expect(html).toContain('계산에 사용한 가정·확인 사항')
    expect(html).toContain('· 확인 필요 1건 · 계산 가정 2건')
  })

  it('지급 부족 → 펼친 채 시작, 확인 필요는 바로 보이고 계산 가정은 안쪽 details 에 접힘', () => {
    const html = render({ notes: NOTES, shortfall: true })
    expect(outerTag(html)).toMatch(/\sopen/)
    expect(html).toContain('지급 부족')
    expect(html).toMatch(/data-notice-actions[^>]*><li>퇴직 목돈 연결 확인 필요<\/li><\/ul>/)
    const assumptions = inner(html)!
    expect(assumptions).not.toMatch(/^<details[^>]*\sopen/)
    expect(assumptions).toContain('계산 가정 2건')
    expect(assumptions.match(/<li>/g)).toHaveLength(2)
    expect(assumptions).not.toContain('퇴직 목돈 연결 확인 필요')
  })

  it('IRP 미연결 → 펼침 + 연결 링크, 가정이 없으면 안쪽 details 없음', () => {
    const html = render({ notes: [], incomplete: true })
    expect(outerTag(html)).toMatch(/\sopen/)
    expect(html).toContain('href="/analysis?tab=pension-sim"')
    expect(inner(html)).toBeUndefined()
  })

  it('표시할 것이 없으면 렌더하지 않음', () => {
    expect(render({ notes: [] })).toBe('')
  })
})
