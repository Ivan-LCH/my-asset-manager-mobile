// 4단계 — 모바일 390px: 긴 라벨이 값 칸(w-40)을 카드 밖으로 밀지 않도록 라벨은 줄어들고 값 칸만 고정폭
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Row } from './layout'

describe('Row', () => {
  it('라벨은 줄바꿈 가능(min-w-0, shrink-0 아님), 값 칸은 고정폭 유지', () => {
    const html = renderToStaticMarkup(<Row label="= 법인 잔여 현금(가수금·배당 원천)"><span>1,841만원</span></Row>)
    const label = html.match(/<span class="([^"]*)">= 법인 잔여 현금/)![1].split(' ')
    expect(label).toContain('min-w-0')
    expect(label).not.toContain('shrink-0')
    expect(html).toMatch(/<div class="w-40 sm:w-48 shrink-0"><span>1,841만원<\/span><\/div>/)
  })
})
