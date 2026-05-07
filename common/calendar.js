/* =========================================
   캘린더 공통 로직
   - 3개 HTML(kim-family / jhkim-hyeju / calendar)이 공유
   - 사용 방법: HTML에서 window.CAL_CONFIG 를 먼저 정의한 뒤 이 파일 로드
     {
       prefix: 'family',           // localStorage 키 접두사 (필수)
       title:  '👨‍👩‍👧‍👦 가족 캘린더', // 화면 상단 제목 (필수)
       accent: '#3498db'           // 액센트 색상 (옵션, 미지정 시 CSS 기본값)
     }
   ========================================= */
(function(){
  'use strict';

  // -----------------------------------------
  // 1) 설정 읽기
  // -----------------------------------------
  const cfg = window.CAL_CONFIG || {};
  const PREFIX = cfg.prefix || 'default';
  const TITLE  = cfg.title  || '📅 캘린더';

  const KEY_EVENTS  = `${PREFIX}_events`;
  const KEY_USERS   = `${PREFIX}_users`;
  const KEY_CURRENT = `${PREFIX}_current_user`;
  const KEY_NOTICES = `${PREFIX}_notices`;

  // 액센트 색상 적용 (옵션)
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
  // 2) 기본 HTML 구조 주입
  // -----------------------------------------
  const HTML_TEMPLATE = `
<div class="login-box" id="loginBox">
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
  let isDragging=false, dragStart=null, dragEnd=null;

  // -----------------------------------------
  // 4) 스토리지 헬퍼
  // -----------------------------------------
  function saveEvents(ev){ localStorage.setItem(KEY_EVENTS,JSON.stringify(ev)); }
  function loadEvents(){
    const raw=localStorage.getItem(KEY_EVENTS);if(!raw)return[];
    const p=JSON.parse(raw);
    // 구버전(객체) → 신버전(배열) 마이그레이션
    if(!Array.isArray(p)){
      const m=[];
      Object.keys(p).forEach(d=>(p[d]||[]).forEach(ev=>m.push({id:makeId(),user:ev.user||'?',color:ev.color||'#95a5a6',text:ev.text||'',startDate:d,endDate:d,from:ev.from||'',to:ev.to||'',important:false})));
      saveEvents(m);return m;
    }
    return p;
  }
  function loadUsers(){
    const raw=localStorage.getItem(KEY_USERS);if(!raw)return{};
    const p=JSON.parse(raw);const r={};
    Object.keys(p).forEach(n=>{const v=p[n];r[n]=(typeof v==='string')?{color:v,skin:'light'}:v;});
    return r;
  }
  function saveUsers(u){ localStorage.setItem(KEY_USERS,JSON.stringify(u)); }
  function loadNotices(){ const r=localStorage.getItem(KEY_NOTICES);return r?JSON.parse(r):[]; }
  function saveNotices(a){ localStorage.setItem(KEY_NOTICES,JSON.stringify(a)); }

  // -----------------------------------------
  // 5) 포맷 / 유틸 헬퍼
  // -----------------------------------------
  function makeId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function formatDate(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function todayStr(){ const t=new Date();return formatDate(t.getFullYear(),t.getMonth(),t.getDate()); }
  // 시간 표기: 신규 "H" 시 정수 / 구버전 "HH:MM" 호환
  function formatTimeRange(f,t){
    const fmt=v=>{
      if(v===''||v==null)return'';
      const s=String(v);
      if(s.includes(':'))return parseInt(s.split(':')[0],10)+'시';
      return parseInt(s,10)+'시';
    };
    return(f&&t)?`${fmt(f)}~${fmt(t)}`:f?`${fmt(f)}~`:t?`~${fmt(t)}`:'';
  }
  // 0~23시 옵션 채우기
  function fillHourOptions(){
    const opts='<option value="">시간</option>'+Array.from({length:24},(_,h)=>`<option value="${h}">${h}시</option>`).join('');
    document.getElementById('eventFrom').innerHTML=opts;
    document.getElementById('eventTo').innerHTML=opts;
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

  // 모든 캘린더 사용자 통합 (현재 + 다른 *_users 키 모두 스캔)
  function loadAllUsers(){
    const parseRaw=raw=>{
      if(!raw)return{};
      try{
        const p=JSON.parse(raw);const r={};
        Object.keys(p).forEach(n=>{const v=p[n];r[n]=(typeof v==='string')?{color:v,skin:'light'}:v;});
        return r;
      }catch(e){return{};}
    };
    const merged={};
    // 현재 캘린더 사용자
    Object.entries(parseRaw(localStorage.getItem(KEY_USERS))).forEach(([n,v])=>{merged[n]={...v,fromCurrent:true};});
    // 다른 캘린더의 *_users 키 모두 스캔 (admin_* 같은 시스템 키 제외)
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||key===KEY_USERS)continue;
      if(!/_users$/.test(key))continue;
      if(/^admin_/.test(key))continue;
      Object.entries(parseRaw(localStorage.getItem(key))).forEach(([n,v])=>{
        if(!merged[n])merged[n]={...v,fromCurrent:false};
      });
    }
    return merged;
  }
  function renderSavedUsers(){
    const users=loadAllUsers(),section=document.getElementById('quickLoginSection'),list=document.getElementById('quickLoginList');
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

  function login(){
    const name=document.getElementById('nameInput').value.trim();
    if(!name||!selectedColor)return;
    const users=loadUsers();const prev=users[name]?.color;
    users[name]={color:selectedColor,skin:selectedSkin};saveUsers(users);
    // 색상 변경 시 기존 일정의 색도 함께 업데이트
    if(prev&&prev!==selectedColor){
      const ev=loadEvents();let ch=false;
      ev.forEach(e=>{if(e.user===name){e.color=selectedColor;ch=true;}});
      if(ch)saveEvents(ev);
    }
    localStorage.setItem(KEY_CURRENT,name);
    currentUser=name;currentUserColor=selectedColor;currentUserSkin=selectedSkin;
    showCalendar();
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
    // 입력폼 초기화
    ['eventInput','eventFrom','eventTo'].forEach(id=>{const el=document.getElementById(id);el.disabled=true;el.value='';});
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

  // 매우중요 배너
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
    const dragLo=(isDragging&&dragStart&&dragEnd)?minDate(dragStart,dragEnd):null;
    const dragHi=(isDragging&&dragStart&&dragEnd)?maxDate(dragStart,dragEnd):null;
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

      // 중복 제거 후 이벤트 바 렌더링
      const dayEvs=events.filter(ev=>dateInRange(dateStr,ev.startDate,ev.endDate));
      const seen=new Set();
      const deduped=dayEvs.filter(ev=>{
        const k=`${ev.startDate}|${ev.endDate}|${ev.text}`;
        if(seen.has(k))return false;seen.add(k);return true;
      });
      deduped.slice(0,2).forEach(ev=>{
        const isMulti=ev.startDate!==ev.endDate;
        let barClass;
        if(!isMulti){
          barClass='bar-single';
        }else{
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
      cell.addEventListener('click',()=>{
        if(!isDragging){
          // 첫 탭: 당일 일정으로 즉시 활성화
          isDragging=true;dragStart=dateStr;dragEnd=dateStr;
          selectedStart=dateStr;selectedEnd=dateStr;
          activateInputs();updateSelectedLabel();renderCalendar();renderEventList();
        }else{
          // 두번째 탭: 낮은 일자=시작, 높은 일자=종료 (기간 일정)
          isDragging=false;
          selectedStart=minDate(dragStart,dateStr);selectedEnd=maxDate(dragStart,dateStr);
          dragStart=dragEnd=null;activateInputs();updateSelectedLabel();renderCalendar();renderEventList();
        }
      });
      cell.addEventListener('mouseenter',()=>{if(!isDragging)return;dragEnd=dateStr;renderCalendar();});
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
    // 시작 시간(시 단위)으로 정렬 — 빈값/구버전 HH:MM 형식 모두 처리
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
  // 8) 일정 추가/삭제
  // -----------------------------------------
  function addEvent(){
    const input=document.getElementById('eventInput'),text=input.value.trim();
    if(!text||!selectedStart||!selectedEnd)return;
    const from=document.getElementById('eventFrom').value;
    const to=document.getElementById('eventTo').value;
    const important=document.getElementById('importantCheck').checked;
    if(selectedStart===selectedEnd&&from&&to&&parseInt(to,10)<parseInt(from,10)){
      alert('종료 시간이 시작 시간보다 빠를 수 없습니다.');return;
    }
    const events=loadEvents();
    events.push({id:makeId(),user:currentUser,color:currentUserColor,text,startDate:selectedStart,endDate:selectedEnd,from,to,important});
    saveEvents(events);
    input.value='';document.getElementById('eventFrom').value='';document.getElementById('eventTo').value='';
    document.getElementById('importantCheck').checked=false;
    // 추가 후 선택 상태 리셋: 다음 탭은 새로운 1차 탭으로 동작
    isDragging=false;dragStart=null;dragEnd=null;
    renderCalendar();renderEventList();
  }
  function deleteEvent(id){
    const events=loadEvents(),target=events.find(ev=>ev.id===id);if(!target)return;
    const who=target.user!==currentUser?`[${target.user}]님이 등록한 `:'';
    if(!confirm(`${who}"${target.text}" 일정을 삭제하시겠습니까?`))return;
    saveEvents(events.filter(ev=>ev.id!==id));renderCalendar();renderEventList();
  }

  // -----------------------------------------
  // 9) 공지사항
  // -----------------------------------------
  function openNoticeModal(){ renderNoticeList();document.getElementById('noticeModal').classList.remove('hidden'); }
  function closeNoticeModal(){
    document.getElementById('noticeModal').classList.add('hidden');
    document.getElementById('noticeTextInput').value='';
  }
  function addNotice(){
    const text=document.getElementById('noticeTextInput').value.trim();if(!text)return;
    const now=new Date();const pad=n=>String(n).padStart(2,'0');
    const createdAt=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const notices=loadNotices();
    notices.unshift({id:makeId(),user:currentUser,color:currentUserColor,text,createdAt});
    saveNotices(notices);
    document.getElementById('noticeTextInput').value='';renderNoticeList();
  }
  function deleteNotice(id){
    if(!confirm('이 공지를 삭제하시겠습니까?'))return;
    saveNotices(loadNotices().filter(n=>n.id!==id));renderNoticeList();
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
  // 10) 이벤트 바인딩
  // -----------------------------------------
  document.getElementById('skinLight').addEventListener('click',()=>setLoginSkin('light'));
  document.getElementById('skinDark').addEventListener('click',()=>setLoginSkin('dark'));
  document.getElementById('nameInput').addEventListener('input',checkLoginReady);
  document.getElementById('loginBtn').addEventListener('click',login);
  document.getElementById('nameInput').addEventListener('keypress',e=>{
    if(e.key==='Enter'&&!document.getElementById('loginBtn').disabled)login();
  });
  document.getElementById('logoutBtn').addEventListener('click',logout);
  document.getElementById('skinSwitchBtn').addEventListener('click',()=>{
    currentUserSkin=currentUserSkin==='dark'?'light':'dark';
    applySkin(currentUserSkin);updateSkinSwitchBtn();
    const u=loadUsers();
    if(u[currentUser]){u[currentUser].skin=currentUserSkin;saveUsers(u);}
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
  document.getElementById('noticeBtn').addEventListener('click',openNoticeModal);
  document.getElementById('noticeCloseBtn').addEventListener('click',closeNoticeModal);
  document.getElementById('noticeAddBtn').addEventListener('click',addNotice);
  document.getElementById('noticeModal').addEventListener('click',e=>{
    if(e.target===document.getElementById('noticeModal'))closeNoticeModal();
  });
  ['eventInput','eventFrom','eventTo'].forEach(id=>{
    document.getElementById(id).addEventListener('keypress',e=>{if(e.key==='Enter')addEvent();});
  });

  // -----------------------------------------
  // 11) 초기화
  // -----------------------------------------
  fillHourOptions();
  renderColorPalette();
  renderSavedUsers();
  // 자동 로그인: 이전 로그인한 사용자 정보가 있으면 즉시 로그인 화면 통과
  const savedName=localStorage.getItem(KEY_CURRENT);
  if(savedName){
    const u=loadUsers()[savedName];
    if(u){
      currentUser=savedName;
      currentUserColor=u.color;currentUserSkin=u.skin||'light';
      selectedColor=u.color;selectedSkin=u.skin||'light';
      showCalendar();
    }
  }
})();
