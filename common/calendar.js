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
        <button class="u-btn" id="alarmBtn" title="중요일정 알림 설정">🔕</button>
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
      <div id="editDateRow" class="edit-date-row" style="display:none;">
        <span class="time-label">시작일</span><input type="date" id="editStartDate">
        <span class="time-label">종료일</span><input type="date" id="editEndDate">
      </div>
      <button id="addBtn" disabled>추가</button>
    </div>
    <ul class="event-list" id="eventList"></ul>
  </div>
</div>


<div class="modal-overlay hidden" id="notifyPermModal">
  <div class="modal-box" style="max-width:340px;">
    <h2>🔔 알림 동의</h2>
    <p style="font-size:14px;color:var(--text-base);line-height:1.7;margin-bottom:16px;white-space:pre-line;">새 일정·공지가 등록되면
알림을 받을 수 있습니다.
브라우저 알림을 허용하시겠습니까?</p>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="notifyPermDenyBtn">거부</button>
      <button class="modal-btn primary" id="notifyPermAllowBtn">동의</button>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="notifyDeniedModal">
  <div class="modal-box" style="max-width:400px;">
    <h2>🔔 알림이 차단되어 있어요</h2>
    <p style="font-size:14px;color:var(--text-base);line-height:1.6;margin-bottom:12px;">실수로 차단하셨나요?
아래 방법으로 다시 켤 수 있어요. <strong>변경 즉시 자동 감지됩니다.</strong></p>
    <div id="deniedInstructions" style="background:var(--item-bg);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;line-height:1.8;"></div>
    <p id="deniedWaiting" style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:10px;">⏳ 권한 변경을 감지하는 중...</p>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="notifyDeniedCloseBtn">닫기</button>
      <button class="modal-btn primary" id="notifyDeniedReloadBtn">새로고침</button>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="noticeModal">
  <div class="modal-box">
    <h2>📢 공지사항</h2>
    <div class="notice-list-section">
      <h3>등록된 공지</h3>
      <div id="noticeList"></div>
    </div>
    <textarea id="noticeTextInput" placeholder="공지 내용을 입력하세요..."></textarea>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="noticeCloseBtn">닫기</button>
      <button class="modal-btn primary" id="noticeAddBtn">등록</button>
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
  let editingEventId=null; // 수정 중인 일정 ID (null=추가 모드)

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
    // 이 캘린더 사용자만 표시 (다른 캘린더와 공유 안 함)
    cache.allUsers = cache.users;
  }
  async function refreshNotices(){
    cache.notices = await fetchJSON(`${API}/notices?prefix=${encodeURIComponent(PREFIX)}`);
  }
  async function refreshAll(){
    if(localMode){
      cache.events  = lsGet(LS_EVENTS,  []);
      cache.users   = lsGet(LS_USERS,   {});
      cache.allUsers = cache.users;
      cache.notices = lsGet(LS_NOTICES, []);
      return;
    }
    await Promise.all([refreshEvents(), refreshUsers(), refreshNotices()]);
    cache.allUsers = cache.users; // 같은 캘린더 사용자만 사용
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
    if(String(f)===String(t)) return ''; // 시작=종료 동일하면 시간 표시 안 함
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
      showCalendar(true); // 로그인 시 공지 자동 팝업
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
  async function showCalendar(autoNotice=false){
    applySkin(currentUserSkin);
    document.getElementById('loginBox').classList.add('hidden');
    document.getElementById('calendarBox').classList.remove('hidden');
    document.getElementById('userName').textContent=currentUser;
    document.getElementById('userDot').style.background=currentUserColor;
    updateSkinSwitchBtn();renderCalendar();renderEventList();
    // 권한 상태 동기화 (외부 거부 시 KEY_NOTIFY_ON='0' 설정)
    if(autoNotice) syncNotifyPermission();
    // 알림 OFF 상태면 동의/거부 모달 (공지 유무와 무관, 세션당 1회)
    if(autoNotice) await askNotifyIfOff();
    // 공지 있으면 자동 팝업 (첫 로딩 시만)
    if(autoNotice&&cache.notices.length>0) openNoticeModal();
    // 이미 ON인 경우 SW 재등록 (브라우저 재시작 후 SW가 사라질 수 있음)
    if(autoNotice && isNotifyOn()) registerPushSubscription();
    // 오늘 중요 일정 브라우저 알림
    if(autoNotice) checkNewItemsAndNotify();
    updateAlarmBtn();
  }

  // -----------------------------------------
  // 브라우저 알림 — 캘린더별 ON/OFF
  // -----------------------------------------
  const KEY_NOTIFY_ON   = `${PREFIX}_notify_on`;   // 알림 활성화 여부
  const KEY_NOTIFY_SEEN = `${PREFIX}_notify_seen`;  // 이미 알림 보낸 ID 목록

  function isNotifyOn(){ return localStorage.getItem(KEY_NOTIFY_ON)==='1'; }

  function getSeenIds(){ return new Set(lsGet(KEY_NOTIFY_SEEN,[])); }
  function saveSeenIds(set){
    const arr=[...set];
    lsSet(KEY_NOTIFY_SEEN, arr.slice(-500)); // 최대 500개 보관
  }

  function updateAlarmBtn(){
    const btn=document.getElementById('alarmBtn');
    if(!btn) return;
    const on=isNotifyOn();
    btn.textContent=on?'🔔':'🔕';
    btn.title=on?'알림 ON — 클릭하여 끄기':'알림 OFF — 클릭하여 켜기';
    btn.style.opacity=on?'1':'0.5';
  }

  // 외부(시스템 설정/안드로이드 알림 트레이)에서 권한이 변경된 경우 상태 동기화
  function syncNotifyPermission(){
    if(!('Notification' in window)) return;
    // 권한이 거부 상태면 알림 OFF로 강제 동기화
    if(Notification.permission==='denied' && isNotifyOn()){
      localStorage.setItem(KEY_NOTIFY_ON,'0');
      updateAlarmBtn();
    }
  }

  // 알림 동의/거부 모달 (Promise<true=동의, false=거부>)
  function showNotifyPermAskModal(){
    return new Promise(resolve=>{
      const overlay=document.getElementById('notifyPermModal');
      const denyBtn=document.getElementById('notifyPermDenyBtn');
      const allowBtn=document.getElementById('notifyPermAllowBtn');
      overlay.classList.remove('hidden');
      const cleanup=result=>{
        overlay.classList.add('hidden');
        resolve(result);
      };
      allowBtn.addEventListener('click',()=>cleanup(true),{once:true});
      denyBtn.addEventListener('click',()=>cleanup(false),{once:true});
    });
  }

  // 사용자 환경(OS/브라우저)별 차단 해제 안내 문구 생성
  function getDeniedInstructionsHtml(){
    const ua=navigator.userAgent;
    const isAndroid=/Android/i.test(ua);
    const isIOS=/iPhone|iPad|iPod/i.test(ua);
    const isFirefox=/Firefox/i.test(ua);
    const isEdge=/Edg/i.test(ua);
    const isSafari=/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);
    if(isIOS){
      return `<ol style="margin:0;padding-left:20px;">
        <li>iOS <strong>설정 앱</strong> 열기</li>
        <li><strong>Safari</strong> → <strong>고급</strong> → <strong>웹사이트 데이터</strong></li>
        <li>이 사이트 항목 삭제 후 새로고침</li>
        <li><em>※ iOS 16.4+ 는 PWA 설치 후 알림 사용 권장</em></li>
      </ol>`;
    }
    if(isAndroid){
      return `<ol style="margin:0;padding-left:20px;">
        <li>주소창 오른쪽 <strong>⋮</strong> 메뉴 클릭</li>
        <li><strong>사이트 설정</strong> 또는 자물쇠 아이콘 선택</li>
        <li><strong>알림</strong> → <strong>허용</strong>으로 변경</li>
      </ol>`;
    }
    if(isFirefox){
      return `<ol style="margin:0;padding-left:20px;">
        <li>주소창 왼쪽 <strong>자물쇠</strong> 아이콘 클릭</li>
        <li><strong>알림 보내기</strong> 우측 <strong>×</strong> 클릭하여 차단 해제</li>
      </ol>`;
    }
    if(isSafari){
      return `<ol style="margin:0;padding-left:20px;">
        <li>상단 메뉴 <strong>Safari</strong> → <strong>설정</strong> (또는 환경설정)</li>
        <li><strong>웹사이트</strong> 탭 → <strong>알림</strong></li>
        <li>이 사이트를 <strong>허용</strong>으로 변경</li>
      </ol>`;
    }
    // Chrome/Edge/기타 데스크탑
    return `<ol style="margin:0;padding-left:20px;">
      <li>주소창 왼쪽의 <strong>🔒</strong> 또는 <strong>ⓘ</strong> 아이콘 클릭</li>
      <li><strong>알림</strong> 항목을 <strong>허용</strong>으로 변경</li>
      <li>아래 <strong>새로고침</strong> 버튼 클릭 (또는 자동 감지 대기)</li>
    </ol>`;
  }

  // 차단 안내 모달 — 사용자가 설정에서 권한 변경하면 자동 감지
  let deniedModalOpen=false;
  function showNotifyDeniedModal(){
    const overlay=document.getElementById('notifyDeniedModal');
    const closeBtn=document.getElementById('notifyDeniedCloseBtn');
    const reloadBtn=document.getElementById('notifyDeniedReloadBtn');
    document.getElementById('deniedInstructions').innerHTML=getDeniedInstructionsHtml();
    overlay.classList.remove('hidden');
    deniedModalOpen=true;
    const close=()=>{
      overlay.classList.add('hidden');
      deniedModalOpen=false;
    };
    closeBtn.addEventListener('click',close,{once:true});
    reloadBtn.addEventListener('click',()=>location.reload(),{once:true});
  }

  // 권한이 granted로 바뀌면 자동으로 알림 활성화 + 차단 모달 닫기
  async function autoEnableOnGranted(){
    if(Notification.permission!=='granted') return;
    if(isNotifyOn()) return;
    localStorage.setItem(KEY_NOTIFY_ON,'1');
    const seen=getSeenIds();
    cache.events.forEach(ev=>seen.add(ev.id));
    cache.notices.forEach(n=>seen.add(n.id));
    saveSeenIds(seen);
    await registerPushSubscription();
    updateAlarmBtn();
    if(deniedModalOpen){
      document.getElementById('notifyDeniedModal').classList.add('hidden');
      deniedModalOpen=false;
      alert('✅ 알림이 활성화되었습니다!');
    }
  }

  // Permissions API로 권한 상태 변화 실시간 감지
  async function watchNotifyPermission(){
    if(!('permissions' in navigator)) return;
    try {
      const status=await navigator.permissions.query({name:'notifications'});
      status.addEventListener('change',autoEnableOnGranted);
    } catch(e){ /* Safari 등 일부 브라우저는 미지원 */ }
  }
  watchNotifyPermission();
  // 페이지 포커스 복귀 시에도 검사 (Permissions API 미지원 환경 대비)
  window.addEventListener('focus',autoEnableOnGranted);

  // 알림이 OFF 상태면 동의/거부 모달 표시 (세션당 1회)
  async function askNotifyIfOff(){
    if(!('Notification' in window)) return;
    if(isNotifyOn()) return; // 이미 ON이면 묻지 않음
    const sessionKey=`${PREFIX}_notifyAskShown`;
    if(sessionStorage.getItem(sessionKey)) return; // 이번 세션에 이미 보여줌
    sessionStorage.setItem(sessionKey,'1');
    const agreed=await showNotifyPermAskModal();
    if(agreed){
      // 동의 → 알림 버튼 클릭과 동일한 동작
      await toggleNotify();
    } else {
      localStorage.setItem(KEY_NOTIFY_ON,'0');
      updateAlarmBtn();
    }
  }


  // VAPID base64url → Uint8Array 변환 (Web Push 구독에 필요)
  function urlBase64ToUint8Array(b64){
    const pad='='.repeat((4-b64.length%4)%4);
    const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }

  // 서비스 워커 등록 + 푸시 구독 → 서버에 저장
  async function registerPushSubscription(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)) return;
    try {
      // VAPID 공개키 가져오기
      const vRes=await fetch('/api/vapid');
      if(!vRes.ok) return; // 서버에 VAPID 미설정 시 스킵
      const {publicKey}=await vRes.json();

      const reg=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 기존 구독 있으면 재사용, 없으면 새로 구독
      let sub=await reg.pushManager.getSubscription();
      if(!sub){
        sub=await reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(publicKey)
        });
      }

      // 구독 정보 + 현재 페이지 URL을 서버에 저장
      const subData={...sub.toJSON(), pageUrl:location.href};
      await fetch(`/api/tokens?prefix=${PREFIX}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(subData)
      });
    } catch(e){ console.error('푸시 구독 실패:', e); }
  }

  async function toggleNotify(){
    if(!('Notification' in window)){ alert('이 브라우저는 알림을 지원하지 않습니다.'); return; }
    if(isNotifyOn()){
      // 끄기 — '0' 명시 저장 + 푸시 구독 해제
      localStorage.setItem(KEY_NOTIFY_ON,'0');
      try {
        if('serviceWorker' in navigator){
          const reg=await navigator.serviceWorker.getRegistration('/sw.js');
          const sub=await reg?.pushManager?.getSubscription();
          if(sub){
            await sub.unsubscribe();
            await fetch(`/api/tokens?prefix=${PREFIX}`,{
              method:'DELETE',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({endpoint:sub.endpoint})
            });
          }
        }
      } catch(e){ console.error('구독 해제 실패:', e); }
      updateAlarmBtn();
      return;
    }
    // 켜기
    if(!('Notification' in window)){ alert('이 브라우저는 알림을 지원하지 않습니다.'); return; }
    const perm=Notification.permission;
    // 이미 차단된 경우 — 브라우저가 requestPermission을 무시하므로 OS별 안내 모달 표시
    if(perm==='denied'){
      localStorage.setItem(KEY_NOTIFY_ON,'0'); updateAlarmBtn();
      showNotifyDeniedModal();
      return;
    }
    const newPerm = perm==='granted' ? 'granted' : await Notification.requestPermission();
    if(newPerm!=='granted'){
      localStorage.setItem(KEY_NOTIFY_ON,'0'); updateAlarmBtn(); return;
    }
    localStorage.setItem(KEY_NOTIFY_ON,'1');
    const seen=getSeenIds();
    cache.events.forEach(ev=>seen.add(ev.id));
    cache.notices.forEach(n=>seen.add(n.id));
    saveSeenIds(seen);
    await registerPushSubscription();
    updateAlarmBtn();
  }

  function checkNewItemsAndNotify(){
    if(!isNotifyOn()) return;
    if(!('Notification' in window)||Notification.permission!=='granted') return;
    const seen=getSeenIds();
    let changed=false;

    // 새 일정 알림
    cache.events.forEach(ev=>{
      if(seen.has(ev.id)) return;
      const dateLabel=ev.startDate===ev.endDate
        ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`;
      const ts=formatTimeRange(ev.from,ev.to);
      const body=`${ev.user} · ${dateLabel}${ev.important?' ⭐중요':''}${ts?' · '+ts:''}`;
      new Notification(`📅 ${ev.text}`,{body, tag:`${PREFIX}_ev_${ev.id}`});
      seen.add(ev.id); changed=true;
    });

    // 새 공지 알림
    cache.notices.forEach(n=>{
      if(seen.has(n.id)) return;
      new Notification(`📢 공지`,{body:`${n.user} · ${n.text}`, tag:`${PREFIX}_nt_${n.id}`});
      seen.add(n.id); changed=true;
    });

    if(changed) saveSeenIds(seen);
  }
  function updateSkinSwitchBtn(){
    document.getElementById('skinSwitchBtn').textContent=currentUserSkin==='dark'?'☀️':'🌙';
  }

  function renderImportantBanner(){
    const banner=document.getElementById('importantBanner');
    const list=document.getElementById('importantBannerList');
    const today=todayStr();
    const all=loadEvents();

    // 중요 일정 (오늘 이후 종료)
    const importantAll=all.filter(ev=>ev.important&&ev.endDate>=today);
    const inProgressEvs=importantAll.filter(ev=>ev.startDate<=today).sort((a,b)=>a.endDate.localeCompare(b.endDate));
    const upcomingEvs=importantAll.filter(ev=>ev.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));

    // 오늘 진행 중인 일반 일정 (중요 표시 없는 것만)
    const todayEvs=all.filter(ev=>!ev.important&&ev.startDate<=today&&ev.endDate>=today)
      .sort((a,b)=>a.endDate.localeCompare(b.endDate));

    if(!importantAll.length&&!todayEvs.length){banner.classList.add('hidden');return;}
    banner.classList.remove('hidden');list.innerHTML='';

    const makeItem=(ev,isIP)=>{
      const item=document.createElement('div');item.className='b-item'+(isIP?' in-progress':'');
      const badge=document.createElement('span');badge.className='b-user-badge';
      badge.style.background=ev.color||'#95a5a6';badge.textContent=ev.user;
      const ts=formatTimeRange(ev.from,ev.to);
      const text=document.createElement('span');text.textContent=ev.text;
      const range=document.createElement('span');range.className='b-range'+(isIP?' b-range-ip':'');
      range.textContent=ev.startDate===ev.endDate?ev.startDate:`${ev.startDate}~${ev.endDate}`;
      item.appendChild(badge);item.appendChild(text);item.appendChild(range);
      if(ts){const tb=document.createElement('span');tb.className='b-time';tb.textContent=`⏰ ${ts}`;item.appendChild(tb);}
      return item;
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
    // 오늘 진행 중 일반 일정 (중요 일정 섹션 아래에 표시)
    if(todayEvs.length){
      const t=document.createElement('div');t.className='b-section-title'+(importantAll.length?' b-section-gap':'');
      t.textContent='🗓️ 오늘 진행 일정';list.appendChild(t);
      todayEvs.forEach(ev=>list.appendChild(makeItem(ev,true)));
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
    for(let day=1;day<=lastDate;day++){
      const cell=document.createElement('div');cell.className='day';
      const dateStr=formatDate(year,month,day);cell.dataset.date=dateStr;
      const wd=new Date(year,month,day).getDay();
      if(wd===0)cell.classList.add('sun');if(wd===6)cell.classList.add('sat');
      if(dateStr===today)cell.classList.add('today');
      if(selectedStart&&selectedEnd){
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
          bar.innerHTML=`${ev.important?'⭐ ':''}${ev.user}: ${ev.text}${ts?` <span style="font-size:10px;opacity:0.75"> ${ts}</span>`:''}`;

        }
        cell.appendChild(bar);
      });
      if(deduped.length>2){
        const more=document.createElement('div');more.className='event-bar bar-single';
        more.style.background='#95a5a6';more.textContent=`+${deduped.length-2}개 더`;cell.appendChild(more);
      }
      cell.addEventListener('click',(e)=>{
        e.stopPropagation();
        if(editingEventId) return; // 수정 중에는 달력 날짜 선택 비활성화
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
      const tx=document.createElement('span');tx.className='event-text';
      tx.textContent=ev.text;content.appendChild(tx);
      const ts=formatTimeRange(ev.from,ev.to);
      if(ts){
        const tb=document.createElement('span');tb.className='event-time';
        tb.textContent=`⏰ ${ts}`;content.appendChild(tb);
      }
      const btnWrap=document.createElement('div');btnWrap.className='event-btn-wrap';
      if(ev.user===currentUser){
        const editBtn=document.createElement('button');editBtn.className='edit-btn';editBtn.textContent='수정';
        editBtn.addEventListener('click',()=>startEdit(ev));
        btnWrap.appendChild(editBtn);
      }
      const btn=document.createElement('button');btn.className='delete-btn';btn.textContent='삭제';
      btn.addEventListener('click',()=>deleteEvent(ev.id));
      btnWrap.appendChild(btn);
      li.appendChild(content);li.appendChild(btnWrap);list.appendChild(li);
    });
  }

  // -----------------------------------------
  // 8) 일정 추가/수정/삭제 (async)
  // -----------------------------------------
  function startEdit(ev){
    // 폼에 기존 데이터 채우기
    selectedStart=ev.startDate; selectedEnd=ev.endDate; tapFirst=null;
    document.getElementById('eventInput').value=ev.text;
    document.getElementById('eventFrom').value=ev.from||'0';
    document.getElementById('eventTo').value=ev.to||'0';
    document.getElementById('importantCheck').checked=!!ev.important;
    activateInputs(); updateSelectedLabel(); renderCalendar(); renderEventList();
    // 추가 버튼 → 수정 완료로 변경
    editingEventId=ev.id;
    const addBtn=document.getElementById('addBtn');
    addBtn.textContent='수정 완료';addBtn.style.background='#27ae60';
    // 수정 취소 버튼 표시
    let cancelBtn=document.getElementById('editCancelBtn');
    if(!cancelBtn){
      cancelBtn=document.createElement('button');cancelBtn.id='editCancelBtn';
      cancelBtn.textContent='취소';cancelBtn.style.cssText='margin-left:6px;background:#95a5a6;color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:14px;';
      cancelBtn.addEventListener('click',cancelEdit);
      addBtn.after(cancelBtn);
    }
    cancelBtn.style.display='';
    // 날짜 직접 입력 필드 표시
    const dateRow=document.getElementById('editDateRow');
    dateRow.style.display='flex';
    document.getElementById('editStartDate').value=ev.startDate;
    document.getElementById('editEndDate').value=ev.endDate;
    // 달력 그리드 비활성화
    document.getElementById('daysGrid').classList.add('editing-mode');
    ['prevBtn','nextBtn','todayBtn'].forEach(id=>document.getElementById(id).disabled=true);
    // 폼으로 스크롤
    document.getElementById('eventInput').scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('eventInput').focus();
  }
  function cancelEdit(){
    editingEventId=null;
    const addBtn=document.getElementById('addBtn');
    addBtn.textContent='추가';addBtn.style.background='';
    const cancelBtn=document.getElementById('editCancelBtn');
    if(cancelBtn)cancelBtn.style.display='none';
    document.getElementById('eventInput').value='';
    document.getElementById('eventFrom').value='0';
    document.getElementById('eventTo').value='0';
    document.getElementById('importantCheck').checked=false;
    // 날짜 입력 필드 숨김 + 달력 복원
    document.getElementById('editDateRow').style.display='none';
    document.getElementById('daysGrid').classList.remove('editing-mode');
    ['prevBtn','nextBtn','todayBtn'].forEach(id=>document.getElementById(id).disabled=false);
  }
  async function apiUpdateEvent(id, updated){
    if(localMode){
      const evs=lsGet(LS_EVENTS,[]).map(e=>e.id===id?{...e,...updated}:e);
      lsSet(LS_EVENTS,evs);
      cache.events=cache.events.map(e=>e.id===id?{...e,...updated}:e);
      return;
    }
    // PATCH로 단건 수정
    await fetchJSON(`${API}/events?prefix=${encodeURIComponent(PREFIX)}&id=${encodeURIComponent(id)}`,{
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated)
    });
    cache.events=cache.events.map(e=>e.id===id?{...e,...updated}:e);
  }
  async function addEvent(){
    const input=document.getElementById('eventInput'),text=input.value.trim();
    if(!text||!selectedStart||!selectedEnd)return;
    const from=document.getElementById('eventFrom').value;
    const to  =document.getElementById('eventTo').value;
    const important=document.getElementById('importantCheck').checked;
    if(selectedStart===selectedEnd&&from&&to&&parseInt(to,10)<parseInt(from,10)){
      alert('종료 시간이 시작 시간보다 빠를 수 없습니다.');return;
    }
    const addBtn=document.getElementById('addBtn');addBtn.disabled=true;
    try{
      if(editingEventId){
        // 수정 모드
        await apiUpdateEvent(editingEventId,{text,startDate:selectedStart,endDate:selectedEnd,from,to,important});
        cancelEdit();
      }else{
        // 추가 모드
        const newEv={id:makeId(),user:currentUser,color:currentUserColor,text,startDate:selectedStart,endDate:selectedEnd,from,to,important};
        await apiAddEvent(newEv);
        input.value='';
        document.getElementById('eventFrom').value='0';
        document.getElementById('eventTo').value='0';
        document.getElementById('importantCheck').checked=false;
        tapFirst=null;
      }
      renderCalendar();renderEventList();
    }catch(e){
      alert((editingEventId?'수정':'일정 추가')+' 실패: '+e.message);console.error(e);
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
      if(currentUser){renderCalendar();renderEventList();checkNewItemsAndNotify();}
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
  document.getElementById('prevBtn').addEventListener('click',(e)=>{
    e.stopPropagation(); // 월 이동 시 tapFirst 초기화 방지
    currentDate.setMonth(currentDate.getMonth()-1);renderCalendar();
  });
  document.getElementById('nextBtn').addEventListener('click',(e)=>{
    e.stopPropagation();
    currentDate.setMonth(currentDate.getMonth()+1);renderCalendar();
  });
  document.getElementById('todayBtn').addEventListener('click',(e)=>{
    e.stopPropagation();
    currentDate=new Date();renderCalendar();
  });
  document.getElementById('addBtn').addEventListener('click',addEvent);
  document.getElementById('reloadBtn').addEventListener('click',reloadData);
  document.getElementById('alarmBtn').addEventListener('click',toggleNotify);
  document.getElementById('noticeBtn').addEventListener('click',openNoticeModal);
  document.getElementById('noticeCloseBtn').addEventListener('click',closeNoticeModal);
  document.getElementById('noticeAddBtn').addEventListener('click',addNotice);
  // 수정 모드 날짜 직접 입력 핸들러
  document.getElementById('editStartDate').addEventListener('change',e=>{
    selectedStart=e.target.value;
    if(selectedEnd<selectedStart){ selectedEnd=selectedStart; document.getElementById('editEndDate').value=selectedStart; }
    updateSelectedLabel(); renderCalendar();
  });
  document.getElementById('editEndDate').addEventListener('change',e=>{
    selectedEnd=e.target.value;
    if(selectedEnd<selectedStart){ selectedStart=selectedEnd; document.getElementById('editStartDate').value=selectedEnd; }
    updateSelectedLabel(); renderCalendar();
  });
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
    syncNotifyPermission(); // 앱 복귀 시 권한 변경 여부 즉시 반영 (안드로이드 알림 거부 등)
    try{
      await refreshAll();
      if(currentUser){renderCalendar();renderEventList();checkNewItemsAndNotify();}
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
        showCalendar(true); // 자동 로그인 시 공지 자동 팝업
      }
    }
  })();
})();
