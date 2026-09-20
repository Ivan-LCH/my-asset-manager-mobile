// 설치된 Chrome과 Node 내장 기능만 사용해 독립 시제품을 확인하고 화면을 캡처한다.
// 실제 앱 데이터와 기존 브라우저 프로필은 사용하지 않는다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const delay = ms => new Promise(r => setTimeout(r, ms));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-ui-check-'));
const out = path.join(__dirname, 'screenshots');
fs.mkdirSync(out, { recursive: true });
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let spawnError;
child.on('error', e => { spawnError = e; });
let ws, seq = 0;
const pending = new Map(), browserErrors = [];
async function until(fn, label) {
  for (let i = 0; i < 300; i++) { if (spawnError) throw spawnError; if (await fn()) return; await delay(100); }
  throw new Error('Timed out: ' + label);
}
function call(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function page(route, heading) {
  await evaluate('location.hash=' + JSON.stringify('#/' + route));
  await until(async () => await evaluate('document.querySelector("#page h1")?.textContent') === heading, route);
  // 같은 제목의 분석/계획 서브탭은 hashchange 완료 후 내용을 캡처한다.
  await delay(150);
}
async function capture(name) {
  await evaluate('document.getElementById("toast").hidden=true');
  const layout = await call('Page.getLayoutMetrics');
  const size = layout.cssContentSize;
  const viewportOnly = name.includes('mobile') || name === '14-month-detail';
  const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !viewportOnly, clip: { x: 0, y: 0, width: viewportOnly ? viewport.width : size.width, height: viewportOnly ? viewport.height : size.height, scale: 1 } });
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
}
(async () => {
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile), 'Chrome debugging endpoint');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', event => {
      const r = JSON.parse(event.data);
      if (r.method === 'Runtime.exceptionThrown') browserErrors.push(r.params.exceptionDetails);
      if (pending.has(r.id)) { const p = pending.get(r.id); clearTimeout(p.timer); pending.delete(r.id); r.error ? p.reject(new Error(JSON.stringify(r.error))) : p.resolve(r.result); }
    });
    await call('Page.enable'); await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'full-app.html')).href });
    await until(async () => await evaluate('Boolean(document.querySelector("#page h1"))'), 'initial render');
    const routes = [
      ['guide', '전체 화면을 먼저 둘러보세요', '01-guide'],
      ['home', '내일을 준비하는 오늘', '02-home'],
      ['assets', '내 자산', '03-assets'],
      ['asset/home', '우리 집', '04-asset-detail'],
      ['plan', '나의 계획', '05-plan'],
      ['plan?tab=events', '나의 계획', '06-events'],
      ['analysis', '계획을 숫자로 확인하기', '07-analysis'],
      ['analysis?tab=period', '계획을 숫자로 확인하기', '08-cashflow'],
      ['analysis?tab=compare', '계획을 숫자로 확인하기', '09-comparison'],
      ['pension', '연금 수령 설계', '10-pension'],
      ['corp', '법인 활용 비교', '11-corp'],
      ['settings', '설정 · 데이터 관리', '12-settings'],
      ['stocks', '주식 관리', '17-stocks'],
      ['stocks?asset=stock', '글로벌 ETF 계좌', '18-stock-account'],
      ['stocks?asset=stock&position=demo-a', '국내 지수 ETF · 가상', '19-stock-holding'],
      ['stocks?asset=stock&position=demo-a&tab=history', '국내 지수 ETF · 가상', '20-stock-history'],
      ['stocks?asset=stock&position=demo-a&tab=dividend', '국내 지수 ETF · 가상', '21-stock-dividend'],
    ];
    for (const [route, heading, name] of routes) { await page(route, heading); await capture(name); }
    // 은퇴계획 없이 현재 자산 관리, 실제 버튼의 가상 가격 갱신과 원천 경계.
    await evaluate('state=sample("tracking");render()');
    await page('home','내일을 준비하는 오늘'); await capture('22-tracking-home');
    assert(await evaluate('document.querySelector("#page").textContent.includes("현재 평가 자산")'));
    assert.equal(await evaluate('simulate().months.length'),0);
    for(const tab of ['overview','assumptions']){
      await page('plan?tab='+tab,'나의 계획');
      assert(await evaluate('document.querySelector("#page").textContent.includes("계획은 아직 입력하지 않았습니다")'));
    }
    await page('plan?tab=events','나의 계획');
    assert.equal(await evaluate('eventsFor().some(e=>e.kind==="retirement")'),false);
    await page('settings','설정 · 데이터 관리');
    assert(await evaluate('document.querySelector("#page").textContent.includes("미입력")'));
    assert(await evaluate('Boolean(document.querySelector("#page [data-action=household-edit]"))'));
    await page('assets','내 자산');
    await evaluate('document.querySelector("[data-filter=STOCK]").click()');
    await until(async()=>await evaluate('document.querySelector("#page h1").textContent')==='주식 관리','stock filter navigation');
    await evaluate('Array.from(document.querySelectorAll("#page a")).find(a=>a.getAttribute("href")==="#/assets").click()');
    await until(async()=>await evaluate('document.querySelector("#page h1").textContent')==='내 자산','all assets return');
    assert.equal(await evaluate('assetFilter'),'all');
    await page('stocks','주식 관리');
    const unchanged = await evaluate('JSON.stringify({cash:totals().cash,positions:state.assets.find(a=>a.id==="stock").positions.map(p=>({quantity:p.quantity,average:p.average,dividends:p.dividends}))})');
    await evaluate('document.querySelector("[data-action=quote-partial]").click()');
    assert.equal(await evaluate('state.assets.find(a=>a.id==="stock").value'),15030);
    await evaluate('document.querySelector("[data-action=quote-demo]").click()');
    assert.equal(await evaluate('state.assets.find(a=>a.id==="stock").value'),15060);
    assert.equal(await evaluate('JSON.stringify({cash:totals().cash,positions:state.assets.find(a=>a.id==="stock").positions.map(p=>({quantity:p.quantity,average:p.average,dividends:p.dividends}))})'),unchanged);
    await page('stocks?asset=stock&position=demo-a','국내 지수 ETF · 가상');
    await evaluate('document.querySelector("[data-action=position-edit]").click();document.querySelector("#positionForm [name=quantity]").value=1600;document.getElementById("positionForm").requestSubmit()');
    assert.equal(await evaluate('document.getElementById("modal").open'),false);
    assert.equal(await evaluate('state.assets.find(a=>a.id==="stock").value'),15662);
    assert.equal(await evaluate('state.assets.find(a=>a.id==="stock").positions[0].history[0].quantity'),1500);
    await evaluate('state=sample("empty");render();householdEditor();document.querySelector("#householdForm [name=spouse]").value="yes";document.getElementById("householdForm").requestSubmit();assetEditor(null,"STOCK")');
    await evaluate('document.querySelector("#assetForm [name=name]").value="배우자 계좌 확인";document.querySelector("#assetForm [name=owner]").value="배우자";document.getElementById("assetForm").requestSubmit()');
    assert.equal(await evaluate('document.getElementById("modal").open'),false);
    assert.equal(await evaluate('state.assets[0].owner'),'배우자');
    assert.equal(await evaluate('state.complete'),false);
    await evaluate('state=sample("rebuild");scenario="delay";analysisYear=2033;render();assetFlows("home")');
    assert(await evaluate('document.getElementById("modalTitle").textContent.includes("준공 1년 지연")'));
    assert.equal(await evaluate('document.getElementById("modalBody").textContent.includes("임대료")'),false);
    await evaluate('scenario="base";analysisYear=2032;document.getElementById("modal").close()');
    await evaluate('state=sample();render()');
    // 실제 DOM에서 입력하고 submit: 계획 수정이 공통 분석에 전파되는지 확인.
    const before = await evaluate('simulate().years[0].regular');
    await evaluate('planEditor(); document.querySelector("#planForm [name=living]").value=300; document.getElementById("planForm").requestSubmit()');
    const after = await evaluate('simulate().years[0].regular');
    assert(Math.abs((after - before) - (-240)) < .001);
    assert.equal(await evaluate('document.getElementById("modal").open'), false);
    // 부동산의 날짜를 변경하면 임대·분담금 사건도 이동한다.
    await evaluate('state=sample("rebuild"); render(); assetEditor("home")');
    await evaluate('document.querySelector("#assetForm [name=completion]").value="2034-09"; document.getElementById("assetForm").requestSubmit()');
    assert.equal(await evaluate('eventsFor().find(e=>e.id==="rent-home").date'), '2034-10');
    await page('asset/home', '재건축 A주택'); await capture('13-rebuild');
    // 유형 없는 사용자에서 재건축 전용 제안이 사라지는지 실제 페이지 확인.
    await evaluate('state=sample("financial"); scenario="base"; render()');
    await page('analysis', '계획을 숫자로 확인하기');
    assert.equal(await evaluate('Boolean(document.querySelector("[data-mode=delay]"))'), false);
    // 월 상세 드릴다운과 원천 링크.
    await evaluate('yearDetail(2032)');
    await evaluate('document.querySelector("[data-action=month-detail]").click()');
    assert.equal(await evaluate('document.getElementById("modalTitle").textContent'), '2032.01 · 현금의 실제 구성');
    assert(await evaluate('document.querySelectorAll("#modalBody a[href*=asset]").length') > 0);
    await capture('14-month-detail'); await evaluate('document.getElementById("modal").close()');
    // 모든 자산 유형의 추가 폼과 외부 목돈 이벤트를 실제 submit으로 확인.
    const assetCount = await evaluate('state.assets.length');
    for (const type of ['SAVINGS', 'STOCK', 'PENSION', 'REAL_ESTATE', 'PHYSICAL', 'ETC']) {
      await evaluate('assetEditor(null,' + JSON.stringify(type) + ')');
      await evaluate('document.querySelector("#assetForm [name=name]").value=' + JSON.stringify('추가 예시 ' + type) + '; document.querySelector("#assetForm [name=value]").value=100; document.getElementById("assetForm").requestSubmit()');
      assert.equal(await evaluate('document.getElementById("modal").open'), false, 'Asset submit: ' + type);
    }
    assert.equal(await evaluate('state.assets.length'), assetCount + 6);
    const eventBefore = await evaluate('simulate().years.find(y=>y.year===2033).eventNet');
    await evaluate('eventEditor(); document.querySelector("#eventForm [name=name]").value="일회성 지출 확인"; document.querySelector("#eventForm [name=date]").value="2033-02"; document.querySelector("#eventForm [name=amount]").value=100; document.getElementById("eventForm").requestSubmit()');
    assert.equal(await evaluate('simulate().years.find(y=>y.year===2033).eventNet'), eventBefore - 100);
    await page('corp', '법인 활용 비교');
    await evaluate('document.getElementById("corpForm").requestSubmit()');
    assert(await evaluate('document.getElementById("corpResult").textContent.includes("540만원")'));
    // 모바일 가로 넘침·레이아웃과 편집 폼.
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('state=sample(); scenario="base"; render()');
    for (const [route, heading, name] of [routes[1], routes[2], routes[4], routes[6], routes[11]]) {
      await page(route, heading);
      assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Horizontal overflow: ' + route);
      await capture(name + '-mobile');
    }
    for (const [route, heading, name] of routes.slice(12)) {
      await page(route,heading);
      assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),'Stock mobile overflow: '+route);
      await capture(name+'-mobile');
    }
    await evaluate('assetEditor(null,"PENSION")'); await capture('15-asset-form-mobile');
    await evaluate('document.getElementById("modal").close(); state=sample("empty"); render()');
    await page('home', '내일을 준비하는 오늘'); await capture('16-empty-mobile');
    assert.equal(await evaluate('document.querySelectorAll(".metricvalue").length'), 0);
    assert.equal(browserErrors.length, 0, 'Browser exception(s): ' + JSON.stringify(browserErrors));
    console.log(JSON.stringify({ result: 'PASS', desktopRoutes: routes.length, mobilePages: 10, screenshots: fs.readdirSync(out).filter(f => f.endsWith('.png')).length, browserErrors: browserErrors.length, checks: ['plan edit propagates', 'completion anchors shift', 'non-property conditional UI', 'year-month-source drilldown', 'six asset add forms', 'one-time event', 'corp structure preview', 'mobile overflow', 'empty state','asset-only tracking','quote partial/success','quote cash/cost/receipt boundary','position edit with history preserved','unknown plan tabs','stock filter round trip','household without retirement','scenario asset drilldown'] }));
  } finally {
    if (ws) { try { await call('Browser.close'); } catch {} ws.close(); }
    if (!child.killed) child.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
