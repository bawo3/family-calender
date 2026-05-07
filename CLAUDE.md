# CLAUDE.md (캘린더 프로젝트 정책)

이 파일은 이 프로젝트(`context/`)에서 작업하는 Claude Code에게 적용되는 규칙입니다.

---

## 📁 폴더 구조

```
context/
├── common/                 # ★ 공통 자원 (CSS · JS)
│   ├── calendar.css        # 3개 캘린더가 공유하는 모든 스타일
│   └── calendar.js         # 3개 캘린더가 공유하는 모든 로직 (HTML 구조 포함)
├── kim-family.html         # 가족 캘린더 (prefix: family)
├── jhkim-hyeju.html        # 재현혜주네 캘린더 (prefix: hyeju)
├── calendar.html           # 동적 캘린더 (prefix: cal_${id})
├── index.html              # 관리자/홈 화면 (별도 — 공통 로직 미사용)
└── calender.md             # 사용 설명 문서
```

---

## ⚖️ 공통화 정책 (반드시 준수)

### 원칙
**3개 캘린더(`kim-family.html`, `jhkim-hyeju.html`, `calendar.html`)에서 공통으로 쓰이는 모든 CSS와 JS는 `common/` 폴더에서만 관리한다.**

### 공통 자원에 들어가야 하는 것
- 모든 CSS (테마 색상은 CSS 변수로 노출)
- 모든 자바스크립트 함수 (스토리지·렌더링·이벤트 처리·공지 등)
- 로그인/캘린더/공지 모달의 HTML 구조 (`common/calendar.js`가 `document.body.insertAdjacentHTML('afterbegin', ...)`로 주입)

### 각 HTML 파일에 들어가야 하는 것 (오직 이것만)
- `<title>` 태그
- `common/calendar.css` 링크
- `window.CAL_CONFIG` 설정 객체
- `common/calendar.js` 로드
- (선택) `calendar.html`처럼 부트스트랩이 필요한 페이지의 동적 설정 로직

### 금지
- 3개 HTML 중 어떤 파일에든 인라인 `<style>` 또는 비-부트스트랩 `<script>` 로직을 추가하지 말 것
- 같은 코드를 2개 이상의 HTML에 중복 작성하지 말 것 (반드시 `common/`으로 옮긴다)
- `common/calendar.js`에 특정 캘린더(prefix) 전용 분기를 하드코딩하지 말 것 — 필요하면 `CAL_CONFIG`에 새 옵션을 추가해서 처리

---

## 🔧 `window.CAL_CONFIG` 스펙

| 키 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `prefix` | string | ✅ | localStorage 키 접두사. `${prefix}_events`, `${prefix}_users`, `${prefix}_current_user`, `${prefix}_notices` 형태로 사용 |
| `title` | string | ✅ | 로그인 화면 + 캘린더 헤더에 표시되는 제목 (이모지 포함 가능) |
| `accent` | string(`#RRGGBB`) | ❌ | 라이트 테마 액센트 색상 (옵션). 미지정 시 CSS 기본값(`#3498db`) 사용. 다크용은 자동으로 78% 어둡게 계산됨 |
| `accentDark` | string | ❌ | `accent`의 어두운 변형을 직접 지정하고 싶을 때 (옵션) |

### 호출 예시
```html
<script>
  window.CAL_CONFIG = {
    prefix: 'family',
    title:  '👨‍👩‍👧‍👦 가족 캘린더'
  };
</script>
<script src="common/calendar.js"></script>
```

---

## 💾 localStorage 키 규약

| 키 형식 | 내용 |
|---|---|
| `${prefix}_events` | 일정 배열 |
| `${prefix}_users` | 사용자 정보 객체 (`{이름: {color, skin}}`) |
| `${prefix}_current_user` | 마지막 로그인한 사용자 이름 (자동 로그인용) |
| `${prefix}_notices` | 공지사항 배열 |
| `admin_calendars` | (시스템) 동적 캘린더 목록 — `index.html`이 관리 |

`loadAllUsers()`는 `localStorage`의 모든 `*_users` 키를 스캔해서 사용자 칩을 모읍니다. 새 캘린더가 추가돼도 코드 수정 없이 자동으로 인식됩니다 (`admin_*` 키는 제외).

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

---

## ✏️ 코딩 정책 (전역 규칙 상속)

- 모든 주석은 한국어로 작성
- 답변과 코드 설명은 초보자도 이해할 수 있는 쉬운 한국어로 작성
