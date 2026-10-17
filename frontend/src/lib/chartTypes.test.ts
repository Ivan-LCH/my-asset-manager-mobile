// 4단계 — 데이터 없는 '기타' 차트 카드 숨기기
import { describe, it, expect } from 'vitest'
import { chartTypes } from './chartTypes'

describe('chartTypes', () => {
  it('보유 자산이 없는 유형은 제외', () => {
    expect(chartTypes(['PHYSICAL', 'ETC'], [{ type: 'PHYSICAL' }])).toEqual(['PHYSICAL'])
    expect(chartTypes(['PHYSICAL', 'ETC'], [{ type: 'ETC' }, { type: 'PHYSICAL' }])).toEqual(['PHYSICAL', 'ETC'])
  })
  it('보유 자산이 없으면 빈 목록 (처분 자산은 호출부에서 이미 제외)', () => {
    expect(chartTypes(['PHYSICAL', 'ETC'], [])).toEqual([])
    expect(chartTypes(['SAVINGS'], [{ type: 'STOCK' }])).toEqual([])
  })
})
