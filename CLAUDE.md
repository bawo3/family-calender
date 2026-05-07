# CLAUDE.md (캘린더 프로젝트 정책)

이 파일은 이 프로젝트(`context/`)에서 작업하는 Claude Code에게 적용되는 규칙입니다.

---

## 📁 폴더 구조

```
context/
├── api/                    # ★ Vercel Serverless Functions (DB 백엔드)
│   ├── _kv.js              # Vercel KV 헬퍼 (키 네이밍, JSON 안전 저장)
│   ├── events.js           # GET/POST/PUT/DELETE 일정
│   ├── users.js            # GET/POST 사용자 (전체 통합 ?all=1)
│   └── notices.js          # GET/POST/DELETE 공지
├── common/                 # ★ 공통 자원 (CSS · JS)
│   ├── calendar.css        # 3개 캘린더가 공유하는 모든 스타일
│   └── calendar.js         # 모든 JS 로직 + HTML 구조 (insertAdjacentHTML)
├── kim-family.html         # 가족 캘린더 (prefix: family)
├── jhkim-hyeju.html        # 재현♥혜주네 캘린더 (prefix: hyeju)
├── calendar.html           # 동적 캘린더 (prefix: cal_${id})
├── index.html              # 관리자/홈 (별도 — 공통 로직 미사용)
├── package.json            # @vercel/kv 의존성
├── DEPLOY.md               # Vercel 배포 가이드
└── CLAUDE.md               # 이 파일
```

---

## 🗄️ 데이터 영속성 정책 (반드시 준수)

### 원칙
**모든 공유 데이터(사용자·일정·공지)는 `/api/*` 엔드포인트를 통해 Vercel KV에 저장한다.**
**브라우저 localStorage 는 디바이스 단위 정보(자동 로그인 이름) 외에는 사용하지 않는다.**

### KV 키 네이밍 규약
```
cal:${prefix}:events    → JSON 배열 (일정)
cal:${prefix}:users     → JSON 객체 {name: {color, skin}}
cal:${prefix}:notices   → JSON 배열 (공지, 최신순)
cal:_prefixes           → Set (등록된 모든 prefix — 전체 사용자 조회용)
```

### localStorage 허용 항목 (이것만)
```
${prefix}_current_user  → 자동 로그인용 사용자 이름 (디바이스마다 다를 수 있음)
admin_calendars         → 동적 캘린더 메타데이터 (TODO: 추후 DB 이전)
```

### 금지
- 새 데이터를 localStorage에 저장하는 신규 코드 작성 금지 — 무조건 API + KV
- API 핸들러에서 prefix 검증 우회 금지 (`isValidPrefix` 사용 필수, 영문/숫자/_ 만)
- 캐시(`cache.events` 등)에 직접 push 후 API 호출 누락 금지 — 항상 API 먼저 성공 후 캐시 갱신

---

## 🔌 API 설계 원칙

- **prefix 격리**: 모든 엔드포인트는 `?prefix=` 쿼리로 캘린더 식별, 다른 prefix 데이터는 절대 노출 안 함
- **에러 응답**: `{error: "메시지"}` JSON, 상태 코드는 400/405/500 명확히 구분
- **CORS**: 현재 `*` 허용 (운영 시 origin 화이트리스트로 제한 권장)
- **인증**: 현재 없음 (가족 단위 사용 가정). 공개 배포 시 토큰 인증 추가 필요

---

## ⚖️ 공통화 정책 (변경 없음)

**3개 캘린더(`kim-family.html`, `jhkim-hyeju.html`, `calendar.html`)에서 공통으로 쓰이는 모든 CSS와 JS는 `common/` 폴더에서만 관리한다.**

각 HTML 파일에 들어가야 하는 것 (오직 이것만)
- `<title>` 태그
- `common/calendar.css` 링크
- `window.CAL_CONFIG` 설정 객체 (`prefix`, `title`, 선택적 `accent`)
- `common/calendar.js` 로드
- (선택) `calendar.html`처럼 부트스트랩이 필요한 페이지의 동적 설정 로직

---

## 🔧 `window.CAL_CONFIG` 스펙

| 키 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `prefix` | string | ✅ | KV 키 + localStorage 자동로그인 키 접두사. 영문/숫자/_ 1~64자 |
| `title` | string | ✅ | 화면 제목 (이모지 포함 가능) |
| `accent` | string(`#RRGGBB`) | ❌ | 라이트 액센트 색. 다크용은 자동으로 78% 어둡게 계산됨 |
| `accentDark` | string | ❌ | 다크용 액센트를 직접 지정 |

---

## 🧩 새 캘린더 추가 방법

1. `xxx.html` 파일을 새로 만든다
2. 아래 템플릿을 복사한 뒤 `prefix`/`title`/(선택)`accent`만 바꾼다

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>캘린더 이름</title>
<link rel="stylesheet" href="common/calendar.css">
</head>
<body>
<script>
  window.CAL_CONFIG = {
    prefix: 'unique_prefix',
    title:  '🎉 캘린더 이름',
    accent: '#abcdef'
  };
</script>
<script src="common/calendar.js"></script>
</body>
</html>
```

KV에 prefix가 처음 등록되는 시점은 첫 사용자 로그인할 때입니다 (`api/_kv.js`의 `setJson`이 자동으로 `cal:_prefixes` set에 추가).

---

## 🔄 비동기 데이터 흐름 (calendar.js)

1. **부트스트랩**: `refreshAll()` 로 events/users/allUsers/notices 병렬 로드 → `cache` 채움
2. **렌더 함수**: 모두 캐시(`loadEvents()` 등)를 동기적으로 읽어 그림
3. **변경 작업**: API 먼저 호출 → 성공 시 캐시 갱신 → 다시 렌더
4. **새로고침**:
   - 헤더의 🔄 버튼 클릭
   - 다른 탭에서 돌아왔을 때 (`visibilitychange`) 자동 호출

---

## ✏️ 코딩 정책 (전역 규칙 상속)

- 모든 주석은 한국어로 작성
- 답변과 코드 설명은 초보자도 이해할 수 있는 쉬운 한국어로 작성
