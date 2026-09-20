// Existing Windows Chrome + Node only. Fresh temporary profile; no real account data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const production=process.argv.includes('--production');
const backfillMode=process.argv.includes('--backfill');
const existingAnalysisMode=process.argv.includes('--analysis');
const backupArg = process.argv.indexOf('--backup');
const privateBackup = backupArg >= 0 ? path.resolve(process.argv[backupArg + 1] || '') : null;
const updatePrivateIrp=process.argv.includes('--apply-irp-update');
if(updatePrivateIrp&&(!privateBackup||production||backfillMode||existingAnalysisMode))throw new Error('Private update requires only --backup and --apply-irp-update, using the local development server');
if (privateBackup && (production || !fs.statSync(privateBackup).isFile())) throw new Error('Use --backup FILE with the development server only');
const originArg=process.argv.indexOf('--origin');
let origin = originArg>=0?String(process.argv[originArg+1]??''):'http://127.0.0.1:5173', server;
if(originArg>=0&&!/^http:\/\/(127\.0\.0\.1|localhost|\d{1,3}(\.\d{1,3}){3}):\d+$/.test(origin))throw new Error('Test origin must be an explicit IP address without credentials or path');
if(privateBackup&&originArg>=0)throw new Error('A private backup may only use the fixed localhost development origin');
const ready=production?new Promise(resolve=>{
  const dist=path.resolve(__dirname,'../frontend/dist');
  server=require('node:http').createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let target=path.resolve(dist,'.'+pathname);
    if(!target.startsWith(dist+path.sep)&&target!==dist){res.writeHead(403);res.end();return}
    if(!path.extname(pathname))target=path.join(dist,'index.html');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
    fs.readFile(target,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(error?'Not found':data)})
  }).listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;resolve()})
}):Promise.resolve();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myasset-local-check-'));
const output = path.resolve(__dirname, '../logs/local-app-check');
fs.mkdirSync(output, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--no-proxy-server', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let ws, seq = 0, spawnError;
chrome.on('error', error => { spawnError = error; });
const pending = new Map(), exceptions = [], checks = [], rendered = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, name) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (await fn()) return;
    await delay(200);
  }
  throw new Error('Timed out: ' + name);
}
function call(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(privateBackup ? 'Private check browser exception (redacted)' : JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function navigate(route, required) {
  await call('Page.navigate', { url: origin + route });
  await until(async () => {
    try { return await evaluate('!!document.querySelector("main") && document.querySelector("main").innerText.includes(' + JSON.stringify(required) + ')'); }
    catch { return false; }
  }, route);
  if (privateBackup) await until(async () => evaluate(`(() => { const t=document.querySelector('main')?.innerText||'';return !!t&&!/로딩 중|불러오는 중|저장된 자산과 계획을 읽고 있습니다/.test(t);})()`), 'private view data ready');
  await delay(300);
  rendered.push(route);
  console.log('RENDERED ' + route);
}
async function snapshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function clickText(text) {
  assert(await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) return false; b.click(); return true; })()`), 'Button unavailable: ' + text);
}
async function dbEval(body) { return evaluate(`(async () => { const m = await import('/src/lib/db.ts'); ${body} })()`); }
(async () => {
  try {
    await ready;
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile), 'Chrome start');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', event => {
      const r = JSON.parse(event.data);
      if (r.method === 'Runtime.exceptionThrown') exceptions.push(r.params.exceptionDetails);
      if ((privateBackup || backfillMode) && r.method === 'Page.javascriptDialogOpening') {
        call('Page.handleJavaScriptDialog', { accept: r.params.type === 'confirm' }).catch(() => exceptions.push('dialog failed'));
      }
      if (r.method === 'Fetch.requestPaused') {
        // Mock all local API calls, so the Vite proxy cannot forward to a real provider.
        const url = new URL(r.params.request.url);
        if(backfillMode && url.origin===origin && url.pathname==='/api/price' && url.searchParams.get('range')==='3mo'){
          const timestamp=['2026-08-03','2026-08-04','2026-09-01','2026-09-02'].map(d=>Date.parse(d+'T00:00:00Z')/1000);
          const data={chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp,indicators:{quote:[{close:[100,110,120,130]}]}}]}};
          call('Fetch.fulfillRequest',{requestId:r.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(data)).toString('base64')}).catch(()=>exceptions.push('backfill mock failed'));return;
        }
        if (privateBackup) {
          const local = url.origin === origin && (!url.pathname.startsWith('/api/')||(updatePrivateIrp&&url.pathname==='/api/price'));
          call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: r.params.requestId } : { requestId: r.params.requestId, errorReason: 'BlockedByClient' }).catch(() => exceptions.push('network guard failed'));
          return;
        }
        const good = url.pathname === '/api/price' && url.searchParams.get('ticker') === 'SYNTHETIC_OK';
        call('Fetch.fulfillRequest', { requestId: r.params.requestId, responseCode: good ? 200 : 503,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(good ? { chart: { result: [{ meta: { regularMarketPrice: 80_000 } }] } } : { error: 'synthetic failure' })).toString('base64'),
        }).catch(error => exceptions.push(String(error)));
      }
      if (pending.has(r.id)) {
        const p = pending.get(r.id); clearTimeout(p.timer); pending.delete(r.id);
        r.error ? p.reject(new Error(JSON.stringify(r.error))) : p.resolve(r.result);
      }
    });
    await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable');
    // Stable synthetic financial dates, including when the test crosses midnight. Node/CDP timeouts stay real.
    if(!updatePrivateIrp&&!process.argv.includes('--register-pension'))await call('Page.addScriptToEvaluateOnNewDocument',{source:`{const NativeDate=window.Date;const fixed=NativeDate.parse('2026-09-14T03:00:00Z');window.Date=new Proxy(NativeDate,{construct:(target,args)=>Reflect.construct(target,args.length?args:[fixed]),apply:()=>new NativeDate(fixed).toString(),get:(target,key)=>key==='now'?()=>fixed:Reflect.get(target,key)});}`});
    await call('Network.setBlockedURLs', { urls: ['https://*', 'http://*.google.com/*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: privateBackup ? '*' : origin + '/api/*' }] });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    if (privateBackup) {
      // The user-supplied file never enters source fixtures, screenshots or result logs.
      await navigate('/settings', '설정');
      assert.equal(await dbEval('return await m.db.assets.count()'), 0);
      const original = fs.readFileSync(privateBackup);
      const input = JSON.parse(original.toString('utf8').replace(/^\uFEFF/, ''));
      const dom = await call('DOM.getDocument');
      const field = await call('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
      assert(field.nodeId, 'Import input missing');
      await call('DOM.setFileInputFiles', { nodeId: field.nodeId, files: [privateBackup] });
      await until(async () => evaluate("document.body.innerText.includes('가져오기 완료')"), 'backup import UI');
      const restored = await dbEval('return await m.exportBackup()');
      for (const [name, rows] of Object.entries(input.tables)) assert.deepEqual(restored.tables[name], rows);
      if(process.argv.includes('--register-pension')){
        await require('./check-pension-registration.cjs')({navigate,evaluate,dbEval,call,until,privateBackup,exceptions});
        assert(fs.readFileSync(privateBackup).equals(original),'Original backup must remain unchanged');
        return;
      }
      if(updatePrivateIrp){
        await require('./update-private-irp.cjs')({navigate,evaluate,dbEval,call,privateBackup,exceptions});
        assert(fs.readFileSync(privateBackup).equals(original),'Original backup must remain unchanged');
        console.log('PRIVATE_IRP_UPDATE=PASS; original file unchanged; output is a new backup, not the user browser');
        return;
      }
      if(existingAnalysisMode)await require('./check-existing-analysis.cjs')({navigate,evaluate,dbEval,call,until,snapshot,privateBackup});
      if(backfillMode)await require('./check-backfill-ui.cjs')({navigate,evaluate,dbEval,call,until});
      if(!backfillMode&&!existingAnalysisMode){
      if(process.argv.includes('--review')) await require('./review-imported-ui.cjs')({navigate,evaluate,dbEval,call});
      await require('./check-simple-ux.cjs')({navigate,evaluate,dbEval,call,until,snapshot,privateBackup});
      for (const [route, label] of [['/', '내 자산과 은퇴 준비'], ['/assets?type=ALL', '현재 자산 전체'], ['/assets?type=STOCK', '시세 업데이트'], ['/plan', '은퇴계획, 여기서 시작하세요'], ['/settings', '설정']]) await navigate(route, label);
      }
      const reloaded = await dbEval('return await m.exportBackup()');
      for (const [name, rows] of Object.entries(input.tables)) assert.deepEqual(reloaded.tables[name], rows);
      assert.equal(exceptions.length, 0, 'Browser exceptions (redacted)');
      assert(fs.readFileSync(privateBackup).equals(original), 'Original file changed');
      console.log('PRIVATE_BACKUP_UI=PASS; original tables preserved; reload passed; original file unchanged; no screenshots');
      return;
    }
    if(process.argv.includes('--income-tax')){await navigate('/analysis','내 은퇴 분석');await require('./check-income-tax.cjs')({navigate,evaluate,dbEval,call,until,snapshot});assert.equal(exceptions.length,0);return;}
    if(process.argv.includes('--irp-interview')){await navigate('/','내 자산과 은퇴 준비');await require('./check-irp-interview-ui.cjs')({navigate,evaluate,call,until,snapshot});assert.equal(exceptions.length,0);return;}
    if(process.argv.includes('--financial-tax')){await navigate('/analysis','내 은퇴 분석');await require('./check-financial-tax.cjs')({navigate,evaluate,dbEval,call,until,snapshot});assert.equal(exceptions.length,0);return;}
    if(process.argv.includes('--linkage')){await navigate('/analysis','내 은퇴 분석');await require('./check-input-linkage.cjs')({navigate,evaluate,dbEval,call,until,snapshot});assert.equal(exceptions.length,0);return;}
    if(existingAnalysisMode){await require('./check-existing-analysis.cjs')({navigate,evaluate,dbEval,call,until,snapshot,privateBackup});assert.equal(exceptions.length,0);return;}
    if(backfillMode){
      await navigate('/','내 자산과 은퇴 준비');
      await dbEval("const id=await m.createAsset({type:'STOCK',name:'SYNTHETIC_BACKFILL',acquisitionDate:'2026-07-01',quantity:10,acquisitionPrice:90,detail:{ticker:'SYNTHETIC_OK',currency:'KRW',accountName:'SYNTHETIC_ACCOUNT',isPensionLike:false}});await m.db.assetHistory.add({assetId:id,date:'2026-08-04',price:95,quantity:20,value:1900});");
      await require('./check-backfill-ui.cjs')({navigate,evaluate,dbEval,call,until});
      assert.equal(exceptions.length,0);return;
    }
    if(production){
      await navigate('/','내 자산과 은퇴 준비');
      const fixture=JSON.parse(fs.readFileSync(path.join(output,'synthetic-fixture.json'),'utf8'));
      assert(fixture.tables.assets.length>0&&fixture.tables.assets.every(a=>a.name.startsWith('SYNTHETIC_')),'Only synthetic fixtures are allowed');
      await evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('asset_manager_m');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tables=${JSON.stringify(fixture.tables)};const tx=db.transaction(Object.keys(tables),'readwrite');for(const [name,rows] of Object.entries(tables))for(const row of rows)tx.objectStore(name).put(row);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error)}})`);
      const run=fixture.tables.plannerPlans[0].activeRunId;
      for(const [route,label] of [['/','내 자산과 은퇴 준비'],['/assets?type=ALL','현재 자산 전체'],['/assets?type=STOCK','시세 업데이트'],['/plan','은퇴계획, 여기서 시작하세요'],['/analysis?run='+run,'은퇴·현금흐름 분석'],['/legacy-analysis?tab=year','연도'],['/settings','설정']])await navigate(route,label);
      await navigate('/analysis?run='+run,'은퇴·현금흐름 분석');
      await snapshot('production-analysis');
      assert.equal(exceptions.length,0,JSON.stringify(exceptions));
      fs.writeFileSync(path.join(output,'production-result.json'),JSON.stringify({result:'PASS',renderedRoutes:rendered,browserExceptions:0,profile,limits:'Local production build only; service-worker upgrade between real installed versions and live providers not exercised'},null,2));
      console.log('PRODUCTION_SMOKE=PASS');return;
    }
    await navigate('/', '자산');
    assert.equal(await dbEval("return await m.db.assets.count()"), 0);
    assert.equal(await dbEval("return await m.db.settings.count()"), 0);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('재건축 일정 확인')"), false);
    checks.push('Fresh real database stays empty; no fictional household/assets or rebuild panel');
    const fixture = await dbEval(`
      const ids = [];
      for (const ticker of ['SYNTHETIC_OK', 'SYNTHETIC_FAIL']) ids.push(await m.createAsset({
        type: 'STOCK', name: ticker, acquisitionDate: '2026-09-01', acquisitionPrice: 70_000, quantity: 10,
        detail: { ticker, accountName: 'SYNTHETIC_ACCOUNT', currency: 'KRW', isPensionLike: false }
      }));
      await m.addDividend(ids[0], { date: '2026-09-02', amountKrw: 1000, amountOriginal: 1000, currency: 'KRW', exchangeRate: 1, memo: 'synthetic' });
      return { ids, dividend: await m.getDividends(ids[0]) };
    `);
    await navigate('/assets?type=STOCK', '시세 업데이트');
    assert.deepEqual(await dbEval('return await m.getRetirement()'), {});
    await clickText('시세 업데이트');
    await until(async () => await dbEval(`return (await m.getAssetById(${JSON.stringify(fixture.ids[0])})).currentValue === 800000`), 'quote update');
    const after = await dbEval(`return { good: await m.getAssetById(${JSON.stringify(fixture.ids[0])}), bad: await m.getAssetById(${JSON.stringify(fixture.ids[1])}), dividend: await m.getDividends(${JSON.stringify(fixture.ids[0])}), plan: await m.getRetirement() }`);
    assert.equal(after.good.quantity, 10); assert.equal(after.good.acquisitionPrice, 70_000);
    assert.equal(after.bad.currentValue, 700_000); assert.deepEqual(after.dividend, fixture.dividend);
    assert.deepEqual(after.plan, {});
    checks.push('Asset management without retirement inputs; mocked quote success/failure; quantity/cost/dividends preserved');
    await snapshot('01-stock-desktop');

    await dbEval(`await m.saveRetirement({ holdingTaxAuto: false, holdingTaxAnnual: 1200000, holdingTaxStartYear: 2030, expenses: [{ id: 'food', name: 'SYNTHETIC_FOOD', amount: 600000 }] }); return true`);
    await navigate('/legacy-analysis?tab=prep', '은퇴 준비');
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('생활비 / 여행 / 의료비'))?.click()");
    await until(async () => await evaluate("[...document.querySelectorAll('input')].some(i => i.value === 'SYNTHETIC_FOOD')"), 'saved expense input');
    assert(await evaluate(`(() => { const input = [...document.querySelectorAll('input')].find(i => i.value === 'SYNTHETIC_FOOD'); if (!input) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'SYNTHETIC_EDITED'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`));
    await until(async () => await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '저장' && !b.disabled)"), 'dirty form');
    await clickText('저장');
    await until(async () => await dbEval("return (await m.getRetirement()).expenses[0].name === 'SYNTHETIC_EDITED'"), 'plan saved');
    const saved = await dbEval('return await m.getRetirement()');
    assert.equal(saved.holdingTaxAuto, false); assert.equal(saved.holdingTaxAnnual, 1200000); assert.equal(saved.holdingTaxStartYear, 2030);
    await navigate('/legacy-analysis?tab=prep', '은퇴 준비');
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('생활비 / 여행 / 의료비'))?.click()");
    await until(async () => await evaluate("[...document.querySelectorAll('input')].some(i => i.value === 'SYNTHETIC_EDITED')"), 'reloaded expense input');
    assert(await evaluate("[...document.querySelectorAll('input')].some(i => i.value === 'SYNTHETIC_EDITED')"));
    checks.push('Real form edit/save/reload preserves manual holding tax');
    await snapshot('02-prep-desktop');


    const plannerFixture=await dbEval(`
      const model=await import('/src/planner/model.ts'), store=await import('/src/planner/storage.ts');
      const cash=await m.createAsset({type:'SAVINGS',name:'SYNTHETIC_CASH',acquisitionDate:'2026-09-01',acquisitionPrice:30000000,detail:{isPensionLike:false}});
      const property=await m.createAsset({type:'REAL_ESTATE',name:'SYNTHETIC_REBUILD',acquisitionDate:'2020-01-01',acquisitionPrice:500000000,detail:{isOwned:true,hasTenant:false,address:'synthetic',loanAmount:0,tenantDeposit:0}});
      const plan={...model.blankPlan('2026-09-14'),endDate:'2028-12-31',inflation:2,reviewedLegacy:true,coverage:{assets:'provided',income:'provided',expenses:'provided',taxes:'provided',insurance:'confirmedNone'}};
      plan.policies=(await m.getAllAssets()).map(a=>model.policySchema.parse({...model.defaultPolicy(a),confirmed:true,annualGrowth:0,dividendYield:0,dividendWithholding:0,propertyState:a.id===property?'construction':'home'}));
      plan.events=[
        model.eventSchema.parse({id:'complete',name:'SYNTHETIC_COMPLETION',kind:'completion',assetId:property,at:model.fixedDate('2027-10-31')}),
        model.eventSchema.parse({id:'approval',name:'SYNTHETIC_APPROVAL',kind:'approval',assetId:property,at:{...model.fixedDate(''),anchorId:'complete',offsetMonths:1}}),
        model.eventSchema.parse({id:'cost',name:'SYNTHETIC_CONTRIBUTION',kind:'expense',amount:5000000,assetId:property,at:model.fixedDate('2027-06-30')})
      ];
      plan.flows=[
        model.flowSchema.parse({id:'pre-tax',name:'SYNTHETIC_PRE_TAX',kind:'tax',amount:0,frequency:'annual',paymentMonth:9,assetId:property,start:model.fixedDate('2026-09-15'),end:{...model.fixedDate(''),anchorId:'approval',offsetDays:-1},scope:'property-tax',basis:'synthetic confirmed zero before approval',confirmed:true}),
        model.flowSchema.parse({id:'living',name:'SYNTHETIC_LIVING',kind:'expense',amount:600000,frequency:'monthly',start:model.fixedDate('2026-09-15'),confirmed:true}),
        model.flowSchema.parse({id:'rent',name:'SYNTHETIC_RENT',kind:'rent',amount:1000000,frequency:'monthly',assetId:property,start:{...model.fixedDate(''),anchorId:'approval',offsetMonths:1},withholding:0,confirmed:true}),
        model.flowSchema.parse({id:'tax',name:'SYNTHETIC_TAX',kind:'tax',amount:1000000,frequency:'annual',assetId:property,start:{...model.fixedDate(''),anchorId:'approval',offsetMonths:0},scope:'property-tax',basis:'synthetic manual estimate',confirmed:true})
      ];
      plan.scenarios=[model.scenarioSchema.parse({id:'delay',name:'준공 1년 지연',eventShifts:{complete:12}})];
      await store.savePlan(plan,0);
      const base=await store.calculateAndSave((await import('/src/planner/engine.ts')).baseScenario);
      const delay=await store.calculateAndSave(plan.scenarios[0]);
      return {base:base.id,delay:delay.id,property,cash};
    `);
    await navigate('/analysis?run='+plannerFixture.base,'입력 확인 완료');
    assert(await evaluate("document.querySelector('main').innerText.includes('SYNTHETIC_APPROVAL')"));
    await evaluate("[...document.querySelectorAll('select')].find(s=>s.closest('label')?.innerText.includes('연도')).value='2027'");
    await call('Page.navigate',{url:origin+'/analysis?run='+plannerFixture.base+'&year=2027&month=2027-12'});
    await until(()=>evaluate("document.querySelector('main')?.innerText.includes('2027-12 입출금 원장')"),'month drilldown');
    await evaluate("[...document.querySelectorAll('.ledger-entry summary')].find(e=>e.innerText.includes('SYNTHETIC_RENT'))?.click()");
    assert(await evaluate("document.querySelector('main').innerText.includes('현재 원천 입력 열기')"));
    await snapshot('03-analysis-desktop');
    await evaluate("document.getElementById('monthly-ledger').scrollIntoView({block:'start'})");
    await snapshot('04-analysis-ledger-desktop');
    await navigate('/analysis?run='+plannerFixture.delay,'동일 출발점의 기본안과 비교');
    const immutable=await dbEval(`return await m.db.table('plannerRuns').get('${plannerFixture.base}')`);
    assert.equal(immutable.run.status,'complete');
    const delayed=await dbEval(`return await m.db.table('plannerRuns').get('${plannerFixture.delay}')`);
    assert.equal(delayed.run.resolvedEvents.find(e=>e.id==='complete').date,'2028-10-31');
    assert.equal(delayed.run.resolvedEvents.find(e=>e.id==='cost').date,'2027-06-30');
    await navigate('/plan?tab=household','계획 범위');
    await evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('계획 범위')).click()");
    assert(await evaluate(`(()=>{const input=[...document.querySelectorAll('label')].find(l=>l.innerText.includes('물가 상승률'))?.querySelector('input');if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2.5');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`));
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('저장 · 변경 있음'))"),'plan dirty');
    await clickText('저장 · 변경 있음');
    await until(()=>dbEval("return (await m.db.table('plannerPlans').get('main')).plan.inflation===2.5"),'new plan saved');
    await navigate('/plan?tab=household','계획 범위');
    await evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('계획 범위')).click()");
    assert(await evaluate("[...document.querySelectorAll('label')].find(l=>l.innerText.includes('물가 상승률'))?.querySelector('input')?.value==='2.5'"));
    await navigate('/analysis?run='+plannerFixture.base,'현재 입력과 다른 과거 결과');
    assert.deepEqual(await dbEval(`return await m.db.table('plannerRuns').get('${plannerFixture.base}')`),immutable);
    const backupCheck=await dbEval(`const before=await m.exportBackup();const bad=structuredClone(before);delete bad.tables.assets;let rejected=false;try{await m.importBackup(bad)}catch{rejected=true}const after=await m.exportBackup();return {rejected,equal:JSON.stringify(before.tables)===JSON.stringify(after.tables)}`);
    assert.deepEqual(backupCheck,{rejected:true,equal:true});
    checks.push('New plan form save/reload; immutable snapshot; actual month drilldown; linked delay vs fixed cost; same-snapshot comparison; corrupt backup rejected atomically');

    await require('./check-simple-ux.cjs')({navigate,evaluate,dbEval,call,until,snapshot,privateBackup});
    const routes = [['/assets?type=ALL', '총 자산'], ['/assets?type=REAL_ESTATE', '부동산'], ['/assets?type=PENSION', '연금'],
      ['/assets?type=SAVINGS', '예'], ['/assets?type=PHYSICAL', '실물'], ['/assets?type=ETC', '기타'],
      ['/legacy-analysis?tab=year', '연도'], ['/legacy-analysis?tab=pension-sim', '연금'], ['/legacy-analysis?tab=corp-sim', '법인'],
      ['/legacy-analysis?tab=cashflow', '현금흐름'], ['/settings', '설정'], ['/plan?tab=policies','자산 연결'], ['/plan?tab=flows','반복 입출금'], ['/plan?tab=events','날짜별 사건'], ['/plan?tab=debts','대출·받은 보증금'], ['/plan?tab=scenarios','대안 가정']];
    for (const [route, label] of routes) await navigate(route, label);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const mobile = [];
    for (const [name, route, label] of [['home','/','자산'], ['stocks','/assets?type=STOCK','시세 업데이트'], ['plan','/plan?tab=events','날짜별 사건'], ['analysis','/analysis?run='+plannerFixture.base+'&year=2027&month=2027-12','입출금 원장'], ['settings','/settings','설정']]) {
      await navigate(route, label);
      mobile.push({ page: name, horizontalOverflow: await evaluate('document.documentElement.scrollWidth > innerWidth + 1') });
      await snapshot('mobile-' + name);
    }
    assert(mobile.every(page=>!page.horizontalOverflow),JSON.stringify(mobile));
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    const result = { result: 'PASS', checks, renderedRoutes: rendered, mobile, browserExceptions: exceptions.length,
      limits: 'Synthetic fresh profile only; live quote/Google authorization and full AM acceptance not tested.', profile, output };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    const fixtureBackup=await dbEval('return await m.exportBackup()');
    assert(fixtureBackup.tables.assets.every(a=>a.name.startsWith('SYNTHETIC_')));
    fs.writeFileSync(path.join(output,'synthetic-fixture.json'),JSON.stringify(fixtureBackup));
    const published=path.resolve(__dirname,'../docs/redesign/screenshots/actual');
    fs.mkdirSync(published,{recursive:true});
    for(const name of ['01-stock-desktop','03-analysis-desktop','04-analysis-ledger-desktop','mobile-home','mobile-stocks','mobile-plan','mobile-analysis','mobile-settings','simple-home-1440','simple-home-390','simple-plan-1440','simple-plan-390'])fs.copyFileSync(path.join(output,name+'.png'),path.join(published,name+'.png'));
    console.log(JSON.stringify(result));
  } finally {
    if (privateBackup && ws) {
      try { await call('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }); } catch {}
    }
    if (ws) { try { await call('Browser.close'); } catch {} ws.close(); }
    if (!chrome.killed) chrome.kill();
    if(server)server.close();
    if (privateBackup) {
      // Only this generated temporary profile; never a user's real Chrome profile.
      assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
      assert(path.basename(profile).startsWith('myasset-local-check-'));
      await delay(1000);
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 500 }); }
      catch(error){
        // Windows Chrome can leave read-only files which Node rm cannot remove.
        // Stay in native PowerShell for validation and removal of this exact generated temp path.
        const cleanup=process.platform==='win32'?spawnSync('powershell.exe',['-NoProfile','-Command',"$ErrorActionPreference='Stop'; $taskProfile=[IO.Path]::GetFullPath($env:MYASSET_TEST_PROFILE); $taskTemp=[IO.Path]::GetTempPath().TrimEnd('\\'); if((Split-Path -Parent $taskProfile) -ne $taskTemp -or !(Split-Path -Leaf $taskProfile).StartsWith('myasset-local-check-')){throw 'Unexpected cleanup target'}; if(Test-Path -LiteralPath $taskProfile){Remove-Item -LiteralPath $taskProfile -Recurse -Force}"],{windowsHide:true,env:{...process.env,MYASSET_TEST_PROFILE:profile},timeout:60000,stdio:'ignore'}):null;
        if(!cleanup||cleanup.status!==0||fs.existsSync(profile)){console.error('PRIVATE_CLEANUP_FAILED '+profile+' '+error.code);throw error;}
      }
      console.log('PRIVATE_TEST_PROFILE_REMOVED');
    }
  }
})().catch(error => { console.error(privateBackup ? 'PRIVATE_BACKUP_UI=FAIL (details redacted; code='+String(error.code??'CHECK')+')' : error); process.exitCode = 1; });
