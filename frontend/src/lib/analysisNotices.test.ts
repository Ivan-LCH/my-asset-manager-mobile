// 4단계 — 분석 주의문 분류 (문구는 그대로, 확인 필요 / 계산 가정으로만 나눔)
import { describe, it, expect } from 'vitest'
import { groupNotices } from './analysisNotices'

// 실제 코드의 문구 템플릿에서 가져온 대표 문구 (useAnalysisEngine·monthlyPension·analysisInputs·holdingTax)
const ACTIONS = [
  '퇴직IRP: 연결 계좌를 찾지 못해 잔액 미확정',
  '퇴직 목돈 연결 확인 필요',
  '연금저축: 연금 수령인 단독 명의를 확인하세요. 명의 미확정·공동지분은 기존 분석 명의(없으면 남편)를 임시 사용합니다.',
  '생활비·여행비·의료비 물가상승률 미설정: 기존 고정 금액으로 계산합니다. 생활비·목돈 입력에서 확인하세요.',
  '기본 모드는 등록 지급액 기준입니다. 연금소득세는 미산정이므로 세금 합계를 확정 납부액으로 보지 마세요.',
  '공사 중 토지의 건강보험 재산 과표는 별도 확인이 필요합니다. 주택으로 전환되기 전 주택 과표는 포함하지 않습니다.',
]
const ASSUMPTIONS = [
  '생활비·여행비·의료비는 2026년 금액 기준, 연 2.5% 증가 가정입니다. 세금·건보·목돈·일회 지출에는 이 비율을 중복 적용하지 않습니다.',
  '연금 계좌 운용 가정: 상승률 3% + 배당률 2%. 미저장 기본값은 각각 0%이며 실제 수익을 보장하지 않습니다.',
  '월별 계획: 월초 잔액에 총수익률을 적용하고 월말 납입·이전·지급합니다. 보험 연금은 조회액 가정이며 납입액으로 지급액을 임의 증액하지 않습니다. 연간 금액 ÷ 12는 연평균 월액으로, 첫해 실제 수령월 월액과 다릅니다.',
  '수동 보유세 개시 연도가 없어 은퇴 예정 연도부터 적용했습니다.',
]

describe('groupNotices', () => {
  it('문구를 확인 필요 / 계산 가정으로 나누고 순서를 유지', () => {
    const g = groupNotices({ notes: [ASSUMPTIONS[0], ACTIONS[0], ...ASSUMPTIONS.slice(1), ...ACTIONS.slice(1)] })!
    expect(g.actions).toEqual(ACTIONS)
    expect(g.assumptions).toEqual(ASSUMPTIONS)
    expect(g.summary).toBe('확인 필요 6건 · 계산 가정 4건')
  })

  it('경고가 없으면 접힌 채 시작 (open=false)', () => {
    const g = groupNotices({ notes: ASSUMPTIONS })!
    expect(g.open).toBe(false)
    expect(g.title).toBe('계산에 사용한 가정·확인 사항')
    expect(g.summary).toBe('계산 가정 4건')
  })

  it('지급 부족·IRP 연결·세금 미반영은 기존처럼 펼친 채 시작하고 제목 우선순위 유지', () => {
    expect(groupNotices({ notes: [], shortfall: true })).toMatchObject({ open: true, title: '연금 계좌 지급 부족이 있습니다', summary: '' })
    expect(groupNotices({ notes: ['x'], incomplete: true, shortfall: true })).toMatchObject({ open: true, title: 'IRP 연결 확인 필요 · 추가 연금 미산정' })
    expect(groupNotices({ notes: ['x'], holdingIncomplete: true, shortfall: true })).toMatchObject({ open: true, title: '일부 세금 미반영 · 결과 확인 필요' })
  })

  it('보유세 노트는 이름 접두사를 붙여 합치고 중복 제거', () => {
    const g = groupNotices({
      notes: [ASSUMPTIONS[0], ASSUMPTIONS[0], '아파트: 공시가격 확인 필요'],
      holdingNotes: [{ name: '아파트', message: '공시가격 확인 필요' }, { message: '일반 개인 주택 기준 추정: 인별 9억 공제. 세부담상한은 별도 확인 필요.' }],
    })!
    expect(g.actions).toEqual(['아파트: 공시가격 확인 필요', '일반 개인 주택 기준 추정: 인별 9억 공제. 세부담상한은 별도 확인 필요.'])
    expect(g.assumptions).toEqual([ASSUMPTIONS[0]])
  })

  it('표시할 것이 없으면 null', () => {
    expect(groupNotices({ notes: [] })).toBeNull()
    expect(groupNotices({ notes: [], holdingNotes: [] })).toBeNull()
  })
})
