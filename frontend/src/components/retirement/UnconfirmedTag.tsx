import type {ReactNode} from 'react'
// 미확정 표시는 주 수치를 대체하지 않는 보조 표기(작고 흐린 글씨)로 붙인다.
export function UnconfirmedTag({children}:{children:ReactNode}){
  return <span className="ml-1 text-[11px] font-normal text-gray-400" data-unconfirmed>{children}</span>
}
