import { useEffect, useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/lib/utils'

interface Props {
  value: number | null | undefined
  /** 빈칸은 0 으로 전달 (기존 폼 상태가 숫자 0 기본값) */
  onChange: (v: number) => void
  className?: string
  placeholder?: string
  'aria-label'?: string
}

/** 원화(KRW) 금액 입력 — 입력하는 동안 천단위 콤마, 0 허용.
 *  수량·연도·%·외화 단가(소수)는 이 컴포넌트 대신 type="number" 를 쓴다.
 *  처음 표시만 기존 값 그대로(소수 포함) 보여 주고, 사용자가 고치기 전에는 값을 바꾸지 않는다. */
export default function AmountInput({ value, onChange, className, placeholder = '0', ...rest }: Props) {
  const show = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? '' : v.toLocaleString('ko-KR', { maximumFractionDigits: 8 })
  const [text, setText] = useState(() => show(value))
  // 외부에서 값이 바뀌면(시세 자동 입력 등) 표시를 다시 맞춘다
  useEffect(() => {
    if ((parseAmountInput(text) ?? 0) !== Math.trunc(value ?? 0)) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      value={text}
      aria-label={rest['aria-label']}
      onChange={(e) => {
        const next = formatAmountInput(e.target.value)
        setText(next)
        onChange(parseAmountInput(next) ?? 0)
      }}
    />
  )
}
