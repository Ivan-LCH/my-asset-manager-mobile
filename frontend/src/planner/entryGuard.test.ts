// 4단계 항목 1 — 월별 계획 편집 진입점 가드 (소스 문자열 검사, 파일 단위 제외)
// 라우트되는 화면에서 /plan·/advanced-analysis·/analysis?run= 링크와 이중 체계 문구가 다시 생기지 않게 한다.
import { describe, it, expect } from 'vitest'

const fs = (await import('node:fs' as string)) as {
  readdirSync(path: string, opts: { recursive: true }): string[]; readFileSync(path: string, encoding: 'utf8'): string
}
const SRC = new URL('../', import.meta.url).pathname
/** 리다이렉트 정의·매칭(App, archive, bottomTabs)과 라우트 없는 보관 파일만 제외 */
const EXCLUDED = new Set([
  'App.tsx', 'planner/archive.ts', 'components/layout/bottomTabs.ts',
  'planner/archivedPlanPage.tsx', 'planner/MigrationReview.tsx',
])
const files = fs.readdirSync(SRC, { recursive: true })
  .map(f => f.replace(/\\/g, '/'))
  .filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !EXCLUDED.has(f))
const LINKS = [/["'`]\/plan(?:[?#"'`]|$)/, /["'`]\/advanced-analysis/, /\/analysis\?run=/]
const PHRASES = ['새 계획', '참고 계산기', '별도 월별']

describe('월별 계획 진입점 가드', () => {
  it('검사 대상에 라우트되는 planner 화면이 포함된다', () => {
    for (const f of ['planner/pages.tsx', 'planner/TotalsPolicyPage.tsx', 'pages/AnalysisPage.tsx', 'pages/Settings.tsx', 'components/common/AssetModal.tsx'])
      expect(files).toContain(f)
  })
  it('라우트되는 파일에 /plan·/advanced-analysis·/analysis?run= 링크 없음', () => {
    const hits = files.flatMap(f => { const src = fs.readFileSync(SRC + f, 'utf8'); return LINKS.filter(re => re.test(src)).map(re => `${f} ${re}`) })
    expect(hits).toEqual([])
  })
  it('라우트되는 파일에 이중 체계 문구 없음', () => {
    const hits = files.flatMap(f => { const src = fs.readFileSync(SRC + f, 'utf8'); return PHRASES.filter(p => src.includes(p)).map(p => `${f} ${p}`) })
    expect(hits).toEqual([])
  })
})
