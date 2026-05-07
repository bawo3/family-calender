/* =========================================
   캘린더 공통 로직 (Vercel KV 백엔드 버전)
   - 3개 HTML(kim-family / jhkim-hyeju / calendar)이 공유
   - 모든 데이터(일정·사용자·공지)는 /api/* 엔드포인트를 통해 KV DB에 저장
   - 자동 로그인용 사용자 이름만 localStorage(`${prefix}_current_user`)에 저장
     (이는 디바이스 단위 정보이므로 공유 불필요)

   사용 방법: HTML에서 window.CAL_CONFIG 를 먼저 정의한 뒤 이 파일 로드
     {
       prefix: 'family',           // localStorage·DB 키 접두사 (필수, 영문/숫자/_)
       title:  '👨‍👩‍👧‍👦 가족 캘린더', // 화면 제목 (필수)
       accent: '#3498db'           // 액센트 색 (옵션)
     }
   ========================================= */
(function(){
  'use strict';

  // -----------------------------------------
  // 1) 설정
  // -----------------------------------------
  const cfg     = window.CAL_CONFIG || {};
  const PREFIX  = cfg.prefix || 'default';
  const TITLE   = cfg.title  || '📅 캘린더';
  const API     = '/api';
  // 자동 로그인 정보(디바이스 한정)는 localStorage 에 보관
  const KEY_CURRENT = `${PREFIX}_current_user`;

  if(cfg.accent){
    const darken = h=>{
      if(!h||!h.startsWith('#')||h.length<7)return h;
      const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
      return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v*0.78))).toString(16).padStart(2,'0')).join('');
    };
    document.documentElement.style.setProperty('--accent', cfg.accent);
    document.documentElement.style.setProperty('--accent-dark', cfg.accentDark || darken(cfg.accent));
    document.documentElement.style.setProperty('--help-border', cfg.accent);
  }

  // -----------------------------------------
  // 2) HTML 구조 + 로딩 오버레이 주입
  // -----------------------------------------
  const HTML_TEMPLATE = `
<div id="loadingOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);color:#fff;display:flex;align-items:center;justify-content:center;z-index:9999;font-size:16px;">⏳ 데이터 로딩 중...</div>

<div class="login-box hidden" id="loginBox">
  <h1 id="loginTitle">${TITLE}</h1>
  <p>이름 입력 → 스킨 · 색상 선택 후 로그인하세요</p>
  <div class="quick-login" id="quickLoginSection">
    <h3>👤 사용자 선택 (탭하면 바로 로그인)</h3>
    <div class="quick-login-list" id="quickLoginList"></div>
  </div>
  <label for="nameInput">이름</label>
  <input type="text" id="nameInput" placeholder="이름을 입력하세요" maxlength="20">
  <label>스킨 선택</label>
  <div class="skin-toggle">
    <div class="skin-btn active" id="skinLight">☀️ 라이트</div>
    <div class="skin-btn" id="skinDark">🌙 다크</div>
  </div>
  <label>색상 선택 (36가지)</label>
  <div class="color-palette" id="colorPalette"></div>
  <div class="selected-color-info">
    <span>선택한 색상:</span>
    <div class="selected-color-swatch" id="selectedSwatch" style="background:#bdc3c7"></div>
    <span id="selectedColorText">선택되지 않음</span>
  </div>
  <button class="login-btn" id="loginBtn" disabled>로그인</button>
</div>

<div class="container hidden" id="calendarBox">
  <div class="cal-header">
    <div class="cal-title-row">
      <h1 class="cal-title" id="calTitle">${TITLE}</h1>
      <div class="user-bar">
        <div class="u-dot" id="userDot"></div>
        <span class="u-name" id="userName"></span>
        <button class="u-btn" id="skinSwitchBtn"></button>
        <button class="u-btn" id="reloadBtn" title="새로고침">🔄</button>
        <button class="u-btn" id="noticeBtn">📢</button>
        <button class="u-btn logout-u-btn" id="logoutBtn">로그아웃</button>
      </div>
    </div>
    <div class="cal-nav-row">
      <button class="nav-btn" id="prevBtn">◀</button>
      <span class="month-label" id="monthLabel"></span>
      <button class="nav-btn" id="nextBtn">▶</button>
      <button class="nav-btn" id="todayBtn">오늘</button>
    </div>
  </div>
  <div id="importantBanner" class="important-banner hidden">
    <div class="b-title">⭐ 중요 일정</div>
    <div id="importantBannerList"></div>
  </div>
  <div class="weekdays">
    <div class="sun">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="sat">토</div>
  </div>
  <div class="days" id="daysGrid"></div>
  <div class="event-panel">
    <h2 id="selectedDateLabel">날짜를 선택하세요</h2>
    <div class="range-info" id="rangeInfo"></div>
    <div class="event-form">
      <span class="time-label">시작</span>
      <select id="eventFrom" class="hour-select" disabled></select>
      <span class="time-label">~ 종료</span>
      <select id="eventTo" class="hour-select" disabled></select>
      <input type="text" id="eventInput" placeholder="일정 내용을 입력하세요" disabled>
      <label class="important-check"><input type="checkbox" id="importantCheck" disabled> ⭐ 중요</label>
      <button id="addBtn" disabled>추가</button>
    </div>
    <ul class="event-list" id="eventList"></ul>
  </div>
</div>

<div class="modal-overlay hidden" id="noticeModal">
  <div class="modal-box">
    <h2>📢 공지사항</h2>
    <textarea id="noticeTextInput" placeholder="공지 내용을 입력하세요..."></textarea>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="noticeCloseBtn">닫기</button>
      <button class="modal-btn primary" id="noticeAddBtn">등록</button>
    </div>
    <div class="notice-list-section">
      <h3>등록된 공지</h3>
      <div id="noticeList"></div>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('afterbegin', HTML_TEMPLATE);

  // -----------------------------------------
  // 3) 상수 / 상태
  // -----------------------------------------
  const COLOR_PALETTE = [
    '#fadbd8','#f5b7b1','#f1948a','#ec7063','#e74c3c','#c0392b',
    '#fdebd0','#fad7a0','#f8c471','#f5b041','#f39c12','#d68910',
    '#fcf3cf','#f9e79f','#f7dc6f','#f4d03f','#f1c40f','#b7950b',
    '#d4efdf','#a9dfbf','#7dcea0','#52be80','#27ae60','#1e8449',
    '#d6eaf8','#aed6f1','#85c1e9','#5dade2','#3498db','#2874a6',
    '#e8daef','#d2b4de','#bb8fce','#a569bd','#8e44ad','#6c3483'
  ];

  let currentDate=new Date(), selectedColor=null, selectedSkin='light';
  let currentUser=null, currentUserColor=null, currentUserSkin='light';
  let selectedStart=null, selectedEnd=null;
  let tapFirst=null; // 1번째 탭 날짜 (null=미선택, string=2번째 탭 대기 중)

  // 메모리 캐시 — DB 호출 결과를 보관해서 렌더 함수는 동기적으로 동작
  const cache = { events:[], users:{}, allUsers:{}, notices:[] };

  // localStorage 폴백 모드 (API/KV 미연결 시 자동 전환)
  let localMode = false;
  const LS_EVENTS  = `${PREFIX}_ls_events`;
  const LS_USERS   = `${PREFIX}_ls_users`;
  const LS_NOTICES = `${PREFIX}_ls_notices`;
  function lsGet(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key))??fallback; }catch{ return fallback; }
  }
  function lsSet(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

  // -----------------------------------------
  // 4) API 헬퍼 + 캐시 동기화
  // -----------------------------------------
  async function fetchJSON(url, opts){
    const r = await fetch(url, opts);
    if(!r.ok){
      let msg='';
      try{ msg=(await r.json()).error||''; }catch(_){}
      throw new Error(`API ${url}: ${r.status} ${msg}`);
    }
    return r.json();
  }
  async function refreshEvents(){
    cache.events = await fetchJSON(`${API}/events?prefix=${encodeURIComponent(PREFIX)}`);
  }
  async function refreshUsers(){
    cache.users = await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}`);
  }
  async function refreshAllUsers(){
    cache.allUsers = await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}&all=1`);
  }
  async function refreshNotices(){
    cache.notices = await fetchJSON(`${API}/notices?prefix=${encodeURIComponent(PREFIX)}`);
  }
  async function refreshAll(){
    if(localMode){
      // 로컬 모드: localStorage에서 읽기
      cache.events  = lsGet(LS_EVENTS,  []);
      cache.users   = lsGet(LS_USERS,   {});
      cache.allUsers = lsGet(LS_USERS,  {});
      cache.notices = lsGet(LS_NOTICES, []);
      return;
    }
    // 병렬로 한 번에 가져와 초기 로딩 시간 단축
    await Promise.all([refreshEvents(), refreshUsers(), refreshAllUsers(), refreshNotices()]);
  }

  // 캐시 읽기 (동기)
  function loadEvents(){ return cache.events; }
  function loadUsers(){ return cache.users; }
  function loadAllUsers(){ return cache.allUsers; }
  function loadNotices(){ return cache.notices; }

  // API 쓰기 (비동기) — 캐시도 즉시 갱신해서 UI 반응 빠르게
  async function apiAddEvent(ev){
    if(localMode){
      const evs=lsGet(LS_EVENTS,[]); evs.push(ev); lsSet(LS_EVENTS,evs);
      cache.events.push(ev); return;
    }
    await fetchJSON(`${API}/events?prefix=${encodeURIComponent(PREFIX)}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(ev)
    });
    cache.events.push(ev);
  }
  async function apiDeleteEvent(id){
    if(localMode){
      const evs=lsGet(LS_EVENTS,[]).filter(e=>e.id!==id); lsSet(LS_EVENTS,evs);
      cache.events=cache.events.filter(e=>e.id!==id); return;
    }
    await fetchJSON(`${API}/events?prefix=${encodeURIComponent(PREFIX)}&id=${encodeURIComponent(id)}`,{method:'DELETE'});
    cache.events = cache.events.filter(e=>e.id!==id);
  }
  async function apiUpsertUser(name,color,skin){
    if(localMode){
      const users=lsGet(LS_USERS,{});
      const oldColor=users[name]?.color;
      users[name]={color,skin}; lsSet(LS_USERS,users);
      // 색상 변경 시 일정 색도 로컬에서 동기화
      if(oldColor&&oldColor!==color){
        const evs=lsGet(LS_EVENTS,[]); let changed=false;
        for(const e of evs){if(e.user===name){e.color=color;changed=true;}}
        if(changed)lsSet(LS_EVENTS,evs);
      }
      cache.users[name]={color,skin}; cache.allUsers[name]={color,skin,fromCurrent:true}; return;
    }
    await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,color,skin})
    });
    cache.users[name] = { color, skin };
    cache.allUsers[name] = { color, skin, fromCurrent:true };
  }
  async function apiAddNotice(n){
    if(localMode){
      const notices=lsGet(LS_NOTICES,[]); notices.unshift(n); lsSet(LS_NOTICES,notices);
      cache.notices.unshift(n); return;
    }
    await fetchJSON(`${API}/notices?prefix=${encodeURIComponent(PREFIX)}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(n)
    });
    cache.notices.unshift(n);
  }
  async function apiDeleteNotice(id){
    if(localMode){
      const notices=lsGet(LS_NOTICES,[]).filter(n=>n.id!==id); lsSet(LS_NOTICES,notices);
      cache.notices=cache.notices.filter(n=>n.id!==id); return;
    }
    await fetchJSON(`${API}/notices?prefix=${encodeURIComponent(PREFIX)}&id=${encodeURIComponent(id)}`,{method:'DELETE'});
    cache.notices = cache.notices.filter(n=>n.id!==id);
  }

  // -----------------------------------------
  // 5) 포맷 / 유틸
  // -----------------------------------------
  function makeId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function formatDate(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function todayStr(){ const t=new Date();return formatDate(t.getFullYear(),t.getMonth(),t.getDate()); }
  function formatTimeRange(f,t){
    const fmt=v=>{
      if(v===''||v==null)return'';
      const s=String(v);
      const h=parseInt(s.includes(':')?s.split(':')[0]:s,10);
      return String(h).padStart(2,'0')+'시';
    };
    return(f&&t)?`${fmt(f)}~${fmt(t)}까지`:f?`${fmt(f)}~`:t?`~${fmt(t)}까지`:'';
  }
  function fillHourOptions(){
    const fromOpts=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')}시</option>`).join('');
    const toOpts  =Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')}시까지</option>`).join('');
    document.getElementById('eventFrom').innerHTML=fromOpts;
    document.getElementById('eventTo').innerHTML=toOpts;
  }
  function minDate(a,b){return a<b?a:b;} function maxDate(a,b){return a>b?a:b;}
  function dateInRange(d,s,e){const lo=minDate(s,e),hi=maxDate(s,e);return d>=lo&&d<=hi;}
  function rangesOverlap(as,ae,bs,be){return as<=be&&bs<=ae;}
  function daysBetween(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
  function applySkin(s){ document.body.classList.toggle('dark',s==='dark'); }

  // -----------------------------------------
  // 6) 로그인 화면 UI
  // -----------------------------------------
  function renderColorPalette(){
    const el=document.getElementById('colorPalette');el.innerHTML='';
    COLOR_PALETTE.forEach(c=>{
      const cell=document.createElement('div');cell.className='color-cell';
      cell.style.background=c;cell.dataset.color=c;
      cell.addEventListener('click',()=>pickColor(c));el.appendChild(cell);
    });
  }
  function pickColor(c){
    selectedColor=c;
    document.querySelectorAll('.color-cell').forEach(el=>el.classList.toggle('active',el.dataset.color===c));
    document.getElementById('selectedSwatch').style.background=c;
    document.getElementById('selectedColorText').textContent=c;
    checkLoginReady();
  }
  function setLoginSkin(s){
    selectedSkin=s;
    document.getElementById('skinLight').classList.toggle('active',s==='light');
    document.getElementById('skinDark').classList.toggle('active',s==='dark');
    applySkin(s);
  }
  function checkLoginReady(){
    document.getElementById('loginBtn').disabled=!(document.getElementById('nameInput').value.trim()&&selectedColor);
  }

  function renderSavedUsers(){
    const users = loadAllUsers();
    const section=document.getElementById('quickLoginSection');
    const list=document.getElementById('quickLoginList');
    list.innerHTML='';const names=Object.keys(users);
    if(!names.length){section.style.display='none';return;}
    section.style.display='';
    const sorted=[...names].sort((a,b)=>(users[b].fromCurrent?1:0)-(users[a].fromCurrent?1:0));
    sorted.forEach(name=>{
      const u=users[name];
      const chip=document.createElement('div');chip.className='saved-user-chip';
      const dot=document.createElement('span');dot.className='dot';dot.style.background=u.color;
      const lbl=document.createElement('span');lbl.textContent=name;
      const icon=document.createElement('span');icon.className='skin-icon';icon.textContent=u.skin==='dark'?'🌙':'☀️';
      chip.appendChild(dot);chip.appendChild(lbl);chip.appendChild(icon);
      chip.addEventListener('click',()=>{
        document.getElementById('nameInput').value=name;
        pickColor(u.color);setLoginSkin(u.skin||'light');login();
      });
      list.appendChild(chip);
    });
  }

  async function login(){
    const name=document.getElementById('nameInput').value.trim();
    if(!name||!selectedColor)return;
    document.getElementById('loginBtn').disabled=true;
    try{
      const prevColor = cache.users[name]?.color;
      await apiUpsertUser(name, selectedColor, selectedSkin);
      // 색상이 바뀐 경우 서버/로컬에서 일정 색까지 자동 동기화 → 캐시 갱신
      if(!localMode && prevColor && prevColor!==selectedColor){
        await refreshEvents();
      }
      localStorage.setItem(KEY_CURRENT,name);
      currentUser=name;currentUserColor=selectedColor;currentUserSkin=selectedSkin;
      showCalendar();
    }catch(e){
      alert(localMode?'로그인 실패: '+e.message:'로그인 실패: 서버 연결을 확인하세요.');
      console.error(e);
      document.getElementById('loginBtn').disabled=false;
    }
  }
  function logout(){
    localStorage.removeItem(KEY_CURRENT);
    currentUser=currentUserColor=null;currentUserSkin='light';
    selectedStart=selectedEnd=null;selectedColor=null;selectedSkin='light';
    document.getElementById('nameInput').value='';
    document.querySelectorAll('.color-cell').forEach(c=>c.classList.remove('active'));
    document.getElementById('selectedSwatch').style.background='#bdc3c7';
    document.getElementById('selectedColorText').textContent='선택되지 않음';
    document.getElementById('loginBtn').disabled=true;
    const evIn=document.getElementById('eventInput');evIn.disabled=true;evIn.value='';
    ['eventFrom','eventTo'].forEach(id=>{const el=document.getElementById(id);el.disabled=true;el.value='0';});
    document.getElementById('importantCheck').checked=false;
    document.getElementById('importantCheck').disabled=true;
    document.getElementById('addBtn').disabled=true;
    setLoginSkin('light');
    document.getElementById('loginBox').classList.remove('hidden');
    document.getElementById('calendarBox').classList.add('hidden');
    renderSavedUsers();
  }

  // -----------------------------------------
  // 7) 캘린더 화면 / 렌더링
  // -----------------------------------------
  function showCalendar(){
    applySkin(currentUserSkin);
    document.getElementById('loginBox').classList.add('hidden');
    document.getElementById('calendarBox').classList.remove('hidden');
    document.getElementById('userName').textContent=currentUser;
    document.getElementById('userDot').style.background=currentUserColor;
    updateSkinSwitchBtn();renderCalendar();renderEventList();
  }
  function updateSkinSwitchBtn(){
    document.getElementById('skinSwitchBtn').textContent=currentUserSkin==='dark'?'☀️':'🌙';
  }

  function renderImportantBanner(){
    const banner=document.getElementById('importantBanner');
    const list=document.getElementById('importantBannerList');
    const today=todayStr();
    const all=loadEvents().filter(ev=>ev.important&&ev.endDate>=today);
    const inProgressEvs=all.filter(ev=>ev.startDate<=today).sort((a,b)=>a.endDate.localeCompare(b.endDate));
    const upcomingEvs=all.filter(ev=>ev.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));
    if(!all.length){banner.classList.add('hidden');return;}
    banner.classList.remove('hidden');list.innerHTML='';
    const makeItem=(ev,isIP)=>{
      const item=document.createElement('div');item.className='b-item'+(isIP?' in-progress':'');
      const badge=document.createElement('span');badge.className='b-user-badge';
      badge.style.background=ev.color||'#95a5a6';badge.textContent=ev.user;
      const ts=formatTimeRange(ev.from,ev.to);
      const text=document.createElement('span');text.textContent=`${ts?ts+' ':''}${ev.text}`;
      const range=document.createElement('span');range.className='b-range';
      range.textContent=ev.startDate===ev.endDate?ev.startDate:`${ev.startDate}~${ev.endDate}`;
      item.appendChild(badge);item.appendChild(text);item.appendChild(range);return item;
    };
    if(inProgressEvs.length){
      const t=document.createElement('div');t.className='b-section-title';
      t.textContent='📍 현재 일정 진행중';list.appendChild(t);
      inProgressEvs.forEach(ev=>list.appendChild(makeItem(ev,true)));
    }
    if(upcomingEvs.length){
      const t=document.createElement('div');t.className='b-section-title'+(inProgressEvs.length?' b-section-gap':'');
      t.textContent='📅 진행 예정 주요 일정';list.appendChild(t);
      upcomingEvs.forEach(ev=>list.appendChild(makeItem(ev,false)));
    }
  }

  function renderCalendar(){
    const year=currentDate.getFullYear(),month=currentDate.getMonth();
    document.getElementById('monthLabel').textContent=`${year}년 ${month+1}월`;
    const firstDay=new Date(year,month,1).getDay(),lastDate=new Date(year,month+1,0).getDate();
    const today=todayStr();
    const events=loadEvents(),grid=document.getElementById('daysGrid');
    grid.innerHTML='';
    for(let i=0;i<firstDay;i++){const e=document.createElement('div');e.className='day empty';grid.appendChild(e);}
    const dragLo=null, dragHi=null; // 호버 프리뷰 제거 (클릭 안정성 우선)
    for(let day=1;day<=lastDate;day++){
      const cell=document.createElement('div');cell.className='day';
      const dateStr=formatDate(year,month,day);cell.dataset.date=dateStr;
      const wd=new Date(year,month,day).getDay();
      if(wd===0)cell.classList.add('sun');if(wd===6)cell.classList.add('sat');
      if(dateStr===today)cell.classList.add('today');
      if(isDragging&&dragLo){
        if(dateStr===dragLo||dateStr===dragHi)cell.classList.add('range-edge');
        else if(dateStr>dragLo&&dateStr<dragHi)cell.classList.add('range');
      }else if(selectedStart&&selectedEnd){
        const lo=minDate(selectedStart,selectedEnd),hi=maxDate(selectedStart,selectedEnd);
        if(selectedStart===selectedEnd&&dateStr===selectedStart)cell.classList.add('selected');
        else if(dateStr===lo||dateStr===hi)cell.classList.add('range-edge');
        else if(dateStr>lo&&dateStr<hi)cell.classList.add('range');
      }
      const num=document.createElement('div');num.className='date-num';num.textContent=day;cell.appendChild(num);

      const dayEvs=events.filter(ev=>dateInRange(dateStr,ev.startDate,ev.endDate));
      const seen=new Set();
      const deduped=dayEvs.filter(ev=>{
        const k=`${ev.startDate}|${ev.endDate}|${ev.text}`;
        if(seen.has(k))return false;seen.add(k);return true;
      });
      deduped.slice(0,2).forEach(ev=>{
        const isMulti=ev.startDate!==ev.endDate;
        let barClass;
        if(!isMulti){barClass='bar-single';}
        else{
          const isFirst=dateStr===ev.startDate||wd===0;
          const isLast=dateStr===ev.endDate||wd===6;
          if(isFirst&&isLast)barClass='bar-span';
          else if(isFirst)barClass='bar-start';
          else if(isLast)barClass='bar-end';
          else barClass='bar-mid';
        }
        const bar=document.createElement('div');
        bar.className=`event-bar ${barClass}`;
        bar.style.background=ev.color||'#95a5a6';
        if(barClass==='bar-single'||barClass==='bar-start'||barClass==='bar-span'){
          const ts=formatTimeRange(ev.from,ev.to);
          bar.textContent=`${ev.important?'⭐ ':''}${ev.user}: ${ts?ts+' ':''}${ev.text}`;
        }
        cell.appendChild(bar);
      });
      if(deduped.length>2){
        const more=document.createElement('div');more.className='event-bar bar-single';
        more.style.background='#95a5a6';more.textContent=`+${deduped.length-2}개 더`;cell.appendChild(more);
      }
      cell.addEventListener('click',(e)=>{
        e.stopPropagation();
        if(tapFirst===null){
          // 1번째 탭: 단일 날짜 선택
          tapFirst=dateStr;
          selectedStart=dateStr;selectedEnd=dateStr;
          activateInputs();updateSelectedLabel();renderCalendar();renderEventList();
        }else{
          // 2번째 탭: 범위 확정
          selectedStart=minDate(tapFirst,dateStr);selectedEnd=maxDate(tapFirst,dateStr);
          tapFirst=null;
          activateInputs();updateSelectedLabel();renderCalendar();renderEventList();
        }
      });
      grid.appendChild(cell);
    }
    renderImportantBanner();
  }

  function activateInputs(){
    ['eventInput','eventFrom','eventTo','importantCheck'].forEach(id=>document.getElementById(id).disabled=false);
    document.getElementById('addBtn').disabled=false;
  }
  function updateSelectedLabel(){
    const label=document.getElementById('selectedDateLabel'),info=document.getElementById('rangeInfo');
    if(!selectedStart){label.textContent='날짜를 선택하세요';info.textContent='';return;}
    if(selectedStart===selectedEnd){
      label.textContent=`${selectedStart} 일정`;
      info.textContent='단일 날짜 선택됨';
    }else{
      label.textContent=`${selectedStart} ~ ${selectedEnd} 기간 일정`;
      info.textContent=`총 ${daysBetween(selectedStart,selectedEnd)+1}일 기간 선택됨`;
    }
  }

  function renderEventList(){
    const list=document.getElementById('eventList');list.innerHTML='';
    if(!selectedStart)return;
    const events=loadEvents();
    const hourOf=v=>{
      if(v===''||v==null)return 9999;
      const s=String(v);
      return parseInt(s.includes(':')?s.split(':')[0]:s,10);
    };
    const matched=events.filter(ev=>rangesOverlap(ev.startDate,ev.endDate,selectedStart,selectedEnd))
      .sort((a,b)=>{
        if(a.startDate!==b.startDate)return a.startDate.localeCompare(b.startDate);
        return hourOf(a.from)-hourOf(b.from);
      });
    if(!matched.length){
      const m=document.createElement('li');m.className='empty-msg';
      m.textContent='등록된 일정이 없습니다.';list.appendChild(m);return;
    }
    matched.forEach(ev=>{
      const li=document.createElement('li');li.style.borderLeftColor=ev.color||'#95a5a6';
      const content=document.createElement('div');content.className='event-content';
      if(ev.important){
        const imp=document.createElement('span');imp.className='event-important-badge';
        imp.textContent='⭐중요';content.appendChild(imp);
      }
      const badge=document.createElement('span');badge.className='event-user';
      badge.style.background=ev.color||'#95a5a6';badge.textContent=ev.user;content.appendChild(badge);
      if(ev.startDate!==ev.endDate){
        const rb=document.createElement('span');rb.className='event-range';
        rb.textContent=`📅 ${ev.startDate} ~ ${ev.endDate}`;content.appendChild(rb);
      }
      const ts=formatTimeRange(ev.from,ev.to);
      if(ts){
        const tb=document.createElement('span');tb.className='event-time';
        tb.textContent=`⏰ ${ts}`;content.appendChild(tb);
      }
      const tx=document.createElement('span');tx.className='event-text';
      tx.textContent=ev.text;content.appendChild(tx);
      const btn=document.createElement('button');btn.className='delete-btn';btn.textContent='삭제';
      btn.addEventListener('click',()=>deleteEvent(ev.id));
      li.appendChild(content);li.appendChild(btn);list.appendChild(li);
    });
  }

  // -----------------------------------------
  // 8) 일정 추가/삭제 (async)
  // -----------------------------------------
  async function addEvent(){
    const input=document.getElementById('eventInput'),text=input.value.trim();
    if(!text||!selectedStart||!selectedEnd)return;
    const from=document.getElementById('eventFrom').value;
    const to  =document.getElementById('eventTo').value;
    const important=document.getElementById('importantCheck').checked;
    if(selectedStart===selectedEnd&&from&&to&&parseInt(to,10)<parseInt(from,10)){
      alert('종료 시간이 시작 시간보다 빠를 수 없습니다.');return;
    }
    const newEv={id:makeId(),user:currentUser,color:currentUserColor,text,startDate:selectedStart,endDate:selectedEnd,from,to,important};
    const addBtn=document.getElementById('addBtn');addBtn.disabled=true;
    try{
      await apiAddEvent(newEv);
      input.value='';
      document.getElementById('eventFrom').value='0';
      document.getElementById('eventTo').value='0';
      document.getElementById('importantCheck').checked=false;
      tapFirst=null;
      renderCalendar();renderEventList();
    }catch(e){
      alert('일정 추가 실패: '+e.message);console.error(e);
    }finally{
      addBtn.disabled=false;
    }
  }
  async function deleteEvent(id){
    const target=cache.events.find(ev=>ev.id===id);if(!target)return;
    const who=target.user!==currentUser?`[${target.user}]님이 등록한 `:'';
    if(!confirm(`${who}"${target.text}" 일정을 삭제하시겠습니까?`))return;
    try{
      await apiDeleteEvent(id);
      renderCalendar();renderEventList();
    }catch(e){
      alert('삭제 실패: '+e.message);console.error(e);
    }
  }

  // -----------------------------------------
  // 9) 공지사항 (async)
  // -----------------------------------------
  function openNoticeModal(){ renderNoticeList();document.getElementById('noticeModal').classList.remove('hidden'); }
  function closeNoticeModal(){
    document.getElementById('noticeModal').classList.add('hidden');
    document.getElementById('noticeTextInput').value='';
  }
  async function addNotice(){
    const text=document.getElementById('noticeTextInput').value.trim();if(!text)return;
    const now=new Date();const pad=n=>String(n).padStart(2,'0');
    const createdAt=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const notice={id:makeId(),user:currentUser,color:currentUserColor,text,createdAt};
    const btn=document.getElementById('noticeAddBtn');btn.disabled=true;
    try{
      await apiAddNotice(notice);
      document.getElementById('noticeTextInput').value='';renderNoticeList();
    }catch(e){
      alert('공지 등록 실패: '+e.message);console.error(e);
    }finally{
      btn.disabled=false;
    }
  }
  async function deleteNotice(id){
    if(!confirm('이 공지를 삭제하시겠습니까?'))return;
    try{
      await apiDeleteNotice(id);renderNoticeList();
    }catch(e){
      alert('공지 삭제 실패: '+e.message);console.error(e);
    }
  }
  function renderNoticeList(){
    const listEl=document.getElementById('noticeList');listEl.innerHTML='';
    const notices=loadNotices();
    if(!notices.length){
      listEl.innerHTML='<p style="color:var(--empty-msg);font-size:13px;padding:8px 0">등록된 공지가 없습니다.</p>';
      return;
    }
    notices.forEach(n=>{
      const item=document.createElement('div');item.className='notice-item';
      item.style.borderLeftColor=n.color||'var(--accent)';
      const del=document.createElement('button');del.className='notice-del';del.textContent='삭제';
      del.addEventListener('click',()=>deleteNotice(n.id));
      const meta=document.createElement('div');meta.className='notice-meta';
      const uSpan=document.createElement('span');uSpan.className='n-user';
      uSpan.style.background=n.color||'#95a5a6';uSpan.textContent=n.user;
      meta.appendChild(uSpan);meta.appendChild(document.createTextNode(` · ${n.createdAt}`));
      const text=document.createElement('div');text.className='notice-text';text.textContent=n.text;
      item.appendChild(del);item.appendChild(meta);item.appendChild(text);
      listEl.appendChild(item);
    });
  }

  // -----------------------------------------
  // 10) 새로고침 (다른 사용자가 추가한 데이터 가져오기)
  // -----------------------------------------
  async function reloadData(){
    const btn=document.getElementById('reloadBtn');
    btn.disabled=true;btn.textContent='⏳';
    try{
      await refreshAll();
      if(currentUser){renderCalendar();renderEventList();}
      else{renderSavedUsers();}
    }catch(e){
      if(!localMode) alert('새로고침 실패: '+e.message);
      console.error(e);
    }finally{
      btn.disabled=false;btn.textContent='🔄';
    }
  }

  // -----------------------------------------
  // 11) 이벤트 바인딩
  // -----------------------------------------
  document.getElementById('skinLight').addEventListener('click',()=>setLoginSkin('light'));
  document.getElementById('skinDark').addEventListener('click',()=>setLoginSkin('dark'));
  document.getElementById('nameInput').addEventListener('input',checkLoginReady);
  document.getElementById('loginBtn').addEventListener('click',login);
  document.getElementById('nameInput').addEventListener('keypress',e=>{
    if(e.key==='Enter'&&!document.getElementById('loginBtn').disabled)login();
  });
  document.getElementById('logoutBtn').addEventListener('click',logout);
  document.getElementById('skinSwitchBtn').addEventListener('click',async()=>{
    currentUserSkin=currentUserSkin==='dark'?'light':'dark';
    applySkin(currentUserSkin);updateSkinSwitchBtn();
    if(cache.users[currentUser]){
      try{ await apiUpsertUser(currentUser, currentUserColor, currentUserSkin); }
      catch(e){ console.error('skin save failed', e); }
    }
  });
  document.getElementById('prevBtn').addEventListener('click',()=>{
    currentDate.setMonth(currentDate.getMonth()-1);renderCalendar();
  });
  document.getElementById('nextBtn').addEventListener('click',()=>{
    currentDate.setMonth(currentDate.getMonth()+1);renderCalendar();
  });
  document.getElementById('todayBtn').addEventListener('click',()=>{
    currentDate=new Date();renderCalendar();
  });
  document.getElementById('addBtn').addEventListener('click',addEvent);
  document.getElementById('reloadBtn').addEventListener('click',reloadData);
  document.getElementById('noticeBtn').addEventListener('click',openNoticeModal);
  document.getElementById('noticeCloseBtn').addEventListener('click',closeNoticeModal);
  document.getElementById('noticeAddBtn').addEventListener('click',addNotice);
  document.getElementById('noticeModal').addEventListener('click',e=>{
    if(e.target===document.getElementById('noticeModal'))closeNoticeModal();
  });
  ['eventInput','eventFrom','eventTo'].forEach(id=>{
    document.getElementById(id).addEventListener('keypress',e=>{if(e.key==='Enter')addEvent();});
  });
  // 외부 클릭 시 1번째 탭 선택 초기화
  document.addEventListener('click',e=>{
    if(tapFirst===null)return;
    if(e.target.closest('.day:not(.empty)'))return;
    tapFirst=null;renderCalendar();
  });
  // 다른 탭/창에서 돌아왔을 때 자동 새로고침 (로컬 모드면 localStorage 재조회)
  document.addEventListener('visibilitychange',async()=>{
    if(document.hidden)return;
    try{
      await refreshAll();
      if(currentUser){renderCalendar();renderEventList();}
      else{renderSavedUsers();}
    }catch(e){console.error('auto refresh failed',e);}
  });

  // -----------------------------------------
  // 12) 초기화 (비동기 부트스트랩)
  // -----------------------------------------
  fillHourOptions();
  document.getElementById('eventFrom').value='0';
  document.getElementById('eventTo').value='0';
  renderColorPalette();

  (async function bootstrap(){
    const overlay=document.getElementById('loadingOverlay');
    try{
      await refreshAll();
    }catch(e){
      console.error('초기 데이터 로드 실패 → localStorage 폴백:', e);
      // API 실패 시 localStorage 폴백 모드 전환
      localMode=true;
      cache.events  = lsGet(LS_EVENTS,  []);
      cache.users   = lsGet(LS_USERS,   {});
      cache.allUsers = lsGet(LS_USERS,  {});
      cache.notices = lsGet(LS_NOTICES, []);
    }
    overlay.classList.add('hidden');
    document.getElementById('loginBox').classList.remove('hidden');
    // 로컬 모드 배너 표시
    if(localMode){
      const banner=document.createElement('div');
      banner.className='local-mode-banner';
      banner.id='localModeBanner';
      banner.innerHTML='⚠️ 서버 미연결 — 이 기기에만 저장됩니다. Vercel KV 연결 후 재배포하면 공유 가능합니다.';
      document.getElementById('calendarBox').querySelector('.cal-header').after(banner);
    }
    renderSavedUsers();
    // 자동 로그인 (이 디바이스에 저장된 KEY_CURRENT 가 캐시에 있을 때)
    const savedName=localStorage.getItem(KEY_CURRENT);
    if(savedName){
      const u=cache.users[savedName];
      if(u){
        currentUser=savedName;
        currentUserColor=u.color;currentUserSkin=u.skin||'light';
        selectedColor=u.color;selectedSkin=u.skin||'light';
        showCalendar();
      }
    }
  })();
})();
