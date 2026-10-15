// 1단계 — 매각 완료 자산 상세 라벨 (매각가/실현손익, 매각가 미입력)
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Asset } from '@/types'
import AssetDetail from './AssetDetail'
import { valueKpiLabels } from '@/lib/assetLabels'

const render = (asset: Asset) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><AssetDetail asset={asset} /></QueryClientProvider>,
)
const base: Asset = {
  id: 's1', type: 'STOCK', name: 'KODEX 테스트', currentValue: 16_000_000, acquisitionDate: '2026-02-05',
  acquisitionPrice: 40_000, quantity: 400, ownership: { husband: 100, wife: 0 }, createdAt: '', updatedAt: '',
  history: [], detail: { accountName: '퇴직IRP', currency: 'KRW', ticker: '000000.KS' } as any,
}

describe('valueKpiLabels', () => {
  it('보유/매각 유형별 라벨', () => {
    expect(valueKpiLabels('STOCK', false).value).toBe('평가금액/손익')
    expect(valueKpiLabels('STOCK', false, true).value).toBe('평가액/손익')
    expect(valueKpiLabels('STOCK', true).value).toBe('매각가/실현손익')
    expect(valueKpiLabels('STOCK', true, true).value).toBe('매각가/실현손익')
    expect(valueKpiLabels('STOCK', true).summaryPrice).toBe('매각가')
    expect(valueKpiLabels('REAL_ESTATE', true).value).toBe('매각가')
    expect(valueKpiLabels('SAVINGS', true)).toMatchObject({ value: '매각가', change: '실현손익' })
    expect(valueKpiLabels('SAVINGS', false)).toMatchObject({ value: '현재 가치', change: '변동액' })
  })
})

describe('AssetDetail 매각 라벨 렌더', () => {
  it('매각한 일반 주식: 매각가/실현손익 · 요약줄 매각가 · 매각 단가', () => {
    const html = render({ ...base, disposalDate: '2026-09-01', disposalPrice: 20_000_000 })
    expect(html).toContain('매각가/실현손익')
    expect(html).toContain('매각 단가')
    expect(html).toContain('>매각가<')
    expect(html).not.toContain('평가금액/손익')
    expect(html).not.toContain('현재 가격')
  })
  it('계좌 통합 주식 매각도 같은 문구', () => {
    const html = render({ ...base, quantity: 1, disposalDate: '2026-09-01', disposalPrice: 20_000_000, detail: { accountName: 'ISA', currency: 'KRW', isAccountLevel: true } as any })
    expect(html).toContain('매각가/실현손익')
    expect(html).not.toContain('매각 금액')
  })
  it('예적금 매각가 0 → 매각가 미입력, 손실 금액 표시 없음', () => {
    const html = render({ ...base, id: 'sv', type: 'SAVINGS', name: '새마을적금', currentValue: 4_000_000, acquisitionPrice: 1_000_000, quantity: 0,
      disposalDate: '2026-04-01', disposalPrice: 0, detail: { isPensionLike: false } as any })
    expect(html).toContain('매각가 미입력')
    expect(html).toContain('실현손익')
    expect(html).not.toContain('현재 가치')
    expect(html).not.toContain('-1,000,000')
  })
  it('매각한 주식 매각가 미입력 → 손익 sub 없음', () => {
    const html = render({ ...base, disposalDate: '2026-09-01' })
    expect(html).toContain('매각가 미입력')
    expect(html).not.toMatch(/-₩?16,000,000/)
  })
  it('보유 중 주식은 기존 라벨 유지', () => {
    const html = render(base)
    expect(html).toContain('평가금액/손익')
    expect(html).toContain('현재 가격')
  })
})
