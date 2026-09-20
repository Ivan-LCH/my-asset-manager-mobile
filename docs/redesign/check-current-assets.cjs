// 독립 시제품의 계산 경계/렌더 검사. 제품 엔진이나 외부 시세 검증이 아니다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ URLSearchParams, URL, structuredClone });
for (const name of ['current-assets.js', 'full-app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), context, { filename: name });
}
const run = source => vm.runInContext(source, context);
run('changed=()=>{state.revision++};toast=()=>{};');
run('state=sample("tracking")');
assert.equal(run('state.complete'), false);
assert(run('currentHome().includes("현재 평가 자산")'));
assert.equal(run('simulate().months.length'), 0);
assert.equal(run('eventsFor().some(e=>e.kind==="retirement")'),false);
assert(run('settingsPage().includes("미입력")'));
assert(run('settingsPage().includes("household-edit")'));
for(const tab of ['overview','assumptions'])assert(run('planPage(new URLSearchParams('+JSON.stringify('tab=')+'+'+JSON.stringify(tab)+')).includes("계획은 아직 입력하지 않았습니다")'));
run('assetFilter="STOCK";assetsPage(new URLSearchParams())');
assert.equal(run('assetFilter'),'all');
const cash = run('totals().cash');
const principal = run('state.assets.find(a=>a.id==="stock").positions.map(p=>p.average*p.quantity).join()');
const receipts = run('JSON.stringify(state.assets.find(a=>a.id==="stock").positions.map(p=>p.dividends))');
run('demoQuote(true)');
assert.equal(run('state.assets.find(a=>a.id==="stock").value'), 15030);
assert.equal(run('state.assets.find(a=>a.id==="stock").positions[1].price'), 200000);
assert(run('state.assets.find(a=>a.id==="stock").positions[1].status.includes("실패")'));
run('demoQuote(false)');
assert.equal(run('state.assets.find(a=>a.id==="stock").value'), 15060);
const history = run('JSON.stringify(state.assets.find(a=>a.id==="stock").positions.map(p=>p.history))');
run('demoQuote(false)');
assert.equal(run('JSON.stringify(state.assets.find(a=>a.id==="stock").positions.map(p=>p.history))'), history);
assert.equal(run('totals().cash'), cash);
assert.equal(run('state.assets.find(a=>a.id==="stock").positions.map(p=>p.average*p.quantity).join()'), principal);
assert.equal(run('JSON.stringify(state.assets.find(a=>a.id==="stock").positions.map(p=>p.dividends))'), receipts);
run('state=sample();');
const current = run('JSON.stringify(state.assets)');
run('simulate(state,"expense");simulate(state,"delay")');
assert.equal(run('JSON.stringify(state.assets)'), current);
let rendered = 0, ledgerRows = 0;
run('state=sample("empty");saveHousehold(new URLSearchParams("spouse=yes"))');
assert.equal(run('state.complete'),false);
assert.equal(run('state.household.spouse'),true);
run('state=sample("rebuild");scenario="delay";analysisYear=2033;openModal=(title,body)=>{globalThis.modalTitle=title;globalThis.modalBody=body};assetFlows("home")');
assert(run('modalTitle.includes("준공 1년 지연")'));
assert.equal(run('modalBody.includes("임대료")'),false);
run('scenario="base";analysisYear=2032');
for (const profile of ['family','tracking','financial','rental','rebuild','single','empty']) {
  run('state=sample(' + JSON.stringify(profile) + ')');
  for (const expression of ['currentHome()','assetsPage(new URLSearchParams())','stocksPage(new URLSearchParams())','stocksPage(new URLSearchParams("asset=stock"))','stocksPage(new URLSearchParams("asset=stock&position=demo-a&tab=history"))','stocksPage(new URLSearchParams("asset=stock&position=demo-a&tab=dividend"))','analysisPage(new URLSearchParams())']) {
    const html = run(expression);assert.equal(typeof html, 'string');assert(!html.includes('NaN'));rendered++;
  }
  for (const mode of ['base','expense',...(profile==='rebuild'?['delay']:[])]) {
    for (const m of run('simulate(state,' + JSON.stringify(mode) + ').months')) {
      assert(Math.abs(m.closing-(m.opening+m.net+m.shortage)) < 1e-6);
      assert(m.closing>=0 && m.irpBalance>=0);ledgerRows++;
    }
  }
}
let localLinks=0;
for(const file of fs.readdirSync(__dirname).filter(f=>/\.(md|html)$/.test(f))){
  const content=fs.readFileSync(path.join(__dirname,file),'utf8');
  const pattern=file.endsWith('.md')?/\]\(([^)]+)\)/g:/(?:href|src)="([^"]+)"/g;
  for(const match of content.matchAll(pattern)){
    const target=match[1].split('#')[0].split('?')[0];
    if(!target||/^[a-z]+:/i.test(target))continue;
    assert(fs.existsSync(path.resolve(__dirname,target)),file+': missing '+target);localLinks++;
  }
}
console.log(JSON.stringify({result:'PASS',rendered,ledgerRows,localLinks,checks:['asset-only onboarding','quote partial failure','idempotent quotes','cash/cost/receipts unchanged','scenario isolation','same account aggregation','unknown plan hidden','URL filter reset','independent household','selected scenario asset drilldown']}));
