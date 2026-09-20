import {describe,expect,it} from 'vitest'
import {irpFundingQuestions} from './IrpFundingInterview'
import {EMPTY_PENSION_PLAN} from '@/lib/pensionSim'
import type {IncomeTaxSettings,PensionSimPlan,PensionSourceTaxSettings} from '@/types'

const source={id:'irp',name:'합성 IRP',principal:100,taxType:'irp' as const,owner:'husband' as const,yieldRate:0,expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:1}
const plan:PensionSimPlan={...EMPTY_PENSION_PLAN,sources:[source]}
const kinds=(settings?:PensionSourceTaxSettings)=>irpFundingQuestions(plan,{sources:settings?{irp:settings}:{}} as IncomeTaxSettings).map(q=>q.kind)
describe('IRP 빈칸 문답 순서',()=>{
  it('재원을 모르면 다른 값을 추정하지 않고 첫 질문만 제시',()=>expect(kinds()).toEqual(['funding']))
  it('퇴직금 재원은 세율과 첫 수령연도를 묻고 명시적 0 세율도 답으로 인정',()=>{
    expect(kinds({fundingKind:'retirement'})).toEqual(['retirementTaxRate','firstReceiptYear'])
    expect(kinds({fundingKind:'retirement',retirementTaxRate:0,firstReceiptYear:2031})).toEqual([])
  })
  it('혼합 재원은 두 원금을 먼저 묻고 0원도 확인값으로 처리',()=>{
    expect(kinds({fundingKind:'mixed'})).toEqual(['retirementPrincipal','exemptPrincipal'])
    expect(kinds({fundingKind:'mixed',retirementPrincipal:0,exemptPrincipal:0})).toEqual(['lifetime'])
    expect(kinds({fundingKind:'mixed',retirementPrincipal:0,exemptPrincipal:0,lifetime:false})).toEqual([])
  })
  it('원금 합계가 잔액을 넘으면 후속 계산 전에 수정 질문만 남김',()=>expect(kinds({fundingKind:'mixed',retirementPrincipal:80,exemptPrincipal:30,lifetime:false})).toEqual(['splitInvalid']))
  it('개인 재원은 일반 IRP인지 종신계약인지 명시적으로 확인',()=>{
    expect(kinds({fundingKind:'personal'})).toEqual(['lifetime'])
    expect(kinds({fundingKind:'personal',lifetime:false})).toEqual([])
  })
})
