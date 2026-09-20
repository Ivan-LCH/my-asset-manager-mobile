/** Annual planning assumptions, not a legal determination of completion/occupancy. */
export interface PropertyTimingInput {
  currentValue: number; futureValue?: number; futureYear?: number;
  acquisitionDate?: string; disposalDate?: string;
  housingTaxStartDate?: string; constructionHoldingTaxAnnual?: number;
}
export function validDate(value: unknown): value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function propertyAtYear(a:PropertyTimingInput,year:number){
  const cutoff=`${year}-06-01`, end=`${year}-12-31`;
  const acquired=!validDate(a.acquisitionDate)||a.acquisitionDate<=cutoff;
  const held=acquired&&(!validDate(a.disposalDate)||a.disposalDate>cutoff);
  const transitionYear=validDate(a.housingTaxStartDate)?Number(a.housingTaxStartDate.slice(0,4)):a.futureYear;
  const rebuilding=Boolean(a.housingTaxStartDate||a.futureYear);
  const housing=validDate(a.housingTaxStartDate)?a.housingTaxStartDate<=cutoff:!rebuilding||year>=Number(transitionYear);
  const valueYear=a.futureYear??transitionYear;
  const value=a.futureValue!=null&&valueYear!=null&&year>=valueYear?a.futureValue:a.currentValue;
  const notes:string[]=[];
  if(held&&rebuilding&&!validDate(a.housingTaxStartDate))notes.push('주택 전환일 미확인: 입주 예정 연도부터 주택으로 보는 연 단위 가정');
  if(held&&!housing)notes.push('공사 중으로 보는 계획 가정입니다. 아직 멸실 전인 주택이거나 주택 외 건물은 자동 산정 대상과 다르므로 보유세 수동값을 확인하세요.');
  if(held&&!housing&&a.constructionHoldingTaxAnnual==null)notes.push('공사 중 토지 등 보유세 미입력: 합계에 미포함, 면세가 아님');
  if(held&&rebuilding&&housing&&a.futureValue==null)notes.push('준공 후 예상 가치 미입력: 현재 평가액 사용');
  return {held,housing,value,notes,
    manualAnnual:held&&!housing?a.constructionHoldingTaxAnnual:undefined,
    endValue:(!validDate(a.acquisitionDate)||a.acquisitionDate<=end)&&(!validDate(a.disposalDate)||a.disposalDate>end)?value:0,
    incomplete:held&&!housing&&a.constructionHoldingTaxAnnual==null,
  };
}
