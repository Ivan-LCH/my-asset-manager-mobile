// 2단계 — 신규 자산 명의 기본값 (AssetCreateForm 전용, 저장된 자산은 건드리지 않음)
import { describe, it, expect } from 'vitest'
import { accountOwnerOf, defaultOwnership } from './ownershipDefaults'

const half = { husband: 50, wife: 50 }
const mine = { husband: 100, wife: 0 }
const wife = { husband: 0, wife: 100 }

describe('defaultOwnership', () => {
  it('연금·예적금은 배우자가 있어도 본인 100%', () => {
    for (const type of ['PENSION', 'SAVINGS'] as const) {
      expect(defaultOwnership(type, { hasSpouse: true })).toEqual({ ownership: mine, review: false })
      expect(defaultOwnership(type, { hasSpouse: false })).toEqual({ ownership: mine, review: false })
    }
  })
  it('배우자가 없으면 전 유형 본인 100% (50:50 을 자동 저장하지 않음)', () => {
    for (const type of ['REAL_ESTATE', 'SAVINGS', 'PHYSICAL', 'ETC', 'STOCK'] as const) {
      expect(defaultOwnership(type, { hasSpouse: false }).ownership).toEqual(mine)
    }
  })
  it('주식은 같은 계좌의 기존 명의를 따르고, 없으면 본인 100%', () => {
    expect(defaultOwnership('STOCK', { hasSpouse: true, accountOwner: wife })).toEqual({ ownership: wife, review: false })
    expect(defaultOwnership('STOCK', { hasSpouse: true })).toEqual({ ownership: mine, review: false })
    // 배우자가 없으면 계좌 명의가 있어도 본인 100%
    expect(defaultOwnership('STOCK', { hasSpouse: false, accountOwner: half }).ownership).toEqual(mine)
  })
  it('부동산·실물·기타는 50:50 유지하되 확인 요청 (사용자 결정 대기)', () => {
    for (const type of ['REAL_ESTATE', 'PHYSICAL', 'ETC'] as const) {
      expect(defaultOwnership(type, { hasSpouse: true })).toEqual({ ownership: half, review: true })
    }
  })
  it('합계가 100이 아닌 계좌 명의는 무시', () => {
    expect(defaultOwnership('STOCK', { hasSpouse: true, accountOwner: { husband: 60, wife: 60 } }).ownership).toEqual(mine)
  })
})

describe('accountOwnerOf — trim 기준 계좌 명의 조회', () => {
  const map = { '이창호-토스증권-개인계좌': mine, ' 배우자-ISA ': wife }
  it('앞뒤 공백 차이를 무시하고 찾는다', () => {
    expect(accountOwnerOf(map, '이창호-토스증권-개인계좌')).toEqual(mine)
    expect(accountOwnerOf(map, '  이창호-토스증권-개인계좌 ')).toEqual(mine)
    expect(accountOwnerOf(map, '배우자-ISA')).toEqual(wife)
  })
  it('없는 계좌·빈 맵·빈 이름은 undefined', () => {
    expect(accountOwnerOf(map, '없는계좌')).toBeUndefined()
    expect(accountOwnerOf(undefined, '이창호-토스증권-개인계좌')).toBeUndefined()
    expect(accountOwnerOf(map, '  ')).toBeUndefined()
  })
})
