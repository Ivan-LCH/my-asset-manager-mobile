// Browser interactions use visible controls and real mouse clicks, in the caller's disposable profile.
const assert = require('node:assert/strict');
module.exports = async ({navigate,evaluate,call,dbEval,until,snapshot,privateBackup}) => {
  async function click(selector, text) {
    const point=await evaluate(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    assert(point,'Visible control not found: '+text);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  const results=[];
  for(const width of [1440,390]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/','내 자산과 은퇴 준비');
    await until(()=>evaluate("[...document.querySelectorAll('main a')].some(e=>e.checkVisibility()&&e.textContent.includes('주식 계좌 확인·시세 갱신'))"),'home asset data loaded');
    assert.equal(await evaluate("!!document.querySelector('main .migration-review')"),false);
    await click('main a','주식 계좌 확인·시세 갱신');
    await until(()=>evaluate("location.pathname==='/assets'&&location.search.includes('STOCK')&&document.querySelector('main').innerText.includes('시세 업데이트')"),'home to stock management');
    await navigate('/plan','은퇴계획, 여기서 시작하세요');
    assert.equal(await evaluate("[...document.querySelectorAll('main input,main select')].filter(e=>e.checkVisibility()).length"),0);
    assert.equal(await evaluate("document.querySelector('.advanced-nav').open"),false);
    if(!privateBackup)await snapshot('simple-plan-'+width);
    await click('.plan-steps button','은퇴 시점');
    await until(()=>evaluate("location.search.includes('household')&&!!document.querySelector('input[type=month]')"),'open household');
    assert.equal(await evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('계획 범위')).parentElement.open"),false);
    await click('main button','다음: 생활비·수입');
    await until(()=>evaluate("location.search.includes('flows')"),'household to flows');
    assert.equal(await evaluate("document.querySelectorAll('.plan-entry [aria-expanded=true]').length"),0);
    const entries=await evaluate("document.querySelectorAll('.entry-toggle').length");
    if(entries){
      await click('.entry-toggle','수정하기');
      await until(()=>evaluate("document.querySelectorAll('.entry-toggle[aria-expanded=true]').length===1"),'one entry opens');
      const selected=await evaluate('location.pathname+location.search');
      await navigate(selected,'반복 입출금');
      assert.equal(await evaluate("document.querySelectorAll('.entry-toggle[aria-expanded=true]').length"),1);
      await click('.entry-toggle[aria-expanded=true]','접기');
      await until(()=>evaluate("document.querySelectorAll('.entry-toggle[aria-expanded=true]').length===0"),'entry closes');
    }
    await click('main button','다음: 분석 전 확인');
    await until(()=>evaluate("location.search.includes('review')&&document.querySelector('main').innerText.includes('입력 범위 확인')"),'review step');
    await navigate('/settings','설정');
    assert.equal(await evaluate("document.querySelector('[data-price-correction]').open"),false);
    await click('summary','과거 기록 보정');
    assert.equal(await evaluate("document.querySelector('[data-price-correction]').open"),true);
    // Synthetic/API-isolated only: click the reported failing button and verify useful completion.
    if(!privateBackup){
      await click('button','최근 3개월 시세 소급 업데이트');
      await until(()=>evaluate("document.querySelector('main').innerText.includes('시세 조회 실패')||document.querySelector('main').innerText.includes('보정 가능한 기존 기록이 없습니다')"),'price correction failure explained');
    }
    for(const [route,label] of [['/','내 자산과 은퇴 준비'],['/plan','은퇴계획, 여기서 시작하세요'],['/plan?tab=flows','반복 입출금'],['/plan?tab=events','날짜별 사건'],['/plan?tab=review','입력 범위 확인']]) {
      await navigate(route,label);
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'),'Layout overflow');
    }
    if(!privateBackup){await navigate('/','내 자산과 은퇴 준비');await snapshot('simple-home-'+width);}
    results.push({width,startVisibleInputs:0,entries,stepNavigation:true,detailReload:true,overflow:false});
  }
  if(!privateBackup){
    // A new record opens immediately; a real form edit survives save and a full reload.
    await navigate('/plan?tab=flows','반복 입출금');await click('main button','입출금 추가');
    await until(()=>evaluate("document.querySelectorAll('.entry-toggle[aria-expanded=true]').length===1"),'new entry opens');
    await evaluate(`(()=>{const el=[...document.querySelectorAll('label')].find(e=>e.checkVisibility()&&e.innerText.includes('항목 이름')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'SYNTHETIC_SIMPLE_FLOW');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('main button','저장 · 변경 있음');
    await until(()=>dbEval("return (await m.db.table('plannerPlans').get('main')).plan.flows.some(f=>f.name==='SYNTHETIC_SIMPLE_FLOW')"),'new entry saved');
    await navigate(await evaluate('location.pathname+location.search'),'SYNTHETIC_SIMPLE_FLOW');
    assert.equal(await evaluate("document.querySelectorAll('.entry-toggle[aria-expanded=true]').length"),1);
  }
  console.log('SIMPLE_UX='+JSON.stringify(results));
};
