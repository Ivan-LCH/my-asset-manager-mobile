import type { PlannerPlan } from './model';

export default function PlanStart({ plan, hasLegacy, onOpen }: {
    plan: PlannerPlan; hasLegacy: boolean; onOpen: (tab: string) => void;
}) {
    const hasDates = plan.people.length > 0 && plan.people.every(p => p.birthMonth && p.retirementDate);
    const hasExpense = plan.flows.some(f => f.kind === 'expense');
    const next = !hasDates ? 'household' : !hasExpense ? 'flows' : 'review';
    return <section className="panel plan-start" data-plan-start>
      <h2>은퇴계획, 여기서 시작하세요</h2>
      <p>등록된 보유 자산을 불러옵니다. 다시 등록하지 않아도 됩니다. 아래 순서로 필요한 내용만 확인하세요.</p>
      <button onClick={() => onOpen(next)}>{next === 'household' ? '1. 은퇴 시점부터 확인하기' : next === 'flows' ? '2. 생활비·수입 확인하기' : '3. 분석 전 확인하기'}</button>
      <ol className="plan-steps">
        <li><button className="secondary" onClick={() => onOpen('household')}>은퇴 시점</button><span>누가, 언제 은퇴하나요?</span></li>
        <li><button className="secondary" onClick={() => onOpen('flows')}>생활비·수입</button><span>매달 쓸 돈과 들어올 돈을 확인합니다.</span></li>
        <li><button className="secondary" onClick={() => onOpen('review')}>분석 전 확인</button><span>자산 사용 방법과 빠진 조건을 확인합니다.</span></li>
      </ol>
      {hasLegacy && !plan.reviewedLegacy && <p className="muted">이전에 입력한 은퇴계획이 있습니다. ‘은퇴 시점’에서 기존 입력을 불러와 검토할 수 있습니다. 원본은 보존됩니다.</p>}
      <p className="muted">이 순서는 입력 안내입니다. 단계 이동만으로 확인 완료 처리하지 않습니다. 현재 자산 관리에는 은퇴계획 설정이 필요하지 않습니다.</p>
    </section>;
}
