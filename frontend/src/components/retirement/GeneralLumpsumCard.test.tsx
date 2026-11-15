// 목돈 분배 — 일반 목돈 카드: 행선지·명의·배당 비율 표시
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GeneralLumpsumCard, destinationOf } from './GeneralLumpsumCard'
import type { LumpsumItem, PensionAllocation } from '@/types'

const lump: LumpsumItem = { id: 'j', name: '전세금 반환', receiveYear: 2030, amount: 600_000_000, taxKind: 'other' }
const noop = () => {}
const render = (l: LumpsumItem, a: Pick<PensionAllocation, 'irpAmount' | 'stockAmount' | 'destination' | 'stockDividendRatio'>) =>
  renderToStaticMarkup(<GeneralLumpsumCard lumpsum={l} allocation={a} ownership={{ husband: 50, wife: 50 }} onLumpsum={noop} onAllocation={noop} onRemove={noop} />)

describe('GeneralLumpsumCard', () => {
  it('기존 데이터는 stockAmount 로 행선지 추정', () => {
    expect(destinationOf(lump, { irpAmount: 0, stockAmount: 0 })).toBe('cash')
    expect(destinationOf(lump, { irpAmount: 0, stockAmount: 600_000_000 })).toBe('stock')
    expect(destinationOf(lump, { irpAmount: 0, stockAmount: 100_000_000 })).toBe('partial')
  })
  it('현금이면 배당 비율 입력 없음, 기존 지분 명의 표시', () => {
    const html = render(lump, { irpAmount: 0, stockAmount: 0 })
    expect(html).toContain('현금')
    expect(html).toContain('기존 지분 (남편 50%)')
    expect(html).not.toContain('배당주 / 일반주')
  })
  it('일부만 증권: 증권 금액 입력 + 배당/일반 금액 표시', () => {
    const html = render({ ...lump, owner: 'wife' }, { irpAmount: 0, stockAmount: 200_000_000, destination: 'partial', stockDividendRatio: 50 })
    expect(html).toContain('일반증권계좌 금액')
    expect(html).toContain('증권 계좌 안 배분 (배당주 / 일반주)')
    expect(html).toContain('value="50"')
    expect(html).toContain('배당주 10,000만원')
    expect(html).toContain('일반주 10,000만원')
    expect(html).toContain('일반주는 배당 0%')
    expect(html).toContain('현금 <span')
  })
  it('일반증권계좌 전액: 비율 미설정이면 100% 배당주', () => {
    const html = render(lump, { irpAmount: 0, stockAmount: 600_000_000, destination: 'stock' })
    expect(html).toContain('배당주 비율')
    expect(html).toContain('value="100"')
    expect(html).toContain('일반주 0만원')
  })
})
