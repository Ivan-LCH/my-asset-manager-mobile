'use strict';
// 현재 자산 관리 UX 보완. 외부 시세/API/실제 계좌에 연결하지 않는다.
function seedPositions(){return [
 {id:'demo-a',name:'국내 지수 ETF · 가상',ticker:'DEMO-A',currency:'KRW',quantity:1500,average:50000,price:60000,quotedAt:'2030-01-02',status:'가상 관측값',history:[{date:'2029-12-30',price:59000,quantity:1500},{date:'2030-01-02',price:60000,quantity:1500}],dividends:[{date:'2029-12-20',amount:450000,memo:'가상 수령 기록 · 실제 입금 아님'}]},
 {id:'demo-b',name:'배당 ETF · 가상',ticker:'DEMO-B',currency:'KRW',quantity:300,average:180000,price:200000,quotedAt:'2030-01-02',status:'가상 관측값',history:[{date:'2029-12-30',price:198000,quantity:300},{date:'2030-01-02',price:200000,quantity:300}],dividends:[]}
];}
const won=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2})+'원';
function currentGuide(){
 return guidePage().replace('은퇴 전망, 현재 자산, 다음 일정과 필요한 확인을 한 곳에.','현재 자산·시세 상태를 먼저, 미래 전망은 별도 영역에.').replace('홈 → 자산 입력 → 계획 → 분석.<br>하나의 흐름으로 바꿨습니다.','오늘의 자산 관리와 미래 설계.<br>두 흐름을 같은 원천으로 연결합니다.').replace('먼저 자산의 금액이나 생활비를 바꿔보세요. 같은 예시 입력이 다른 화면에도 반영됩니다.','자산 관리만 예시에서는 은퇴 입력 없이 주식 계좌와 종목을 확인할 수 있습니다.').replace('자산 → 계획 → 분석</strong>','자산 관리 / 미래 설계</strong>')+'<section class="card"><h2>개정 2 · 현재 자산 전문 관리</h2><p class="muted">기존 주식 기능을 통합 카드로 축소하지 않습니다. 계좌 → 종목 → 보유 현황·이력·배당을 확인하세요.</p><div class="actions">'+link('주식 관리 열기','stocks',true)+'<a class="btn" href="07-current-assets-and-retirement.md">기능 보존·검수 명세</a></div></section>';
}
function positionValue(p){return p.price*p.quantity/10000;}
function householdEditor(){openModal('현재 자산의 가구·명의 설정','<form id="householdForm">'+selectField('현재 가구 구성','spouse',[['no','본인 1명'],['yes','본인 + 배우자']],state.household.spouse?'yes':'no')+note('현재 자산 명의를 위한 설정입니다. 은퇴일·생활비는 입력하지 않아도 됩니다. 실제 제품은 사람 ID를 사용하며 다른 가구원도 관리합니다.')+formFooter()+'</form>');}
function saveHousehold(d){const spouse=d.get('spouse')==='yes';if(!spouse&&state.assets.some(a=>a.owner==='배우자'||a.owner==='공동'))throw new Error('배우자·공동 명의 자산을 먼저 확인해 주세요.');state.household={spouse};state.plan.spouse=spouse;changed('가구·명의 설정만 수정했습니다');}
function currentHome(){
 const t=totals();let html=heading('TODAY & TOMORROW','내일을 준비하는 오늘','오늘의 자산을 관리하고, 준비되면 미래를 설계하세요.','기존 홈 → 현재 자산 우선 + 별도 은퇴 전망',link('주식 관리 →','stocks',true));
 if(!state.assets.length)return html+emptyView('자산 관리부터 시작할 수 있어요','은퇴 시점이나 생활비를 몰라도 자산을 등록하고 관리할 수 있습니다.',button('첫 자산 추가','asset-add','',true)+' '+button('가구·명의 설정','household-edit')+' '+link('은퇴계획 시작','plan')+' '+button('예시로 둘러보기','profiles'));
 html+='<div class="grid three">'+metric('현재 평가 자산',pretty(t.total),'가상 현재 자료 · 지급권 제외','metric','gross')+metric('현재 순자산',pretty(t.net),'부채 '+pretty(t.debt)+' 차감','metric','net')+metric('현재 현금·예적금',pretty(t.cash),'평가이익과 생활 현금은 별개','metric','cash')+'</div>';
 html+='<div class="grid two"><section class="card"><div class="sectionhead"><h2>현재 자산 구성</h2><a class="textlink" href="#/assets">전체 자산</a></div>'+Object.keys(TYPES).filter(type=>state.assets.some(a=>a.type===type&&a.value>0)).map(type=>kv(TYPES[type].name,pretty(state.assets.filter(a=>a.type===type).reduce((n,a)=>n+a.value,0)))).join('')+'</section><section class="card"><h2>자주 쓰는 자산 관리</h2><p class="muted">시세 확인부터 계좌·종목·평가 이력·배당까지. 은퇴계획 입력은 필요하지 않습니다.</p><div class="actions">'+link('주식 시세·상세 보기','stocks',true)+button('자산 추가','asset-add')+button('가구·명의 설정','household-edit')+'</div>'+note('가상 예시 · 실시간 시세가 아닙니다. 종목별 가격 기준일과 갱신 상태는 주식 화면에서 확인하세요.')+'</section></div>';
 if(!state.complete)return html+'<section class="card"><h2>미래 계획은 준비될 때 시작하세요</h2><p class="muted">현재 자산 관리는 사용 중입니다. 생활비와 은퇴 조건이 없어 미래 전망만 보류합니다.</p>'+link('은퇴계획 시작','plan',true)+'</section>';
 const r=simulate(),y=r.years.find(x=>x.year===2032);
 html+='<section class="hero"><div>'+badge('미래 전망 · 현재 자산과 구분')+'<h2>'+(r.firstShortfall?dateLabel(r.firstShortfall)+'에 생활자금 보완이 필요해요.':'예시 기간 안에서는 생활 현금이 유지돼요.')+'</h2><p class="muted small">2030~2040년의 단순 가정입니다. 현재 계좌 잔액이나 실제 투자성과가 아닙니다.</p><div class="actions">'+link('전망의 근거 확인','analysis',true)+link('계획 조정','plan',true)+'</div></div><div class="herofigure"><span class="small">2032년 반복 수지 · 월평균</span><strong>'+signed(y.regular/12)+'</strong><span class="muted small">IRP 인출 포함 · 일회성 흐름 제외</span></div></section>';
 const events=eventsFor().filter(e=>e.date>='2030-01').slice(0,3);
 if(events.length)html+='<section class="card"><div class="sectionhead"><h2>앞으로의 주요 일정</h2><a class="textlink" href="#/plan?tab=events">전체 일정</a></div>'+events.map(eventRow).join('')+'</section>';
 return html;
}
function stocksPage(q=new URLSearchParams()){
 const accounts=state.assets.filter(a=>a.type==='STOCK'),account=accounts.find(a=>a.id===q.get('asset')),p=account?.positions?.find(p=>p.id===q.get('position')),tab=q.get('tab')||'holding';
 let html=heading('CURRENT ASSET MANAGEMENT',p?p.name:account?account.name:'주식 관리','현재 보유 현황과 실제 기록의 자리입니다. 모든 표시 금액은 합성 예시입니다.','기존 주식 → 계좌 → 종목 → 현황·이력·배당','');
 html+='<div class="actions">'+link(p?'← 계좌로':account?'← 주식 전체':'← 전체 자산',p?'stocks?asset='+encodeURIComponent(account.id):account?'stocks':'assets')+button('가상 시세 갱신 · 전체','quote-demo','',true)+button('일부 실패 예시','quote-partial')+button('계좌 추가','asset-add','data-type="STOCK"')+'</div>';
 html+=note('실제 시장 조회가 아닙니다. 고정 가상 가격을 적용합니다. 종목 시세 갱신은 수량·평단·현금·수령 기록을 바꾸지 않습니다. 새로고침하면 초기화됩니다.');
 if(!accounts.length)return html+emptyView('등록된 주식 계좌가 없습니다','은퇴계획 없이 계좌부터 추가할 수 있습니다.',button('주식 계좌 추가','asset-add','data-type="STOCK"',true));
 if(q.get('asset')&&!account)return html+note('선택 계좌를 찾을 수 없습니다. 주식 전체에서 다시 선택해 주세요.',true);
 if(q.get('position')&&!p)return html+note('선택 종목을 찾을 수 없습니다. 계좌 목록에서 다시 선택해 주세요.',true);
 const selected=account?[account]:accounts,total=selected.reduce((n,a)=>n+a.value,0);
 if(!p){
  html+='<section class="card"><h2>'+(account?'선택 계좌 현황':'주식 전체 현황')+'</h2>'+kv('현재 평가액',pretty(total))+kv('관리 범위',account?esc(account.owner)+' · '+(account.positions?'종목별 관리':'계좌 통합 관리'):accounts.length+'개 계좌')+kv('연 배당 예상 · 가정',money(selected.reduce((n,a)=>n+a.value*(a.yield||0)/100,0)))+'<p class="small muted">예상 배당은 미래 가정이며 아래 수령 기록과 별개입니다. 예시는 평가액 × 연 배당률 모델을 사용합니다.</p></section>';
  if(!account)return html+'<section class="card"><h2>계좌별 보기</h2>'+accounts.map(a=>'<a class="listrow" href="#/stocks?asset='+encodeURIComponent(a.id)+'"><div class="grow"><strong>'+esc(a.account||a.name)+'</strong><span class="muted small">'+esc(a.owner)+' · '+(a.positions?a.positions.length+'개 종목':'계좌 통합 · 수동 평가')+'</span></div><strong>'+pretty(a.value)+' ›</strong></a>').join('')+'</section>';
  html+='<section class="card"><h2>'+esc(account.account||account.name)+'</h2>'+button('계좌 정보·가정 수정','asset-edit','data-id="'+esc(account.id)+'"');
  if(!account.positions)return html+note('종목을 등록하지 않은 계좌 통합 모드입니다. 개별 주가·수량을 생성하지 않습니다. 입력 수정에서 평가액을 수동 갱신하세요.')+'</section>';
  return html+account.positions.map(p=>'<a class="listrow" href="#/stocks?asset='+encodeURIComponent(account.id)+'&position='+p.id+'"><div class="grow"><strong>'+esc(p.name)+'</strong><span class="muted small">'+p.ticker+' · '+p.quantity.toLocaleString()+'주 · '+won(p.price)+'</span><span class="muted small">'+p.quotedAt+' · '+esc(p.status)+'</span></div><strong>'+pretty(positionValue(p))+' ›</strong></a>').join('')+'</section>'+note('연금계좌에 연결된 종목과 계좌 총액은 실제 제품에서도 한 번만 합산합니다. 이 시제품의 하위 종목은 상위 계좌 평가액의 구성 내역입니다.');
 }
 const base='stocks?asset='+encodeURIComponent(account.id)+'&position='+p.id;
 html+='<div class="chips">'+[['holding','보유 현황'],['history','평가 이력'],['dividend','배당']].map(([id,label])=>'<a class="'+(tab===id?'active':'')+'" href="#/'+base+'&tab='+id+'">'+label+'</a>').join('')+'</div>';
 if(tab==='history')return html+'<section class="card"><h2>날짜별 평가 이력 · 가상</h2><div class="tablewrap"><table><caption>합성 기록 · 가격은 원, 평가액은 만원</caption><thead><tr><th>날짜</th><th>가격</th><th>수량</th><th>평가액</th></tr></thead><tbody>'+p.history.map(h=>'<tr><td>'+h.date+'</td><td>'+won(h.price)+'</td><td>'+h.quantity+'</td><td>'+money(h.price*h.quantity/10000)+'</td></tr>').join('')+'</tbody></table></div>'+note('시제품은 관측 표와 가상 가격 갱신만 제공합니다. 기존 기간별 차트·이력 추가/수정/삭제·과거 보정은 제품에서 유지할 필수 기능입니다.')+'</section>';
 if(tab==='dividend')return html+'<div class="grid two"><section class="card"><h2>수령 기록 · 가상 실적</h2>'+kv('예시 기록 합계',won(p.dividends.reduce((n,d)=>n+d.amount,0)))+(p.dividends.length?p.dividends.map(d=>kv(d.date,won(d.amount))+'<p class="muted small">'+esc(d.memo)+'</p>').join(''):'<p class="muted">예시 수령 기록 없음. 예상액을 실적으로 채우지 않습니다.</p>')+'</section><section class="card"><h2>앞으로의 배당 예상</h2>'+kv('계좌의 연 배당률 가정',account.yield+'%')+kv('이 종목 평가액 기준 예상',money(positionValue(p)*account.yield/100))+'<p class="muted small">계좌 공통 가정을 배분한 예시이며 실제 지급액이 아닙니다. 제품에서는 종목별 설정과 원통화·환율·수령 입력/삭제를 보존합니다.</p></section></div>';
 const cost=p.average*p.quantity;
 return html+'<div class="grid two"><section class="card"><h2>현재 보유</h2>'+kv('종목 코드',p.ticker)+kv('보유 수량',p.quantity.toLocaleString()+'주')+kv('평단가',won(p.average))+kv('관측 가격',won(p.price))+kv('가격 기준일',p.quotedAt)+kv('출처·상태',esc(p.status))+button('수량·평단 예시 수정','position-edit','data-account="'+esc(account.id)+'" data-position="'+p.id+'"')+'</section><section class="card"><h2>평가 상세</h2>'+kv('평가액',won(p.price*p.quantity))+kv('단순 원금',won(cost))+kv('단순 평가손익',won(p.price*p.quantity-cost))+note('KRW 합성 예시 · 수수료/세금 제외. 실제 거래원장 기반 실현손익이나 정밀 수익률은 아닙니다.')+link('계좌 원천의 미래 반영','analysis')+'</section></div>';
}
function demoQuote(partial=false){
 let ok=0,failed=0;
 for(const a of state.assets.filter(a=>a.type==='STOCK'&&a.positions)){
  const before=a.value;
  for(const p of a.positions){
   if(partial&&p.id==='demo-b'){p.status='조회 실패 예시 · 이전 가격 보존';failed++;continue;}
   p.price=p.id==='demo-a'?60200:201000;p.quotedAt='2030-01-03';p.status='가상 갱신 성공';
   if(!p.history.some(h=>h.date===p.quotedAt))p.history.push({date:p.quotedAt,price:p.price,quantity:p.quantity});
   ok++;
  }
  a.value=a.positions.reduce((n,p)=>n+positionValue(p),0);if(before!==a.value)a.history.push({value:before});a.updated='2030-01';
 }
 if(!ok&&!failed){toast('자동 갱신할 가상 종목이 없습니다. 계좌 통합 값은 수동 수정하세요.');return;}
 changed('가상 가격 '+ok+'건 반영'+(failed?' · '+failed+'건 실패/이전값 보존':''));
}
function positionEditor(accountId,positionId){
 const a=state.assets.find(a=>a.id===accountId),p=a?.positions?.find(p=>p.id===positionId);if(!p)return;
 openModal('수량·평단 수정 · 가상 현재 기록','<form id="positionForm" data-account="'+esc(a.id)+'" data-position="'+p.id+'">'+field('보유 수량','quantity',p.quantity)+field('평단가 (원)','average',p.average)+note('현재 예시만 수정합니다. 이전 관측 이력의 수량은 덮어쓰지 않습니다. 실제 제품에서는 변경일과 매매/정정 의미를 구분합니다.')+formFooter()+'</form>');
}
function savePositionForm(f,d){
 const a=state.assets.find(a=>a.id===f.dataset.account),p=a?.positions?.find(p=>p.id===f.dataset.position);if(!p)throw new Error('종목을 찾을 수 없습니다.');
 const quantity=readNumber(d,'quantity'),average=readNumber(d,'average'),before=a.value;
 p.quantity=quantity;p.average=average;a.value=a.positions.reduce((n,p)=>n+positionValue(p),0);if(before!==a.value)a.history.push({value:before});changed('현재 종목 예시를 수정했습니다');
}
