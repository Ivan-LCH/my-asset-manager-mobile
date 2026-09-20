const assert = require('node:assert/strict');
module.exports = async ({navigate, evaluate, dbEval, call, until, snapshot}) => {
  // Only used by check-local-app's fresh synthetic browser profile.
  async function clickSummary(selector) {
    const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert(p, 'Missing tax summary');
    for (const type of ['mousePressed','mouseReleased']) await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  const read = () => evaluate(`(()=>{const e=document.querySelector('[data-financial-tax-total]');return {total:Number(e.dataset.financialTaxTotal),people:[...e.querySelectorAll('[data-financial-tax-owner]')].map(p=>({owner:p.dataset.financialTaxOwner,values:Object.fromEntries([...p.querySelectorAll('[data-tax-field]')].map(v=>[v.dataset.taxField,Number(v.dataset.amount)]))}))}})()`);
  await dbEval(`
    await m.saveSettings({birthHusband:'1980.01',birthWife:'1982.01',retirementYear:2031});
    const {EMPTY_PENSION_PLAN}=await import('/src/lib/pensionSim.ts');
    await m.savePensionSim({...EMPTY_PENSION_PLAN,sources:[],allocations:[],startYear:2031,refYear:2031,stockInputMode:'manual',spouseDependent:false,dependents:0,useStandardDeduction:false,healthHouseholdMode:'joint',stockAccount:{husband:{extraAmount:100000000,growthRate:0,dividendYield:21},wife:{extraAmount:100000000,growthRate:0,dividendYield:18}}});
    await m.saveRetirement({retirementYear:2031,linkPensionSim:true,linkCorpSim:false,expenses:[],medicalMonthly:0,travel:[],lumpsum:[],emergency:[],holdingTaxAuto:false,holdingTaxAnnual:0});
  `);
  const before = (await dbEval('return await m.exportBackup()')).tables;
  for (const width of [1440,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("!!document.querySelector('[data-financial-tax-total]')"),'Tax result ready');
    assert.equal(await evaluate("document.querySelector('#analysis-tax').open"),false);
    assert(await evaluate("document.querySelector('#analysis-tax>summary').innerText.includes('연')"));
    await clickSummary('#analysis-tax>summary');
    await clickSummary('[data-financial-tax-total]>summary');
    assert(await evaluate("document.querySelector('[data-financial-tax-total]').open"));
    const year = await read();
    assert.equal(year.total,6006000);
    assert.deepEqual(year.people.map(p=>p.values.withholding),[3234000,2772000]);
    assert(year.people.every(p=>p.values.additional===0 && p.values.total===p.values.withholding));
    assert.equal(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.annualTax)"),6006000);
    assert(await evaluate("document.querySelector('[data-financial-tax-owner=husband]').innerText.includes('종합과세 검토 대상')"));
    assert(await evaluate("document.querySelector('[data-financial-tax-owner=wife]').innerText.includes('2천만원 이하')"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await snapshot('financial-tax-'+width);
    await navigate('/analysis?tab=pension-sim','개인투자시뮬');
    await until(()=>evaluate("!!document.querySelector('[data-financial-tax-total]')"),'Vehicle tax ready');
    await clickSummary('[data-financial-tax-total]>summary');
    assert.deepEqual(await read(),year,'Same-year vehicle and dashboard must match');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));
  }
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,before,'Projection views must not mutate saved inputs');
  await dbEval('const p=await m.getPensionSim();p.stockAccount.husband.dividendYield=100;await m.savePensionSim(p)');
  await navigate('/analysis','내 은퇴 분석');
  await until(()=>evaluate("Number(document.querySelector('[data-financial-tax-total]')?.dataset.financialTaxTotal)===20240000"),'Updated high-income liability');
  const high=await read();
  assert.equal(high.people[0].values.withholding,15400000);
  assert.equal(high.people[0].values.additional,2068000);
  assert.equal(high.people[0].values.total,17468000);
  console.log('FINANCIAL_TAX_UI=PASS; full withholding; additional settlement; individual threshold; cash-flow total; same-year screens; desktop/mobile; read-only projections');
};
