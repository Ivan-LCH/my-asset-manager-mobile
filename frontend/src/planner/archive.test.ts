// 4단계 항목 1(안 1) — 보관 링크 노출 판정, 옛 URL 리다이렉트, 합산 기준 병합 규칙
import 'fake-indexeddb/auto'
import { beforeEach, describe, it, expect } from 'vitest'
import { db, createAsset, importBackup, seedSampleData } from '@/lib/db'
import { blankPlan, flowSchema, policySchema, resolvePolicy, today, type AssetPolicy } from './model'
import { calculateAndSave, loadContext, saveDraft, savePlan } from './storage'
import { baseScenario } from './engine'
import { hasMonthlyArchive, hasMonthlyContent, legacyPlannerRedirect, readMonthlyArchive } from './archive'
import { mergePolicies } from './policies'
import { pensionAccountNames } from './accounts'
import { snapshotTotals } from './totals'

const { existsSync, readFileSync } = (await import('node:fs' as string)) as {
  existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string
}
const BACKUP = '/workspace/asset-analysis/asset-manager-backup-2026-10-14-fixed.json'
const stock = (name: string, price = 100) => createAsset({ type: 'STOCK', name, acquisitionDate: today(), acquisitionPrice: price, quantity: 10, detail: { accountName: 'acct-' + name, ticker: name, currency: 'KRW', isPensionLike: false } })
/** 합산 기준 화면 저장 경로와 같은 호출 */
const saveTotalsPolicies = async (policies: AssetPolicy[]) => { const { plan } = await loadContext(); await savePlan({ ...plan, policies }, plan.revision) }

beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

describe('hasMonthlyContent / hasMonthlyArchive — 순수 판정', () => {
  it('blankPlan·정책/입력범위만 채운 plan·main 없음은 false', () => {
    expect(hasMonthlyArchive(undefined, 0)).toBe(false)
    expect(hasMonthlyArchive({ plan: blankPlan() }, 0)).toBe(false)
    const p = blankPlan('2020-01-01')
    p.policies = [policySchema.parse({ assetId: 'a', role: 'excluded', confirmed: true })]
    p.coverage = { assets: 'provided', income: 'confirmedNone', expenses: 'provided', taxes: 'unknown', insurance: 'unknown' }
    p.reviewedLegacy = true
    expect(hasMonthlyContent(p)).toBe(false)
    expect(hasMonthlyArchive({ plan: p }, 0)).toBe(false)
  })
  it('flow 1건·구성원 2명·은퇴일·생년월·종료일·물가는 true', () => {
    const cases: ((p: ReturnType<typeof blankPlan>) => void)[] = [
      p => { p.flows = [flowSchema.parse({ id: 'f', name: '생활비', kind: 'expense', amount: 1, start: { value: today(), precision: 'day', offsetMonths: 0 }, frequency: 'monthly' })] },
      p => { p.people = [...p.people, { id: 'w', name: '배우자', birthMonth: '', retirementDate: '' }] },
      p => { p.people[0].retirementDate = '2040-01-01' },
      p => { p.people[0].birthMonth = '1980-01' },
      p => { p.endDate = '2060-12-31' },
      p => { p.inflation = 2 },
    ]
    for (const mutate of cases) { const p = blankPlan(); mutate(p); expect(hasMonthlyArchive({ plan: p }, 0)).toBe(true) }
  })
  it('run이 있으면 plan 없이도 true', () => {
    expect(hasMonthlyArchive(undefined, 1)).toBe(true)
  })
  it('plan 파싱 실패는 예외 없이 false (run이 있으면 true)', () => {
    expect(hasMonthlyArchive({ plan: { version: 99, flows: 'x' } }, 0)).toBe(false)
    expect(hasMonthlyArchive({ plan: null }, 0)).toBe(false)
    expect(hasMonthlyArchive({ plan: { version: 99 } }, 2)).toBe(true)
  })
})

describe('readMonthlyArchive — DB 상태별', () => {
  it('빈 DB·초안만 있음·합산 기준만 저장 → false', async () => {
    expect(await readMonthlyArchive()).toBe(false)
    const draft = blankPlan(); draft.flows = [flowSchema.parse({ id: 'f', name: 'x', kind: 'expense', amount: 1, start: { value: today(), precision: 'day', offsetMonths: 0 }, frequency: 'monthly' })]
    await saveDraft('tab', draft)
    expect(await readMonthlyArchive()).toBe(false)
    const id = await stock('a')
    await saveTotalsPolicies([policySchema.parse({ assetId: id, role: 'excluded', confirmed: true })])
    expect(await db.table('plannerPlans').count()).toBe(1)
    expect(await readMonthlyArchive()).toBe(false)
  })
  it('데모 샘플 데이터 직후 → false (planner 표를 쓰지 않음)', async () => {
    await seedSampleData()
    expect(await db.assets.count()).toBeGreaterThan(0)
    expect(await readMonthlyArchive()).toBe(false)
  })
  it('저장된 월별 분석 1건 → true', async () => {
    await stock('a')
    await savePlan({ ...blankPlan(), endDate: '2027-12-31' }, 0)
    await calculateAndSave(baseScenario)
    expect(await readMonthlyArchive()).toBe(true)
  })
  describe.skipIf(!existsSync(BACKUP))('실데이터 백업(2026-10-14-fixed)', () => {
    it('import 직후와 합산 기준 저장 후에도 false', async () => {
      await importBackup(JSON.parse(readFileSync(BACKUP, 'utf8').replace(/^﻿/, '')))
      expect(await readMonthlyArchive()).toBe(false)
      const ctx = await loadContext()
      const pensionAccounts = pensionAccountNames(ctx.current.positions.map(p => p.source))
      const list = ctx.current.positions.map(p => resolvePolicy(p.source, ctx.plan.policies, pensionAccounts))
      await saveTotalsPolicies(mergePolicies(ctx.plan.policies, list, [{ ...list[0], confirmed: true }]))
      expect(await readMonthlyArchive()).toBe(false)
    })
  })
})

describe('legacyPlannerRedirect', () => {
  const split = (url: string) => { const [path, search = ''] = url.split('?'); return { path, params: Object.fromEntries(new URLSearchParams(search)) } }
  it.each([
    ['/plan', '?tab=policies&focus=a&returnTo=%2Fassets%3Ftype%3DSTOCK&unconfirmed=1', '/settings/totals', { focus: 'a', returnTo: '/assets?type=STOCK', unconfirmed: '1' }],
    ['/plan', '?tab=policies&group=account%3Ax&q=삼성', '/settings/totals', { group: 'account:x', q: '삼성' }],
    ['/plan', '?tab=flows&asset=a', '/analysis/archive', {}],
    ['/plan', '', '/analysis/archive', {}],
    ['/advanced-analysis', '', '/analysis/archive', {}],
    ['/advanced-analysis', '?run=r', '/analysis/archive', { run: 'r' }],
    ['/analysis', '?run=r&year=2030&month=2030-05&tab=year', '/analysis/archive', { run: 'r', year: '2030', month: '2030-05' }],
  ])('%s%s → %s', (path, search, to, params) => {
    const out = split(legacyPlannerRedirect(path, search))
    expect(out.path).toBe(to)
    expect(out.params).toEqual(params)
  })
})

describe('mergePolicies — 합산 기준 편집 병합', () => {
  it('목록 밖 자산의 정책과 숨긴 필드를 보존하고, role=excluded는 해당 금액만 합계에서 뺀다', async () => {
    const a = await stock('a', 100), b = await stock('b', 200)
    const gone = policySchema.parse({ assetId: 'deleted-asset', role: 'investment', annualGrowth: 7 })
    const keepA = policySchema.parse({ assetId: a, role: 'investment', annualGrowth: 5, dividendYield: 2, allowWithdrawal: true, withdrawalWithholding: 3.3 })
    await savePlan({ ...blankPlan(), policies: [gone, keepA] }, 0)
    const before = await loadContext()
    const totalsBefore = snapshotTotals(before.current)
    const list = before.current.positions.map(p => resolvePolicy(p.source, before.plan.policies))
    const target = list.find(p => p.assetId === b)!
    const merged = mergePolicies(before.plan.policies, list, [{ ...target, role: 'excluded' }])
    expect(merged.find(p => p.assetId === 'deleted-asset')).toEqual(gone)
    expect(merged.find(p => p.assetId === a)).toEqual(keepA)
    expect(merged.find(p => p.assetId === b)?.role).toBe('excluded')
    await saveTotalsPolicies(merged)
    const after = snapshotTotals((await loadContext()).current)
    expect(after.total).toBe(totalsBefore.total - 2000)
    expect(after.excluded.map(e => [e.assetId, e.amount])).toEqual([[b, 2000]])
    expect(after.byType.STOCK).toBe(1000)
    expect(after.debt).toBe(totalsBefore.debt)
  })
  it('next에 없는 목록 항목은 resolvePolicy 값 그대로', () => {
    const list = [policySchema.parse({ assetId: 'x', role: 'cash' }), policySchema.parse({ assetId: 'y', role: 'other' })]
    expect(mergePolicies([], list, [])).toEqual(list)
  })
})
