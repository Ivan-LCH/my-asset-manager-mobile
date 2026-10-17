// 4단계 항목 1 — 보관된 월별 분석 본문은 읽기 전용: 계획 편집·새 계산 진입점 없음, CSV·비교만
import 'fake-indexeddb/auto'
import { beforeEach, describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { db, createAsset } from '@/lib/db'
import { blankPlan, flowSchema, today } from './model'
import { calculateAndSave, savePlan } from './storage'
import { baseScenario } from './engine'
import { ArchivedRunBody } from './pages'

beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

describe('ArchivedRunBody', () => {
  it('저장된 run을 정적 렌더 — /plan 링크·새 분석 없음, CSV 버튼 있음', async () => {
    await createAsset({ type: 'SAVINGS', name: 'cash', acquisitionDate: today(), acquisitionPrice: 10_000_000, detail: {} })
    const plan = { ...blankPlan(), endDate: '2027-12-31' }
    plan.flows = [flowSchema.parse({ id: 'f', name: '생활비', kind: 'expense', amount: 100_000, start: { value: today(), precision: 'day', offsetMonths: 0 }, frequency: 'monthly', confirmed: true })]
    await savePlan(plan, 0)
    const record = await calculateAndSave(baseScenario)
    expect(record.run.months.length).toBeGreaterThan(0)
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/analysis/archive?run=' + record.id]}><ArchivedRunBody record={record} stale={true} /></MemoryRouter>)
    expect(html).not.toContain('href="/plan')
    expect(html).not.toContain('새 분석')
    expect(html).not.toContain('다시 계산')
    expect(html).toContain('이번 달 CSV')
    expect(html).toContain('전체 CSV')
    expect(html).toContain('계산 당시 조건 그대로 보관')
  })
})
