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

  const darken = h=>{
    if(!h||!h.startsWith('#')||h.length<7)return h;
    const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
    return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v*0.78))).toString(16).padStart(2,'0')).join('');
  };
  if(cfg.accent){
    document.documentElement.style.setProperty('--accent', cfg.accent);
    document.documentElement.style.setProperty('--accent-dark', cfg.accentDark || darken(cfg.accent));
    document.documentElement.style.setProperty('--help-border', cfg.accent);
  }

  // PWA 홈 화면 아이콘 — Canvas로 동적 생성 (별도 PNG 파일 불필요)
  // iOS apple-touch-icon + Android Web Manifest 모두 처리
  function setupPWAIcons(){
    try{
      const accent = cfg.accent || '#3498db';
      // 제목에서 첫 번째 이모지 추출 — Intl.Segmenter로 ZWJ+variation-selector 완전 지원
      let emoji='📅';
      try{
        if(typeof Intl.Segmenter==='function'){
          const seg=new Intl.Segmenter('ko',{granularity:'grapheme'});
          for(const {segment} of seg.segment(TITLE)){
            const cp=segment.codePointAt(0)||0;
            if(cp>0x2000){ emoji=segment; break; }
          }
        } else {
          // 폴백: variation selector(FE0F) 포함 ZWJ 정규식
          const re=/(\p{Emoji_Presentation}|\p{Extended_Pictographic})️?(\u{200D}(\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)*/gu;
          const m=TITLE.match(re);
          if(m) emoji=m[0];
        }
      }catch(e){}

      // sz 크기의 아이콘 캔버스 생성 (재사용 헬퍼)
      function makeIconCanvas(sz){
        const cv=document.createElement('canvas');cv.width=sz;cv.height=sz;
        const cx=cv.getContext('2d');
        const r=sz*0.20; // 둥근 모서리 반지름 (20%)

        // 배경 — accent 색 꽉 채우기
        cx.fillStyle=accent;
        cx.beginPath();
        cx.moveTo(r,0);cx.lineTo(sz-r,0);
        cx.arcTo(sz,0,sz,r,r);cx.lineTo(sz,sz-r);
        cx.arcTo(sz,sz,sz-r,sz,r);cx.lineTo(r,sz);
        cx.arcTo(0,sz,0,sz-r,r);cx.lineTo(0,r);
        cx.arcTo(0,0,r,0,r);cx.closePath();cx.fill();

        // 이모지 — 캔버스의 55% 크기로 중앙 배치 (여백 확보)
        cx.font=`${Math.floor(sz*0.55)}px serif`;
        cx.textAlign='center';cx.textBaseline='middle';
        cx.fillText(emoji,sz/2,sz/2+sz*0.02);
        return cv;
      }

      const icon192=makeIconCanvas(192).toDataURL('image/png');
      const icon512=makeIconCanvas(512).toDataURL('image/png');
      const icon180=makeIconCanvas(180).toDataURL('image/png'); // iOS 전용

      // apple-touch-icon (iOS 180×180)
      let atl=document.querySelector('link[rel="apple-touch-icon"]');
      if(!atl){atl=document.createElement('link');atl.rel='apple-touch-icon';document.head.appendChild(atl);}
      atl.href=icon180;

      // favicon (브라우저 탭)
      let fav=document.querySelector('link[rel="icon"]');
      if(!fav){fav=document.createElement('link');fav.rel='icon';fav.type='image/png';document.head.appendChild(fav);}
      fav.href=icon192;

      // theme-color 메타 동기화
      let tm=document.querySelector('meta[name="theme-color"]');
      if(!tm){tm=document.createElement('meta');tm.name='theme-color';document.head.appendChild(tm);}
      tm.content=accent;

      // Web App Manifest
      // purpose:'any' 만 사용 — 'maskable' 포함 시 Android 런처가 원형 크롭해서 확대 현상 발생
      const mData={
        name:TITLE,
        short_name:TITLE.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u{200D}(\p{Emoji_Presentation}|\p{Extended_Pictographic}))*/gu,'').replace(/\s+/g,' ').trim().slice(0,15),
        start_url:location.pathname+(location.search||''),
        display:'standalone',
        background_color:accent,
        theme_color:accent,
        icons:[
          {src:icon192,sizes:'192x192',type:'image/png',purpose:'any'},
          {src:icon512,sizes:'512x512',type:'image/png',purpose:'any'}
        ]
      };
      const mBlob=new Blob([JSON.stringify(mData)],{type:'application/manifest+json'});
      const mUrl=URL.createObjectURL(mBlob);
      let ml=document.querySelector('link[rel="manifest"]');
      if(!ml){ml=document.createElement('link');ml.rel='manifest';document.head.appendChild(ml);}
      ml.href=mUrl;
    }catch(e){ console.error('PWA 아이콘 생성 실패:', e); }
  }
  setupPWAIcons();

  // PWA 설치 조건 충족을 위해 서비스 워커 먼저 등록 (푸시 알림과 무관하게)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(e=>console.error('SW 등록 실패:',e));
  }

  // -----------------------------------------
  // PWA 설치 유도 (하단 바)
  // -----------------------------------------
  let _deferredInstallPrompt = null;
  const PWA_DISMISS_KEY = `${PREFIX}_pwa_dismissed`;

  function _isStandalone(){
    return navigator.standalone===true ||
      window.matchMedia('(display-mode: standalone)').matches;
  }
  function _showInstallBar(){
    if(_isStandalone()) return;                          // 이미 설치됨
    if(sessionStorage.getItem(PWA_DISMISS_KEY)) return; // 이번 세션 닫기 클릭
    const bar=document.getElementById('pwaInstallBar');
    if(bar) bar.classList.remove('hidden');
  }
  function _hideInstallBar(){
    const bar=document.getElementById('pwaInstallBar');
    if(bar) bar.classList.add('hidden');
  }

  // Android/Chrome: 설치 프롬프트 이벤트 캡처
  window.addEventListener('beforeinstallprompt', e=>{
    e.preventDefault();
    _deferredInstallPrompt=e;
    _showInstallBar();
  });
  // 설치 완료 시 자동 숨김
  window.addEventListener('appinstalled', ()=>{
    _hideInstallBar();
    _deferredInstallPrompt=null;
  });

  async function _triggerInstall(){
    if(_deferredInstallPrompt){
      // Android/Chrome: 시스템 설치 다이얼로그
      _deferredInstallPrompt.prompt();
      const {outcome}=await _deferredInstallPrompt.userChoice;
      _deferredInstallPrompt=null;
      if(outcome==='accepted') _hideInstallBar();
    } else if(isIOS()){
      // iOS: 수동 안내 모달 (기존 iosInstallModal 재사용)
      showIOSInstallModal();
    } else {
      // Chrome 데스크탑 등 — 이미 설치됐거나 불가
      alert('이 브라우저에서는 주소창 오른쪽의 설치 아이콘(⊕)을 눌러 설치할 수 있어요.');
    }
  }

  // iOS이면서 standalone 아닌 경우에도 설치 바 표시
  if(isIOS() && !_isStandalone()){
    // DOM이 준비된 뒤 표시 (HTML_TEMPLATE 주입 전이므로 지연)
    setTimeout(_showInstallBar, 0);
  }

  // -----------------------------------------
  // 2) HTML 구조 + 로딩 오버레이 주입
  // -----------------------------------------
  const HTML_TEMPLATE = `
<div id="loadingOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);color:#fff;display:flex;align-items:center;justify-content:center;z-index:9999;font-size:16px;">⏳ 데이터 로딩 중...</div>

<div class="login-box hidden" id="loginBox">
  <h1 id="loginTitle">${TITLE}</h1>
  <p id="loginSubtitle">이름 입력 → 스킨 · 색상 선택 후 로그인하세요</p>
  <div class="quick-login" id="quickLoginSection">
    <h3>👤 사용자 선택 (탭하면 바로 로그인)</h3>
    <div class="quick-login-list" id="quickLoginList"></div>
  </div>
  <div id="capacityFullNote" class="hidden" style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:8px;padding:12px;margin:12px 0;color:#c0392b;font-size:13px;text-align:center;">
    🔒 이 캘린더는 최대 인원에 도달했습니다.<br>
    위에 표시된 등록된 사용자만 로그인할 수 있습니다.
  </div>
  <div id="newUserForm">
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
        <button class="u-btn" id="anniversaryBtn" title="기념일/생일 관리">💗</button>
        <button class="u-btn logout-u-btn" id="logoutBtn">로그아웃</button>
      </div>
    </div>
  </div>
  <div id="importantBanner" class="important-banner hidden">
    <div class="b-title" id="importantBannerTitle">
      <span>⭐ 중요 일정</span>
      <span class="b-toggle" id="importantBannerToggle">▼</span>
    </div>
    <div id="importantBannerList"></div>
  </div>
  <div class="cal-nav-row">
    <button class="nav-btn" id="prevBtn">◀</button>
    <span class="month-label" id="monthLabel"></span>
    <button class="nav-btn" id="nextBtn">▶</button>
    <button class="nav-btn" id="todayBtn">오늘</button>
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

  <!-- 앱 설치 안내 바 (standalone 모드이면 자동 숨김) -->
  <div id="pwaInstallBar" class="pwa-install-bar hidden">
    <span class="pwa-install-txt">📲 이 캘린더를 홈 화면에 추가하면 앱처럼 사용할 수 있어요</span>
    <button class="pwa-install-btn" id="pwaInstallBtn">설치하기</button>
    <button class="pwa-dismiss-btn" id="pwaInstallDismiss" title="닫기">✕</button>
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

<div id="noticeToast" class="notice-toast hidden">📢 새 공지가 있습니다</div>

<div class="modal-overlay hidden" id="phoneAuthModal">
  <div class="modal-box" style="max-width:340px;">
    <h2>🔐 휴대폰 인증</h2>
    <p id="phoneAuthBody" style="font-size:14px;color:var(--text-base);line-height:1.6;margin-bottom:12px;"></p>
    <input type="tel" id="phoneAuthInput" placeholder="01012345678" inputmode="numeric"
      style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;background:var(--input-bg);color:var(--text-base);box-sizing:border-box;margin-bottom:8px;">
    <p id="phoneAuthError" style="color:#e74c3c;font-size:12px;min-height:16px;margin:0 0 8px 0;"></p>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="phoneAuthCancelBtn">취소</button>
      <button class="modal-btn primary" id="phoneAuthOkBtn">확인</button>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="iosInstallModal">
  <div class="modal-box" style="max-width:380px;">
    <h2>📱 iPhone 알림 받기</h2>
    <p style="font-size:14px;color:var(--text-base);line-height:1.6;margin-bottom:12px;">iOS Safari는 일반 탭에서 알림을 지원하지 않아요.
<strong>홈 화면에 추가</strong>하면 알림을 받을 수 있습니다.</p>
    <div style="background:var(--item-bg);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;line-height:1.9;">
      <ol style="margin:0;padding-left:20px;">
        <li>Safari 하단의 <strong>공유 버튼</strong> ( <span style="display:inline-block;border:1px solid var(--border);border-radius:4px;padding:0 5px;">⬆️</span> ) 탭</li>
        <li>목록에서 <strong>"홈 화면에 추가"</strong> 선택</li>
        <li>홈 화면에 생긴 아이콘으로 다시 들어오기</li>
        <li>알림 허용 후 사용</li>
      </ol>
      <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0 0;">※ iOS 16.4 이상 필요</p>
    </div>
    <div class="modal-actions">
      <button class="modal-btn primary" id="iosInstallCloseBtn">확인</button>
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
</div>

<div class="modal-overlay hidden" id="anniversaryModal">
  <div class="modal-box" style="max-width:500px;">
    <h2>💗 기념일 · 생일 관리</h2>
    <div class="anniv-list-section" id="anniversaryList"></div>
    <div class="anniv-add-section">
      <h3 id="annivFormTitle">+ 새로 추가</h3>
      <div class="anniv-type-row">
        <label class="anniv-type-btn active" id="annivBirthdayLabel">
          <input type="radio" name="annivType" value="birthday" id="annivTypeBirthday" checked>🎂 생일
        </label>
        <label class="anniv-type-btn" id="annivAnnivLabel">
          <input type="radio" name="annivType" value="anniversary" id="annivTypeAnniversary">💕 기념일
        </label>
      </div>
      <input type="text" class="anniv-input" id="annivName" placeholder="이름 또는 설명 (예: 혜주, 우리 기념일)" maxlength="30">
      <input type="date" class="anniv-input" id="annivDate">
      <label class="anniv-check-label" id="annivLunarLabel">
        <input type="checkbox" id="annivLunar">🌙 음력날짜 같이 표시
      </label>
      <label class="anniv-check-label hidden" id="anniv100dayLabel">
        <input type="checkbox" id="anniv100days">📅 매 100일마다 캘린더에 표기
      </label>
    </div>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="anniversaryCloseBtn">닫기</button>
      <button class="modal-btn cancel hidden" id="anniversaryCancelEditBtn">수정 취소</button>
      <button class="modal-btn primary" id="anniversaryAddBtn">추가</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('afterbegin', HTML_TEMPLATE);

  // -----------------------------------------
  // 3) 상수 / 상태
  // -----------------------------------------
  // 12개의 명확히 구분되는 색상 (관리자 페이지와 동일 — 비슷한 색 없이)
  const COLOR_PALETTE = [
    '#e74c3c', // 빨강
    '#e67e22', // 주황
    '#f1c40f', // 노랑
    '#a3cb38', // 라임
    '#27ae60', // 초록
    '#1abc9c', // 청록
    '#3498db', // 하늘
    '#2c3e50', // 네이비
    '#9b59b6', // 보라
    '#e84393', // 분홍
    '#795548', // 갈색
    '#7f8c8d'  // 회색
  ];

  let currentDate=new Date(), selectedColor=null, selectedSkin='dark';
  let currentUser=null, currentUserColor=null, currentUserSkin='dark';
  let selectedStart=null, selectedEnd=null;
  let tapFirst=null; // 1번째 탭 날짜 (null=미선택, string=2번째 탭 대기 중)
  let editingEventId=null; // 수정 중인 일정 ID (null=추가 모드)
  let _pastEventsCollapsed=true; // 이번달 지난 일정 접힘 상태
  let editingAnnivId=null; // 수정 중인 기념일 ID (null=추가 모드)

  // 메모리 캐시 — DB 호출 결과를 보관해서 렌더 함수는 동기적으로 동작
  const cache = { events:[], users:{}, allUsers:{}, notices:[], anniversaries:[] };

  // localStorage 폴백 모드 (API/KV 미연결 시 자동 전환)
  let localMode = false;
  const LS_EVENTS        = `${PREFIX}_ls_events`;
  const LS_USERS         = `${PREFIX}_ls_users`;
  const LS_NOTICES       = `${PREFIX}_ls_notices`;
  const LS_ANNIVERSARIES = `${PREFIX}_ls_anniversaries`;
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
  async function refreshAnniversaries(){
    if(localMode){ cache.anniversaries = lsGet(LS_ANNIVERSARIES, []); return; }
    cache.anniversaries = await fetchJSON(`${API}/anniversaries?prefix=${encodeURIComponent(PREFIX)}`);
  }
  async function refreshAll(){
    if(localMode){
      cache.events        = lsGet(LS_EVENTS,  []);
      cache.users         = lsGet(LS_USERS,   {});
      cache.allUsers      = cache.users;
      cache.notices       = lsGet(LS_NOTICES, []);
      cache.anniversaries = lsGet(LS_ANNIVERSARIES, []);
      return;
    }
    await Promise.all([refreshEvents(), refreshUsers(), refreshNotices(), refreshAnniversaries()]);
    cache.allUsers = cache.users; // 같은 캘린더 사용자만 사용
  }

  // 캐시 읽기 (동기)
  function loadEvents(){ return cache.events; }
  function loadUsers(){ return cache.users; }
  function loadAllUsers(){ return cache.allUsers; }
  function loadNotices(){ return cache.notices; }
  function loadAnniversaries(){ return cache.anniversaries || []; }

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
  async function apiAddAnniversary(item){
    if(localMode){
      const arr=lsGet(LS_ANNIVERSARIES,[]); arr.push(item); lsSet(LS_ANNIVERSARIES,arr);
      cache.anniversaries.push(item); return;
    }
    await fetchJSON(`${API}/anniversaries?prefix=${encodeURIComponent(PREFIX)}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item)
    });
    cache.anniversaries.push(item);
  }
  async function apiDeleteAnniversary(id){
    if(localMode){
      const arr=lsGet(LS_ANNIVERSARIES,[]).filter(a=>a.id!==id); lsSet(LS_ANNIVERSARIES,arr);
      cache.anniversaries=cache.anniversaries.filter(a=>a.id!==id); return;
    }
    await fetchJSON(`${API}/anniversaries?prefix=${encodeURIComponent(PREFIX)}&id=${encodeURIComponent(id)}`,{method:'DELETE'});
    cache.anniversaries=cache.anniversaries.filter(a=>a.id!==id);
  }
  async function apiUpdateAnniversary(id, data){
    if(localMode){
      const arr=lsGet(LS_ANNIVERSARIES,[]);
      const i=arr.findIndex(a=>a.id===id);
      if(i!==-1){arr[i]={...arr[i],...data,id};lsSet(LS_ANNIVERSARIES,arr);}
      const ci=cache.anniversaries.findIndex(a=>a.id===id);
      if(ci!==-1) cache.anniversaries[ci]={...cache.anniversaries[ci],...data,id};
      return;
    }
    await fetchJSON(`${API}/anniversaries?prefix=${encodeURIComponent(PREFIX)}&id=${encodeURIComponent(id)}`,{
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
    });
    const ci=cache.anniversaries.findIndex(a=>a.id===id);
    if(ci!==-1) cache.anniversaries[ci]={...cache.anniversaries[ci],...data,id};
  }

  // -----------------------------------------
  // 5) 포맷 / 유틸
  // -----------------------------------------
  function makeId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function formatDate(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function todayStr(){ const t=new Date();return formatDate(t.getFullYear(),t.getMonth(),t.getDate()); }

  // 대한민국 법정공휴일 — 1년에 1번 date.nager.at API에서 자동 갱신.
  // API 실패 시 아래 하드코딩 폴백 사용. 음력 명절(설날·추석·부처님오신날)은 양력 환산값.
  const HOLIDAYS_FALLBACK = {
    // 2024
    '2024-01-01':'신정','2024-02-09':'설날','2024-02-10':'설날','2024-02-11':'설날','2024-02-12':'대체공휴일',
    '2024-03-01':'삼일절','2024-04-10':'국회의원선거','2024-05-05':'어린이날','2024-05-06':'대체공휴일',
    '2024-05-15':'부처님오신날','2024-06-06':'현충일','2024-08-15':'광복절','2024-09-16':'추석','2024-09-17':'추석',
    '2024-09-18':'추석','2024-10-01':'국군의날','2024-10-03':'개천절','2024-10-09':'한글날','2024-12-25':'성탄절',
    // 2025
    '2025-01-01':'신정','2025-01-27':'임시공휴일','2025-01-28':'설날','2025-01-29':'설날','2025-01-30':'설날',
    '2025-03-01':'삼일절','2025-03-03':'대체공휴일','2025-05-05':'어린이날·부처님오신날','2025-05-06':'대체공휴일',
    '2025-06-03':'대통령선거','2025-06-06':'현충일','2025-08-15':'광복절','2025-10-03':'개천절',
    '2025-10-05':'추석','2025-10-06':'추석','2025-10-07':'추석','2025-10-08':'대체공휴일',
    '2025-10-09':'한글날','2025-12-25':'성탄절',
    // 2026
    '2026-01-01':'신정','2026-02-16':'설날','2026-02-17':'설날','2026-02-18':'설날','2026-03-01':'삼일절',
    '2026-03-02':'대체공휴일','2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일',
    '2026-06-03':'전국동시지방선거','2026-06-06':'현충일','2026-08-15':'광복절','2026-08-17':'대체공휴일',
    '2026-09-24':'추석','2026-09-25':'추석','2026-09-26':'추석','2026-09-28':'대체공휴일','2026-10-03':'개천절',
    '2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절',
    // 2027
    '2027-01-01':'신정','2027-02-06':'설날','2027-02-07':'설날','2027-02-08':'설날','2027-02-09':'대체공휴일',
    '2027-03-01':'삼일절','2027-05-05':'어린이날','2027-05-13':'부처님오신날','2027-06-06':'현충일',
    '2027-06-07':'대체공휴일','2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-09-14':'추석',
    '2027-09-15':'추석','2027-09-16':'추석','2027-10-03':'개천절','2027-10-04':'대체공휴일',
    '2027-10-09':'한글날','2027-10-11':'대체공휴일','2027-12-25':'성탄절'
  };
  // 실제 사용 데이터 (API 캐시 + 폴백 병합) — bootstrap에서 갱신 시도
  let holidaysData = { ...HOLIDAYS_FALLBACK };
  function getHoliday(dateStr){ return holidaysData[dateStr] || null; }

  // 1년에 1번 공휴일 갱신 — date.nager.at 무료 API (CORS 허용, 키 불필요)
  async function refreshHolidaysIfNeeded(){
    const CACHE_KEY = 'kr_holidays_cache';
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const cached = lsGet(CACHE_KEY, null);
    const now = Date.now();
    // 캐시가 1년 이내면 그대로 사용 (재요청 X)
    if (cached?.fetchedAt && (now - cached.fetchedAt) < ONE_YEAR_MS && cached.data) {
      holidaysData = { ...cached.data, ...HOLIDAYS_FALLBACK };
      return false; // 갱신 안 함
    }
    // 1년 지났거나 캐시 없음 → API에서 가져오기 (작년 ~ 내후년 4개년)
    const cy = new Date().getFullYear();
    const years = [cy - 1, cy, cy + 1, cy + 2];
    try {
      const all = {};
      for (const year of years) {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
        if (!res.ok) continue;
        const list = await res.json();
        list.forEach(h => { if (h.date && h.localName) all[h.date] = h.localName; });
      }
      if (Object.keys(all).length > 0) {
        lsSet(CACHE_KEY, { fetchedAt: now, data: all });
        // 하드코딩 데이터가 우선 (선거·임시공휴일 등 API에 없는 한국 특수 공휴일 보장)
        holidaysData = { ...all, ...HOLIDAYS_FALLBACK };
        return true; // 갱신됨
      }
    } catch(e) {
      console.error('공휴일 API 가져오기 실패 → 하드코딩 폴백 사용:', e);
    }
    return false;
  }
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

  // 음력 변환 — Intl.DateTimeFormat 'ca-chinese' 활용 (별도 라이브러리 불필요)
  let _lunarFmt=null;
  function _getLunarFmt(){
    if(_lunarFmt===false) return null;
    if(!_lunarFmt){
      try{ _lunarFmt=new Intl.DateTimeFormat('ko-KR-u-ca-chinese',{month:'numeric',day:'numeric'}); }
      catch(e){ _lunarFmt=false; return null; }
    }
    return _lunarFmt;
  }
  const _l2sCache={};
  // 양력 날짜 문자열(YYYY-MM-DD) → 음력 {month, day, leap}
  function solarToLunar(solarDateStr){
    const fmt=_getLunarFmt(); if(!fmt) return null;
    try{
      const parts=fmt.formatToParts(new Date(solarDateStr+'T12:00:00'));
      const mp=parts.find(p=>p.type==='month')?.value||'';
      const dp=parts.find(p=>p.type==='day')?.value||'';
      const isLeap=mp.includes('윤');
      const lm=parseInt(mp.match(/\d+/)?.[0]||'0');
      const ld=parseInt(dp.match(/\d+/)?.[0]||'0');
      return (lm&&ld)?{month:lm,day:ld,leap:isLeap}:null;
    }catch(e){return null;}
  }
  // 음력 월/일 → 해당 연도의 양력 날짜 문자열 (캐시 포함, O(365) 탐색)
  function lunarToSolar(year, lunarMonth, lunarDay){
    const key=`${year}-${lunarMonth}-${lunarDay}`;
    if(_l2sCache[key]!==undefined) return _l2sCache[key];
    const fmt=_getLunarFmt();
    if(!fmt){ _l2sCache[key]=null; return null; }
    try{
      for(let m=1;m<=12;m++){
        const dmax=new Date(year,m,0).getDate();
        for(let d=1;d<=dmax;d++){
          const parts=fmt.formatToParts(new Date(year,m-1,d,12,0,0));
          const mp=parts.find(p=>p.type==='month')?.value||'';
          const dp=parts.find(p=>p.type==='day')?.value||'';
          const lm2=parseInt(mp.match(/\d+/)?.[0]||'0');
          const ld2=parseInt(dp.match(/\d+/)?.[0]||'0');
          if(lm2===lunarMonth&&ld2===lunarDay){
            const result=formatDate(year,m-1,d);
            _l2sCache[key]=result; return result;
          }
        }
      }
    }catch(e){}
    _l2sCache[key]=null; return null;
  }

  // -----------------------------------------
  // 기념일 · 생일 가상 이벤트 생성 헬퍼
  // -----------------------------------------

  // 기념일 1건의 다음 발생 양력 날짜 반환 (음력 지원)
  function getAnnivNextDate(ann){
    const today=todayStr();
    const [oy,om,od]=ann.date.split('-').map(Number);
    const cy=new Date().getFullYear();
    const pad=n=>String(n).padStart(2,'0');
    for(const y of [cy,cy+1]){
      if(y<=oy) continue;
      const ds=`${y}-${pad(om)}-${pad(od)}`;
      if(ds>=today) return ds;
    }
    return null;
  }

  // D-day 문자열 반환 ('D-Day' | 'D-3' | 'D+5')
  function calcDday(targetDateStr){
    const today=todayStr();
    if(targetDateStr===today) return 'D-Day';
    const diff=daysBetween(today,targetDateStr);
    return diff>0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  }

  // 기념일 1건의 다음 발생 목록 반환 (연도별 1건 + 100일 1건)
  function getAnnivNextOccurrences(ann){
    const today=todayStr();
    const [oy,om,od]=ann.date.split('-').map(Number);
    const cy=new Date().getFullYear();
    const pad=n=>String(n).padStart(2,'0');
    const result=[];

    // 연도별 다음 발생 (n >= 1)
    for(const y of [cy, cy+1]){
      if(y<=oy) continue;
      const ds=`${y}-${pad(om)}-${pad(od)}`;
      if(ds>=today){
        const n=y-oy;
        result.push({
          dateStr:ds, n,
          label: ann.type==='birthday' ? `${n}번째 생일` : `${n}주년`,
          dday: calcDday(ds),
          subtype: ann.type
        });
        break;
      }
    }

    // 100일 단위 다음 발생 (기념일만)
    if(ann.type==='anniversary' && ann.show100days){
      const origMs=new Date(oy,om-1,od).getTime();
      for(let n=100; n<=36500; n+=100){
        const d=new Date(origMs+n*86400000);
        const ds=formatDate(d.getFullYear(),d.getMonth(),d.getDate());
        if(ds>=today && ds>ann.date){
          result.push({
            dateStr:ds, n,
            label:`${n}일`,
            dday: calcDday(ds),
            subtype:'100days'
          });
          break;
        }
      }
    }

    return result.sort((a,b)=>a.dateStr.localeCompare(b.dateStr));
  }

  // 기간 내 기념일 가상 이벤트 배열 생성
  function generateAnniversaryVirtualEventsForRange(startStr, endStr){
    const result=[];
    const anns=loadAnniversaries();
    if(!anns.length) return result;
    const [sy]=startStr.split('-').map(Number);
    const [ey]=endStr.split('-').map(Number);
    const pad=n=>String(n).padStart(2,'0');

    for(const ann of anns){
      if(!ann.date) continue;
      const [oy,om,od]=ann.date.split('-').map(Number);
      const color=ann.type==='birthday'?'#e84393':'#e74c3c';
      const userBadge=ann.type==='birthday'?'🎂':'💕';

      // 음력 체크 시: 양력→음력 변환 (1번만 계산)
      const lunarOfBirth=(ann.isLunar && ann.type==='birthday') ? solarToLunar(ann.date) : null;

      // 연도별 이벤트 (n >= 1)
      for(let y=Math.max(sy,oy+1); y<=ey; y++){
        const n=y-oy;

        // ① 양력 이벤트 — 항상 표시
        const dsSolar=`${y}-${pad(om)}-${pad(od)}`;
        if(dsSolar>=startStr && dsSolar<=endStr){
          // 음력 체크 시 "(양력)" 구분 레이블 붙임
          const solarLabel=ann.isLunar?' (양력)':'';
          result.push({
            isAnniversary:true, anniversaryId:ann.id, anniversaryType:ann.type,
            text: ann.type==='birthday' ? `🎂 ${ann.name} (${n}번째 생일${solarLabel})` : `💕 ${ann.name} (${n}주년)`,
            startDate:dsSolar, endDate:dsSolar, from:'', to:'',
            color, user:userBadge, important:true
          });
        }

        // ② 음력 이벤트 — 음력 체크 시 추가 표시 (음력 날짜→양력 변환 날짜에 표기)
        if(lunarOfBirth){
          const dsLunar=lunarToSolar(y, lunarOfBirth.month, lunarOfBirth.day);
          if(dsLunar && dsLunar>=startStr && dsLunar<=endStr && dsLunar!==dsSolar){
            result.push({
              isAnniversary:true, anniversaryId:ann.id, anniversaryType:ann.type,
              text:`🎂 ${ann.name} (${n}번째 생일 (음력))`,
              startDate:dsLunar, endDate:dsLunar, from:'', to:'',
              color, user:userBadge, important:true
            });
          }
        }
      }

      // 100일 단위 이벤트 (기념일만)
      if(ann.type==='anniversary' && ann.show100days){
        const origMs=new Date(oy,om-1,od).getTime();
        for(let n=100; n<=36500; n+=100){
          const d=new Date(origMs+n*86400000);
          const ds=formatDate(d.getFullYear(),d.getMonth(),d.getDate());
          if(ds>endStr) break;
          if(ds>=startStr && ds>ann.date){
            result.push({
              isAnniversary:true,
              anniversaryId:ann.id,
              anniversaryType:'anniversary-100',
              text:`💕 ${ann.name} (${n}일)`,
              startDate:ds, endDate:ds, from:'', to:'',
              color:'#e74c3c', user:'💕', important:true
            });
          }
        }
      }
    }
    return result;
  }

  // -----------------------------------------
  // 기념일 모달 UI
  // -----------------------------------------
  function openAnniversaryModal(){
    renderAnniversaryList();
    document.getElementById('anniversaryModal').classList.remove('hidden');
  }
  function resetAnnivForm(){
    editingAnnivId=null;
    document.getElementById('annivName').value='';
    document.getElementById('annivDate').value='';
    document.getElementById('anniv100days').checked=false;
    document.getElementById('annivLunar').checked=false;
    document.getElementById('annivTypeBirthday').checked=true;
    document.getElementById('annivBirthdayLabel').classList.add('active');
    document.getElementById('annivAnnivLabel').classList.remove('active');
    document.getElementById('anniv100dayLabel').classList.add('hidden');
    document.getElementById('annivFormTitle').textContent='+ 새로 추가';
    document.getElementById('anniversaryAddBtn').textContent='추가';
    document.getElementById('anniversaryCancelEditBtn').classList.add('hidden');
  }
  function closeAnniversaryModal(){
    document.getElementById('anniversaryModal').classList.add('hidden');
    resetAnnivForm();
  }
  function startEditAnniversary(ann){
    editingAnnivId=ann.id;
    if(ann.type==='birthday'){
      document.getElementById('annivTypeBirthday').checked=true;
      document.getElementById('annivBirthdayLabel').classList.add('active');
      document.getElementById('annivAnnivLabel').classList.remove('active');
      document.getElementById('anniv100dayLabel').classList.add('hidden');
    } else {
      document.getElementById('annivTypeAnniversary').checked=true;
      document.getElementById('annivAnnivLabel').classList.add('active');
      document.getElementById('annivBirthdayLabel').classList.remove('active');
      document.getElementById('anniv100dayLabel').classList.remove('hidden');
      document.getElementById('anniv100days').checked=!!ann.show100days;
    }
    document.getElementById('annivName').value=ann.name;
    document.getElementById('annivDate').value=ann.date;
    document.getElementById('annivLunar').checked=!!ann.isLunar;
    document.getElementById('annivFormTitle').textContent='✏️ 수정';
    document.getElementById('anniversaryAddBtn').textContent='저장';
    document.getElementById('anniversaryCancelEditBtn').classList.remove('hidden');
    document.getElementById('annivFormTitle').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function renderAnniversaryList(){
    const el=document.getElementById('anniversaryList');
    el.innerHTML='';
    const anns=loadAnniversaries();
    if(!anns.length){
      el.innerHTML='<p style="color:var(--empty-msg);font-size:13px;padding:8px 0">등록된 기념일이 없습니다.</p>';
      return;
    }
    anns.forEach(ann=>{
      const elapsed=daysBetween(ann.date, todayStr()); // 기준일부터 오늘까지 경과일
      const icon=ann.type==='birthday'?'🎂':'💕';
      const typeLabel=ann.type==='birthday'?'생일':'기념일';
      const isAnniv=ann.type==='anniversary';
      const elapsedCls='anniv-dday'+(isAnniv?' type-anniversary':'');
      const elapsedHtml=elapsed>=0?`<span class="${elapsedCls}">${elapsed}일째</span>`:'';

      // 다음 발생일까지 D-day
      const nextDate=getAnnivNextDate(ann);
      let ddayHtml='';
      if(nextDate){
        const ddLabel=calcDday(nextDate);
        const ddCls='anniv-dday anniv-dday-sm'+(isAnniv?' type-anniversary':'')+(ddLabel==='D-Day'?' dday-today':'');
        ddayHtml=`<span class="${ddCls}">${ddLabel}</span>`;
      }

      // 음력 날짜 표시 — 항상 양력 생일의 음력 변환값 표시 (isLunar 체크 시에만)
      let lunarHtml='';
      if(ann.type==='birthday' && ann.isLunar){
        const lunar=solarToLunar(ann.date);
        if(lunar) lunarHtml=`<span class="anniv-lunar-badge">🌙 음력 ${lunar.month}월 ${lunar.day}일${lunar.leap?' (윤달)':''}</span>`;
      }

      const item=document.createElement('div');
      item.className='anniv-item'+(isAnniv?' type-anniversary':'');
      item.innerHTML=`
        <div class="anniv-row-left">
          <span class="anniv-icon-lbl">${icon}</span>
          <div class="anniv-info">
            <div class="anniv-name-row">
              <span class="anniv-name">${ann.name}</span>
              <span class="anniv-type-tag">${typeLabel}</span>
              ${ann.isLunar?'<span class="anniv-lunar-tag">🌙음력</span>':''}
              ${elapsedHtml}
              ${ddayHtml}
            </div>
            <div class="anniv-orig-date">📅 ${ann.date} 부터${lunarHtml}</div>
            ${nextDate&&nextDate!==todayStr()?`<div class="anniv-next-date">다음: ${nextDate}</div>`:''}
          </div>
        </div>
        <div class="anniv-actions">
          <button class="anniv-edit-btn">✏️</button>
          <button class="anniv-del-btn">삭제</button>
        </div>`;
      item.querySelector('.anniv-del-btn').addEventListener('click',()=>deleteAnniversary(ann.id));
      item.querySelector('.anniv-edit-btn').addEventListener('click',()=>startEditAnniversary(ann));
      el.appendChild(item);
    });
  }
  async function addAnniversary(){
    const type=document.querySelector('input[name="annivType"]:checked')?.value||'birthday';
    const name=document.getElementById('annivName').value.trim();
    const date=document.getElementById('annivDate').value;
    const show100days=type==='anniversary'&&document.getElementById('anniv100days').checked;
    const isLunar=type==='birthday'&&document.getElementById('annivLunar').checked;
    if(!name||!date){ alert('이름과 날짜를 모두 입력하세요.'); return; }
    const btn=document.getElementById('anniversaryAddBtn');
    btn.disabled=true;
    try{
      if(editingAnnivId){
        // 수정 모드 — PUT API 호출
        await apiUpdateAnniversary(editingAnnivId,{type,name,date,show100days,isLunar});
      } else {
        // 추가 모드 — POST API 호출
        await apiAddAnniversary({id:makeId(),type,name,date,show100days,isLunar,createdBy:currentUser});
      }
      resetAnnivForm();
      renderAnniversaryList();
      renderCalendar();
      renderEventList();
    }catch(e){
      alert((editingAnnivId?'수정':'추가')+' 실패: '+e.message);
    }finally{
      btn.disabled=false;
    }
  }
  async function deleteAnniversary(id){
    if(!confirm('이 기념일을 삭제하면 캘린더의 모든 표기가 사라집니다.\n삭제하시겠습니까?')) return;
    try{
      await apiDeleteAnniversary(id);
      renderAnniversaryList();
      renderCalendar();
      renderEventList();
    }catch(e){
      alert('삭제 실패: '+e.message);
    }
  }

  // -----------------------------------------
  // 6) 로그인 화면 UI
  // -----------------------------------------
  // 캘린더 내 다른 사용자가 쓰고 있는 색은 팔레트에서 숨김 (자기 색은 유지)
  function renderColorPalette(){
    const el=document.getElementById('colorPalette');
    if(!el) return;
    el.innerHTML='';
    const typedName = document.getElementById('nameInput')?.value.trim();
    const ownColor = typedName && cache.users[typedName]?.color;
    const usedColors = new Set(
      Object.entries(cache.users)
        .filter(([n]) => n !== typedName) // 본인은 제외
        .map(([_, u]) => u.color)
        .filter(Boolean)
    );
    COLOR_PALETTE.forEach(c=>{
      if(usedColors.has(c)) return; // 다른 사용자가 쓰는 색 숨김
      const cell=document.createElement('div');cell.className='color-cell';
      cell.style.background=c;cell.dataset.color=c;
      if(c===selectedColor) cell.classList.add('active');
      cell.addEventListener('click',()=>pickColor(c));el.appendChild(cell);
    });
    // 빈 팔레트 — 모든 색이 점유됨
    if(!el.children.length){
      const note=document.createElement('div');
      note.style.cssText='grid-column:1/-1;text-align:center;color:var(--text-secondary);font-size:12px;padding:8px;';
      note.textContent='사용 가능한 색상이 없습니다.';
      el.appendChild(note);
    }
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

  // 최대인원 도달 시: 사용자 칩만 노출, 신규 등록 폼 숨김
  async function applyCapacityState(){
    const form = document.getElementById('newUserForm');
    const note = document.getElementById('capacityFullNote');
    const subtitle = document.getElementById('loginSubtitle');
    if(!form || !note) return;
    let max = 0;
    if(!localMode){
      try {
        const meta = await fetchJSON(`${API}/cal-meta?prefix=${encodeURIComponent(PREFIX)}`);
        max = Number(meta?.maxUsers || 0);
      } catch(e) { max = 0; }
    }
    const count = Object.keys(cache.users).length;
    const full = max > 0 && count >= max;
    form.classList.toggle('hidden', full);
    note.classList.toggle('hidden', !full);
    if(subtitle) subtitle.style.display = full ? 'none' : '';
  }

  async function renderSavedUsers(){
    // 인원 제한 상태 반영 — 가득 차면 신규 등록 폼 숨김
    await applyCapacityState();
    // 색상 팔레트도 다시 그려서 사용 중인 색 반영
    renderColorPalette();
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
        pickColor(u.color);setLoginSkin(u.skin||'dark');login();
      });
      list.appendChild(chip);
    });
  }


  // -----------------------------------------
  // 휴대폰 인증 모달 (패스워드 대용)
  //   - DB에 phone 없으면 → 신규 등록 모드 (입력 → DB 저장 + localStorage 캐시)
  //   - DB에 phone 있고 localStorage 미저장(=새 기기) → 검증 모드 (입력 → DB와 비교 → 일치 시 캐시)
  //   - localStorage에 저장돼있고 일치하면 → 자동 통과
  // 반환: 입력된 phone 문자열(성공) 또는 null(취소/실패)
  // -----------------------------------------
  function phoneKey(name){ return `${PREFIX}_phone_${name}`; }
  function showPhoneAuthModal(mode, name){
    return new Promise(resolve=>{
      const overlay=document.getElementById('phoneAuthModal');
      const body=document.getElementById('phoneAuthBody');
      const input=document.getElementById('phoneAuthInput');
      const errBox=document.getElementById('phoneAuthError');
      const okBtn=document.getElementById('phoneAuthOkBtn');
      const cancelBtn=document.getElementById('phoneAuthCancelBtn');
      input.value=''; errBox.textContent='';
      body.textContent = mode==='register'
        ? `${name} 님 최초 로그인입니다.\n사용하실 휴대폰 번호를 등록해주세요.`
        : `${name} 님, 등록된 휴대폰 번호를 입력해주세요.`;
      overlay.classList.remove('hidden');
      setTimeout(()=>input.focus(),50);

      const cleanup=val=>{
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click',onOk);
        cancelBtn.removeEventListener('click',onCancel);
        input.removeEventListener('keypress',onKey);
        resolve(val);
      };
      const onCancel=()=>cleanup(null);
      const onKey=e=>{ if(e.key==='Enter') onOk(); };
      const onOk=async()=>{
        const phone=input.value.replace(/[^0-9]/g,'');
        if(phone.length<9){ errBox.textContent='유효한 번호를 입력해주세요.'; return; }
        okBtn.disabled=true;
        try{
          if(mode==='register'){
            // DB에 phone 저장
            await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ name, color: selectedColor, skin: selectedSkin, phone })
            });
            localStorage.setItem(phoneKey(name), phone);
            cleanup(phone);
          } else {
            // 검증 모드 — DB와 비교 (시도 제한 적용)
            const r=await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}&action=verify`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ name, phone })
            });
            if(r && r.ok){
              localStorage.setItem(phoneKey(name), phone);
              cleanup(phone);
            } else if(r && r.locked){
              const m=Math.floor((r.remainSec||0)/60), s=(r.remainSec||0)%60;
              errBox.textContent=`🔒 시도 한도 초과 — ${m}분 ${s}초 후 다시 시도하거나 관리자에게 문의하세요.`;
              okBtn.disabled=true;
              input.disabled=true;
            } else {
              const left = (r && typeof r.attemptsLeft==='number') ? r.attemptsLeft : null;
              errBox.textContent = left!=null
                ? `휴대폰 번호 불일치 (남은 시도: ${left}회)`
                : '휴대폰 번호가 일치하지 않습니다.';
              okBtn.disabled=false;
            }
          }
        } catch(e){
          errBox.textContent='서버 오류: '+e.message;
          okBtn.disabled=false;
        }
      };
      okBtn.disabled=false;
      okBtn.addEventListener('click',onOk);
      cancelBtn.addEventListener('click',onCancel);
      input.addEventListener('keypress',onKey);
    });
  }

  // 로그인 시 휴대폰 인증 (필요 시 모달). 통과 시 true, 실패/취소 시 false 반환.
  async function ensurePhoneAuth(name){
    if(localMode) return true; // 로컬 폴백 모드는 인증 생략
    // 최신 사용자 정보 조회 — hasPhone 확인용
    let users;
    try { users = await fetchJSON(`${API}/users?prefix=${encodeURIComponent(PREFIX)}`); }
    catch(e){ console.error('users 조회 실패:', e); return true; /* 서버 조회 실패 시 진행 */ }
    const info = users && users[name];
    const hasPhone = info && info.hasPhone;
    if(!hasPhone){
      // 신규 등록
      const result=await showPhoneAuthModal('register', name);
      return !!result;
    }
    // 이미 등록된 사용자 — localStorage 확인
    const cached = localStorage.getItem(phoneKey(name));
    if(cached){
      // 한번 캐시된 기기는 빠르게 통과 (DB와 검증 안 함 — 신뢰)
      return true;
    }
    // 새 기기 — 검증 모달
    const result=await showPhoneAuthModal('verify', name);
    return !!result;
  }

  // 새 사용자 등록 가능 여부 검사 — 캘린더 최대인원 초과 방지
  async function checkUserCapacity(name){
    if(localMode) return true;
    if(cache.users[name]) return true; // 기존 사용자는 항상 통과
    try {
      const meta = await fetchJSON(`${API}/cal-meta?prefix=${encodeURIComponent(PREFIX)}`);
      const max = Number(meta?.maxUsers || 0);
      if (max <= 0) return true; // 0 = 무제한
      const currentCount = Object.keys(cache.users).length;
      if (currentCount >= max) {
        alert(`이 캘린더는 최대 ${max}명까지 사용 가능합니다.\n현재 ${currentCount}명이 등록되어 더 이상 추가할 수 없습니다.\n관리자에게 문의해주세요.`);
        return false;
      }
      return true;
    } catch(e) {
      console.error('최대인원 검사 실패, 진행 허용:', e);
      return true;
    }
  }

  async function login(){
    const name=document.getElementById('nameInput').value.trim();
    if(!name||!selectedColor)return;
    const loginBtn=document.getElementById('loginBtn');
    loginBtn.disabled=true;
    try{
      // 최대 인원 검증 (신규 사용자만 차단)
      const capacityOk = await checkUserCapacity(name);
      if(!capacityOk){ loginBtn.disabled=false; return; }
      // 휴대폰 인증 통과해야 진행
      const ok=await ensurePhoneAuth(name);
      if(!ok){ loginBtn.disabled=false; return; }
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
      loginBtn.disabled=false;
    }
  }
  function logout(){
    localStorage.removeItem(KEY_CURRENT);
    currentUser=currentUserColor=null;currentUserSkin='dark';
    selectedStart=selectedEnd=null;selectedColor=null;selectedSkin='dark';
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
    setLoginSkin('dark');
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
    _showInstallBar(); // 로그인 후 설치 바 표시 시도
    // 권한 상태 동기화 (외부 거부 시 KEY_NOTIFY_ON='0' 설정)
    if(autoNotice) syncNotifyPermission();
    // 알림 OFF 상태면 동의/거부 모달 (공지 유무와 무관, 세션당 1회)
    if(autoNotice) await askNotifyIfOff();
    // 공지 있으면 토스트로 5초간 은은하게 안내 (자동 모달 X)
    if(autoNotice && cache.notices.length>0) showNoticeToast(cache.notices);
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

  // iOS 감지 + PWA(홈화면 추가) 모드 감지
  function isIOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isIOSStandalone(){
    return isIOS() && (window.navigator.standalone===true || window.matchMedia('(display-mode: standalone)').matches);
  }

  // iOS 일반 Safari에서 알림 시도 시 PWA 설치 안내 모달
  function showIOSInstallModal(){
    const overlay=document.getElementById('iosInstallModal');
    const closeBtn=document.getElementById('iosInstallCloseBtn');
    overlay.classList.remove('hidden');
    closeBtn.addEventListener('click',()=>overlay.classList.add('hidden'),{once:true});
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
    // iOS 일반 Safari는 자동 모달 띄우지 않음 (사용자가 알람버튼 직접 누를 때만 PWA 안내)
    if(isIOS() && !isIOSStandalone()) return;
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
    // iOS Safari 일반 모드는 알림 미지원 → PWA 설치 안내
    if(isIOS() && !isIOSStandalone()){
      showIOSInstallModal();
      return;
    }
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
    // 새 일정·공지 알림은 서버 → SW push 로 일원화 (앱이 닫혀있어도 동작)
    // 앱을 켤 때마다 포그라운드에서 또 알림이 뜨는 중복 문제 방지를 위해
    // 현재 항목을 seen에 기록만 하고 별도 알림은 표시하지 않음.
    const seen=getSeenIds();
    cache.events.forEach(ev=>seen.add(ev.id));
    cache.notices.forEach(n=>seen.add(n.id));
    saveSeenIds(seen);
  }
  function updateSkinSwitchBtn(){
    document.getElementById('skinSwitchBtn').textContent=currentUserSkin==='dark'?'☀️':'🌙';
  }

  function renderImportantBanner(){
    const banner=document.getElementById('importantBanner');
    const list=document.getElementById('importantBannerList');
    const today=todayStr();
    const all=loadEvents();

    // 현재 보고 있는 달과 실제 이번달 비교
    const viewY=currentDate.getFullYear(), viewM=currentDate.getMonth();
    const nowD=new Date();
    const isCurrentMonth=(viewY===nowD.getFullYear() && viewM===nowD.getMonth());

    // 뷰 달의 첫날/마지막날 문자열
    const viewMonthStart=formatDate(viewY,viewM,1);
    const viewMonthEnd=formatDate(viewY,viewM,new Date(viewY,viewM+1,0).getDate());

    // 기념일 가상 이벤트 (뷰 달 전체)
    const annivBannerEvs=generateAnniversaryVirtualEventsForRange(viewMonthStart, viewMonthEnd);
    const allWithAnniv=[...all, ...annivBannerEvs];

    // 섹션 1: 진행 중인 일정 (항상 표시 — 오늘이 시작일~종료일 사이)
    const inProgressEvs=allWithAnniv
      .filter(ev=>ev.startDate<=today && ev.endDate>=today)
      .sort((a,b)=>a.endDate.localeCompare(b.endDate));

    let upcomingMonthEvs=[], pastMonthEvs=[], otherMonthEvs=[];

    if(isCurrentMonth){
      // 섹션 2: 이번달 진행 예정 (startDate > today, 이번달 내)
      upcomingMonthEvs=allWithAnniv
        .filter(ev=>ev.startDate>today && ev.startDate>=viewMonthStart && ev.startDate<=viewMonthEnd)
        .sort((a,b)=>a.startDate.localeCompare(b.startDate));
      // 섹션 3: 이번달 지난 일정 (endDate < today, 이번달 내) — 기념일 가상이벤트 제외
      pastMonthEvs=all
        .filter(ev=>ev.endDate<today && ev.endDate>=viewMonthStart && ev.endDate<=viewMonthEnd)
        .sort((a,b)=>a.startDate.localeCompare(b.startDate));
    } else {
      // 다른 달: 해당 월 전체 일정 (날짜 범위가 해당 달과 겹치는 모든 일정)
      otherMonthEvs=allWithAnniv
        .filter(ev=>ev.startDate<=viewMonthEnd && ev.endDate>=viewMonthStart)
        .sort((a,b)=>a.startDate.localeCompare(b.startDate));
    }

    if(!inProgressEvs.length && !upcomingMonthEvs.length && !pastMonthEvs.length && !otherMonthEvs.length){
      banner.classList.add('hidden');return;
    }
    banner.classList.remove('hidden');list.innerHTML='';

    const makeItem=(ev,isIP)=>{
      const item=document.createElement('div');item.className='b-item'+(isIP?' in-progress':'');
      const badge=document.createElement('span');badge.className='b-user-badge';
      badge.style.background=ev.color||'#95a5a6';badge.textContent=ev.user||'';
      const ts=formatTimeRange(ev.from,ev.to);
      const text=document.createElement('span');
      text.textContent=(ev.important&&!ev.isAnniversary?'⭐ ':'')+ev.text;
      const range=document.createElement('span');range.className='b-range'+(isIP?' b-range-ip':'');
      range.textContent=ev.startDate===ev.endDate?ev.startDate:`${ev.startDate}~${ev.endDate}`;
      item.appendChild(badge);item.appendChild(text);item.appendChild(range);
      if(ts){const tb=document.createElement('span');tb.className='b-time';tb.textContent=`⏰ ${ts}`;item.appendChild(tb);}
      // 기념일 이벤트에는 D-day 뱃지 추가
      if(ev.isAnniversary){
        const dd=document.createElement('span');
        const ddLabel=calcDday(ev.startDate);
        dd.className='anniv-dday anniv-dday-sm'+(ev.anniversaryType==='birthday'?'':' type-anniversary')+(ddLabel==='D-Day'?' dday-today':'');
        dd.textContent=ddLabel;
        dd.style.marginLeft='4px';
        item.appendChild(dd);
      }
      return item;
    };
    let prevSection=false;
    const addSection=(title,items,isIP)=>{
      if(!items.length)return;
      const t=document.createElement('div');t.className='b-section-title'+(prevSection?' b-section-gap':'');
      t.textContent=title;list.appendChild(t);
      items.forEach(ev=>list.appendChild(makeItem(ev,isIP)));
      prevSection=true;
    };

    addSection('📍 현재 일정 진행중', inProgressEvs, true);

    if(isCurrentMonth){
      addSection('✨ 이번달 진행 예정 일정', upcomingMonthEvs, false);
      // 이번달 지난 일정 — 접힘 상태 유지, 빈 경우 미표시
      if(pastMonthEvs.length){
        const gapCls=prevSection?' b-section-gap':'';
        const headerEl=document.createElement('div');
        headerEl.className='b-section-title b-past-header'+gapCls;
        const toggleSpan=document.createElement('span');
        toggleSpan.className='b-past-toggle';
        toggleSpan.textContent=_pastEventsCollapsed?'▶':'▼';
        headerEl.append('📋 이번달 지난 일정 ', toggleSpan);
        list.appendChild(headerEl);

        const pastWrap=document.createElement('div');
        pastWrap.className='b-past-items';
        if(_pastEventsCollapsed) pastWrap.classList.add('hidden');
        pastMonthEvs.forEach(ev=>pastWrap.appendChild(makeItem(ev,false)));
        list.appendChild(pastWrap);

        headerEl.addEventListener('click',()=>{
          _pastEventsCollapsed=!_pastEventsCollapsed;
          pastWrap.classList.toggle('hidden',_pastEventsCollapsed);
          toggleSpan.textContent=_pastEventsCollapsed?'▶':'▼';
        });
        prevSection=true;
      }
    } else {
      addSection(`📅 ${viewM+1}월 일정`, otherMonthEvs, false);
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
      // 법정공휴일 — 빨간색 + 공휴일명 표시
      const holidayName=getHoliday(dateStr);
      if(holidayName){ cell.classList.add('sun'); cell.classList.add('holiday'); }
      if(dateStr===today)cell.classList.add('today');
      if(selectedStart&&selectedEnd){
        const lo=minDate(selectedStart,selectedEnd),hi=maxDate(selectedStart,selectedEnd);
        if(selectedStart===selectedEnd&&dateStr===selectedStart)cell.classList.add('selected');
        else if(dateStr===lo||dateStr===hi)cell.classList.add('range-edge');
        else if(dateStr>lo&&dateStr<hi)cell.classList.add('range');
      }
      const num=document.createElement('div');num.className='date-num';num.textContent=day;cell.appendChild(num);
      if(holidayName){
        const hl=document.createElement('div');
        hl.className='holiday-name';
        hl.textContent=holidayName;
        cell.appendChild(hl);
      }

      // 일반 이벤트 + 기념일 가상 이벤트 합산
      const annivDayEvs=generateAnniversaryVirtualEventsForRange(dateStr,dateStr);
      const dayEvs=[...events.filter(ev=>dateInRange(dateStr,ev.startDate,ev.endDate)), ...annivDayEvs];
      const seen=new Set();
      const deduped=dayEvs.filter(ev=>{
        const k=`${ev.startDate}|${ev.endDate}|${ev.text}`;
        if(seen.has(k))return false;seen.add(k);return true;
      });
      deduped.slice(0,3).forEach(ev=>{
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
        bar.className=`event-bar ${barClass}${ev.isAnniversary?' anniv-bar':''}`;
        bar.style.background=ev.color||'#95a5a6';
        if(barClass==='bar-single'||barClass==='bar-start'||barClass==='bar-span'){
          const ts=formatTimeRange(ev.from,ev.to);
          if(ev.isAnniversary){
            bar.textContent=ev.text; // 기념일은 텍스트만 표시 (user 접두사 없음)
          } else {
            bar.innerHTML=`${ev.important?'⭐ ':''}${ev.user}: ${ev.text}${ts?` <span style="font-size:10px;opacity:0.75"> ${ts}</span>`:''}`;
          }
        }
        cell.appendChild(bar);
      });
      if(deduped.length>3){
        const more=document.createElement('div');more.className='event-bar bar-single';
        more.style.background='#95a5a6';more.textContent=`+${deduped.length-3}개 더`;cell.appendChild(more);
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
    // 날짜 + 요일 표기 헬퍼 (예: 2025-05-08 (목))
    const WEEKDAYS=['일','월','화','수','목','금','토'];
    const dateWithWeekday=(s)=>{
      const [y,m,d]=s.split('-').map(Number);
      return `${s} (${WEEKDAYS[new Date(y,m-1,d).getDay()]})`;
    };
    // 사용자 일정 + 기념일 가상 이벤트 매칭
    const matched=events.filter(ev=>rangesOverlap(ev.startDate,ev.endDate,selectedStart,selectedEnd));
    const annivMatched=generateAnniversaryVirtualEventsForRange(selectedStart,selectedEnd);
    // 선택 기간 내 공휴일 수집 (가상 항목으로 리스트에 표시 — 삭제 불가)
    const [sy,sm,sd]=selectedStart.split('-').map(Number);
    const [ey,em,ed]=selectedEnd.split('-').map(Number);
    const startD=new Date(sy,sm-1,sd), endD=new Date(ey,em-1,ed);
    const holidayItems=[];
    for(let cur=new Date(startD.getTime()); cur<=endD; cur.setDate(cur.getDate()+1)){
      const ds=formatDate(cur.getFullYear(),cur.getMonth(),cur.getDate());
      const name=getHoliday(ds);
      if(name) holidayItems.push({isHoliday:true, startDate:ds, endDate:ds, text:name, from:0, to:0});
    }
    // 통합 정렬 — 날짜순, 같은 날이면 공휴일→기념일→일반 순, 그 다음 시간순
    const allItems=[...holidayItems, ...annivMatched, ...matched].sort((a,b)=>{
      if(a.startDate!==b.startDate)return a.startDate.localeCompare(b.startDate);
      if(!!a.isHoliday !== !!b.isHoliday) return a.isHoliday ? -1 : 1;
      return hourOf(a.from)-hourOf(b.from);
    });
    if(!allItems.length){
      const m=document.createElement('li');m.className='empty-msg';
      m.textContent='등록된 일정이 없습니다.';list.appendChild(m);return;
    }
    allItems.forEach(ev=>{
      const li=document.createElement('li');
      const content=document.createElement('div');content.className='event-content';
      // 날짜(요일) 라인 — 항상 맨 위
      const dateLine=document.createElement('div');
      dateLine.className='event-date-line';
      dateLine.textContent = ev.startDate===ev.endDate
        ? `📅 ${dateWithWeekday(ev.startDate)}`
        : `📅 ${dateWithWeekday(ev.startDate)} ~ ${dateWithWeekday(ev.endDate)}`;
      content.appendChild(dateLine);

      if(ev.isHoliday){
        // 공휴일 항목 — 빨간 테두리/뱃지, 수정·삭제 버튼 없음
        li.style.borderLeftColor='#e74c3c';
        li.classList.add('holiday-item');
        const tag=document.createElement('span');tag.className='event-user';
        tag.style.background='#e74c3c';tag.textContent='🇰🇷 공휴일';content.appendChild(tag);
        const tx=document.createElement('span');tx.className='event-text';
        tx.textContent=ev.text;tx.style.color='#e74c3c';tx.style.fontWeight='600';
        content.appendChild(tx);
        li.appendChild(content);list.appendChild(li);
        return;
      }

      if(ev.isAnniversary){
        // 기념일/생일 항목 — 삭제·수정 불가, 잠금 아이콘
        const isBirthday=ev.anniversaryType==='birthday';
        li.style.borderLeftColor=ev.color||'#e84393';
        li.classList.add('anniv-list-item');
        if(!isBirthday) li.classList.add('type-anniversary');
        const badgeSpan=document.createElement('span');
        badgeSpan.className='anniv-event-badge'+(isBirthday?'':' type-anniversary');
        badgeSpan.textContent=isBirthday?'🎂생일':'💕기념일';
        content.appendChild(badgeSpan);
        const ddayLabel=calcDday(ev.startDate);
        const ddaySpan=document.createElement('span');
        ddaySpan.className='anniv-dday'+(ddayLabel==='D-Day'?' dday-today':'')+(isBirthday?'':' type-anniversary');
        ddaySpan.textContent=ddayLabel;
        content.appendChild(ddaySpan);
        const tx=document.createElement('span');tx.className='event-text';
        tx.textContent=ev.text;content.appendChild(tx);
        // 잠금 아이콘 (삭제 불가 표시)
        const lock=document.createElement('span');lock.className='anniv-lock-icon';lock.textContent='🔒';lock.title='기념일 관리에서 삭제 가능';
        li.appendChild(content);li.appendChild(lock);list.appendChild(li);
        return;
      }

      // 일반 일정
      li.style.borderLeftColor=ev.color||'#95a5a6';
      if(ev.important){
        const imp=document.createElement('span');imp.className='event-important-badge';
        imp.textContent='⭐중요';content.appendChild(imp);
      }
      const badge=document.createElement('span');badge.className='event-user';
      badge.style.background=ev.color||'#95a5a6';badge.textContent=ev.user;content.appendChild(badge);
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

  // 공지 토스트 — 5초 동안 은은하게 페이드 인/아웃, 클릭하면 모달 열림
  let noticeToastTimer=null;
  function showNoticeToast(notices){
    const toast=document.getElementById('noticeToast');
    if(!toast) return;
    const count=notices.length;
    // 헤더 + 각 공지 미리보기 (최대 5건 표시, 본문 30자 truncate)
    const PREVIEW_MAX=5, TEXT_MAX=30;
    const truncate=t=>{ const s=String(t||'').replace(/\s+/g,' ').trim(); return s.length>TEXT_MAX ? s.slice(0,TEXT_MAX)+'…' : s; };
    toast.innerHTML='';
    const head=document.createElement('div');
    head.className='notice-toast-head';
    head.textContent=`📢 등록된 공지 ${count}건 (탭하여 보기)`;
    toast.appendChild(head);
    notices.slice(0, PREVIEW_MAX).forEach(n=>{
      const line=document.createElement('div');
      line.className='notice-toast-line';
      line.textContent=`• ${truncate(n.text)}`;
      toast.appendChild(line);
    });
    if(count>PREVIEW_MAX){
      const more=document.createElement('div');
      more.className='notice-toast-more';
      more.textContent=`… 외 ${count-PREVIEW_MAX}건`;
      toast.appendChild(more);
    }

    if(noticeToastTimer){ clearTimeout(noticeToastTimer); noticeToastTimer=null; }
    toast.classList.remove('hidden');
    void toast.offsetWidth; // reflow → fade-in
    toast.classList.add('show');
    const onTap=()=>{
      toast.classList.remove('show');
      setTimeout(()=>toast.classList.add('hidden'),400);
      if(noticeToastTimer){ clearTimeout(noticeToastTimer); noticeToastTimer=null; }
      openNoticeModal();
    };
    toast.addEventListener('click', onTap, {once:true});
    noticeToastTimer=setTimeout(()=>{
      toast.classList.remove('show');
      setTimeout(()=>{ toast.classList.add('hidden'); toast.removeEventListener('click', onTap); }, 600);
      noticeToastTimer=null;
    }, 5000);
  }
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
  document.getElementById('nameInput').addEventListener('input',()=>{
    checkLoginReady();
    // 입력한 이름이 기존 사용자면 그 사람의 색을 다시 노출
    renderColorPalette();
  });
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

  // 중요 일정 배너 — 헤더 클릭/탭으로 접기/펼치기 (페이지 로드 시 항상 열림)
  (function setupBannerCollapse(){
    const banner=document.getElementById('importantBanner');
    const title=document.getElementById('importantBannerTitle');
    if(!banner||!title) return;
    let lastFire=0;
    const toggle=()=>{
      // 모바일에서 touchend → click 두번 발생 방지
      const now=Date.now();
      if(now-lastFire<400) return;
      lastFire=now;
      banner.classList.toggle('collapsed');
    };
    title.addEventListener('click',toggle);
    title.addEventListener('touchend',e=>{ e.preventDefault(); toggle(); }, {passive:false});
  })();

  // 캘린더 좌우 스와이프 — 다음달/저번달 이동
  (function setupCalendarSwipe(){
    const grid=document.getElementById('daysGrid');
    if(!grid) return;
    let sx=0, sy=0, st=0, tracking=false, swiped=false;
    grid.addEventListener('touchstart',e=>{
      if(editingEventId) return; // 수정 모드 비활성
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY;
      st=Date.now(); tracking=true; swiped=false;
    },{passive:true});
    grid.addEventListener('touchend',e=>{
      if(!tracking) return;
      tracking=false;
      if(e.changedTouches.length!==1) return;
      const dx=e.changedTouches[0].clientX-sx;
      const dy=e.changedTouches[0].clientY-sy;
      const dt=Date.now()-st;
      const MIN=60;            // 최소 이동 px
      if(dt>700) return;       // 너무 느린 동작 무시
      if(Math.abs(dx)<MIN) return;
      if(Math.abs(dx)<Math.abs(dy)*1.2) return; // 수직이 더 크면 스크롤로 간주
      // 스와이프 인식 — 후속 click 무시
      swiped=true;
      setTimeout(()=>{swiped=false;},400);
      if(dx<0) currentDate.setMonth(currentDate.getMonth()+1); // 좌로 스와이프 → 다음달
      else     currentDate.setMonth(currentDate.getMonth()-1); // 우로 스와이프 → 저번달
      // 선택된 날짜/탭 상태는 그대로 유지 (prev/next 버튼과 동일 동작)
      renderCalendar();
    },{passive:true});
    // 스와이프 직후의 click 이벤트가 day cell 선택을 발생시키지 않도록 캡처 단계에서 차단
    grid.addEventListener('click',e=>{
      if(swiped){ e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); }
    },true);
  })();
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
  document.getElementById('pwaInstallBtn').addEventListener('click', _triggerInstall);
  document.getElementById('pwaInstallDismiss').addEventListener('click', ()=>{
    sessionStorage.setItem(PWA_DISMISS_KEY,'1');
    _hideInstallBar();
  });
  document.getElementById('anniversaryBtn').addEventListener('click',openAnniversaryModal);
  document.getElementById('anniversaryCloseBtn').addEventListener('click',closeAnniversaryModal);
  document.getElementById('anniversaryAddBtn').addEventListener('click',addAnniversary);
  document.getElementById('anniversaryCancelEditBtn').addEventListener('click',resetAnnivForm);
  document.getElementById('anniversaryModal').addEventListener('click',e=>{
    if(e.target===document.getElementById('anniversaryModal')) closeAnniversaryModal();
  });
  // 기념일 타입 라디오 토글 — 100일/음력 체크박스 표시 여부
  document.getElementById('annivTypeBirthday').addEventListener('change',()=>{
    document.getElementById('annivBirthdayLabel').classList.add('active');
    document.getElementById('annivAnnivLabel').classList.remove('active');
    document.getElementById('anniv100dayLabel').classList.add('hidden');
    // 생일에서만 음력 체크 가능
    document.getElementById('annivLunarLabel').style.opacity='1';
    document.getElementById('annivLunarLabel').style.pointerEvents='';
  });
  document.getElementById('annivTypeAnniversary').addEventListener('change',()=>{
    document.getElementById('annivAnnivLabel').classList.add('active');
    document.getElementById('annivBirthdayLabel').classList.remove('active');
    document.getElementById('anniv100dayLabel').classList.remove('hidden');
    // 기념일에서는 음력 체크 비활성화
    document.getElementById('annivLunar').checked=false;
    document.getElementById('annivLunarLabel').style.opacity='0.4';
    document.getElementById('annivLunarLabel').style.pointerEvents='none';
  });
  // 레이블 클릭으로도 라디오 선택 가능하게
  document.getElementById('annivBirthdayLabel').addEventListener('click',()=>{
    document.getElementById('annivTypeBirthday').checked=true;
    document.getElementById('annivTypeBirthday').dispatchEvent(new Event('change'));
  });
  document.getElementById('annivAnnivLabel').addEventListener('click',()=>{
    document.getElementById('annivTypeAnniversary').checked=true;
    document.getElementById('annivTypeAnniversary').dispatchEvent(new Event('change'));
  });
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
    // 캐시된 공휴일 즉시 적용 (있으면) — 페이지 로딩 차단하지 않음
    refreshHolidaysIfNeeded().then(updated=>{
      // 1년 지나서 새로 받아왔으면 캘린더 다시 그리기
      if(updated && currentUser){ renderCalendar(); }
    });
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
    // 기본 스킨 다크 적용 (로그인 화면)
    setLoginSkin('dark');
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
        currentUserColor=u.color;currentUserSkin=u.skin||'dark';
        selectedColor=u.color;selectedSkin=u.skin||'dark';
        showCalendar(true); // 자동 로그인 시 공지 자동 팝업
      }
    }
  })();
})();
