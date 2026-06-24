/**
 * ★★ 음성 챗봇 메인 로직 ★★
 * - STT: Groq Whisper (1순위), Web Speech API (폴백)
 * - NLU: 규칙 기반 키워드 매칭
 * - TTS: Web Speech API speechSynthesis
 * - 백엔드: 기존 /api/events 등 연동
 */

// ===== 설정 =====
const API_BASE = '/api';
let currentPrefix = 'family';
let currentUser = '음성도우미';

// ===== DOM 요소 =====
const chatArea = document.getElementById('chat-area');
const micBtn = document.getElementById('mic-btn');
const statusText = document.getElementById('status-text');
const prefixSelect = document.getElementById('prefix-select');
const textInput = document.getElementById('text-input');
const textSendBtn = document.getElementById('text-send-btn');

// ===== 초기화 =====
prefixSelect.addEventListener('change', () => {
  currentPrefix = prefixSelect.value;
  addBotMsg(`캘린더를 "${prefixSelect.selectedOptions[0].text}"(으)로 바꿨어요.`);
});

micBtn.addEventListener('click', startListening);

// (텍스트 입력) 전송 버튼 클릭
textSendBtn.addEventListener('click', handleTextSubmit);

// (텍스트 입력) Enter 키로 전송
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    handleTextSubmit();
  }
});

// 텍스트 입력 처리 함수
async function handleTextSubmit() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  addUserMsg(text);
  await handleCommand(text);
}

// ===== (1) 음성 녹음 + STT =====
let mediaRecorder = null;
let audioChunks = [];
let isListening = false;
let webSpeechResult = '';   // Web Speech API 실시간 인식 결과 (병렬 폴백용)
let webSpeechRecognition = null;

async function startListening() {
  if (isListening) {
    // 녹음 중이면 중지
    stopListening();
    return;
  }

  try {
    // (a) 마이크 권한 요청
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isListening = true;
    webSpeechResult = '';
    micBtn.classList.add('listening');
    micBtn.querySelector('.mic-label').textContent = '듣는 중...';
    statusText.textContent = '말씀하신 후 버튼을 다시 눌러주세요';

    // (b) Web Speech API 실시간 인식을 동시에 시작 (폴백용)
    startWebSpeechParallel();

    // (c) MediaRecorder 녹음 시작 (Groq 전송용)
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMime() });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // (d) 녹음 완료 → STT 호출
      stream.getTracks().forEach(t => t.stop());
      stopWebSpeechParallel(); // Web Speech도 정리
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      await processAudio(audioBlob);
    };

    mediaRecorder.start();

    // (e) 최대 30초 후 자동 중지 (넉넉하게)
    setTimeout(() => {
      if (isListening) stopListening();
    }, 30000);

  } catch (err) {
    addBotMsg('마이크를 사용할 수 없어요. 설정에서 마이크 권한을 허용해 주세요.');
    statusText.textContent = '';
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  micBtn.querySelector('.mic-label').textContent = '음성';
  statusText.textContent = '인식 중...';
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// Web Speech API를 녹음과 동시에 병렬 실행 (실시간 폴백)
function startWebSpeechParallel() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  webSpeechRecognition = new SR();
  webSpeechRecognition.lang = 'ko-KR';
  webSpeechRecognition.continuous = true;
  webSpeechRecognition.interimResults = false;

  webSpeechRecognition.onresult = (e) => {
    // 인식된 결과를 계속 누적
    let text = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        text += e.results[i][0].transcript;
      }
    }
    if (text) webSpeechResult = text;
  };

  webSpeechRecognition.onerror = () => {}; // 무시 (Groq이 메인)
  webSpeechRecognition.onend = () => {
    // 녹음 중인데 종료되면 재시작 (브라우저가 일찍 끊을 수 있음)
    if (isListening && webSpeechRecognition) {
      try { webSpeechRecognition.start(); } catch (e) {}
    }
  };

  try { webSpeechRecognition.start(); } catch (e) {}
}

function stopWebSpeechParallel() {
  if (webSpeechRecognition) {
    try { webSpeechRecognition.abort(); } catch (e) {}
    webSpeechRecognition = null;
  }
}

function getSupportedMime() {
  // 브라우저 호환 MIME 타입 선택
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'audio/webm';
}

// ===== (2) Groq Whisper STT + LLM 보정 (한 번에 처리) =====
async function processAudio(audioBlob) {
  let transcript = '';
  let corrected = '';

  // (a) 오디오 크기가 너무 작으면(0.5초 미만) 무시
  if (audioBlob.size < 5000) {
    statusText.textContent = '';
    addBotMsg('너무 짧아서 알아듣지 못했어요. 조금 더 길게 말해주세요.');
    speak('조금 더 길게 말해주세요.');
    return;
  }

  try {
    // (b) Groq Whisper + LLM 보정 API 호출 (서버에서 한 번에 처리)
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('language', 'ko');

    const res = await fetch(`${API_BASE}/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      transcript = (data.text || '').trim();
      corrected = (data.corrected || transcript).trim();
    }
  } catch (e) {
    console.warn('Groq STT 실패:', e);
  }

  // (c) Groq 실패 시 → 병렬로 수집한 Web Speech 결과 사용
  if (!transcript && webSpeechResult) {
    transcript = webSpeechResult.trim();
    corrected = transcript; // Web Speech 폴백은 보정 없이 원문 사용
    console.log('Web Speech 폴백 사용:', transcript);
  }

  // (d) 짧은 대기 후 Web Speech 결과 한번 더 확인 (인식 지연 대비)
  if (!transcript) {
    await new Promise(r => setTimeout(r, 500));
    if (webSpeechResult) {
      transcript = webSpeechResult.trim();
      corrected = transcript;
    }
  }

  // (e) 인식 결과 처리
  statusText.textContent = '';
  if (transcript) {
    addUserMsg(corrected !== transcript ? corrected : transcript);
    if (corrected !== transcript) {
      addBotMsg(`💡 "${transcript}" → "${corrected}" (으)로 이해했어요.`);
    }
    await handleCommand(corrected);
  } else {
    addBotMsg('죄송해요, 잘 못 알아들었어요. 다시 한번 또박또박 말해주시거나 아래 입력창에 직접 입력해 주세요.');
    speak('잘 못 알아들었어요. 다시 말해주시거나 입력창에 직접 입력해 주세요.');
  }
}

// ===== (3) 의도 파악 (규칙 기반 NLU) =====
async function handleCommand(text) {
  const intent = parseIntent(text);

  switch (intent.action) {
    case 'query':
      await queryEvents(intent);
      break;
    case 'add':
      await addEvent(intent, text);
      break;
    case 'delete':
      addBotMsg('일정 삭제는 캘린더 앱에서 직접 해주세요.');
      speak('일정 삭제는 캘린더 앱에서 직접 해주세요.');
      break;
    case 'help':
      showHelp();
      break;
    default:
      addBotMsg('잘 이해하지 못했어요. "오늘 일정 알려줘" 또는 "내일 병원 등록해줘"처럼 말해보세요.');
      speak('잘 이해하지 못했어요. 오늘 일정 알려줘, 처럼 말해보세요.');
  }
}

function parseIntent(text) {
  // (a) 일정 조회 패턴
  if (/일정.*알려|뭐.*있|있.*뭐|확인|조회/.test(text)) {
    return { action: 'query', when: parseWhen(text) };
  }
  // (b) 일정 등록 패턴
  if (/등록|넣어|추가|잡아|잡아줘|해줘.*일정/.test(text)) {
    return { action: 'add', dates: parseDateRange(text), eventText: extractEventText(text) };
  }
  // (c) 삭제 패턴
  if (/삭제|지워|취소/.test(text)) {
    return { action: 'delete' };
  }
  // (d) 도움말
  if (/도움|뭐.*할.*수|사용법|도와/.test(text)) {
    return { action: 'help' };
  }
  // (e) 일정이라는 단어 없이도 날짜+내용이면 등록으로 간주
  const dates = parseDateRange(text);
  if (dates.startDate && extractEventText(text)) {
    return { action: 'add', dates, eventText: extractEventText(text) };
  }

  return { action: 'unknown' };
}

// ===== (4) 날짜 파싱 =====
function parseWhen(text) {
  if (/오늘/.test(text)) return 'today';
  if (/내일/.test(text)) return 'tomorrow';
  if (/모레/.test(text)) return 'dayafter';
  if (/이번\s*주/.test(text)) return 'thisweek';
  if (/다음\s*주/.test(text)) return 'nextweek';
  if (/이번\s*달/.test(text)) return 'thismonth';
  // 특정 날짜
  const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `${new Date().getFullYear()}-${pad(m[1])}-${pad(m[2])}`;
  return 'today';
}

function parseDateRange(text) {
  const year = new Date().getFullYear();
  let start = null, end = null;

  // "6월 15일부터 7월 3일까지" (다른 달)
  let m = text.match(/(\d{1,2})월\s*(\d{1,2})일.*?(?:부터|에서|~)\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    start = `${year}-${pad(m[1])}-${pad(m[2])}`;
    end = `${year}-${pad(m[3])}-${pad(m[4])}`;
    return { startDate: start, endDate: end };
  }

  // "6월 15일부터 20일까지" (같은 달)
  m = text.match(/(\d{1,2})월\s*(\d{1,2})일.*?(?:부터|에서|~)\s*(\d{1,2})일/);
  if (m) {
    start = `${year}-${pad(m[1])}-${pad(m[2])}`;
    end = `${year}-${pad(m[1])}-${pad(m[3])}`;
    return { startDate: start, endDate: end };
  }

  // "6월 15일에" (단일)
  m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    start = `${year}-${pad(m[1])}-${pad(m[2])}`;
    return { startDate: start, endDate: start };
  }

  // 상대 날짜
  const rel = resolveRelativeDate(text);
  if (rel) {
    const d = formatDate(rel);
    return { startDate: d, endDate: d };
  }

  return { startDate: null, endDate: null };
}

function resolveRelativeDate(text) {
  const today = new Date();
  if (/오늘/.test(text)) return today;
  if (/내일/.test(text)) return addDays(today, 1);
  if (/모레/.test(text)) return addDays(today, 2);

  // "다음 주 월요일"
  const dayMatch = text.match(/다음\s*주\s*(월|화|수|목|금|토|일)/);
  if (dayMatch) {
    const dayMap = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };
    const target = dayMap[dayMatch[1]];
    const diff = ((target - today.getDay()) + 7) % 7 + 7;
    return addDays(today, diff);
  }

  // "이번 주 금요일"
  const thisWeekMatch = text.match(/이번\s*주\s*(월|화|수|목|금|토|일)/);
  if (thisWeekMatch) {
    const dayMap = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };
    const target = dayMap[thisWeekMatch[1]];
    const diff = ((target - today.getDay()) + 7) % 7;
    return addDays(today, diff);
  }

  return null;
}

function extractEventText(text) {
  return text
    .replace(/\d{1,2}월\s*\d{1,2}일/g, '')
    .replace(/부터|까지|에서|에|~|등록|넣어|추가|잡아|해\s*줘|해줘|일정|좀|요|을|를|이|가|오늘|내일|모레/g, '')
    .replace(/다음\s*주\s*(월|화|수|목|금|토|일)요?일?/g, '')
    .replace(/이번\s*주\s*(월|화|수|목|금|토|일)요?일?/g, '')
    .trim();
}

// ===== (5) 일정 조회 =====
async function queryEvents(intent) {
  try {
    const res = await fetch(`${API_BASE}/events?prefix=${currentPrefix}`);
    if (!res.ok) throw new Error('API 오류');
    const events = await res.json();

    const { start, end } = getDateRange(intent.when);
    const filtered = events.filter(e => {
      return e.startDate <= end && (e.endDate || e.startDate) >= start;
    });

    if (filtered.length === 0) {
      const msg = `${getWhenLabel(intent.when)} 일정이 없어요.`;
      addBotMsg(msg);
      speak(msg);
    } else {
      let msg = `${getWhenLabel(intent.when)} 일정이 ${filtered.length}개 있어요:\n\n`;
      const speakParts = [`${getWhenLabel(intent.when)} 일정이 ${filtered.length}개 있어요.`];

      filtered.forEach((e, i) => {
        const line = `${i + 1}. ${e.text} (${e.user})`;
        msg += line + '\n';
        speakParts.push(`${i + 1}번, ${e.text}`);
      });

      addBotMsg(msg);
      speak(speakParts.join('. '));
    }
  } catch (err) {
    addBotMsg('일정을 불러오는데 문제가 생겼어요. 잠시 후 다시 해보세요.');
    speak('일정을 불러오는데 문제가 생겼어요.');
  }
}

function getDateRange(when) {
  const today = new Date();
  const todayStr = formatDate(today);

  switch (when) {
    case 'today': return { start: todayStr, end: todayStr };
    case 'tomorrow': {
      const d = formatDate(addDays(today, 1));
      return { start: d, end: d };
    }
    case 'dayafter': {
      const d = formatDate(addDays(today, 2));
      return { start: d, end: d };
    }
    case 'thisweek': {
      const mon = addDays(today, -(today.getDay() || 7) + 1);
      const sun = addDays(mon, 6);
      return { start: formatDate(mon), end: formatDate(sun) };
    }
    case 'nextweek': {
      const mon = addDays(today, 7 - (today.getDay() || 7) + 1);
      const sun = addDays(mon, 6);
      return { start: formatDate(mon), end: formatDate(sun) };
    }
    case 'thismonth': {
      const s = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const e = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(lastDay)}`;
      return { start: s, end: e };
    }
    default:
      // 특정 날짜 문자열
      if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return { start: when, end: when };
      return { start: todayStr, end: todayStr };
  }
}

function getWhenLabel(when) {
  const map = { today: '오늘', tomorrow: '내일', dayafter: '모레', thisweek: '이번 주', nextweek: '다음 주', thismonth: '이번 달' };
  return map[when] || when;
}

// ===== (6) 일정 등록 =====
async function addEvent(intent, rawText) {
  const { startDate, endDate } = intent.dates || {};
  const eventText = intent.eventText || extractEventText(rawText);

  if (!startDate) {
    addBotMsg('날짜를 알아듣지 못했어요. "6월 15일에 병원 등록해줘"처럼 말해보세요.');
    speak('날짜를 알아듣지 못했어요.');
    return;
  }
  if (!eventText) {
    addBotMsg('어떤 일정인지 알아듣지 못했어요. 다시 한번 말씀해 주세요.');
    speak('어떤 일정인지 알아듣지 못했어요.');
    return;
  }

  // 등록 확인 메시지
  const dateLabel = startDate === endDate
    ? startDate
    : `${startDate} ~ ${endDate}`;
  addBotMsg(`📝 "${eventText}"을(를) ${dateLabel}에 등록할게요.`);

  try {
    const event = {
      id: makeId(),
      user: currentUser,
      color: '#4a90d9',
      text: eventText,
      startDate,
      endDate: endDate || startDate,
      from: '',
      to: '',
      important: false
    };

    const res = await fetch(`${API_BASE}/events?prefix=${currentPrefix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    if (res.ok) {
      const msg = `등록 완료! ${dateLabel}에 "${eventText}" 일정을 넣었어요.`;
      addBotMsg('✅ ' + msg);
      speak(msg);
    } else {
      throw new Error('등록 실패');
    }
  } catch (err) {
    addBotMsg('등록에 실패했어요. 잠시 후 다시 해보세요.');
    speak('등록에 실패했어요.');
  }
}

// ===== (7) TTS 음성 출력 =====
function speak(text) {
  if (!window.speechSynthesis) return;

  // 이전 음성 중지
  speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = 0.85;   // 어르신 대비 느리게
  utter.pitch = 1.0;

  // 한국어 음성 선택
  const voices = speechSynthesis.getVoices();
  const koVoice = voices.find(v => v.lang.startsWith('ko'));
  if (koVoice) utter.voice = koVoice;

  speechSynthesis.speak(utter);
}

// 음성 목록 로드 대기
if (window.speechSynthesis) {
  speechSynthesis.onvoiceschanged = () => {};
}

// ===== (8) 도움말 =====
function showHelp() {
  const msg = `이렇게 말해보세요:\n\n` +
    `📋 일정 확인:\n` +
    `• "오늘 일정 알려줘"\n` +
    `• "내일 뭐 있어?"\n` +
    `• "이번 주 일정 확인"\n\n` +
    `📝 일정 등록:\n` +
    `• "내일 병원 등록해줘"\n` +
    `• "6월 15일에 모임 넣어줘"\n` +
    `• "6월 20일부터 25일까지 여행 등록해줘"`;
  addBotMsg(msg);
  speak('오늘 일정 알려줘, 또는 내일 병원 등록해줘, 처럼 말해보세요.');
}

// ===== 유틸리티 =====
function addBotMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.textContent = text;
  div.style.whiteSpace = 'pre-line';
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addUserMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
