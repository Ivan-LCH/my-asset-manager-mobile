// 연도별 현금흐름 표 — 남편·와이프 은퇴 표시와 (남편/와이프) 나이 표기 (표시 전용)
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CashFlowTable } from './CashFlowTable'
import type { CashFlowRow } from '@/lib/retirementCashflow'

const row = (year: number): CashFlowRow => ({
  year, age: 64 + (year - 2034),
  nationalPensionMonthly: 0, pensionMonthly: 0, dividendMonthly: 0, corpSalaryMonthly: 0, corpReturnMonthly: 0,
  taxAnnual: 0, incomeTaxAnnual: 0, holdingTaxAnnual: 0, lumpsumTaxAnnual: 0,
  expenseMonthly: 0, travelMonthly: 0, medicalMonthly: 0, healthInsuranceMonthly: 0, totalExpense: 0,
  lumpsumReceived: 0, totalIncome: 0, balance: 0, emergencyAnnual: 0, cumulative: 0,
})
const ROWS = [2034, 2035, 2036].map(row)
const render = (props: Partial<Parameters<typeof CashFlowTable>[0]>) =>
  renderToStaticMarkup(<CashFlowTable rows={ROWS} retirementYear={2034} linkMode="none" {...props} />)
/** 해당 연도의 <tr> 마크업 */
const tr = (html: string, year: number) => html.match(new RegExp(`<tr[^>]*><td[^>]*>${year}<[\\s\\S]*?</tr>`))![0]
const highlighted = (h: string) => /^<tr[^>]*bg-blue-500\/10/.test(h) && /<td[^>]*text-blue-400/.test(h)

describe('CashFlowTable 은퇴 표시', () => {
  it('남편 은퇴 연도 → 은퇴 배지 + 강조, 다른 해는 강조 없음', () => {
    const html = render({})
    expect(tr(html, 2034)).toContain('>은퇴</span>')
    expect(highlighted(tr(html, 2034))).toBe(true)
    expect(highlighted(tr(html, 2035))).toBe(false)
    expect(html).not.toContain('와이프 은퇴')
  })

  it('와이프 은퇴 연도 → 와이프 은퇴 배지 + 같은 강조', () => {
    const html = render({ wifeRetirementYear: 2036, wifeBirthYear: 1972 })
    const r = tr(html, 2036)
    expect(r).toContain('>와이프 은퇴</span>')
    expect(r).not.toContain('>은퇴</span>')
    expect(highlighted(r)).toBe(true)
    expect(highlighted(tr(html, 2035))).toBe(false)
  })

  it('같은 해 은퇴 → 배지 둘, 강조는 한 번', () => {
    const r = tr(render({ wifeRetirementYear: 2034 }), 2034)
    expect(r).toContain('>은퇴</span>')
    expect(r).toContain('>와이프 은퇴</span>')
    expect(r.match(/bg-blue-500\/10/g)).toHaveLength(1)
  })

  it('와이프 은퇴 연도 없음(null/미전달) → 와이프 배지 없음', () => {
    expect(render({ wifeRetirementYear: null, wifeBirthYear: 1972 })).not.toContain('와이프 은퇴')
    expect(render({})).not.toContain('와이프 은퇴')
  })

  it('와이프 출생연도 있으면 연도(남편/와이프) 나이 표기', () => {
    const html = render({ wifeBirthYear: 1972 })
    expect(html).toContain('연도(남편/와이프)')
    expect(tr(html, 2034)).toContain('(64/62)')
    expect(tr(html, 2035)).toContain('(65/63)')
  })

  it('와이프 출생연도 없으면 기존 연도(나이) — 은퇴 배지는 그대로', () => {
    const html = render({ wifeRetirementYear: 2035 })
    expect(html).toContain('연도(나이)')
    expect(html).not.toContain('남편/와이프')
    expect(tr(html, 2034)).toContain('(64)<')
    expect(tr(html, 2035)).toContain('>와이프 은퇴</span>')
  })
})
