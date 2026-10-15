// 2단계 — 실데이터 백업(2026-10-14-fixed) 회귀 테스트. 파일이 없으면 skip.
// 연결 연금 래퍼(이창호-퇴직연금-미래에셋, linkedStockId → 퇴직IRP 계좌)의 옛 이력 3억이
// hideInChart 해제·평가액 3억 입력 상황에서도 홈·차트·분석·연금 탭에 이중 계산되지 않음을 보장한다.
// 저장 데이터는 바꾸지 않고 메모리에서만 래퍼를 수정한다.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, importBackup, getAllAssets, getSettings, getPensionSim } from '@/lib/db'
import { generateChartData } from '@/lib/chartData'
import { pensionInputs } from '@/lib/analysisInputs'
import { annualPension } from '@/lib/annualPension'
import type { Asset, PensionDetail } from '@/types'
import { buildSnapshot, today } from './model'
import { loadContext } from './storage'
import { linkedWrapperInfo } from './accounts'
import { reviewCounts, snapshotTotals } from './totals'

const { existsSync, readFileSync } = (await import('node:fs' as string)) as {
  existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string
}
const BACKUP = '/workspace/asset-analysis/asset-manager-backup-2026-10-14-fixed.json'
const load = () => JSON.parse(readFileSync(BACKUP, 'utf8').replace(/^﻿/, ''))
const won = (v: number) => Math.round(v).toLocaleString('ko-KR')
const WRAPPER = '이창호-퇴직연금-미래에셋'

describe.skipIf(!existsSync(BACKUP))('2단계 실데이터 백업 — 연결 연금 이중 계산 방지', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('퇴직연금 래퍼 hideInChart=false · 평가액 3억 → 홈·차트·분석·연금 탭 불변', async () => {
    await importBackup(load())
    const ctx = await loadContext(), settings = await getSettings(), sim = await getPensionSim()
    const assets = await getAllAssets()
    const wrapper = assets.find(a => a.name === WRAPPER)!
    expect(wrapper).toBeTruthy()
    expect((wrapper.detail as PensionDetail).linkedStockId).toBeTruthy()

    // 메모리 내 변조본 (저장 안 함)
    const mutated: Asset[] = assets.map(a => a.id !== wrapper.id ? a
      : { ...a, currentValue: 300_000_000, detail: { ...(a.detail as PensionDetail), hideInChart: false } })
    const plan = { ...ctx.plan, asOfDate: today() }
    const now = new Date().toISOString()
    const before = snapshotTotals(buildSnapshot(assets, settings, plan, now))
    const afterSnap = buildSnapshot(mutated, settings, plan, now)
    const after = snapshotTotals(afterSnap)

    // 차트 — 2026-04-22(래퍼 이력 3억)부터 오늘까지 날짜별 합계
    const sumByDate = (rows: ReturnType<typeof generateChartData>) => {
      const m = new Map<string, number>()
      for (const p of rows) if (p.date >= '2026-04-22') m.set(p.date, (m.get(p.date) ?? 0) + p.value)
      return m
    }
    const chartBefore = sumByDate(generateChartData(assets, 'all', 'type'))
    const chartAfter = sumByDate(generateChartData(mutated, 'all', 'type'))
    const maxDiff = Math.max(...[...chartAfter].map(([d, v]) => Math.abs(v - (chartBefore.get(d) ?? 0))))

    // 분석 — 연금 원금(연결 계좌 합계)과 시작 잔액
    const year = Number(today().slice(0, 4))
    const pensionRun = (list: Asset[]) => {
      const r = annualPension(pensionInputs(sim, list), list, year, year, { simulation: false, currentYear: year })
      return { opening: r.rows[0]?.opening ?? 0, principal: pensionInputs(sim, list).sources.find(s => s.id === wrapper.id)?.principal }
    }
    const runBefore = pensionRun(assets), runAfter = pensionRun(mutated)
    const info = linkedWrapperInfo(mutated.find(a => a.id === wrapper.id)!, mutated)!
    const review = reviewCounts(afterSnap)

    console.log(`[phase2] 홈 총자산 전=${won(before.total)} 후=${won(after.total)} · 순자산 후=${won(after.net)}`)
    console.log(`[phase2] 연금 탭 합계 전=${won(before.byType.PENSION ?? 0)} 후=${won(after.byType.PENSION ?? 0)} · 제외 항목 ${after.excluded.map(e => `${e.name} ${e.reason} ${won(e.amount)}`).join(', ')}`)
    console.log(`[phase2] 차트 ${chartAfter.size}일(2026-04-22~오늘) 최대 차이=${won(maxDiff)} · 마지막=${won([...chartAfter.values()].pop() ?? 0)}`)
    console.log(`[phase2] 분석 연금 시작 잔액 전=${won(runBefore.opening)} 후=${won(runAfter.opening)} · 래퍼 원금 전=${won(runBefore.principal ?? 0)} 후=${won(runAfter.principal ?? 0)}`)
    console.log(`[phase2] 연금 카드: 계좌 ${info.accountName} 합계=${won(info.accountTotal)} · 원본 이력 ${info.lastHistory ? won(info.lastHistory.value) + '(' + info.lastHistory.date + ')' : '없음'} · 불일치=${info.mismatch}`)
    console.log(`[phase2] 검토 건수 원본: 합계 영향 ${reviewCounts(ctx.current).totalImpact} · 분석 미확인 ${reviewCounts(ctx.current).analysis} / 변조본: 합계 영향 ${review.totalImpact} · 분석 미확인 ${review.analysis}`)

    expect(before.total).toBe(2_648_608_701)
    expect(after.total).toBe(2_648_608_701)
    expect(after.net).toBe(2_488_608_701)
    expect(after.byType.PENSION).toBe(154_810_000)
    expect(after.byType.PENSION).toBe(before.byType.PENSION)
    expect(after.excluded).toContainEqual(expect.objectContaining({ name: WRAPPER, reason: 'linked', amount: 300_000_000 }))
    expect(chartAfter.size).toBeGreaterThan(100)
    expect(maxDiff).toBe(0)
    expect(runAfter.opening).toBe(runBefore.opening)
    expect(runAfter.principal).toBe(runBefore.principal)
    expect(runAfter.principal).toBe(250_406_395)
    expect(info).toMatchObject({ accountTotal: 250_406_395, lastHistory: { date: '2026-04-22', value: 300_000_000 }, mismatch: true })
    // 원본 데이터: 합계 영향 0건, 분석 미확인 = 미확인 자산 56건 (+LEGACY_DATE 는 같은 부동산이라 중복 제거)
    expect(reviewCounts(ctx.current)).toEqual({ totalImpact: 0, analysis: 56 })
    expect(review.totalImpact).toBe(1)
  }, 60_000)
})
