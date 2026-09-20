// Called only in the disposable --backup browser profile. No names, amounts,
// input values, screenshots or private backup copies are written to disk.
module.exports = async function review({ navigate, evaluate, dbEval, call }) {
  const assert=require('node:assert/strict'),fixed=process.argv.includes('--expect-fixed');
  const structure = await dbEval(`
    const assets=await m.getAllAssets(), active=assets.filter(a=>!a.disposalDate);
    const {loadContext,legacyPreview}=await import('/src/planner/storage.ts');
    const c=await loadContext(), stocks=active.filter(a=>a.type==='STOCK');
    const accounts=[...new Set(stocks.map(a=>a.detail?.accountName??''))];
    const linked=active.filter(a=>a.type==='PENSION'&&a.detail?.linkedStockId);
    const linkedResolved=linked.filter(a=>accounts.includes(a.detail.linkedStockId));
    const preview=await legacyPreview();
    return {active:active.length,stocks:stocks.length,accounts:accounts.length,
      overviewRows:c.current.positions.length,unconfirmed:c.current.positions.filter(p=>!p.confirmed).length,
      pensionLinks:linked.length,accountResolvedLinks:linkedResolved.length,
      linkedPensionsCountedAgain:linkedResolved.filter(a=>c.current.positions.some(p=>p.assetId===a.id&&p.balance>0&&!p.linkedTo)).length,
      pensionLikeStocks:stocks.filter(a=>a.detail?.isPensionLike).length,
      pensionLikeStocksClassedInvestment:stocks.filter(a=>a.detail?.isPensionLike&&c.current.positions.some(p=>p.assetId===a.id&&p.role==='investment')).length,
      overviewIssueCodes:[...new Set(c.current.issues.map(i=>i.code))],
      legacyExists:c.hasLegacy,newPlanExists:c.hasPlan,previewPeople:preview.plan.people.length,
      previewFlows:preview.plan.flows.length,previewEvents:preview.plan.events.length};
  `);
  console.log('REVIEW_STRUCTURE '+JSON.stringify(structure));
  const metrics=[];
  const routes=[['all','/assets?type=ALL','현재 자산 전체'],['stocks','/assets?type=STOCK','시세 업데이트'],['property','/assets?type=REAL_ESTATE','부동산'],['pension','/assets?type=PENSION','연금'],['savings','/assets?type=SAVINGS','예'],['other','/assets?type=ETC','기타'],['home','/','내 자산과 은퇴 준비'],['history','/history','자산'],['start','/plan','은퇴계획, 여기서 시작하세요'],['household','/plan?tab=household','계획 범위'],['review','/plan?tab=review','입력 범위 확인'],['policies','/plan?tab=policies','자산 연결'],['flows','/plan?tab=flows','반복 입출금'],['events','/plan?tab=events','날짜별 사건'],['debts','/plan?tab=debts','대출·받은 보증금'],['scenarios','/plan?tab=scenarios','대안'],['analysis','/analysis','내 은퇴 분석'],['advanced-analysis','/advanced-analysis','은퇴·현금흐름 분석'],['legacy-prep','/legacy-analysis?tab=prep','은퇴'],['legacy-year','/legacy-analysis?tab=year','연도'],['legacy-pension','/legacy-analysis?tab=pension-sim','연금'],['legacy-corp','/legacy-analysis?tab=corp-sim','법인'],['legacy-cashflow','/legacy-analysis?tab=cashflow','현금'],['settings','/settings','설정']];
  const overflowOnly=process.argv.includes('--overflow-only');
  for(const width of process.argv.includes('--review-details') ? [] : overflowOnly ? [390] : [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    for(const [page,route,label] of routes){
      if(overflowOnly&&page!=='legacy-cashflow')continue;
      await navigate(route,label);
      const result=await evaluate(`(()=>{const main=document.querySelector('main');return {
        height:main.scrollHeight,viewport:main.clientHeight,mainOverflow:main.scrollWidth>main.clientWidth+1,
        documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
        panels:main.querySelectorAll('.panel').length,inputs:main.querySelectorAll('input,select,textarea').length,
        detailLinks:main.querySelectorAll('a[href^="/assets/"]').length,
        overviewAccounts:main.querySelectorAll('[data-account-link]').length,
        accountButtons:[...main.querySelectorAll('button.group')].length,
        settingsLink:!!main.querySelector('a[href="/settings"]')};})()`);
      metrics.push({width,page,...result});
      if(result.mainOverflow) console.log('OVERFLOW_ELEMENTS '+JSON.stringify(await evaluate(`(()=>{const main=document.querySelector('main'),edge=main.getBoundingClientRect().right;return [...main.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>edge+1).slice(0,14).map(el=>({tag:el.tagName,class:el.getAttribute('class'),width:Math.round(el.getBoundingClientRect().width),right:Math.round(el.getBoundingClientRect().right)}));})()`)));
    }
  }
  console.log('REVIEW_LAYOUT '+JSON.stringify(metrics));
  if(overflowOnly)return metrics;
  if(fixed&&metrics.length){
    for(const row of metrics){assert(!row.mainOverflow,'Main overflow: '+row.page);if(row.page==='all')assert.equal(row.overviewAccounts,structure.accounts);if(row.page==='policies')assert(row.inputs<10,'Initial policy forms should be collapsed');}
  }
  await navigate('/assets?type=STOCK','시세 업데이트');
  const selected=await evaluate(`(()=>{const b=document.querySelector('main button.group');if(!b)return false;b.click();return true;})()`);
  await new Promise(r=>setTimeout(r,400));
  const selection=await evaluate(`({selected:document.querySelector('main').innerText.includes('클릭하면 상세 확인'),urlStoresAccount:new URLSearchParams(location.search).has('account')})`);
  const accountUrl=await evaluate('location.pathname+location.search');
  await navigate(accountUrl,'시세 업데이트');
  const lost=await evaluate(`!document.querySelector('main').innerText.includes('클릭하면 상세 확인')`);
  console.log('REVIEW_ACCOUNT_NAV '+JSON.stringify({clicked:selected,...selection,lostOnReload:lost}));
  if(fixed){assert(selection.urlStoresAccount);assert(!lost);}
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const targetIds=await dbEval("return (await m.getAllAssets()).filter(a=>!a.disposalDate).reduce((out,a)=>{out[a.type]??=a.id;return out},{})");
  const details=[];
  for(const [type,id] of Object.entries(targetIds)){
    await navigate('/assets/'+encodeURIComponent(id),'속성 수정');
    details.push({type,...await evaluate(`(()=>{const main=document.querySelector('main');return {mainOverflow:main.scrollWidth>main.clientWidth+1,editButton:[...main.querySelectorAll('button')].some(b=>b.textContent.includes('속성 수정')),dividendTab:[...main.querySelectorAll('button')].some(b=>b.textContent.includes('배당금')),returnLinkKeepsAccount:[...main.querySelectorAll('a')].some(a=>a.textContent.includes('유형별 관리')&&a.search.includes('account='))};})()`)});
    if(type==='STOCK'){
      await evaluate(`(()=>{const b=[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('배당금'));b?.click();})()`);
      details[details.length-1].dividendContent=await evaluate("document.querySelector('main').innerText.includes('수령')");
    }
  }
  console.log('REVIEW_DIRECT_DETAILS '+JSON.stringify(details));
  await navigate('/assets?type=PENSION','연금');
  const pension=await evaluate(`({legacyForecastVisible:document.querySelector('main').innerText.includes('은퇴 시 월 수령'),targetLabelVisible:document.querySelector('main').innerText.includes('등록 지급 목표'),hasConnectionButton:[...document.querySelectorAll('main button')].some(b=>b.textContent.includes('연금 분석 보기'))})`);
  await evaluate(`(()=>{const b=[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('연금 분석 보기'));b?.click();})()`);
  await new Promise(r=>setTimeout(r,500));
  pension.simulationButtonOpensPensionAnalysis=await evaluate("location.pathname==='/analysis'&&new URLSearchParams(location.search).get('tab')==='pension-sim'");
  console.log('REVIEW_PENSION_NAV '+JSON.stringify(pension));
  if(fixed){assert(!pension.legacyForecastVisible);assert(pension.targetLabelVisible);assert(pension.hasConnectionButton);assert(pension.simulationButtonOpensPensionAnalysis);assert(details.every(d=>d.editButton&&!d.mainOverflow));}
  if(fixed){
    const linkedId=await dbEval("return (await m.getAllAssets()).find(a=>a.type==='PENSION'&&a.detail?.linkedStockId)?.id");
    if(linkedId){
      await navigate('/plan?tab=flows&asset='+encodeURIComponent(linkedId),'반복 입출금');
      await evaluate(`(()=>{const b=[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='자산에 등록한 연금 지급액 연결');b.click();})()`);
      for(let i=0;i<30;i++){if(await evaluate("!!document.querySelector('select[aria-label=\"출금할 주식 계좌\"]')"))break;await new Promise(r=>setTimeout(r,200));}
      const funding=await evaluate(`(()=>{const s=document.querySelector('select[aria-label="출금할 주식 계좌"]');return {chosen:!!s?.value,rows:document.querySelectorAll('.date-editor ol li').length,flows:document.querySelectorAll('section[id^="source-asset-payout:"]').length};})()`);
      assert(funding.chosen);assert(funding.rows>0);assert.equal(funding.flows,1);
      await evaluate(`(()=>{const b=[...document.querySelectorAll('main button')].find(b=>b.textContent.startsWith('저장')&&!b.textContent.includes('분석'));b.click();})()`);
      let saved=false;for(let i=0;i<40;i++){saved=await dbEval("return !!(await m.db.table('plannerPlans').get('main'))?.plan.flows.some(f=>f.withdrawalAssetIds?.length&&f.confirmed===false)");if(saved)break;await new Promise(r=>setTimeout(r,200));}assert(saved);
      console.log('REVIEW_FUNDING_FORM '+JSON.stringify({selectedSourceOnly:true,fundingSelected:true,fundingRows:funding.rows,savedUnconfirmed:true}));
    }
    await navigate('/plan?tab=policies','계좌·유형별 연결 검토');
    await evaluate("document.querySelector('.policy-group-list button').click()");await new Promise(r=>setTimeout(r,300));
    await evaluate("document.querySelector('.policy-row').click()");await new Promise(r=>setTimeout(r,300));
    const editor=await evaluate("({opened:document.querySelectorAll('.policy-row[aria-expanded=true]').length,inputs:document.querySelectorAll('main input,main select').length})");
    assert.equal(editor.opened,1);assert(editor.inputs>2&&editor.inputs<30);
    console.log('REVIEW_POLICY_EDITOR '+JSON.stringify(editor));
  }
  return metrics;
};
