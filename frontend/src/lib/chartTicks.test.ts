// 4단계 3a — X축 tick 을 달력 경계 기준으로 규칙적으로
import { describe, it, expect } from 'vitest'
import { axisTicks, tickCountForWidth } from './chartTicks'

/** from~to 일별 날짜 */
function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function checkInvariants(ticks: string[], dates: string[], max: number) {
  const sorted = [...new Set(dates)].sort()
  expect(ticks.length).toBeLessThanOrEqual(Math.max(2, max))
  expect(ticks[0]).toBe(sorted[0])
  expect(ticks[ticks.length - 1]).toBe(sorted[sorted.length - 1])
  expect([...ticks].sort()).toEqual(ticks)
  expect(new Set(ticks).size).toBe(ticks.length)
  for (const t of ticks) expect(sorted).toContain(t)
}

describe('axisTicks', () => {
  it('10년 일별 → 연초(또는 n년 경계) 정렬', () => {
    const d = days('2016-10-16', '2026-10-16')
    const t = axisTicks(d, 5)
    checkInvariants(t, d, 5)
    // 중간 tick 은 모두 1월 1일
    for (const x of t.slice(1, -1)) expect(x.slice(5)).toBe('01-01')
    // 같은 간격(년 단위)
    const years = t.slice(1, -1).map((x) => +x.slice(0, 4))
    const gaps = years.slice(1).map((y, i) => y - years[i])
    expect(new Set(gaps).size).toBeLessThanOrEqual(1)
  })

  it('1년 일별 → 월초, 같은 개월 간격', () => {
    const d = days('2025-10-16', '2026-10-16')
    const t = axisTicks(d, 5)
    checkInvariants(t, d, 5)
    const inner = t.slice(1, -1)
    expect(inner.length).toBeGreaterThan(0)
    for (const x of inner) expect(x.slice(8)).toBe('01')
    const months = inner.map((x) => +x.slice(0, 4) * 12 + +x.slice(5, 7))
    const gaps = months.slice(1).map((m, i) => m - months[i])
    expect(new Set(gaps).size).toBeLessThanOrEqual(1)
  })

  it('3개월 일별 → 월초', () => {
    const d = days('2026-07-16', '2026-10-16')
    const t = axisTicks(d, 5)
    checkInvariants(t, d, 5)
    expect(t).toEqual(['2026-07-16', '2026-08-01', '2026-09-01', '2026-10-01', '2026-10-16'])
  })

  it('1개월 일별 → 주 단위(월요일)', () => {
    const d = days('2026-09-16', '2026-10-16')
    const t = axisTicks(d, 6)
    checkInvariants(t, d, 6)
    for (const x of t.slice(1, -1)) expect(new Date(x + 'T00:00:00Z').getUTCDay()).toBe(1)
  })

  it('끝과 너무 가까운 중간 tick 제거', () => {
    // 2026-09-30 ~ 2026-12-02, 3개: 10-01 은 첫날과 1일 차이 → 제거, 12-01 도 끝과 1일 차이 → 제거
    const d = days('2026-09-30', '2026-12-02')
    const t = axisTicks(d, 3)
    expect(t).toEqual(['2026-09-30', '2026-11-01', '2026-12-02'])
  })

  it('빈 배열·단일 날짜·적은 날짜는 그대로', () => {
    expect(axisTicks([], 5)).toEqual([])
    expect(axisTicks(['2026-01-01'], 5)).toEqual(['2026-01-01'])
    expect(axisTicks(['2026-03-01', '2026-01-01', '2026-01-01'], 5)).toEqual(['2026-01-01', '2026-03-01'])
  })

  it('불규칙(희소) 날짜에서도 불변식 유지', () => {
    const d = ['2019-03-02', '2019-11-20', '2021-06-01', '2021-06-02', '2023-12-31', '2024-01-01', '2026-10-16']
    for (const max of [2, 3, 4, 5]) checkInvariants(axisTicks(d, max), d, max)
  })

  it('maxTicks 가 매우 작아도 첫·끝은 유지', () => {
    const d = days('2016-01-01', '2026-10-16')
    expect(axisTicks(d, 1)).toEqual(['2016-01-01', '2026-10-16'])
  })
})

describe('tickCountForWidth', () => {
  it('390px 폰 → 5, 상·하한 3~10', () => {
    expect(tickCountForWidth(390)).toBe(5)
    expect(tickCountForWidth(100)).toBe(3)
    expect(tickCountForWidth(3000)).toBe(10)
  })
})
