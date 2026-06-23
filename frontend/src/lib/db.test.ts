// db.ts 데이터 무결성 직접 테스트 (fake-indexeddb 사용)
// 실행: npm i fake-indexeddb --no-save && npx vitest run src/lib/db.test.ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createAsset, addHistory, getAssetById, db } from '@/lib/db'

const RE_DETAIL = { address: '', loanAmount: 0, tenantDeposit: 0, isOwned: true, hasTenant: false }

describe('자산 생성/이력 — 데이터 무결성 (M-1 버그 회귀 방지)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('부동산 생성: 취득가가 currentValue + 초기 이력로 시딩된다 (시세 0 버그)', async () => {
    const id = await createAsset({
      type: 'REAL_ESTATE', name: '테스트 아파트',
      acquisitionDate: '2024-01-01', acquisitionPrice: 500_000_000,
      detail: RE_DETAIL,
    })
    const a = await getAssetById(id)
    expect(a).not.toBeNull()
    expect(a!.currentValue).toBe(500_000_000)   // ← 이전: 0
    expect(a!.history.length).toBe(1)            // ← 이전: 0
    expect(a!.history[0].value).toBe(500_000_000)
  })

  it('주식 생성: 단가*수량(환율 적용)이 currentValue로 시딩된다', async () => {
    const id = await createAsset({
      type: 'STOCK', name: 'AAPL',
      acquisitionDate: '2024-01-01', acquisitionPrice: 150, quantity: 10,
      detail: { accountName: '계좌', currency: 'USD', isPensionLike: false },
    })
    const a = await getAssetById(id)
    // fallback USD 환율 1450 → 150 * 10 * 1450
    expect(a!.currentValue).toBe(150 * 10 * 1450)
    expect(a!.history[0].price).toBe(150)
    expect(a!.history[0].quantity).toBe(10)
  })

  it('이력 추가: currentValue 가 새 값으로 즉시 동기화된다 (타일 미반영 버그)', async () => {
    const id = await createAsset({
      type: 'REAL_ESTATE', name: '아파트',
      acquisitionDate: '2024-01-01', acquisitionPrice: 500_000_000,
      detail: RE_DETAIL,
    })
    await addHistory(id, { date: '2024-06-01', value: 600_000_000 })
    const a = await getAssetById(id)
    expect(a!.currentValue).toBe(600_000_000)   // ← 이전: 500_000_000 그대로
    expect(a!.history.length).toBe(2)
  })

  it('과거 날짜 이력 추가: currentValue 는 가장 최근 날짜 값을 유지한다', async () => {
    const id = await createAsset({
      type: 'REAL_ESTATE', name: '아파트',
      acquisitionDate: '2024-01-01', acquisitionPrice: 500_000_000,
      detail: RE_DETAIL,
    })
    await addHistory(id, { date: '2025-01-01', value: 700_000_000 })
    await addHistory(id, { date: '2024-06-01', value: 550_000_000 }) // 과거 삽입
    const a = await getAssetById(id)
    expect(a!.currentValue).toBe(700_000_000)   // 최신(2025) 유지
    expect(a!.history.length).toBe(3)
  })

  it('주식 이력 추가(단가+수량): value 자동 계산 + currentValue 동기화', async () => {
    const id = await createAsset({
      type: 'STOCK', name: '005930',
      acquisitionDate: '2024-01-01', acquisitionPrice: 70_000, quantity: 100,
      detail: { accountName: '계좌', currency: 'KRW', isPensionLike: false },
    })
    // 단가 상승 이력 (value 미제공 → price*qty 자동 계산, KRW rate=1)
    await addHistory(id, { date: '2024-06-01', price: 80_000, quantity: 100 })
    const a = await getAssetById(id)
    expect(a!.currentValue).toBe(80_000 * 100)
    const latest = a!.history[a!.history.length - 1]
    expect(latest.value).toBe(80_000 * 100)
  })
})
