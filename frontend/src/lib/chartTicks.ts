// 차트 X축 tick 선택 — 데이터 인덱스가 아닌 달력 경계(주·2주·월·분기·반기·연) 기준으로 고른다.
// recharts 의 interval="preserveStartEnd" 는 인덱스 간격으로 골라 라벨 간격이 들쭉날쭉했다
// (예: 1y `25-10 25-12 26-01 26-03 …`). 데이터는 건드리지 않고 tick 위치만 정한다.

type Step = { days: number } | { months: number }

// 작은 간격부터 시도 — maxTicks 안에 들어오는 첫 간격을 쓴다
const STEPS: Step[] = [
  { days: 7 }, { days: 14 }, { months: 1 }, { months: 2 }, { months: 3 }, { months: 6 },
  { months: 12 }, { months: 24 }, { months: 60 }, { months: 120 },
]

/** 'YYYY-MM-DD' → 1970-01-01 기준 일수 (UTC, 시간대 무관) */
const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000

/** 날짜가 속한 구간 번호 — 주는 월요일 시작(1970-01-01 = 목요일), 월 단위는 연초 정렬 */
function bucket(d: string, step: Step): number {
  if ('days' in step) return Math.floor((dayNumber(d) + 3) / step.days)
  return Math.floor((+d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1)) / step.months)
}

/**
 * X축 tick 날짜 목록. 반환값은 모두 입력에 있는 날짜(카테고리 축용), 정렬·중복 없음.
 * - 첫·마지막 날짜는 항상 포함
 * - 중간 tick 은 각 구간(주/2주/월/n개월/n년)의 첫 데이터 날짜 = 달력 경계
 * - 첫·끝과 tick 한 칸 폭(전체 기간 / maxTicks)의 60%보다 가까운 중간 tick 은 제거 (라벨 겹침 방지)
 * - 길이 ≤ max(2, maxTicks)
 */
export function axisTicks(dates: string[], maxTicks: number): string[] {
  const uniq = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)))].sort()
  const limit = Math.max(2, Math.floor(maxTicks))
  if (uniq.length <= limit) return uniq
  const first = uniq[0], last = uniq[uniq.length - 1]
  const firstDay = dayNumber(first), lastDay = dayNumber(last)
  const minGap = ((lastDay - firstDay) / limit) * 0.6
  for (const step of STEPS) {
    const inner: string[] = []
    let prev = bucket(first, step)
    for (const d of uniq) {
      const b = bucket(d, step)
      if (b === prev) continue
      prev = b
      const day = dayNumber(d)
      if (d !== last && day - firstDay >= minGap && lastDay - day >= minGap) inner.push(d)
    }
    if (inner.length + 2 <= limit) return [first, ...inner, last]
  }
  return [first, last]
}

/** 화면 폭에 맞는 최대 tick 수 — 라벨 하나에 약 72px (390px 폰 → 5개) */
export function tickCountForWidth(width: number): number {
  return Math.min(10, Math.max(3, Math.floor(width / 72)))
}

/** 현재 창 폭 기준 tick 수 (SSR·테스트 환경에서는 모바일 기준 5) */
export const axisTickCount = () => tickCountForWidth(typeof window === 'undefined' ? 390 : window.innerWidth)
