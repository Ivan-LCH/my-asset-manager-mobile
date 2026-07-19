import { describe, it, expect } from 'vitest'
import { generateChartData } from './chartData'
import type { Asset } from '@/types'

// 테스트 헬퍼: 결과에서 특정 (라벨, 날짜)의 값 조회
function valueAt(rows: ReturnType<typeof generateChartData>, label: string, date: string): number | undefined {
  return rows.find((r) => r.label === label && r.date === date)?.value
}

function today(): string {
  const n = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

// 공통 자산 베이스 (필수 필드 채움)
function asset(partial: Partial<Asset>): Asset {
  return {
    id: 'a1', type: 'STOCK', name: 'A', currentValue: 0,
    acquisitionDate: '2023-01-01', acquisitionPrice: 0, quantity: 0,
    createdAt: '', updatedAt: '', history: [],
    ...partial,
  }
}

const STOCK_LABEL = '📈 주식'
const RE_LABEL    = '🏠 부동산'

describe('generateChartData — forward fill', () => {
  it('취득가→이력→현재값을 일 단위로 ffill 한다', () => {
    const a = asset({
      type: 'STOCK', acquisitionPrice: 100, quantity: 10,  // initVal 1000
      history: [
        { date: '2023-01-03', value: 1200 },
        { date: '2023-01-05', price: 130, quantity: 10 },   // 1300
      ],
      currentValue: 1500,
    })
    const rows = generateChartData([a], 'all', 'type')

    expect(valueAt(rows, STOCK_LABEL, '2015-06-01')).toBe(0)     // 취득 전 = 0
    expect(valueAt(rows, STOCK_LABEL, '2023-01-01')).toBe(1000)  // 취득일
    expect(valueAt(rows, STOCK_LABEL, '2023-01-02')).toBe(1000)  // ffill
    expect(valueAt(rows, STOCK_LABEL, '2023-01-03')).toBe(1200)  // 이력
    expect(valueAt(rows, STOCK_LABEL, '2023-01-04')).toBe(1200)  // ffill
    expect(valueAt(rows, STOCK_LABEL, '2023-01-05')).toBe(1300)  // price*qty
    expect(valueAt(rows, STOCK_LABEL, '2023-06-01')).toBe(1300)  // 마지막 이력 carry
    expect(valueAt(rows, STOCK_LABEL, today())).toBe(1500)       // 현재값 = 오늘
  })

  it('부동산은 부채(대출+보증금)를 차감한다', () => {
    const re = asset({
      id: 're', type: 'REAL_ESTATE', name: '아파트',
      acquisitionPrice: 50000, quantity: 0,
      currentValue: 60000,
      detail: { isOwned: true, hasTenant: true, tenantDeposit: 10000, address: '', loanAmount: 20000, ownership: { husband: 50, wife: 50 } },
    })
    const rows = generateChartData([re], 'all', 'type')
    expect(valueAt(rows, RE_LABEL, '2023-01-01')).toBe(20000)  // 50000 - 30000
    expect(valueAt(rows, RE_LABEL, today())).toBe(30000)       // 60000 - 30000
  })

  it('매각 시점 이후는 0으로 처리한다', () => {
    const a = asset({
      acquisitionPrice: 100, quantity: 10, currentValue: 9999,  // current는 무시됨
      disposalDate: '2024-01-01', disposalPrice: 2000,
    })
    const rows = generateChartData([a], 'all', 'type')
    expect(valueAt(rows, STOCK_LABEL, '2023-06-01')).toBe(1000)
    expect(valueAt(rows, STOCK_LABEL, '2024-01-01')).toBe(0)
    expect(valueAt(rows, STOCK_LABEL, '2024-06-01')).toBe(0)
    expect(valueAt(rows, STOCK_LABEL, today())).toBe(0)
  })

  it('같은 유형은 합산된다', () => {
    const a = asset({ id: 'a', acquisitionPrice: 100, quantity: 10, currentValue: 1000 })
    const b = asset({ id: 'b', acquisitionPrice: 100, quantity: 5,  currentValue: 500 })
    const rows = generateChartData([a, b], 'all', 'type')
    expect(valueAt(rows, STOCK_LABEL, today())).toBe(1500)
  })

  it('hideInChart 연금은 제외된다', () => {
    const p = asset({
      id: 'p', type: 'PENSION', name: '연금', currentValue: 5000,
      detail: { expectedStartYear: 2050, expectedEndYear: 2070, expectedMonthlyPayout: 0, annualGrowthRate: 0, hideInChart: true },
    })
    expect(generateChartData([p], 'all', 'type')).toEqual([])
  })

  it('group_by=name 이면 이름별로 분리된다', () => {
    const a = asset({ id: 'a', name: '삼성', currentValue: 1000, acquisitionPrice: 100, quantity: 10 })
    const b = asset({ id: 'b', name: 'TSLA', currentValue: 500, acquisitionPrice: 100, quantity: 5 })
    const rows = generateChartData([a, b], 'all', 'name')
    expect(valueAt(rows, '삼성', today())).toBe(1000)
    expect(valueAt(rows, 'TSLA', today())).toBe(500)
  })

  it('group_by=account 이면 계좌명으로 묶고, 없으면 이름으로 대체한다', () => {
    const a = asset({
      id: 'a', name: '삼성', currentValue: 1000, acquisitionPrice: 100, quantity: 10,
      detail: { accountName: 'IRP', currency: 'KRW', isPensionLike: false },
    })
    const rows = generateChartData([a], 'all', 'account')
    expect(valueAt(rows, 'IRP', today())).toBe(1000)
  })

  it('빈 입력은 빈 배열', () => {
    expect(generateChartData([], 'all', 'type')).toEqual([])
  })

  it('period 필터는 start 이후만 반환한다', () => {
    const a = asset({ acquisitionPrice: 100, quantity: 10, currentValue: 1000 })
    const rows = generateChartData([a], '1m', 'type')
    // 1개월 전부터 오늘까지 → 2015 같은 과거 날짜는 없어야 함
    expect(rows.some((r) => r.date < '2020-01-01')).toBe(false)
    expect(valueAt(rows, STOCK_LABEL, today())).toBe(1000)
  })
})
