// UI 간소화 A안 — 은퇴 연도·목돈·배당률은 입력/설정 허브 한곳에서만 편집 (소스 문자열 검사)
import { describe, it, expect } from 'vitest'

const fs = (await import('node:fs' as string)) as {
  readdirSync(path: string, opts: { recursive: true }): string[]; readFileSync(path: string, encoding: 'utf8'): string
}
const SRC = new URL('../../', import.meta.url).pathname
const files = fs.readdirSync(SRC, { recursive: true })
  .map(f => f.replace(/\\/g, '/'))
  .filter(f => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
const read = (f: string) => fs.readFileSync(SRC + f, 'utf8')
const using = (re: RegExp) => files.filter(f => re.test(read(f))).sort()

describe('단일 편집기', () => {
  it('은퇴 연도 입력은 ① 인물·은퇴 하나뿐', () => {
    expect(using(/onChange=\{[^\n]*?[rR]etirementYear/)).toEqual(['components/hub/PeopleSection.tsx'])
  })
  it('현금흐름(RetirementPage)·분석 화면에는 입력이 없다', () => {
    for (const f of ['pages/RetirementPage.tsx', 'pages/AnalysisPage.tsx', 'pages/YearDashboardPage.tsx']) {
      expect(read(f)).not.toMatch(/<input|AmountInput|NumInput|YearInput/)
      expect(read(f)).not.toMatch(/useSave(Retirement|Settings|PensionSim|CorpSim|Portfolio)/)
    }
  })
  it('목돈 편집기(LumpsumSection·GeneralLumpsumCard)는 ③ 목돈·행선지에서만', () => {
    expect(using(/<LumpsumSection\b/)).toEqual(['components/hub/LumpsumHubSection.tsx'])
    expect(using(/<GeneralLumpsumCard\b/)).toEqual(['components/retirement/LumpsumSection.tsx'])
    expect(using(/<SeveranceAllocationCard\b/)).toEqual(['components/hub/LumpsumHubSection.tsx'])
  })
  it('연금 시뮬 결과 화면은 입력·저장 없음 (기준년도 보기만)', () => {
    const src = read('pages/PensionSimPage.tsx')
    expect(src).not.toMatch(/GeneralLumpsumCard|IncomeTaxSettingsEditor|AmountInput|NumInput|useSave/)
    expect(src.match(/<input/g)).toHaveLength(1)
    expect(src).toContain('기준년도 (보기)')
  })
  it('배당률 편집은 허브 섹션 편집기에서만 (④ IRP·일반주식계좌, ⑤ 법인 입력)', () => {
    expect(using(/onChange=\{[^\n]*?[dD]ividendYield/)).toEqual([
      'components/retirement/PrepEditors.tsx', 'components/retirement/StockAccountEditor.tsx', 'pages/CorpSimPage.tsx',
    ])
    expect(using(/<PortfolioSection\b|<StockAccountEditor\b/)).toEqual(['components/hub/InvestSection.tsx'])
    expect(using(/<CorpSimPage mode="inputs"/)).toEqual(['components/hub/TaxSection.tsx'])
    expect(using(/<CorpSimPage mode="results"/)).toEqual(['pages/AnalysisPage.tsx'])
  })
})
