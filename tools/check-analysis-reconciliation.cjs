const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'Reconciliation control missing: '+text);
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  const id=await dbEval("const a=await m.createAsset({type:'REAL_ESTATE',name:'SYNTHETIC_REBUILD',acquisitionDate:'2020-01-01',acquisitionPrice:500000000,ownership:{husband:100,wife:0},detail:{address:'',loanAmount:0,tenantDeposit:0,isOwned:false,hasTenant:false,futureYear:2030,futureValue:1000000000}});await m.db.assets.update(a,{currentValue:500000000});await m.saveRetirement({retirementYear:2029,holdingTaxAuto:true});return a;");
  await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("document.querySelector('[data-analysis-notices]')?.innerText.includes('일부 세금 미반영')"),'unknown tax is not zero');
  await navigate('/assets/'+id,'SYNTHETIC_REBUILD');await click('button','속성 수정');await click('button','상세 옵션');await click('summary','재건축 세금 시점 확인');
  for(const [label,value] of [['주택 과세대상 전환일','2030-09-01'],['공사 중 연 보유세','123000']])await evaluate(`(()=>{const e=document.querySelector('input[aria-label="'+${JSON.stringify(label)}+'"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur()})()`);
  await click('button','저장');await until(()=>dbEval(`return (await m.db.realEstateDetails.get(${JSON.stringify(id)})).housingTaxStartDate==='2030-09-01'`),'property timing save');
  const exported=await dbEval('return (await m.exportBackup()).tables.realEstateDetails');assert.equal(exported.find(a=>a.assetId===id).constructionHoldingTaxAnnual,123000);
  await dbEval('await m.saveRetirement({retirementYear:2030})');await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2030'"),'tax year 2030');
  assert.equal(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.annualTax)"),123000);
  await click('button[aria-label="다음 연도"]','');await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2031'"),'tax year 2031');assert(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.annualTax)>123000"));
  await click('[data-pension-ledger] summary','연금 계좌');assert(await evaluate("document.querySelector('[data-pension-ledger]').open"));
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));
    await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'reconciliation summary loaded');await snapshot('reconciled-analysis-'+width);
  }
  // Synthetic account: the second year must not show a withdrawal after depletion.
  await dbEval("await m.savePortfolio({growthRate:0,dividendYield:0})");
  await dbEval("const a=await m.createAsset({type:'PENSION',name:'SYNTHETIC_FUNDED',acquisitionDate:'2020-01-01',acquisitionPrice:1200000,detail:{pensionType:'IRP',expectedStartYear:2030,expectedEndYear:2040,expectedMonthlyPayout:100000,annualGrowthRate:0}});await m.db.assets.update(a,{currentValue:1200000});await m.saveRetirement({retirementYear:2030})");
  await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'funded summary');const income=await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.monthlyIncome)");
  await click('button[aria-label="다음 연도"]','');await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2031'"),'depleted year');
  assert.equal(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.monthlyIncome)"),income-100000);assert(await evaluate("document.querySelector('[data-analysis-notices]').innerText.includes('지급 부족')"));
  console.log('ANALYSIS_RECONCILIATION_UI=PASS; property form save/export; unknown vs entered tax; cutoff transition; depleted payment; desktop/mobile');
};
