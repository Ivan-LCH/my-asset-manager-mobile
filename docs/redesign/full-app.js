'use strict';
// 전체 화면 검토용 독립 시제품. 실제 앱 DB·네트워크·세법 엔진에 접근하지 않는다.
const TYPES={SAVINGS:{name:'현금·예적금',icon:'₩',color:'#659476'},STOCK:{name:'주식·펀드',icon:'↗',color:'#8194c1'},PENSION:{name:'연금',icon:'◷',color:'#c5a275'},REAL_ESTATE:{name:'부동산',icon:'⌂',color:'#3c7960'},PHYSICAL:{name:'실물자산',icon:'◇',color:'#c6b363'},ETC:{name:'기타자산',icon:'□',color:'#b2aea6'}};
const NAV=[['home','⌂','홈'],['assets','▤','자산'],['plan','◷','계획'],['analysis','▥','분석']];
const PROFILE_NAMES={family:'부부 · 일반 자가+투자+연금',tracking:'자산 관리만 · 은퇴계획 미입력',financial:'부동산 없음 · 금융·연금',rental:'부부 · 임대 부동산',rebuild:'부부 · 재건축 진행 중',single:'은퇴한 1인 가구',empty:'아직 입력하지 않음'};
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만원';
const signed=n=>(n>0?'+':'')+money(n);
const pretty=n=>Math.abs(n)>=10000?(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:2})+'억원':money(n);
const dateLabel=s=>String(s).replace('-', '.');
function sample(profile='family'){
 const assets=[
  {id:'cash',type:'SAVINGS',name:'생활·비상자금',owner:'본인',value:6000,kind:'cash',updated:'2030-01',history:[]},
  {id:'stock',type:'STOCK',name:'글로벌 ETF 계좌',owner:'본인',value:15000,yield:3,account:'일반 투자계좌',updated:'2030-01',history:[]},
  {id:'irp',type:'PENSION',name:'퇴직연금 IRP',owner:'본인',value:12000,monthly:40,start:'2030-01',kind:'irp',updated:'2030-01',history:[]},
  {id:'national',type:'PENSION',name:'국민연금 · 본인',owner:'본인',value:0,monthly:180,start:'2032-01',kind:'national',updated:'2030-01',history:[]},
  {id:'spouse',type:'PENSION',name:'국민연금 · 배우자',owner:'배우자',value:0,monthly:90,start:'2035-01',kind:'national',updated:'2030-01',history:[]},
  {id:'home',type:'REAL_ESTATE',name:'우리 집',owner:'공동',value:70000,kind:'home',debt:15000,rate:3.5,rent:0,deposit:0,completion:'2033-09',futureValue:85000,contribution:2000,tempRent:50,rentStart:'2030-01',updated:'2030-01',history:[]},
  {id:'gold',type:'PHYSICAL',name:'보유 금',owner:'본인',value:1000,updated:'2030-01',history:[]},
  {id:'other',type:'ETC',name:'소장품',owner:'본인',value:500,updated:'2030-01',history:[]}
 ];
 const s={profile,revision:1,complete:true,plan:{name:'우리 가족의 기본 계획',retirement:'2032-01',salary:350,living:280,travel:20,medical:15,health:28,tax:180,spouse:true,alreadyRetired:false},assets,events:[{id:'trip',name:'가족 여행 특별 예산',date:'2034-05',amount:500,direction:'out',source:'생활자금'}]};
 assets.find(a=>a.id==='stock').positions=seedPositions();
 if(profile==='tracking'){s.assets=assets.filter(a=>['cash','stock'].includes(a.id));s.events=[];s.complete=false;s.plan={name:'아직 작성하지 않은 계획',retirement:'',salary:0,living:0,travel:0,medical:0,health:0,tax:0,spouse:true,alreadyRetired:false};}
 if(profile==='financial')s.assets=assets.filter(a=>['SAVINGS','STOCK','PENSION'].includes(a.type));
 if(profile==='rental'){const a=assets.find(a=>a.id==='home');Object.assign(a,{name:'임대 아파트',kind:'rental',rent:160,deposit:5000,rentStart:'2030-01'});}
 if(profile==='rebuild'){const a=assets.find(a=>a.id==='home');Object.assign(a,{name:'재건축 A주택',kind:'rebuild',value:50000,rent:160});}
 if(profile==='single'){s.assets=assets.filter(a=>['cash','national','irp'].includes(a.id));Object.assign(s.plan,{name:'나의 은퇴 생활',spouse:false,alreadyRetired:true,retirement:'2029-01',salary:0,living:180,travel:15,medical:10,health:18,tax:60});s.assets.find(a=>a.id==='national').start='2030-01';s.events=[];}
 if(profile==='empty'){s.assets=[];s.events=[];s.complete=false;s.plan={name:'새 은퇴 계획',retirement:'2032-01',salary:0,living:0,travel:0,medical:0,health:0,tax:0,spouse:false,alreadyRetired:false};}
 s.household={spouse:s.plan.spouse};return s;
}
let state=sample();
let analysisYear=2032,scenario='base',assetFilter='all',toastTimer;
function nextMonth(s,offset=1){const [y,m]=s.split('-').map(Number);const n=y*12+m-1+offset;return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0');}
function isRebuild(){return state.assets.some(a=>a.type==='REAL_ESTATE'&&a.kind==='rebuild');}
function scenarios(){return [{id:'base',name:'기본 계획'},{id:'expense',name:'생활비 10% 증가'},...(isRebuild()?[{id:'delay',name:'준공 1년 지연'}]:[])];}
function totals(s=state){const total=s.assets.reduce((n,a)=>n+a.value,0),debt=s.assets.reduce((n,a)=>n+(a.debt||0)+(a.deposit||0),0),cash=s.assets.filter(a=>a.type==='SAVINGS').reduce((n,a)=>n+a.value,0);return {total,debt,net:total-debt,cash};}
function eventsFor(s=state,mode='base'){
 const events=s.events.map(e=>({...e,kind:'custom'}));
 if(s.complete&&!s.plan.alreadyRetired)events.push({id:'retirement',name:'은퇴 예정',date:s.plan.retirement,kind:'retirement',description:'근로 수입이 종료되는 시점',amount:0});
 for(const a of s.assets){
  if(a.type==='PENSION')events.push({id:'pension-'+a.id,name:a.name+' 수령 시작',date:a.start,kind:'asset',assetId:a.id,description:'월 '+money(a.monthly),amount:0});
  if(a.type==='REAL_ESTATE'&&a.kind==='rental')events.push({id:'rent-'+a.id,name:a.name+' 임대 시작',date:a.rentStart,kind:'asset',assetId:a.id,description:'월 '+money(a.rent),amount:0});
  if(a.type==='REAL_ESTATE'&&a.kind==='rebuild'){
   const date=nextMonth(a.completion,mode==='delay'?12:0);
   events.push({id:'completion-'+a.id,name:a.name+' 준공·분담금',date,kind:'asset',assetId:a.id,description:'일회성 분담금 '+money(a.contribution),amount:a.contribution,direction:'out'});
   events.push({id:'rent-'+a.id,name:a.name+' 임대 시작',date:nextMonth(date),kind:'asset',assetId:a.id,description:'준공 후 1개월 · 월 '+money(a.rent),amount:0});
  }
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
function simulate(s=state,mode='base'){
 if(!s.complete)return {months:[],years:[],firstShortfall:null,unmet:0};
 let cash=totals(s).cash;const balances=Object.fromEntries(s.assets.filter(a=>a.type==='PENSION'&&a.kind==='irp').map(a=>[a.id,a.value]));
 const events=eventsFor(s,mode),months=[];let firstShortfall=null,unmet=0;
 for(let year=2030;year<=2040;year++)for(let m=1;m<=12;m++){
  const date=year+'-'+String(m).padStart(2,'0'),opening=cash,lines=[];
  const add=(label,amount,category,assetId=null,eventId=null)=>{if(amount!==0)lines.push({label,amount,category,assetId,eventId});};
  if(!s.plan.alreadyRetired&&date<s.plan.retirement)add('근로 수입',s.plan.salary,'income');
  for(const a of s.assets){
   if(a.type==='STOCK')add(a.name+' 배당',a.value*(a.yield||0)/100/12,'income',a.id);
   if(a.type==='PENSION'&&date>=a.start){
    const paid=a.kind==='irp'?Math.min(a.monthly,balances[a.id]):a.monthly;
    if(a.kind==='irp')balances[a.id]-=paid;
    add(a.name+(a.kind==='irp'?' 원금 인출':' 지급'),paid,a.kind==='irp'?'drawdown':'income',a.id);
   }
   if(a.type==='REAL_ESTATE'){
    add(a.name+' 대출 이자',-(a.debt||0)*(a.rate||0)/100/12,'expense',a.id);
    if(a.kind==='rental'&&date>=a.rentStart)add(a.name+' 임대료',a.rent,'income',a.id);
    if(a.kind==='rebuild'){
     const completion=nextMonth(a.completion,mode==='delay'?12:0);
     if(date<=completion)add(a.name+' 임시 거주비',-a.tempRent,'expense',a.id);
     if(date>=nextMonth(completion))add(a.name+' 임대료',a.rent,'income',a.id);
    }
   }
  }
  add('생활비',-s.plan.living*(mode==='expense'?1.1:1),'expense');add('여행 예산',-s.plan.travel,'expense');add('의료 지출',-s.plan.medical,'expense');add('건강보험 · 입력 예상액',-s.plan.health,'health');
  if(m===12)add('연 세금 · 입력 예상액',-s.plan.tax,'tax');
  for(const e of events.filter(e=>e.date===date&&e.amount>0))add(e.name,e.direction==='in'?e.amount:-e.amount,'event',e.assetId,e.id);
  const income=lines.filter(l=>l.category==='income').reduce((n,l)=>n+l.amount,0),drawdown=lines.filter(l=>l.category==='drawdown').reduce((n,l)=>n+l.amount,0);
  const regular=lines.filter(l=>l.category!=='event').reduce((n,l)=>n+l.amount,0),eventNet=lines.filter(l=>l.category==='event').reduce((n,l)=>n+l.amount,0),net=regular+eventNet;
  const shortage=Math.max(0,-(opening+net));cash=Math.max(0,opening+net);unmet+=shortage;if(shortage>0&&!firstShortfall)firstShortfall=date;
  months.push({date,year,month:m,opening,closing:cash,income,drawdown,regular,eventNet,net,shortage,lines,irpBalance:Object.values(balances).reduce((n,v)=>n+v,0)});
 }
 const years=[];for(let year=2030;year<=2040;year++){const list=months.filter(m=>m.year===year),sum=k=>list.reduce((n,m)=>n+m[k],0);years.push({year,opening:list[0].opening,closing:list.at(-1).closing,income:sum('income'),drawdown:sum('drawdown'),regular:sum('regular'),eventNet:sum('eventNet'),shortage:sum('shortage'),tax:-list.flatMap(m=>m.lines).filter(l=>l.category==='tax').reduce((n,l)=>n+l.amount,0)});}
 return {months,years,firstShortfall,unmet};
}
const el=id=>document.getElementById(id);
const badge=(text,kind='')=>'<span class="badge '+kind+'">'+esc(text)+'</span>';
const button=(text,action,extra='',primary=false)=>'<button class="btn '+(primary?'primary':'')+'" data-action="'+action+'" '+extra+'>'+text+'</button>';
const link=(text,path,primary=false)=>'<a class="btn '+(primary?'primary':'')+'" href="#/'+path+'">'+text+'</a>';
const kv=(label,value)=>'<div class="kv"><span>'+esc(label)+'</span><strong>'+value+'</strong></div>';
const note=(text,amber=false)=>'<div class="note '+(amber?'amber':'')+'">'+text+'</div>';
const metric=(label,value,help,action='metric',key='net',negative=false)=>'<button class="card clickable" data-action="'+action+'" data-key="'+key+'"><span class="metriclabel">'+label+'</span><strong class="metricvalue '+(negative?'negative':'')+'">'+value+'</strong><span class="metricnote">'+help+' ↗</span></button>';
function heading(eyebrow,title,subtitle,old,action=''){return '<div class="pageheading"><div><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p class="muted small">'+subtitle+'</p></div>'+action+'</div><div class="mapping">'+badge('개편 위치')+'<span>'+old+'</span><a href="#/guide">전체 페이지 대응 보기</a></div>';}
function emptyView(title,text,action){return '<section class="card empty"><div class="asseticon">＋</div><h2>'+title+'</h2><p>'+text+'</p>'+action+'</section>';}
function assetRow(a){const t=TYPES[a.type],pension=a.type==='PENSION';return '<a class="listrow" href="#/asset/'+encodeURIComponent(a.id)+'"><span class="asseticon '+a.type+'">'+t.icon+'</span><div class="grow"><strong>'+esc(a.name)+'</strong><span class="muted small">'+esc(a.owner)+' · '+(pension?(a.kind==='national'?'공적 지급권':'계좌 잔액과 인출'):(a.kind==='rebuild'?'재건축 진행 중':t.name))+'</span></div><div class="right"><strong>'+(pension&&a.kind==='national'?money(a.monthly)+'/월':pretty(a.value))+'</strong><span class="muted small">'+(pension?dateLabel(a.start)+' 수령':'2030.01 기준')+' ›</span></div></a>';}
function eventRow(e){const action=e.assetId?'asset-event':e.kind==='retirement'?'plan-edit':'event-edit';return '<button class="listrow rowbutton" data-action="'+action+'" data-id="'+esc(e.assetId||e.id)+'"><span class="datechip">'+e.date.slice(0,4)+'<strong>'+e.date.slice(5)+'월</strong></span><div class="grow"><strong>'+esc(e.name)+'</strong><span class="muted small">'+esc(e.description||(e.direction==='in'?'수령 ':'지출 ')+money(e.amount))+'</span></div><span class="muted">›</span></button>';}
function chart(result){const max=Math.max(1,...result.years.map(y=>y.closing));return '<div class="chart">'+result.years.map(y=>'<div class="chartbar"><button class="bar '+(y.year===analysisYear?'selected':'')+'" style="height:'+Math.max(3,y.closing/max*145)+'px" data-action="select-year" data-year="'+y.year+'" aria-label="'+y.year+'년 현금 '+money(y.closing)+'"></button><small>'+String(y.year).slice(2)+'</small></div>').join('')+'</div><div class="legend">2030~2040년 · 연말 생활 현금 · 막대를 누르면 해당 연도 상세</div>';}
// 이전 검토 스크립트의 진입점도 개정된 현재 자산 우선 홈을 사용한다.
function homePage(){return currentHome();}
function assetsPage(q){
 if(q.get('type')==='STOCK')return stocksPage(new URLSearchParams());
 const requested=q.get('type');assetFilter=requested&&TYPES[requested]?requested:'all';
 const t=totals();let html=heading('ASSETS & LIABILITIES','내 자산','보유한 것과 실제 사용할 수 있는 돈을 구분합니다.','기존 자산·유형별 페이지 → 통합 자산과 연결 상세',button('＋ 자산 추가','asset-add','',true));
 if(!state.assets.length)return html+emptyView('첫 자산을 등록해 주세요','현금·예적금, 주식, 연금, 부동산, 실물, 기타 자산을 추가할 수 있습니다.',button('자산 추가','asset-add','',true));
 html+='<div class="grid three">'+metric('평가 자산 합계',pretty(t.total),'공적연금 지급권은 제외','metric','gross')+metric('대출·반환 의무',pretty(t.debt),'부채 구성 확인','metric','debt')+metric('순자산',pretty(t.net),'자산에서 부채 차감','metric','net')+'</div>';
 const available=Object.keys(TYPES).filter(type=>state.assets.some(a=>a.type===type));if(!requested&&assetFilter!=='all'&&!available.includes(assetFilter))assetFilter='all';
 html+='<div class="chips"><a href="#/assets" data-filter="all" class="'+(assetFilter==='all'?'active':'')+'">전체 '+state.assets.length+'</a>'+available.map(type=>'<a href="#/assets?type='+type+'" data-filter="'+type+'" class="'+(assetFilter===type?'active':'')+'">'+TYPES[type].name+'</a>').join('')+'</div>';
 const list=state.assets.filter(a=>assetFilter==='all'||a.type===assetFilter);html+='<div class="grid split"><section class="card"><div class="sectionhead"><h2>'+(assetFilter==='all'?'전체 자산':TYPES[assetFilter].name)+'</h2><span class="muted small">금액을 누르면 원천과 일정 확인</span></div>'+(list.length?list.map(assetRow).join(''):'<p class="muted">등록된 '+TYPES[assetFilter].name+'이 없습니다.</p>'+button('이 유형의 자산 추가','asset-add','data-type="'+assetFilter+'"'))+'</section><section class="card"><h2>내 자산 구성</h2><div class="allocation">'+available.map(type=>{const v=state.assets.filter(a=>a.type===type).reduce((n,a)=>n+a.value,0);return v?'<span style="width:'+v/Math.max(1,t.total)*100+'%;background:'+TYPES[type].color+'"></span>':'';}).join('')+'</div><div class="allocationlist">'+available.map(type=>'<div><i class="dot" style="background:'+TYPES[type].color+'"></i>'+TYPES[type].name+'<strong>'+pretty(state.assets.filter(a=>a.type===type).reduce((n,a)=>n+a.value,0))+'</strong></div>').join('')+'</div>'+note('국민연금은 앞으로 받을 지급권으로 별도 표시합니다. 현재 투자계좌 원금에 더하지 않습니다.')+'<a class="textlink" href="#/pension">연금 전체 수령 계획 →</a></section></div>';return html;
}
function assetPage(id){
 if(state.assets.some(a=>a.id===id&&a.type==='STOCK'))return stocksPage(new URLSearchParams({asset:id}));
 const a=state.assets.find(a=>a.id===id);if(!a)return emptyView('이 자산을 찾을 수 없습니다','예시가 변경됐거나 삭제된 자산입니다.',link('자산으로 돌아가기','assets'));
 const type=TYPES[a.type];let html=heading('ASSET DETAIL',esc(a.name),esc(type.name+' · '+a.owner+' · 2030.01 평가 기준'),'기존 자산 상세 모달 → 정보·일정·분석을 연결한 상세',button('입력 수정','asset-edit','data-id="'+esc(a.id)+'"',true));
 html+='<div class="actions">'+link('← 자산 목록','assets')+(a.type==='PENSION'?link('연금 전체 보기','pension'):'')+'</div><div class="grid two"><section class="card"><h2>자산의 현재 상태</h2>'+kv(a.type==='PENSION'&&a.kind==='national'?'예상 월 지급액':'평가액',pretty(a.kind==='national'?a.monthly:a.value))+kv('명의',esc(a.owner))+kv('분류',esc(type.name));
 if(a.type==='REAL_ESTATE')html+=kv('상태',a.kind==='rebuild'?'재건축 공사 중':a.kind==='rental'?'임대 운영':'일반 자가')+kv('대출 원금',money(a.debt))+kv('대출 이자 · 연 가정',a.rate+'%')+kv('받은 보증금 · 반환부채',money(a.deposit))+(a.kind==='rebuild'?kv('준공 예상',dateLabel(a.completion))+kv('완공 후 예상 가치',pretty(a.futureValue)):'');
 if(a.type==='STOCK')html+=kv('계좌',esc(a.account))+kv('배당 가정 · 연',a.yield+'%')+kv('연 배당 예상',money(a.value*a.yield/100));
 if(a.type==='PENSION')html+=kv('월 지급 / 인출 목표',money(a.monthly))+kv('시작 시점',dateLabel(a.start))+kv('지급 방식',a.kind==='national'?'외부 지급권':'계좌 잔액 한도에서 인출');
 html+='</section><section class="card"><h2>이 입력이 분석에 반영되는 곳</h2>'+note(a.type==='SAVINGS'?'현재 잔액이 2030년 시작 생활자금에 반영됩니다.':a.type==='PENSION'?'명의와 수령 시작 시점이 월별 연금 흐름에 연결됩니다. IRP는 실제 지급한 만큼 계좌 잔액이 줄어듭니다.':a.type==='STOCK'?'평가액과 배당 가정이 매월 배당 예시에 연결됩니다. 시제품에서는 가격 상승과 자동 매도를 가정하지 않습니다.':a.type==='REAL_ESTATE'?'대출 이자와 임대 수입, 재건축 분담금이 해당 월의 현금 흐름에 연결됩니다. 시가는 생활 현금에 직접 더하지 않습니다.':'매각 계획이 없는 실물·기타 자산은 순자산에만 포함하고 생활 현금으로 사용하지 않습니다.')+'<div class="actions">'+button('이 자산의 현금 내역','asset-flows','data-id="'+esc(a.id)+'"')+link('전체 분석','analysis')+'</div></section></div>';
 const events=eventsFor().filter(e=>e.assetId===id);if(events.length)html+='<section class="card"><div class="sectionhead"><h2>연결된 일정</h2><a class="textlink" href="#/plan?tab=events">계획에서 모두 보기</a></div>'+events.map(eventRow).join('')+'</section>';
 html+='<div class="grid two"><section class="card"><div class="sectionhead"><h2>평가 이력</h2>'+button('평가액 갱신','asset-edit','data-id="'+esc(id)+'"')+'</div>'+kv('2030.01 · 예시 최초 값',pretty(a.history?.[0]?.value??a.value))+((a.history||[]).map(h=>kv('이 창에서 수정한 이전 값',pretty(h.value))).join(''))+'<p class="small muted">여기서 바꾼 예시는 새로고침 시 초기화됩니다.</p></section><section class="card"><h2>'+(a.type==='STOCK'?'배당 내역과 예상':'입력 근거')+'</h2>'+(a.type==='STOCK'?kv('배당 가정',a.yield+'% / 연')+kv('월 환산 예상',money(a.value*a.yield/100/12))+'<p class="muted small">실제 입금 이력은 없습니다. 예상액을 과거 배당 실적으로 표시하지 않습니다.</p>':'<p class="muted">실제 명세서나 시세를 사용하지 않은 합성 예시입니다. 실제 제품에서는 출처·기준일·확정 여부를 함께 기록합니다.</p>')+'</section></div>';return html;
}
function planPage(q){
 const tab=q.get('tab')||'overview',p=state.plan;
 let html=heading('LIFE PLAN','나의 계획','언제, 얼마가 필요하고 무엇이 달라지는지 계획합니다.','기존 분석 → 은퇴준비 + 현금흐름 입력 → 계획 탭',button('계획 입력 수정','plan-edit','',true));
 html+='<div class="tabs">'+[['overview','생활·은퇴'],['events','예정 일정'],['assumptions','가정·예상액']].map(([key,label])=>'<a class="'+(tab===key?'active':'')+'" href="#/plan?tab='+key+'">'+label+'</a>').join('')+'</div>';
 if(tab==='events'){
  const events=eventsFor();html+='<div class="sectionhead"><h2>하나의 일정, 연결되는 현금 흐름</h2>'+button('＋ 목돈·지출 일정','event-add','',true)+'</div>'+note('자산에서 등록한 연금·임대·준공 일정은 여기서도 같은 입력을 수정합니다. 중복 등록할 필요가 없습니다.');
  return html+(events.length?'<section class="card">'+events.map(eventRow).join('')+'</section>':emptyView('아직 예정된 일정이 없어요','목돈 수령, 가족 지원, 특별 지출 등 필요한 일정을 추가할 수 있습니다.',button('일정 추가','event-add')));
 }
 if(!state.complete)return html+emptyView('계획은 아직 입력하지 않았습니다','현재 자산 관리는 계속 사용할 수 있습니다. 은퇴 시점·생활비·세금 예상액을 입력한 사실로 표시하지 않습니다.',button('계획 입력 시작','plan-edit','',true)+link('현재 자산으로','assets'));
 if(tab==='assumptions')return html+'<div class="grid two"><section class="card"><h2>세금·건강보험 예상액</h2>'+kv('연 세금',money(p.tax))+kv('월 건강보험',money(p.health))+note('예상액은 합성 데이터입니다. 세금은 예시의 12월에 납부하며 실제 법정 납부 일정이 아닙니다.',true)+button('예상액 수정','plan-edit')+'</section><section class="card"><h2>계산 범위</h2>'+kv('예시 기간','2030.01 ~ 2040.12')+kv('물가·투자가격 상승','0% · 이 화면의 고정 가정')+kv('생활 현금 부족 시','부족액 표시 · 자동 자산 매각 없음')+kv('세금 자동 산정','시제품에서는 미지원')+'</section></div><section class="card"><h2>계획을 비교하는 방법</h2><p class="muted">생활비 증가안은 반복 생활비에만 적용합니다. 준공 지연안은 재건축 자산이 있을 때만 만들고 분담금·임대·임시 거주 기간을 연결해 이동합니다.</p>'+link('비교 화면으로 이동','analysis?tab=compare',true)+'</section>';
 html+='<div class="grid two"><section class="card"><div class="sectionhead"><h2>우리 집 은퇴 일정</h2>'+badge(p.alreadyRetired?'이미 은퇴':'은퇴 준비 중')+'</div>'+kv('계획 이름',esc(p.name))+kv('가구 구성',p.spouse?'본인 + 배우자':'본인 1명')+kv(p.alreadyRetired?'은퇴 시점':'은퇴 예정',dateLabel(p.retirement))+kv('은퇴 전 월 근로 수입',money(p.salary))+'</section><section class="card"><h2>매월 필요한 생활비</h2>'+kv('기본 생활비',money(p.living))+kv('여행 예산',money(p.travel))+kv('의료 지출',money(p.medical))+kv('건강보험 예상액',money(p.health))+'<div class="kv total"><span>월 합계 · 대출 이자/세금 별도</span><strong>'+money(p.living+p.travel+p.medical+p.health)+'</strong></div></section></div>';
 html+='<div class="grid two"><section class="card"><div class="sectionhead"><h2>연금·수입의 시작</h2><a class="textlink" href="#/pension">연금 계획</a></div>'+state.assets.filter(a=>a.type==='PENSION').map(assetRow).join('')+'</section><section class="card"><div class="sectionhead"><h2>목돈과 특별 지출</h2>'+button('＋ 추가','event-add')+'</div>'+(state.events.length?state.events.map(e=>eventRow({...e,kind:'custom'})).join(''):'<p class="muted">등록된 일회성 일정이 없습니다.</p>')+'</section></div>';
 if(!state.complete)html=html.replace('<div class="grid two">',note('현재는 입력 전 상태입니다. 계획 입력 수정에서 예시 값을 적용한 뒤 자산을 추가해 보세요.',true)+'<div class="grid two">');return html;
}
function analysisToolbar(){return '<div class="toolbar"><label>선택 연도<select id="analysisYear">'+Array.from({length:11},(_,i)=>2030+i).map(y=>'<option value="'+y+'" '+(y===analysisYear?'selected':'')+'>'+y+'년</option>').join('')+'</select></label><label>살펴볼 계획<select id="analysisScenario">'+scenarios().map(s=>'<option value="'+s.id+'" '+(s.id===scenario?'selected':'')+'>'+s.name+'</option>').join('')+'</select></label><span class="badge">'+state.revision+'번째 예시 입력 반영</span></div>';}
function yearTable(result){return '<div class="tablewrap"><table><caption>단위: 만원 · 외부 수입과 계좌 원금 인출을 구분합니다.</caption><thead><tr><th>연도</th><th>외부 수입/연</th><th>IRP 인출/연</th><th>반복수지/월</th><th>목돈 순흐름/연</th><th>연말 현금</th><th>미충당액/연</th></tr></thead><tbody>'+result.years.map(y=>'<tr class="'+(y.year===analysisYear?'selected':'')+'"><td><button data-action="year-detail" data-year="'+y.year+'">'+y.year+'년</button></td><td>'+money(y.income)+'</td><td>'+money(y.drawdown)+'</td><td class="'+(y.regular<0?'negative':'')+'">'+signed(y.regular/12)+'</td><td>'+signed(y.eventNet)+'</td><td>'+money(y.closing)+'</td><td class="'+(y.shortage?'negative':'')+'">'+money(y.shortage)+'</td></tr>').join('')+'</tbody></table></div>';}
function analysisPage(q){
 const tab=q.get('tab')||'overview';let html=heading('RETIREMENT OUTLOOK','계획을 숫자로 확인하기','한 번 계산한 결과에서 내역과 원천 입력까지 이어집니다.','기존 분석 → 연도별·현금흐름 → 통합 분석',link('계획 수정','plan'));
 html+='<div class="tabs">'+[['overview','한눈에'],['period','연도·월별'],['compare','계획 비교'],['advanced','고급 전략']].map(([k,l])=>'<a class="'+(tab===k?'active':'')+'" href="#/analysis?tab='+k+'">'+l+'</a>').join('')+'</div>';
 if(tab==='advanced')return html+'<div class="grid two"><a class="card guidecard" href="#/pension"><span class="asseticon PENSION">◷</span><h2>연금 수령 설계</h2><p class="muted small">지급권과 계좌 인출, 소유자별 수령 시점을 함께 확인합니다.</p><span class="textlink">연금 전체 보기 →</span></a><a class="card guidecard" href="#/corp"><span class="asseticon">▦</span><h2>법인 활용 비교</h2><p class="muted small">기본 은퇴계획과 분리된 고급 전략 화면입니다. 실제 세무 검증 범위가 필요합니다.</p><span class="textlink">고급 비교 화면 보기 →</span></a></div>'+note('연금은 별도 연동 버튼 없이 기본 분석에 포함됩니다. 법인은 사용자가 고급 전략으로 선택할 때만 검토합니다.');
 if(!state.complete)return html+emptyView('아직 분석할 입력이 부족합니다','자산·수입·생활비를 입력하거나 사용자 예시를 바꿔 화면 흐름을 확인해 보세요.',link('계획 입력','plan',true));
 if(!scenarios().some(s=>s.id===scenario))scenario='base';const result=simulate(state,scenario),y=result.years.find(y=>y.year===analysisYear);html+=analysisToolbar();
 if(tab==='compare'){
  const baseline=simulate(state,'base'),altMode=scenario==='base'?(isRebuild()?'delay':'expense'):scenario,alt=simulate(state,altMode),other=scenarios().find(s=>s.id===altMode).name;
  html+='<div class="grid two"><section class="card"><span class="eyebrow">BASELINE</span><h2>기본 계획</h2>'+kv('최초 미충당 월',baseline.firstShortfall?dateLabel(baseline.firstShortfall):'예시 기간 내 없음')+kv(analysisYear+'년 말 현금',money(baseline.years.find(y=>y.year===analysisYear).closing))+'</section><section class="card"><span class="eyebrow">WHAT IF</span><h2>'+other+'</h2>'+kv('최초 미충당 월',alt.firstShortfall?dateLabel(alt.firstShortfall):'예시 기간 내 없음')+kv(analysisYear+'년 말 현금',money(alt.years.find(y=>y.year===analysisYear).closing))+'</section></div>';
  html+='<section class="card"><h2>같은 입력에서 달라지는 것</h2>'+note(altMode==='delay'?'준공을 12개월 늦추고 연결된 분담금·임대 시작·임시 거주 기간을 이동합니다. 세금은 두 안에서 같은 수동 예상액을 유지합니다.':'기본 생활비에만 10%를 더합니다. 여행·의료·세금·수입은 그대로 유지합니다.')+'<div class="tablewrap"><table><thead><tr><th>연도</th><th>기본안 현금</th><th>'+other+' 현금</th><th>차이</th></tr></thead><tbody>'+baseline.years.map((b,i)=>'<tr><td>'+b.year+'</td><td>'+money(b.closing)+'</td><td>'+money(alt.years[i].closing)+'</td><td>'+signed(alt.years[i].closing-b.closing)+'</td></tr>').join('')+'</tbody></table></div></section>';return html;
 }
 html+='<div class="grid four">'+metric('세후 반복 수지/월',signed(y.regular/12),'원금 인출 포함 · 구성 확인','analysis-detail','regular',y.regular<0)+metric('선택 연도 말 현금',pretty(y.closing),'기초부터 기말까지','analysis-detail','closing')+metric('연간 세금 예상',money(y.tax),'입력 근거와 납부월','analysis-detail','tax')+metric('최초 미충당 월',result.firstShortfall?dateLabel(result.firstShortfall):'기간 내 없음','2030~2040 예시 범위','analysis-detail','shortage',!!result.firstShortfall)+'</div>';
 if(tab==='period')return html+'<section class="card"><h2>연도별 현금흐름</h2>'+yearTable(result)+'</section>'+note('연도를 누르면 12개월의 실제 예시 현금 흐름이 열립니다. 현금이 부족하면 미충당액으로 표시하며 투자자산을 자동 매각하지 않습니다.');
 html+='<div class="grid split"><section class="card"><div class="sectionhead"><h2>언제 현금이 줄어드나요?</h2><a class="textlink" href="#/analysis?tab=period">전체 내역</a></div>'+chart(result)+'</section><section class="card"><h2>'+analysisYear+'년을 만드는 항목</h2>'+kv('외부 수입',money(y.income))+kv('IRP 원금 인출',money(y.drawdown))+kv('반복 수지 · 세금 포함',signed(y.regular))+kv('일회성 순흐름',signed(y.eventNet))+button('월별 내역 확인','year-detail','data-year="'+analysisYear+'"')+'</section></div>';
 html+='<section class="card"><h2>다음으로 확인할 선택</h2><div class="grid two"><div class="insight"><strong>생활비가 지금보다 늘어난다면?</strong><p>기본 생활비 10% 증가안으로 현금 부족 시점의 변화를 볼 수 있습니다.</p>'+button('생활비 증가안 보기','set-scenario','data-mode="expense"')+'</div>'+(isRebuild()?'<div class="insight"><strong>준공 일정이 1년 늦어진다면?</strong><p>분담금·임대 시작·거주비의 연결을 확인합니다.</p>'+button('준공 지연안 보기','set-scenario','data-mode="delay"')+'</div>':'<div class="insight"><strong>연금 수령 시점이 맞나요?</strong><p>시작 전 지급권과 실제 인출 계좌를 구분해 보세요.</p>'+link('연금 수령 계획','pension')+'</div>')+'</div></section>';return html;
}
function pensionPage(){
 let html=heading('PENSION PLANNING','연금 수령 설계','원금이 있는 계좌와 매달 지급받는 권리를 구분합니다.','기존 자산 → 연금 + 분석 → 연금시뮬',button('＋ 연금 추가','asset-add','data-type="PENSION"',true));
 const pensions=state.assets.filter(a=>a.type==='PENSION');if(!pensions.length)return html+emptyView('등록된 연금이 없습니다','국민연금 지급권과 IRP·연금저축 계좌를 구분해 추가해 보세요.',button('연금 추가','asset-add','data-type="PENSION"',true));
 const r=simulate(),year=r.years.find(y=>y.year===analysisYear);
 html+='<div class="grid three">'+metric('연금계좌 초기 원금',pretty(pensions.filter(a=>a.kind==='irp').reduce((n,a)=>n+a.value,0)),'국민연금 지급권 제외','metric','pensionPrincipal')+metric('등록된 월 지급·인출 목표',money(pensions.reduce((n,a)=>n+a.monthly,0)),'개시 전 원천 포함','pension-help')+metric(analysisYear+'년 실제 IRP 인출',year?money(year.drawdown):'—','가용 원금 한도 적용','analysis-detail','regular')+'</div>';
 html+='<section class="card"><div class="sectionhead"><h2>원천별 명의와 시작 시점</h2><a class="textlink" href="#/analysis">전체 현금에 반영된 결과</a></div>'+pensions.map(assetRow).join('')+'</section><div class="grid two"><section class="card"><h2>소유자별 지급·인출 목표</h2>'+['본인',...(state.household.spouse?['배우자']:[])].map(person=>kv(person,money(pensions.filter(a=>a.owner===person).reduce((n,a)=>n+a.monthly,0))+'/월')).join('')+'<p class="small muted">모든 원천이 개시된 후의 등록 목표 합계입니다. 실제 연도별 금액은 시작 시점과 잔액에 따라 달라집니다.</p></section><section class="card"><h2>원금이 다 사용되면?</h2><p class="muted">IRP 원금은 지급한 만큼 감소합니다. 이 예시에서는 수익률 0%로 계산하며 원금이 소진되면 지급을 멈춥니다.</p>'+link('연도별 수입·인출 확인','analysis?tab=period',true)+'</section></div>';return html;
}
function corpPage(){return heading('ADVANCED STRATEGY','법인 활용 비교','가구의 기본 계획과 분리해서 검토하는 고급 기능입니다.','기존 분석 → 법인시뮬 → 고급 전략',link('← 분석','analysis?tab=advanced'))+note('화면과 입력 구조를 검토하는 영역입니다. 법인세·급여·보험·설립비·유지비·개인 정산을 검증한 계산 엔진은 연결되지 않았으며, 기본 은퇴 전망에도 반영하지 않습니다.',true)+'<div class="grid two"><section class="card"><h2>법인 자금과 운용 가정</h2><form id="corpForm"><div class="formgrid">'+field('출자·대여 자금 합계 (만원)','capital',30000)+field('배당 수익 가정 (%)','yield',3,'number','min="0" max="30" step="0.1"')+field('연간 급여 총액 (만원)','salary',240)+field('연 유지비 (만원)','cost',120)+'</div><div class="formactions"><button class="btn primary" type="submit">단순 구조 미리보기</button></div></form></section><section class="card"><h2>법인과 개인의 자금 경계</h2><div id="corpResult"><p class="muted">왼쪽 예시 가정을 적용하면 세금 전 자금 관계를 볼 수 있습니다.</p></div>'+note('법인에 출자한 원금은 개인의 생활 현금과 같은 돈이 아닙니다. 급여·배당·대여금 반환으로 실제 지급된 돈만 가구 유입으로 연결해야 합니다.')+'</section></div><section class="card"><h2>실제 비교 결과에 필요한 항목</h2><div class="grid three"><div><h3>법인 내부</h3><p class="muted small">운용수익·급여·사업주 비용·법인세·유지비·유보금</p></div><div><h3>가구에 지급</h3><p class="muted small">세전 지급액·원천징수·대여금 상환·실수령액</p></div><div><h3>개인 보유안과 비교</h3><p class="muted small">같은 원금·기간·수익 가정에서 세후 생활자금 비교</p></div></div></section>';}
function settingsPage(){return heading('SETTINGS','설정 · 데이터 관리','가구와 예시 데이터를 관리하고 화면 검토를 이어갑니다.','기존 설정 → 홈 상단 설정으로 이동',link('전체 화면 안내','guide'))+'<div class="grid two"><section class="card"><h2>기본 정보</h2>'+kv('계획 이름',esc(state.plan.name))+kv('가구 구성',state.household.spouse?'본인 + 배우자':'본인 1명')+kv('은퇴 상태',!state.complete?'미입력':state.plan.alreadyRetired?'이미 은퇴':'은퇴 준비 중')+button('가구·명의 설정','household-edit')+button('은퇴계획 입력 수정','plan-edit')+'</section><section class="card"><h2>다른 사용자라면 어떻게 보일까요?</h2><p class="muted">부동산 없는 사용자, 임대인, 재건축 보유자, 은퇴한 1인 가구와 미입력 상태를 전환할 수 있습니다.</p>'+button('사용자 예시 바꾸기','profiles','',true)+'</section></div><div class="grid two"><section class="card"><h2>예시 데이터 내보내기</h2><p class="muted small">이 창에서 바꾼 가상 자산·계획만 JSON 파일로 내려받습니다. 실제 앱 백업과는 형식이 다릅니다.</p>'+kv('자산',state.assets.length+'건')+kv('별도 일정',state.events.length+'건')+kv('편집 반영',state.revision+'번째')+button('예시 JSON 내려받기','export','',true)+'</section><section class="card"><h2>데이터 복원 흐름</h2><p class="muted small">실제 제품에서는 파일 검사 → 변경 내역 확인 → 복원 → 결과 검증으로 진행합니다.</p>'+button('복원 화면 미리보기','restore-preview')+note('이 시제품은 실제 데이터 가져오기·삭제·클라우드 연결을 수행하지 않습니다.')+'</section></div><section class="card"><div class="sectionhead"><h2>시제품 정보</h2>'+badge('네트워크 연결 없음')+'</div>'+kv('저장 범위','열린 창의 메모리 · 새로고침 시 초기화')+kv('계산 범위','2030~2040 · 단순 월별 예시')+kv('세금·건보','고정 예상액 · 실제 법규 계산 아님')+'<div class="actions">'+button('현재 사용자 예시 초기화','reset')+'<a class="textlink" href="05-implementation-spec.md">전체 적용 명세</a></div></section>';}
function guidePage(){
 const cards=[['01','홈','기존 통합 자산 대시보드','은퇴 전망, 현재 자산, 다음 일정과 필요한 확인을 한 곳에.','home'],['02','자산 목록·상세','기존 자산 및 유형별 페이지','모든 자산 유형을 탐색하고 평가액·명의·분석 연결을 편집.','assets'],['03','생활·은퇴 계획','기존 분석 → 은퇴준비','가구·은퇴 시점·생활비를 수정하고 분석 반영 확인.','plan'],['04','예정 일정','기존 목돈·긴급자금·부동산 일정','연금·임대·준공·목돈 일정을 한 타임라인에서 편집.','plan?tab=events'],['05','분석 한눈에','기존 분석 → 연도별','세후 수지·기말 현금·세금·최초 미충당 월 확인.','analysis'],['06','연도·월 상세','기존 분석 → 현금흐름','연도에서 월, 월에서 거래와 원천 자산으로 이동.','analysis?tab=period'],['07','계획 비교','분석의 새로운 공통 기능','생활비 증가, 해당하는 경우 준공 지연을 비교.','analysis?tab=compare'],['08','연금 수령 설계','기존 연금 페이지 + 연금시뮬','지급권과 계좌 원금, 소유자, 시작 시점을 함께 확인.','pension'],['09','법인 활용 비교','기존 분석 → 법인시뮬','기본 계획과 분리된 고급 비교 화면. 세무 엔진은 미연결.','corp'],['10','설정·백업','기존 하단 설정','가구 정보, 사용자 예시, 내보내기·복원 화면 확인.','settings']];
 return heading('FULL APP WALKTHROUGH','전체 화면을 먼저 둘러보세요','이제 아래 모든 화면이 실제로 연결됩니다. 메뉴를 눌러 개편 흐름을 판단해 보세요.','기존 화면 ↔ 수정 후 화면 대응')+'<section class="hero"><div><h2>홈 → 자산 입력 → 계획 → 분석.<br>하나의 흐름으로 바꿨습니다.</h2><p class="muted small">먼저 자산의 금액이나 생활비를 바꿔보세요. 같은 예시 입력이 다른 화면에도 반영됩니다.</p><div class="actions">'+link('홈부터 시작 →','home',true)+' '+button('다른 사용자로 보기','profiles')+'</div></div><div class="herofigure"><span class="small">권장 확인 순서</span><strong>자산 → 계획 → 분석</strong><span class="muted small">홈 상단 설정에서 예시를 바꿀 수 있어요.</span></div></section><div class="grid two">'+cards.map(([n,title,old,desc,path])=>'<a class="card clickable guidecard" href="#/'+path+'"><span class="number">SCREEN '+n+'</span><h2>'+title+'</h2><span class="old">'+old+' →</span><p class="muted small">'+desc+'</p><span class="textlink">화면 열기 →</span></a>').join('')+'</div><section class="card"><h2>유형별 자산 화면도 확인할 수 있습니다</h2><div class="chips">'+Object.keys(TYPES).map(type=>'<a href="#/assets?type='+type+'" data-filter="'+type+'">'+TYPES[type].name+'</a>').join('')+'</div>'+note('이 시제품은 실제 앱 교체본이 아닙니다. 편집·저장은 가상 예시의 메모리에 적용되며 새로고침하면 초기화됩니다. 실제 세무 계산, 금융기관 연결, 영구 저장·복원은 구현하지 않았습니다.',true)+'</section>';
}
function field(label,name,value,type='number',attrs='min="0" step="0.1"',full=false){return '<label class="field '+(full?'full':'')+'"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?attrs:'')+' required></label>';}
function selectField(label,name,options,value){return '<label class="field"><span>'+label+'</span><select name="'+name+'">'+options.map(([v,l])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';}
function formFooter(){return '<p class="formerror" id="formError" role="alert"></p><div class="formactions"><button type="button" data-action="close">취소</button><button class="btn primary" type="submit">예시에 적용</button></div><p class="small muted">실제 데이터는 변경하지 않습니다. 이 창의 예시에만 반영됩니다.</p>';}
function openModal(title,body){el('modalTitle').textContent=title;el('modalBody').innerHTML=body;if(!el('modal').open)el('modal').showModal();}
function planEditor(){const p=state.plan;openModal('가구·은퇴·생활비 수정','<form id="planForm"><div class="formgrid">'+field('계획 이름','name',p.name,'text','',true)+selectField('가구 구성','spouse',[['yes','본인 + 배우자'],['no','본인 1명']],p.spouse?'yes':'no')+selectField('은퇴 상태','retired',[['no','은퇴 준비 중'],['yes','이미 은퇴']],p.alreadyRetired?'yes':'no')+field('은퇴 시점','retirement',p.retirement,'month')+field('은퇴 전 월 근로 수입 (만원)','salary',p.salary)+field('월 기본 생활비 (만원)','living',p.living)+field('월 여행 예산 (만원)','travel',p.travel)+field('월 의료 지출 (만원)','medical',p.medical)+field('월 건강보험 예상액 (만원)','health',p.health)+field('연간 세금 예상액 (만원)','tax',p.tax)+'</div>'+formFooter()+'</form>');}
function assetFields(type,a){
 let html='';if(type==='REAL_ESTATE')html=selectField('부동산 상태','kind',[['home','일반 자가'],['rental','임대 운영'],['rebuild','재건축 진행']],a.kind||'home')+field('대출 잔액 (만원)','debt',a.debt||0)+field('대출 금리 · 연 (%)','rate',a.rate||0,'number','min="0" max="100" step="0.1"')+field('받은 보증금 · 반환부채 (만원)','deposit',a.deposit||0)+'<div id="propertyExtra" class="field full"></div>';
 if(type==='STOCK')html=field('계좌 이름','account',a.account||'일반 투자계좌','text')+field('연 배당 가정 (%)','yield',a.yield||0,'number','min="0" max="100" step="0.1"');
 if(type==='PENSION')html=selectField('연금 종류','kind',[['national','국민연금 등 외부 지급권'],['irp','IRP·연금저축 계좌 인출']],a.kind||'national')+field('월 지급·인출 목표 (만원)','monthly',a.monthly||0)+field('수령 시작','start',a.start||'2032-01','month');
 return html;
}
let editingAsset=null;
function assetEditor(id=null,type='SAVINGS'){
 const a=id?state.assets.find(a=>a.id===id):{type,name:'',value:0,owner:'본인'};if(!a)return;editingAsset=clone(a);
 openModal(id?'자산 입력 수정':'새 자산 추가','<form id="assetForm" data-id="'+esc(id||'')+'"><div class="formgrid">'+selectField('자산 유형','type',Object.keys(TYPES).map(t=>[t,TYPES[t].name]),a.type)+selectField('명의','owner',[['본인','본인'],...(state.household.spouse?[['배우자','배우자'],['공동','공동']]:[])],a.owner)+field('자산 이름','name',a.name,'text','',true)+field('현재 평가액/계좌 잔액 (만원)','value',a.value)+'<div class="field full"><p class="muted small">국민연금 등 지급권의 평가액은 0으로 둡니다. 월 지급액은 아래에서 입력합니다.</p></div><div class="field full"><div class="formgrid" id="assetSpecific">'+assetFields(a.type,a)+'</div></div></div>'+formFooter()+'</form>');renderPropertyExtra();
 if(id)el('assetForm').elements.type.disabled=true;
}
function renderPropertyExtra(){const f=el('assetForm');if(!f||f.elements.type.value!=='REAL_ESTATE')return;const a=editingAsset||{},kind=f.elements.kind.value;let html='';if(kind==='rental')html=field('월 임대 수입 (만원)','rent',a.rent||0)+field('임대 시작','rentStart',a.rentStart||'2030-01','month');if(kind==='rebuild')html=field('준공 예상','completion',a.completion||'2033-09','month')+field('완공 후 예상 시가 (만원)','futureValue',a.futureValue||0)+field('준공 시 잔여 분담금 (만원)','contribution',a.contribution||0)+field('준공 전 월 임시 거주비 (만원)','tempRent',a.tempRent||0)+field('준공 다음 달부터 월 임대액 (만원)','rent',a.rent||0);el('propertyExtra').innerHTML=html?'<div class="formgrid">'+html+'</div>':'';}
function eventEditor(id=null){const e=state.events.find(e=>e.id===id)||{name:'',date:'2034-01',amount:0,direction:'out'};openModal(id?'목돈·지출 일정 수정':'목돈·지출 일정 추가','<form id="eventForm" data-id="'+esc(id||'')+'"><div class="formgrid">'+field('일정 이름','name',e.name,'text','',true)+field('예정 시점','date',e.date,'month')+selectField('흐름','direction',[['out','일회성 지출'],['in','외부 목돈 수령']],e.direction)+field('금액 (만원)','amount',e.amount)+'</div>'+note('계좌 간 이전·보증금 반환·대출 원금 상환은 일반 소득·소비와 다릅니다. 이 폼은 예시의 외부 목돈/지출만 추가합니다.')+formFooter()+'</form>');}
function annualDetail(key){
 const result=simulate(state,scenario),y=result.years.find(y=>y.year===analysisYear);if(!y)return;
 const months=result.months.filter(m=>m.year===analysisYear),lines=months.flatMap(m=>m.lines);let title='',body='';
 if(key==='regular'){
  title=analysisYear+'년 반복 수지의 구성';const grouped=new Map();for(const l of lines.filter(l=>l.category!=='event')){const k=l.label;const g=grouped.get(k)||{...l,amount:0};g.amount+=l.amount;grouped.set(k,g);}
  body='<p class="muted small">연간 합계입니다. 원천 자산 이름을 누르면 입력으로 이동합니다.</p>'+Array.from(grouped.values()).map(l=>'<div class="kv"><span>'+(l.assetId?'<a class="textlink" href="#/asset/'+l.assetId+'">'+esc(l.label)+'</a>':esc(l.label))+'</span><strong>'+signed(l.amount)+'</strong></div>').join('')+kv('연 반복 수지',signed(y.regular))+kv('12개월 월평균',signed(y.regular/12))+note('IRP 원금 인출은 외부 수입과 구분합니다. 일회성 사건은 이 합계에서 제외했습니다.');
 }
 if(key==='closing'){title=analysisYear+'년 현금의 변화';body=kv('연초 현금',money(y.opening))+kv('반복수지 · 인출/세금 포함',signed(y.regular))+kv('일회성 순흐름',signed(y.eventNet))+kv('충당하지 못해 출금되지 않은 금액',money(y.shortage))+kv('연말 현금',money(y.closing))+note('기말 현금 = 기초 현금 + 계획상 순흐름 + 미충당액. 미충당액은 수입이 아니라 지출하지 못한 부족분이며, 0원으로 잘린 현금 뒤에 숨기지 않습니다.',!!y.shortage);}
 if(key==='tax'){title=analysisYear+'년 세금 예상액';body=kv('원천','계획 → 가정·예상액')+kv('연간 입력액',money(state.plan.tax))+kv('예시 납부월',analysisYear+'.12')+kv('자동 세법 적용','시제품에서는 없음')+note('재산세·소득세 등의 자동 계산 결과가 아닙니다. 실제 제품에서는 세목별 원천과 규칙을 연결해야 합니다.',true)+button('입력 예상액 수정','plan-edit');}
 if(key==='shortage'){title='현금 부족이 발생하는 시점';body=kv('최초 미충당 월',result.firstShortfall?dateLabel(result.firstShortfall):'2030~2040년 내 없음')+kv('예시 기간 누적 미충당액',money(result.unmet))+note('현금과 정해진 IRP 인출만 사용했습니다. 일반 주식·부동산을 자동 매각하거나 새 대출을 만들지 않습니다. 최초 미충당은 은퇴 전체 기간의 실패확률이 아닙니다.');if(result.firstShortfall)body+=button('첫 부족월 내역','month-detail','data-date="'+result.firstShortfall+'"');}
 openModal(title,body+'<div class="formactions">'+button('선택 연도의 월별 내역','year-detail','data-year="'+analysisYear+'"')+'</div>');
}
function yearDetail(year){analysisYear=year;const rows=simulate(state,scenario).months.filter(m=>m.year===year);if(!rows.length)return;openModal(year+'년 · 12개월 현금 흐름','<div class="tablewrap"><table><caption>단위: 만원 · 월을 눌러 거래별 내역 확인</caption><thead><tr><th>월</th><th>시작 현금</th><th>계획상 순흐름</th><th>미충당</th><th>기말 현금</th></tr></thead><tbody>'+rows.map(m=>'<tr><td><button data-action="month-detail" data-date="'+m.date+'">'+m.month+'월</button></td><td>'+money(m.opening)+'</td><td>'+signed(m.net)+'</td><td class="'+(m.shortage?'negative':'')+'">'+money(m.shortage)+'</td><td>'+money(m.closing)+'</td></tr>').join('')+'</tbody></table></div>'+note('목돈은 발생한 월에, 입력 세금은 예시의 12월에 반영합니다. 각 행은 같은 계산 결과를 사용합니다.'));}
function monthDetail(date){const row=simulate(state,scenario).months.find(m=>m.date===date);if(!row)return;openModal(dateLabel(date)+' · 현금의 실제 구성',kv('기초 현금',money(row.opening))+row.lines.map(l=>'<div class="kv"><span>'+(l.assetId?'<a class="textlink" href="#/asset/'+l.assetId+'">'+esc(l.label)+' ↗</a>':esc(l.label))+'</span><strong class="'+(l.amount<0?'negative':'positive')+'">'+signed(l.amount)+'</strong></div>').join('')+kv('미충당 지출',money(row.shortage))+kv('기말 현금',money(row.closing))+'<div class="formactions">'+button('← 연도 내역','year-detail','data-year="'+row.year+'"')+'</div>');}
function assetFlows(id){const a=state.assets.find(a=>a.id===id);if(!a)return;const selected=scenarios().find(s=>s.id===scenario)||scenarios()[0];const rows=simulate(state,selected.id).months.filter(m=>m.year===analysisYear).flatMap(m=>m.lines.filter(l=>l.assetId===id).map(l=>({...l,date:m.date})));openModal(a.name+' · '+analysisYear+'년 반영 내역 · '+selected.name,rows.length?rows.map(l=>kv(dateLabel(l.date)+' '+l.label,signed(l.amount))).join(''):note(state.complete?'선택 연도에 현금으로 발생하는 항목이 없습니다. 평가 자산으로만 보유하거나 지급 시작 전일 수 있습니다.':'계획 입력이 부족해 미래 현금 내역은 아직 계산하지 않았습니다.'));}
function metricDetail(key){
 const t=totals();let title='현재 자산 구성',body='';
 if(key==='cash'){title='시작 생활자금의 원천';body=state.assets.filter(a=>a.type==='SAVINGS').map(assetRow).join('')+kv('2030년 1월 시작 현금',money(t.cash));}
 else if(key==='debt'){title='대출과 보증금 반환 의무';body=state.assets.filter(a=>(a.debt||0)+(a.deposit||0)>0).map(a=>'<a class="listrow" href="#/asset/'+a.id+'"><div class="grow"><strong>'+esc(a.name)+'</strong><span class="muted small">대출 '+money(a.debt||0)+' / 보증금 '+money(a.deposit||0)+'</span></div><strong>'+money((a.debt||0)+(a.deposit||0))+'</strong></a>').join('')+kv('현재 총부채',money(t.debt));}
 else if(key==='pensionPrincipal'){title='연금계좌 원금';body=state.assets.filter(a=>a.type==='PENSION'&&a.kind==='irp').map(assetRow).join('');}
 else body=state.assets.filter(a=>a.value>0).map(assetRow).join('')+kv('평가 자산',pretty(t.total))+kv('부채',pretty(t.debt))+kv('순자산',pretty(t.net));
 openModal(title,body||note('해당하는 원천이 없습니다.'));
}
function profilesModal(){openModal('어떤 사용자의 화면을 볼까요?','<p class="muted small">검토용 예시 선택입니다. 실제 앱은 입력 데이터로 필요한 화면을 구성합니다. 예시를 전환하면 현재 편집 내용은 초기화됩니다.</p>'+Object.entries(PROFILE_NAMES).map(([id,name])=>'<button class="listrow rowbutton" data-action="choose-profile" data-profile="'+id+'"><div class="grow"><strong>'+name+'</strong><span class="muted small">'+(id==='empty'?'입력 전·빈 상태':id==='rebuild'?'준공·임대·분담금 흐름':id==='single'?'배우자·은퇴 연기 없음':'자산·계획·분석을 함께 확인')+'</span></div>'+(id===state.profile?badge('선택됨'):'›')+'</button>').join(''));}
function toast(message){el('toast').textContent=message;el('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el('toast').hidden=true;},3500);}
function changed(message){state.revision++;if(el('modal').open)el('modal').close();render();toast(message+' · 모든 화면의 예시에 반영했습니다.');}
function go(path){const hash='#/'+path;if(location.hash===hash)render();else location.hash=hash;}
function route(){try{const url=new URL((location.hash.slice(1)||'/home'),'https://demo.invalid');return {path:url.pathname.split('/').filter(Boolean).map(decodeURIComponent),q:url.searchParams};}catch{return {path:['home'],q:new URLSearchParams()};}}
function render(){
 const {path,q}=route(),page=path[0]||'home';if(el('modal').open)el('modal').close();
 const navPage=page==='asset'||page==='stocks'||page==='pension'?'assets':page==='corp'?'analysis':page;
 const nav=NAV.map(([id,icon,label])=>'<a href="#/'+id+'" class="navlink '+(navPage===id?'active':'')+'" '+(navPage===id?'aria-current="page"':'')+'><span>'+icon+'</span><span>'+label+'</span></a>').join('');el('desktopNav').innerHTML=nav;el('mobileNav').innerHTML=nav;
 el('breadcrumb').textContent=({home:'홈',assets:'자산',stocks:'자산 / 주식 관리',asset:'자산 / 상세',plan:'계획',analysis:'분석',pension:'연금 수령 설계',corp:'고급 / 법인 활용',settings:'설정',guide:'전체 화면 안내'})[page]||'홈';
 el('revision').textContent=state.revision===1?'가상 예시 · 수정해 볼 수 있어요':'예시 입력 '+state.revision+'번째 반영';
 const views={home:currentHome,stocks:()=>stocksPage(q),assets:()=>assetsPage(q),asset:()=>assetPage(path[1]),plan:()=>planPage(q),analysis:()=>analysisPage(q),pension:pensionPage,corp:corpPage,settings:settingsPage,guide:currentGuide};el('page').innerHTML=(views[page]||currentHome)();
}
function validDate(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=1900&&Number(value.slice(0,4))<=2100;}
function readNumber(data,key){const raw=data.get(key);if(raw===null||String(raw).trim()==='')throw new Error('금액과 비율을 빠짐없이 입력해 주세요.');const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1e10)throw new Error('금액과 비율은 0 이상의 유효한 숫자로 입력해 주세요.');return n;}
function readName(data,key){const value=String(data.get(key)||'').trim();if(!value||value.length>100)throw new Error('이름은 1~100자로 입력해 주세요.');return value;}
function submitForm(event){
 const f=event.target;if(!['planForm','assetForm','eventForm','corpForm','positionForm','householdForm'].includes(f.id))return;event.preventDefault();const d=new FormData(f);
 try{
  if(f.id==='positionForm'){savePositionForm(f,d);return;}
  if(f.id==='householdForm'){saveHousehold(d);return;}
  if(f.id==='planForm'){
   const spouse=d.get('spouse')==='yes';if(!spouse&&state.assets.some(a=>a.owner==='배우자'||a.owner==='공동'))throw new Error('배우자·공동 명의 자산이 있습니다. 먼저 명의를 변경하거나 1인 가구 예시로 전환해 주세요.');
   const retirement=String(d.get('retirement'));if(!validDate(retirement))throw new Error('은퇴 시점을 확인해 주세요.');
   const next={...state.plan,name:readName(d,'name'),retirement,spouse,alreadyRetired:d.get('retired')==='yes'};for(const k of ['salary','living','travel','medical','health','tax'])next[k]=readNumber(d,k);
   state.plan=next;state.household={spouse};state.complete=true;changed('계획을 수정했습니다');
  }
  if(f.id==='assetForm'){
   const id=f.dataset.id,old=state.assets.find(a=>a.id===id),type=old?old.type:String(d.get('type'));if(!TYPES[type])throw new Error('자산 유형을 확인해 주세요.');
   const owner=String(d.get('owner'));if(!['본인',...(state.household.spouse?['배우자','공동']:[])].includes(owner))throw new Error('명의를 확인해 주세요.');
   const a={...(old||{}),id:id||'asset-'+Date.now(),type,owner,name:readName(d,'name'),value:readNumber(d,'value'),updated:'2030-01',history:[...(old?.history||[])]};
   if(old?.positions&&old.value!==a.value)throw new Error('종목별 계좌의 평가액은 하위 종목에서 계산합니다. 종목 상세에서 수량을 수정하거나 가상 시세를 갱신하세요.');
   if(old&&old.value!==a.value)a.history.push({value:old.value});
   if(type==='STOCK'){a.account=readName(d,'account');a.yield=readNumber(d,'yield');if(a.yield>100)throw new Error('배당 가정은 0~100%로 입력해 주세요.');}
   if(type==='PENSION'){
    if(owner==='공동')throw new Error('연금은 실제 지급받는 개인 명의를 선택해 주세요.');a.kind=String(d.get('kind'));a.monthly=readNumber(d,'monthly');a.start=String(d.get('start'));if(!validDate(a.start))throw new Error('수령 시작을 확인해 주세요.');if(a.kind==='national')a.value=0;
   }
   if(type==='REAL_ESTATE'){
    a.kind=String(d.get('kind'));for(const k of ['debt','rate','deposit'])a[k]=readNumber(d,k);if(a.rate>100)throw new Error('금리를 확인해 주세요.');
    if(a.kind==='rental'){a.rent=readNumber(d,'rent');a.rentStart=String(d.get('rentStart'));if(!validDate(a.rentStart))throw new Error('임대 시작 시점을 확인해 주세요.');}
    if(a.kind==='rebuild'){a.completion=String(d.get('completion'));if(!validDate(a.completion)||a.completion<'2030-01')throw new Error('공사 중인 예시는 2030년 이후 준공으로 입력해 주세요.');for(const k of ['futureValue','contribution','tempRent','rent'])a[k]=readNumber(d,k);}
   }
   if(old)state.assets=state.assets.map(x=>x.id===id?a:x);else state.assets.push(a);changed('자산 입력을 적용했습니다');
  }
  if(f.id==='eventForm'){
   const date=String(d.get('date'));if(!validDate(date)||date<'2030-01'||date>'2040-12')throw new Error('예시 기간 2030.01~2040.12 안에서 일정을 선택해 주세요.');
   const id=f.dataset.id||'event-'+Date.now(),e={id,name:readName(d,'name'),date,amount:readNumber(d,'amount'),direction:String(d.get('direction')),source:'생활자금'};state.events=state.events.some(x=>x.id===id)?state.events.map(x=>x.id===id?e:x):[...state.events,e];changed('일정을 적용했습니다');
  }
  if(f.id==='corpForm'){const capital=readNumber(d,'capital'),yieldRate=readNumber(d,'yield'),salary=readNumber(d,'salary'),cost=readNumber(d,'cost'),gross=capital*yieldRate/100;el('corpResult').innerHTML=kv('세전 연 운용수입',money(gross))+kv('연 급여 총액',money(salary))+kv('연 유지비',money(cost))+kv('세금·보험 전 잔여',signed(gross-salary-cost))+note('세금·보험·대여금 반환 등을 제외한 단순 구조입니다. 가구의 실수령액이나 법인 활용의 유불리를 판정하지 않습니다.',true);}
 }catch(error){const target=el('formError');if(target)target.textContent=error.message;else toast(error.message);}
}
function exportDemo(){const blob=new Blob([JSON.stringify({app:'retirement-full-ui-demo',version:1,data:state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='retirement-ui-demo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('이 창의 가상 예시를 내보냈습니다.');}
function handleAction(event){
 const filter=event.target.closest('[data-filter]');if(filter){assetFilter=filter.dataset.filter;if(location.hash===filter.getAttribute('href'))render();}
 const b=event.target.closest('[data-action]');if(!b)return;event.preventDefault();const a=b.dataset.action,id=b.dataset.id;
 if(a==='close')el('modal').close();
 else if(a==='household-edit')householdEditor();
 else if(a==='quote-demo'||a==='quote-partial')demoQuote(a==='quote-partial');
 else if(a==='position-edit')positionEditor(b.dataset.account,b.dataset.position);
 else if(a==='profiles')profilesModal();
 else if(a==='choose-profile'){state=sample(b.dataset.profile);scenario='base';assetFilter='all';analysisYear=2032;el('modal').close();go('home');toast(PROFILE_NAMES[state.profile]+' 예시를 열었습니다.');}
 else if(a==='plan-edit')planEditor();
 else if(a==='asset-add')assetEditor(null,b.dataset.type||'SAVINGS');
 else if(a==='asset-edit'||a==='asset-event')assetEditor(id);
 else if(a==='event-add')eventEditor();
 else if(a==='event-edit')eventEditor(id);
 else if(a==='asset-flows')assetFlows(id);
 else if(a==='metric')metricDetail(b.dataset.key);
 else if(a==='pension')go('pension');
 else if(a==='pension-help')openModal('등록 목표와 실제 수령액',note('이 숫자는 아직 개시하지 않은 원천까지 합한 목표입니다. 연도별 분석에서는 실제 수령 시작과 IRP 잔액 한도를 적용합니다.')+link('연도별 실제 금액 확인','analysis?tab=period',true));
 else if(a==='analysis-detail')annualDetail(b.dataset.key);
 else if(a==='year-detail')yearDetail(Number(b.dataset.year));
 else if(a==='month-detail')monthDetail(b.dataset.date);
 else if(a==='select-year'){analysisYear=Number(b.dataset.year);go('analysis?tab=period');}
 else if(a==='set-scenario'){scenario=b.dataset.mode;go('analysis');}
 else if(a==='export')exportDemo();
 else if(a==='restore-preview')openModal('복원 전에 확인할 내용',badge('화면 미리보기')+'<h3>1. 파일 검사</h3><p class="muted small">백업 버전·필수 테이블·원천 연결·금액·날짜를 검증합니다.</p><h3>2. 변경 미리보기</h3>'+kv('현재 자산',state.assets.length+'건')+kv('현재 계획','1건')+'<h3>3. 복원과 되돌리기</h3><p class="muted small">기존 데이터 백업 후 한 번에 적용하고 결과를 대사합니다. 실패하면 기존 데이터로 돌아갑니다.</p>'+note('현재 시제품은 파일을 읽거나 실제 데이터를 교체하지 않습니다.'));
 else if(a==='reset')openModal('현재 예시를 초기화할까요?','<p>이 창에서 편집한 가상 자산·계획을 선택한 사용자 예시의 최초 값으로 되돌립니다.</p><div class="formactions">'+button('취소','close')+button('예시 초기화','confirm-reset','',true)+'</div>');
 else if(a==='confirm-reset'){state=sample(state.profile);scenario='base';assetFilter='all';el('modal').close();render();toast('가상 예시만 초기화했습니다.');}
}
function init(){
 document.addEventListener('click',handleAction);document.addEventListener('submit',submitForm);
 document.addEventListener('change',event=>{
  if(event.target.id==='analysisYear'){analysisYear=Number(event.target.value);render();}
  if(event.target.id==='analysisScenario'){scenario=event.target.value;render();}
  const form=event.target.closest('#assetForm');if(form&&event.target.name==='type'){el('assetSpecific').innerHTML=assetFields(event.target.value,{});editingAsset={};renderPropertyExtra();}
  if(form&&event.target.name==='kind')renderPropertyExtra();
 });
 window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});el('page').focus({preventScroll:true});});
 el('modal').addEventListener('click',event=>{if(event.target!==el('modal'))return;const r=el('modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)el('modal').close();});
 render();
}
if(typeof document!=='undefined')init();
