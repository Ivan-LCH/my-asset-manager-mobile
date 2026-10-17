import type { HistoryItem } from '@/types'
import { createAsset } from './assets'
import { addHistory } from './history'
import { saveSettings } from './settings'

// ──────────────────────────────────────────────────────────────
// 샘플 데이터 시드 (전체 삭제 clearAllData 는 backupIO.ts)
// 처음 실행(빈 DB) 시 샘플을 채워 대시보드/차트가 바로 보이게 한다.
// ──────────────────────────────────────────────────────────────

/** createAsset 으로 자산을 만들고, hist 의 이력을 순차 추가(자동 currentValue 동기화) */
async function seedAsset(
  data: Record<string, any>,
  hist: HistoryItem[] = [],
): Promise<string> {
  const id = await createAsset(data)
  for (const h of hist) await addHistory(id, h)
  return id
}

/**
 * 샘플 데이터 시드 (한국 개인 자산 예시).
 * 부동산·주식(국내/해외, 2계좌)·연금·예적금·실물.
 */
export async function seedSampleData(): Promise<void> {
  // 부동산
  await seedAsset(
    {
      type: 'REAL_ESTATE', name: '강남 자가 아파트',
      acquisitionDate: '2019-03-15', acquisitionPrice: 900_000_000,
      detail: { address: '서울특별시 강남구', loanAmount: 300_000_000, tenantDeposit: 0, isOwned: true, hasTenant: false },
    },
    [
      { date: '2021-06-30', value: 1_050_000_000 },
      { date: '2023-06-30', value: 1_200_000_000 },
      { date: '2025-06-30', value: 1_350_000_000 },
    ],
  )

  // 주식 — 키움증권 계좌
  await seedAsset(
    {
      type: 'STOCK', name: '삼성전자',
      acquisitionDate: '2020-01-10', acquisitionPrice: 55_000, quantity: 200,
      detail: { accountName: '키움증권', currency: 'KRW', ticker: '005930.KS', isPensionLike: false },
    },
    [
      { date: '2022-03-01', price: 75_000, quantity: 200 },
      { date: '2024-01-02', price: 80_000, quantity: 200 },
      { date: '2025-06-02', price: 95_000, quantity: 200 },
    ],
  )
  await seedAsset(
    {
      type: 'STOCK', name: 'Apple',
      acquisitionDate: '2020-06-01', acquisitionPrice: 130, quantity: 20,
      detail: { accountName: '키움증권', currency: 'USD', ticker: 'AAPL', isPensionLike: false },
    },
    [
      { date: '2022-06-01', price: 150, quantity: 20 },
      { date: '2024-06-01', price: 220, quantity: 20 },
      { date: '2025-06-01', price: 300, quantity: 20 },
    ],
  )

  // 주식 — NH증권 계좌
  await seedAsset(
    {
      type: 'STOCK', name: '에코프로',
      acquisitionDate: '2021-02-01', acquisitionPrice: 300_000, quantity: 30,
      detail: { accountName: 'NH증권', currency: 'KRW', ticker: '086520.KS', isPensionLike: false },
    },
    [
      { date: '2023-02-01', price: 700_000, quantity: 30 },
      { date: '2024-06-01', price: 400_000, quantity: 30 },
      { date: '2025-06-01', price: 350_000, quantity: 30 },
    ],
  )

  // 연금
  await seedAsset(
    {
      type: 'PENSION', name: '국민연금',
      acquisitionDate: '2010-01-01', acquisitionPrice: 20_000_000,
      detail: { pensionType: '국민연금', expectedStartYear: 2035, expectedEndYear: 2055, expectedMonthlyPayout: 1_200_000, annualGrowthRate: 2 },
    },
    [
      { date: '2016-12-31', value: 30_000_000 },
      { date: '2020-12-31', value: 45_000_000 },
      { date: '2025-06-30', value: 60_000_000 },
    ],
  )
  await seedAsset(
    {
      type: 'PENSION', name: '퇴직연금(IRP)',
      acquisitionDate: '2015-01-01', acquisitionPrice: 15_000_000,
      detail: { pensionType: '퇴직연금', expectedStartYear: 2040, expectedEndYear: 2060, expectedMonthlyPayout: 1_500_000, annualGrowthRate: 3 },
    },
    [
      { date: '2020-12-31', value: 18_000_000 },
      { date: '2023-12-31', value: 22_000_000 },
      { date: '2025-06-30', value: 25_000_000 },
    ],
  )

  // 예적금
  await seedAsset(
    {
      type: 'SAVINGS', name: '주택청약종금예금',
      acquisitionDate: '2022-01-01', acquisitionPrice: 5_000_000,
      detail: { isPensionLike: false },
    },
    [
      { date: '2023-06-30', value: 9_000_000 },
      { date: '2024-12-31', value: 13_000_000 },
      { date: '2025-06-30', value: 15_000_000 },
    ],
  )

  // 실물 (금)
  await seedAsset(
    {
      type: 'PHYSICAL', name: '금 100g (순금)',
      acquisitionDate: '2020-01-01', acquisitionPrice: 60_000, quantity: 100,
    },
    [
      { date: '2022-06-01', price: 75_000, quantity: 100 },
      { date: '2024-06-01', price: 95_000, quantity: 100 },
      { date: '2025-06-01', price: 130_000, quantity: 100 },
    ],
  )

  // 기본 환율(USD) — 배당/해외주식 표시용
  await saveSettings({ exchange_rate_USD: '1380' })
}
