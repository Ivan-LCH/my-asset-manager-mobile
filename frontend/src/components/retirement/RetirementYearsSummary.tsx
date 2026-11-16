// 은퇴 연도 읽기 전용 표시 + 「수정」 → 입력/설정 › ① 인물·은퇴 (편집기는 허브 한 곳뿐)
import { Link } from 'react-router-dom'
import { hubLink } from '@/components/hub/sections'

export function RetirementYearsSummary({ husband, wife, spouse }: { husband: number | null; wife: number | null; spouse: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300" data-retirement-years>
      <span>본인 은퇴 <b className="text-blue-300">{husband ?? '미입력'}</b>{husband != null && '년'}</span>
      {spouse && <span>와이프 은퇴 <b className="text-pink-300">{wife ?? '미입력'}</b>{wife != null && '년'}</span>}
      <Link className="text-xs text-blue-300 underline" to={hubLink('people')}>수정</Link>
    </p>
  )
}
