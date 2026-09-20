// 기준 커밋의 실제 순수 계산 함수를 실행하는 읽기 전용 진단. DB/네트워크/앱 데이터 접근 없음.
// 저장소 루트에서: node docs/redesign/verify-baseline.cjs (frontend npm ci 필요)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, 'frontend/src', relative + '.ts');
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  // --original은 수정 전 기준 커밋을 메모리에서만 읽어 기존 결함을 재현한다.
  const input = process.argv.includes('--original')
    ? execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'show', '053f83ec698d74fa37ba2280b00ee8a4ba388a1c:frontend/src/' + relative.replaceAll('\\', '/') + '.ts'], { cwd: root, encoding: 'utf8', windowsHide: true })
    : fs.readFileSync(filename, 'utf8');
  const source = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => {
    if (name.startsWith('@/')) return load(name.slice(2));
    if (name.startsWith('.')) return load(path.relative(path.join(root, 'frontend/src'), path.resolve(path.dirname(filename), name)));
    throw new Error('External dependency intentionally unsupported: ' + name);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename })(localRequire, mod, mod.exports);
  return mod.exports;
}
const holding = load('lib/holdingTax');
const health = load('lib/healthInsurance');
const account = load('lib/accountSim');
const pension = load('lib/pensionSim');
const cashflow = load('lib/retirementCashflow');
const { EMPTY_PLAN } = load('lib/retirementPlan');
const observations = [];
function record(id, result) { observations.push({ id, ...result }); }
const property = { id: 'synthetic-property', type: 'REAL_ESTATE', currentValue: 1_000_000_000,
  ownership: { husband: 50, wife: 50 }, disposalDate: '2035-05-31',
  detail: { isOwned: true, hasTenant: true, tenantDeposit: 200_000_000, loanAmount: 100_000_000,
    futureValue: 1_500_000_000, futureYear: 2030 } };
const h = holding.toHoldingTaxAssets([property]);
const before = holding.estimateHoldingTax(h, 2029).total;
const after = holding.estimateHoldingTax(h, 2030).total;
assert(before > 0 && after > before);
record('R01', { beforeCompletionHoldingTax: before, completionYearHoldingTax: after,
  meaning: 'Completion only switches valuation; pre-completion housing tax is already charged.' });
const healthBeforeSale = health.realEstatePropertyBases([property], 2030);
const holdingBeforeSale = holding.estimateHoldingTax(h, 2030).total;
assert.equal(healthBeforeSale.husband.propertyTaxBase, 0);
assert(holdingBeforeSale > 0);
const accountOpts = { irpInitial: 0, irpGrowthRate: 0, irpDividendYield: 0, irpMonthlyPension: 0,
  stockAccounts: [], realEstateItems: [ { currentValue: property.currentValue, ...property.detail } ], fromYear: 2036, toYear: 2036 };
const estateAfterSale = account.simulateAccounts(accountOpts)[0].realEstateEnd;
assert(estateAfterSale > 0);
record('R02', { healthBeforeSale, holdingBeforeSale, holdingInSaleYear: holding.estimateHoldingTax(h, 2035).total,
  holdingAfterSale: holding.estimateHoldingTax(h, 2036).total, estateAfterSale });
const noSale = { ...property, disposalDate: undefined };
record('R03', { healthBase: health.realEstatePropertyBases([noSale], 2029).husband,
  holdingBasePerOwner: property.currentValue * holding.MARKET_TO_OFFICIAL * holding.HOUSING_ASSESSED_RATIO * .5,
  meaning: 'Health uses market*0.6 and received tenant deposit; holding uses market*0.75*0.6.' });
const exhausted = account.simulateAccounts({ ...accountOpts, realEstateItems: [], irpInitial: 100,
  irpMonthlyPension: 10, fromYear: 2030, toYear: 2031 });
assert.equal(exhausted[1].irpStart, 0); assert.equal(exhausted[1].irpPension, 120);
record('R04', { rows: exhausted.map(r => ({ year: r.year, start: r.irpStart, paid: r.irpPension, end: r.irpEnd })) });
const source = { id: 'synthetic-national', name: 'synthetic', principal: 0, taxType: 'national', yieldRate: 0,
  owner: 'wife', expectedMonthlyPayout: 1_000_000, expectedStartYear: 2030, expectedEndYear: 2060, annualGrowthRate: 0 };
const p = { ...pension.EMPTY_PENSION_PLAN, sources: [source], allocations: [], startYear: 2030 };
const nat = pension.pensionSchedule(p, [source], 2030, 2030, { currentYear: 2026 })[0];
assert.equal(nat.nationalAnnual, 12_000_000); assert.equal(nat.drawdownAnnual, 12_000_000);
record('R05', { row: nat, meaning: 'Registered national pension is also added to private drawdown.' });
const oldSource = { ...source, taxType: 'irp', principal: 100 };
const refreshed = pension.sourcesFromAssets([{ id: source.id, name: 'synthetic', currentValue: 200, detail: { pensionType: 'IRP' } }], [oldSource]);
assert.equal(refreshed[0].principal, 100);
record('R06', { inputCurrentValue: 200, previousPrincipal: 100, analysisPrincipal: refreshed[0].principal });
const cf = cashflow.buildCashFlow({ ...EMPTY_PLAN, expenses: [{ id: 'e', name: 'synthetic', amount: 1_000_000 }],
  medicalMonthly: 0, travel: [], emergency: [], lumpsum: [], retirementYear: 2027,
  holdingTaxStartYear: 2029, holdingTaxAnnual: 1_200_000 }, new Map([[2029, 1_000_000]]), 60, 0, 0);
assert.equal(cf[0].year, 2029); assert.equal(cf[0].balance, 0); assert.equal(cf[0].cumulative, -1_200_000);
record('R07', { retirementYear: 2027, firstYear: cf[0].year, monthlyBalance: cf[0].balance, yearEndCash: cf[0].cumulative });
const gross = 1_000_000;
const net = gross * (1 - .154);
const corp = cashflow.buildCashFlow({ ...EMPTY_PLAN, expenses: [], medicalMonthly: 0, travel: [], emergency: [], lumpsum: [], holdingTaxAnnual: 0 },
  new Map(), 60, 0, 0, { salaryMonthly: 0, phaseBoundaryYear: 2040, returnP1Monthly: 0, divP1Monthly: net, divP2Monthly: net });
assert.equal(corp[0].dividendMonthly, net); assert(corp[0].taxAnnual < 0);
record('R08', { grossMonthlyDividend: gross, alreadyNetMonthlyDividend: net, additionalAnnualTax: -corp[0].taxAnnual });
console.log(JSON.stringify({ note: 'Synthetic inputs; assertions reproduce baseline defects, not correct tax rules.', observations }, null, 2));
