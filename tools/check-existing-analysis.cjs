const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot,privateBackup})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'Visible analysis control missing');
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  if(!privateBackup){
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("!document.querySelector('main').innerText.includes('기존 입력을 불러오는 중')"),'empty inputs loaded');
    assert(await evaluate("document.querySelector('main').innerText.includes('이 정보만 확인하면')"),'Empty inputs must not show sample results');
    await dbEval("await m.saveSettings({birthHusband:'1980.01',retirementYear:2028});await m.saveRetirement({retirementYear:2028,expenses:[{id:'test-cost',name:'SYNTHETIC_COST',amount:300000}],medicalMonthly:0,travel:[],lumpsum:[],emergency:[],linkPensionSim:false,linkCorpSim:false});await m.createAsset({type:'PENSION',name:'SYNTHETIC_PENSION',acquisitionDate:'2020-01-01',acquisitionPrice:0,detail:{pensionType:'NATIONAL',expectedStartYear:2028,expectedEndYear:2060,expectedMonthlyPayout:500000,annualGrowthRate:0}});");
  }
  const original=(await dbEval('return await m.exportBackup()')).tables;
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'automatic existing analysis result');
    assert.equal(await evaluate("[...document.querySelectorAll('nav a')].filter(e=>e.checkVisibility()&&e.getAttribute('href')==='/plan').length"),0,'Planner still in primary navigation');
    assert.equal(await evaluate("document.querySelector('#analysis-income').open"),false);
    await click('button[aria-controls=analysis-income]','월 수입');
    assert(await evaluate("document.querySelector('#analysis-income').open"));
    await click('#analysis-tax summary','세금');assert(await evaluate("document.querySelector('#analysis-tax').open"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));
    if(!privateBackup){await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'summary reload');await snapshot('existing-analysis-'+width);}
    await click('button','연도별 현금흐름');await until(()=>evaluate("location.search.includes('cashflow')&&document.querySelector('main').innerText.includes('은퇴 생활비 계획')"),'cash-flow tab');
    await click('button','생활비·목돈 입력');await until(()=>evaluate("location.search.includes('prep')&&document.querySelector('main').innerText.includes('은퇴 준비 (입력)')"),'existing input tab');
    await navigate('/analysis?tab=pension-sim','연금');await navigate('/analysis?tab=corp-sim','법인');await navigate('/advanced-analysis','은퇴·현금흐름 분석');
  }
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,original,'Viewing analysis must not create/overwrite plans');
  if(!privateBackup){
    await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'baseline');
    const before=await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.monthlyExpense)");
    await click('button','생활비·목돈 입력');await click('button','생활비 / 여행 / 의료비');
    assert(await evaluate(`(()=>{const input=[...document.querySelectorAll('input')].find(e=>e.checkVisibility()&&e.value==='300,000');if(!input)return false;input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'400000');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`));
    await evaluate("document.activeElement.blur()");
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='저장'&&!e.disabled)"),'expense edited');
    await click('button','저장');await until(()=>dbEval("return (await m.getRetirement()).expenses[0].amount===400000"),'existing expense saved');
    await click('a','분석 요약으로 돌아가기');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'summary after save');
    assert.equal(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.monthlyExpense)"),before+100000);
    assert.equal(await dbEval("return await m.db.table('plannerPlans').count()"),0,'Basic analysis must not require a new plan');
    await require('./check-analysis-reconciliation.cjs')({navigate,evaluate,dbEval,call,until,snapshot});
    await require('./check-irp-link.cjs')({navigate,evaluate,dbEval,call,until,snapshot});
    await require('./check-input-linkage.cjs')({navigate,evaluate,dbEval,call,until,snapshot});
  }
  console.log('EXISTING_ANALYSIS=PASS; desktop/mobile; auto result; drilldowns; tabs; original inputs preserved; '+(privateBackup?'read-only private backup':'expense edit recalculated; no new plan'));
};
