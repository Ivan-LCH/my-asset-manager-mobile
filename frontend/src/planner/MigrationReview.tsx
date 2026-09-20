import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings, getRetirement } from '@/lib/db';
import { usePlanner } from './context';
export default function MigrationReview() {
    const {data}=usePlanner();
    const [source,setSource]=useState<{people:number;expenses:number;events:number;retirementYear:string;special:number}|null>(null);
    const [error,setError]=useState('');
    useEffect(()=>{let active=true;Promise.all([getSettings(),getRetirement()]).then(([settings,legacy])=>{
      if(active)setSource({people:Number(!!settings.birthHusband)+Number(!!settings.birthWife),expenses:(legacy.expenses?.length??0)+Number(legacy.medicalMonthly!=null),events:(legacy.lumpsum?.length??0)+(legacy.emergency?.length??0),retirementYear:String(legacy.retirementYear??settings.retirementYear??'미입력'),special:Number(!!legacy.travel)+Number(!!legacy.healthInsurance)+Number(!!legacy.linkCorpSim)+Number(!!legacy.linkPensionSim)});
    }).catch(()=>{if(active)setError('기존 입력 점검 내용을 읽지 못했습니다. 다시 열어 주세요.');});return()=>{active=false;};},[data?.snapshot.assetRevision,data?.plan.revision]);
    if(!data?.hasLegacy)return null;
    return <details className="panel migration-review"><summary>기존 입력과 새 계획의 연결 내역 보기</summary><p>기존 자산·이력·명의·은퇴 입력은 보존되어 있습니다. 새 계획에 적용한 항목과 검토 대기 항목은 다릅니다.</p>
      {error?<p role="alert">{error}</p>:source?<><ul><li>기존 생년월 입력 {source.people}명 → 새 계획 {data.plan.people.length}명. 가구/명의 매핑 확인 필요</li><li>복사 가능한 생활·의료 항목 {source.expenses}건, 목돈·긴급 일정 {source.events}건</li><li>기존 은퇴 예정 연도: {source.retirementYear} · 은퇴 월/일은 임의로 정하지 않음</li><li>여행·보험·법인/연금 연동 검토 범주 {source.special}개 · 원본과 대조해 새 조건 확인</li></ul><p>{data.hasPlan?'새 계획 저장본이 있습니다. 원본 전체가 자동 적용되었다는 의미는 아닙니다.':'새 계획은 아직 저장하지 않았습니다. 아래 검토용 복사를 시작하세요.'}</p></>:<p role="status">이전 입력 분류 중…</p>}
      <div className="actions"><Link to="/plan?tab=household#migration-copy">가구·입력 이전 확인 →</Link><Link to="/legacy-analysis?tab=prep">기존 은퇴 입력 대조 →</Link><Link to="/settings">원본 설정·백업 →</Link></div><p className="muted">복사 후에도 날짜·연금 출금 원천·세율을 확인해야 합니다. 미지원 조건은 자동 0원 처리하지 않습니다.</p>
    </details>;
}
