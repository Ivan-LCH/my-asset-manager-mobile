// 분석 화면 주의문(AnalysisNotices) 분류 — 표시 구조만 정하고 문구는 바꾸지 않는다.
// 실데이터에서 23항목·약 71줄이 한 번에 펼쳐져 KPI 아래를 모두 덮던 문제(4단계)를
// "확인 필요"(사용자 조치 대상)와 "계산 가정"(설명)으로 나눠 가정은 접어 둔다.

export interface NoticeInput {
  notes: string[]
  holdingNotes?: { name?: string; message: string }[]
  holdingIncomplete?: boolean
  shortfall?: boolean
  incomplete?: boolean
}

export interface NoticeGroups {
  title: string
  /** 펼친 채 시작 — 지급 부족·IRP 연결·세금 미반영 경고가 있을 때 (기존과 같은 조건) */
  open: boolean
  actions: string[]
  assumptions: string[]
  /** 접힌 상태의 요약줄 — "확인 필요 N건 · 계산 가정 M건" */
  summary: string
}

/** 사용자가 확인·입력해야 하는 항목으로 보는 문구 패턴 */
export const ACTION_NOTE = /확인 필요|확인이 필요|확인하세요|미확정|미산정|찾지 못|빠릅니다|미설정/

export function groupNotices({ notes, holdingNotes, holdingIncomplete = false, shortfall = false, incomplete = false }: NoticeInput): NoticeGroups | null {
  const list = [...new Set([...notes, ...(holdingNotes?.map((n) => (n.name ? n.name + ': ' : '') + n.message) ?? [])])]
  if (!list.length && !shortfall && !incomplete) return null
  const actions = list.filter((s) => ACTION_NOTE.test(s))
  const assumptions = list.filter((s) => !ACTION_NOTE.test(s))
  const title = incomplete ? 'IRP 연결 확인 필요 · 추가 연금 미산정'
    : holdingIncomplete ? '일부 세금 미반영 · 결과 확인 필요'
    : shortfall ? '연금 계좌 지급 부족이 있습니다'
    : '계산에 사용한 가정·확인 사항'
  const summary = [actions.length ? `확인 필요 ${actions.length}건` : '', assumptions.length ? `계산 가정 ${assumptions.length}건` : '']
    .filter(Boolean).join(' · ')
  return { title, open: holdingIncomplete || shortfall || incomplete, actions, assumptions, summary }
}
