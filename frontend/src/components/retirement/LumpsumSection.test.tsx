// 생활비·목돈 입력 → 목돈 수입: 일반 목돈은 행선지·배당주/일반주, 퇴직금은 연금 시뮬레이션 안내
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumpsumSection } from './LumpsumSection'
import type { LumpsumItem, PensionAllocation } from '@/types'

const jeonse: LumpsumItem = { id: 'j', name: '전세금 반환', receiveYear: 2030, amount: 600_000_000, taxKind: 'other' }
const legacy: LumpsumItem = { id: 'l', name: '전세금 반환', receiveYear: 2030, amount: 600_000_000 }   // taxKind 미설정
const severance: LumpsumItem = { id: 's', name: '희망퇴직금', receiveYear: 2031, amount: 300_000_000, taxKind: 'severance' }
const noop = () => {}
const render = (items: LumpsumItem[], allocations: PensionAllocation[] = []) =>
  renderToStaticMarkup(<LumpsumSection items={items} allocations={allocations} ownership={{ husband: 50, wife: 50 }} onChange={noop} onAllocation={noop} />)

describe('LumpsumSection (생활비·목돈 입력)', () => {
  it.each([['other', jeonse], ['미설정', legacy]])('기존 일반 목돈(taxKind %s, 분배 없음)도 행선지·명의·과세 구분 표시', (_, item) => {
    const html = render([item])
    expect(html).toContain(`data-general-lumpsum="${item.id}"`)
    expect(html).toContain('행선지')
    for (const label of ['현금', '일반증권계좌', '일부만 증권', '기존 지분 (남편 50%)', '일반(비과세)', '퇴직소득세 적용']) expect(html).toContain(label)
    expect(html).not.toContain('배당주 / 일반주')   // 현금이면 배분 입력 숨김
    expect(html).toContain('목돈 행선지')          // 안내 InfoNote
  })
  it('일반증권계좌로 넣으면 배당주/일반주 배분 표시', () => {
    const html = render([jeonse], [{ lumpsumId: 'j', irpAmount: 0, stockAmount: 600_000_000, destination: 'stock', stockDividendRatio: 70 }])
    expect(html).toContain('증권 계좌 안 배분 (배당주 / 일반주)')
    expect(html).toContain('value="70"')
    expect(html).toContain('배당주 42,000만원')
    expect(html).toContain('일반주 18,000만원')
  })
  it('일부만 증권: 증권 금액 입력 + 배분 표시', () => {
    const html = render([legacy], [{ lumpsumId: 'l', irpAmount: 0, stockAmount: 200_000_000, destination: 'partial' }])
    expect(html).toContain('일반증권계좌 금액')
    expect(html).toContain('배당주 / 일반주')
  })
  it('퇴직금은 일반 분배 카드 없이 연금 시뮬레이션 안내', () => {
    const html = render([severance])
    expect(html).not.toContain('data-general-lumpsum')
    expect(html).not.toContain('일부만 증권')
    expect(html).toContain('퇴직소득세 적용')
    expect(html).toContain('퇴직금의 IRP·주식 분배는 「연금 시뮬레이션」의 목돈 분배에서 정합니다.')
  })
})
