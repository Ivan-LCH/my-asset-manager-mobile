// 2단계 — BulkPolicy "이 그룹 기본값 확인": confirmed 만 true 로, 분류·수익 가정·연결은 그대로
import { describe, it, expect } from 'vitest'
import { confirmGroupDefaults } from './BulkPolicy'
import type { AssetPolicy } from './model'

const policy = (assetId: string, confirmed: boolean, extra: Partial<AssetPolicy> = {}): AssetPolicy => ({
  assetId, role: 'investment', ownerId: 'me', confirmed,
  annualGrowth: null, dividendYield: null, ...extra,
} as AssetPolicy)

describe('confirmGroupDefaults', () => {
  it('미확인 항목만 확인 완료로 바꾸고 건수를 돌려준다', () => {
    const policies = [
      policy('a', false, { role: 'pension', annualGrowth: 3, linkedTo: 'b' }),
      policy('b', true),
      policy('c', false),
    ]
    const { next, count } = confirmGroupDefaults(policies)
    expect(count).toBe(2)
    expect(next.map(p => p.confirmed)).toEqual([true, true, true])
    // confirmed 외 필드(분류·수익 가정·연결·명의)는 그대로
    expect(next[0]).toMatchObject({ role: 'pension', annualGrowth: 3, linkedTo: 'b', ownerId: 'me' })
    // 이미 확인된 항목은 같은 객체 유지 (불필요한 재작성 없음)
    expect(next[1]).toBe(policies[1])
    // 원본 배열은 바꾸지 않음
    expect(policies[0].confirmed).toBe(false)
  })
  it('모두 확인됐으면 count 0', () => {
    const { next, count } = confirmGroupDefaults([policy('a', true)])
    expect(count).toBe(0)
    expect(next[0]).toBeDefined()
  })
})
