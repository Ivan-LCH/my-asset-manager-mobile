import {describe,it,expect} from 'vitest';
import {annualHealth,regionalPremium,REGIONAL_POLICY_2026} from './annualHealth';
import {getPropertyScore,PROPERTY_SCORE_TABLE} from './healthInsurance';
import {EMPTY_PENSION_PLAN,type PensionScheduleRow} from './pensionSim';
const row:PensionScheduleRow={year:2031,nationalAnnual:0,taxableAnnual:49_500_000,exemptAnnual:0,drawdownAnnual:49_500_000,financialAnnual:0,financialHusbandAnnual:0,financialWifeAnnual:0,totalAnnual:49_500_000,pensionByOwner:{husband:{national:0,taxable:49_500_000,exempt:0},wife:{national:0,taxable:0,exempt:0}}};
const props={husband:{propertyTaxBase:101_250_000,rentalDeposit:0},wife:{propertyTaxBase:911_250_000,rentalDeposit:0}};
describe('IRP 연금과 건강보험 부과소득 분리',()=>{
  it('전체 60등급의 상한 경계와 바로 다음 구간을 적용한다',()=>{
    expect(PROPERTY_SCORE_TABLE).toHaveLength(60);expect(getPropertyScore(100_000_000)).toBe(0);expect(getPropertyScore(100_000_001)).toBe(22);
    for(let i=0;i<PROPERTY_SCORE_TABLE.length-1;i++){
      const [upper,score]=PROPERTY_SCORE_TABLE[i];expect(getPropertyScore(upper*10_000+100_000_000)).toBe(score);expect(getPropertyScore(upper*10_000+100_000_001)).toBe(PROPERTY_SCORE_TABLE[i+1][1]);
    }
    expect(getPropertyScore(101_250_000)).toBe(22);expect(getPropertyScore(911_250_000)).toBe(961);
  });
  it('IRP 지급액이 커져도 공적연금 건보소득으로 더하지 않는다',()=>{
    const a=annualHealth(row,EMPTY_PENSION_PLAN,props),b=annualHealth({...row,taxableAnnual:99_000_000,pensionByOwner:{...row.pensionByOwner!,husband:{national:0,taxable:99_000_000,exempt:0}}},EMPTY_PENSION_PLAN,props);
    expect(a.totalMonthly).toBe(b.totalMonthly);expect(a.husband.assessedAnnual).toBe(0);expect(a.husband.excludedPrivate).toBe(49_500_000);
  });
  it('공적연금은 명의별로 절반만 반영한다',()=>{
    const v=annualHealth({...row,pensionByOwner:{husband:{national:24_000_000,taxable:0,exempt:0},wife:{national:12_000_000,taxable:0,exempt:0}}},EMPTY_PENSION_PLAN,props);
    expect(v.husband.assessedAnnual).toBe(12_000_000);expect(v.wife.assessedAnnual).toBe(6_000_000);
  });
  it('금융소득 문턱은 부부 합계가 아니라 개인별로 적용한다',()=>{
    const v=annualHealth({...row,financialHusbandAnnual:10_000_000,financialWifeAnnual:10_000_001},EMPTY_PENSION_PLAN,props);
    expect(v.husband.includedFinancial).toBe(0);expect(v.wife.includedFinancial).toBe(10_000_001);
  });
  it('같은 지역가입 세대는 합산 과표에서 공제 한 번, 다른 세대는 각각 계산한다',()=>{
    const joint=annualHealth(row,{...EMPTY_PENSION_PLAN,healthHouseholdMode:'joint'},props),separate=annualHealth(row,{...EMPTY_PENSION_PLAN,healthHouseholdMode:'separate'},props);
    expect(joint.joint.deductedProperty).toBe(912_500_000);expect(joint.totalMonthly).toBe(joint.joint.grandTotal);
    expect(separate.totalMonthly).toBe(separate.husbandSeparate.grandTotal+separate.wifeSeparate.grandTotal);expect(joint.totalMonthly).not.toBe(separate.totalMonthly);
  });
  it('가입 형태 미입력은 확인되지 않은 가정으로 표시하고 원본을 수정하지 않는다',()=>{
    const before=JSON.stringify(EMPTY_PENSION_PLAN),v=annualHealth(row,EMPTY_PENSION_PLAN,props);
    expect(v.assumed).toBe(true);expect(v.mode).toBe('joint');expect(JSON.stringify(EMPTY_PENSION_PLAN)).toBe(before);
  });
  it('최저 소득보험료에 재산분을 더하고 2026 상한을 넘지 않는다',()=>{
    const v=regionalPremium(0,911_250_000);expect(v.incomeMonthly).toBe(20_160);expect(v.propertyMonthly).toBe(961*211.5);
    expect(regionalPremium(1e12,1e12).healthTotal).toBe(REGIONAL_POLICY_2026.maximum);
  });
});
