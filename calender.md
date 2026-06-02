# 📅 가족 캘린더

여러 사람이 동시에 사용하는 공유 캘린더 PWA. 일정/공지/기념일을 등록하고, 모든 기기에서 같은 데이터를 봅니다.

> **유지보수 문서**: 사용자·개발자 관점에서 현재 동작을 한눈에 정리합니다.
> 폴더 구조·코딩 정책은 [`CLAUDE.md`](./CLAUDE.md), 배포·KV 연결은 [`DEPLOY.md`](./DEPLOY.md) 를 참고하세요.

---

## 1. 한눈에

| 항목 | 내용 |
|---|---|
| 호스팅 | Vercel (Static + Serverless Functions) |
| 백엔드 | Vercel KV (Upstash Redis) |
| 프론트엔드 | Vanilla JS · CSS Grid · 라이브러리 없음 |
| 설치 | PWA 지원 (iOS · Android · Desktop 홈 화면 설치) |
| 알림 | Web Push (VAPID), iOS는 standalone 모드 필요 |
| 인증 | 이름 + 색상 기반 가벼운 로그인 (가족/소그룹 가정) |

---

## 2. 페이지 구조

| URL | 파일 | 용도 |
|---|---|---|
| `/index.html` | `index.html` | 관리자 페이지 — 동적 캘린더 등록/관리, 비밀번호 변경 |
| `/kim-family.html` | `kim-family.html` | 빌트인 — 가족 캘린더 (`prefix: family`) |
| `/jhkim-hyeju.html` | `jhkim-hyeju.html` | 빌트인 — JHJ쀼♥ (`prefix: hyeju`) |
| `/calendar.html?id=xxx` | `calendar.html` | 동적 — 관리자가 만든 캘린더 (`prefix: cal_xxx`) |

3개 캘린더 HTML 은 모두 `window.CAL_CONFIG` 정의 후 `common/calendar.js` + `common/calendar.css` 를 공유합니다.

---

## 3. 데이터 모델

### `event` (일정)
```js
{
  id: "lka3xy8z9q",          // makeId() 생성 (시간+랜덤)
  user: "엄마",               // 등록자 이름
  color: "#e84393",          // 등록 당시 사용자 색
  text: "회의",               // 일정 내용
  startDate: "2026-05-19",   // 시작 (YYYY-MM-DD)
  endDate:   "2026-05-21",   // 종료 (단일일이면 startDate와 동일)
  from: "9:30",              // 시작 시각 "HH:MM" (구버전: "9")
  to:   "10:00",             // 종료 시각 "HH:MM"
  important: true            // ⭐ 중요 표시
}
```

### `user` (사용자)
```js
{
  color: "#3498db",          // 사용자 고유 색
  skin:  "dark"              // "light" | "dark"
}
```

### `notice` (공지)
```js
{
  id: "...", user: "엄마", color: "#e84393",
  text: "내일 캠핑 짐 챙기기",
  createdAt: "2026-05-19 21:30"
}
```

### `anniversary` (기념일/생일)
```js
{
  id: "...",
  type: "birthday" | "anniversary",
  name: "엄마",               // 이름 또는 설명
  date: "1970-05-19",        // 양력 기준일
  isLunar: false,            // 음력 입력 여부
  notify100days: true        // 100일 단위 알림 (기념일만)
}
```

캘린더 셀에는 매년 자동으로 가상 이벤트가 생성되어 표시 (`generateAnniversaryVirtualEventsForRange`).

---

## 4. 기능 토글 / 모드 한눈에

| 토글 | 위치 | 기본값 | 효과 |
|---|---|---|---|
| **다중 선택** | 일정 패널 상단 체크박스 | OFF | ON 시 클릭한 날짜를 개별 토글 → 같은 내용으로 일괄 등록 (월·수·금 패턴) |
| **월/주 보기** | 네비 행 `📅 월 / 📆 주` | 월 | 주 모드는 7일 세로 리스트 (모바일 가독성), prev/next 가 7일 단위 |
| **텍스트/점 보기** | 네비 행 `📍 점 / 💬 텍스트` | **점** | 점 모드는 한눈에 일정 유무 확인 (단일=점, 다일=색띠 연결, 중요=⭐, 기념일=🎂/💕) |
| **글자 크기** | `🔍1 / 🔍2 / 🔍3 / 🔍4` | 1 (기본) | 4단계 순환. 핀치 줌으로도 100~200% 부드러운 확대 |
| **알림** | `🔕 / 🔔` 토글 | 꺼짐 | 새 일정/공지/내일 일정 푸시 알림 |
| **공지** | 📢 버튼 | — | 가족 단위 공지 등록/조회 (최신순) |
| **기념일** | 💗 버튼 | — | 생일/기념일 등록 (음력 지원, D-day 계산) |

### 보기 모드 상세

- **점 모드(기본)**: 7칸이 화면에 모두 들어감. 셀당 최대 10개 점 표시 + `+N`
- **텍스트 모드**: 셀 `min-width: 560px` 강제 → 좁은 화면이면 가로 스크롤. 단일일은 2줄 클램프, 다일은 시작 셀 텍스트가 다음 셀로 흘러 1줄로 이어짐 (`bar-start` overflow:visible + z-index)
- **주별 보기**: 다일 이벤트도 풀 텍스트로 표시. 가로 스크롤 불필요

---

## 5. 설정 (`window.CAL_CONFIG`)

각 HTML에서 정의:

| 키 | 필수 | 설명 |
|---|---|---|
| `prefix` | ✅ | KV 키 + localStorage 자동로그인 키 접두사. 영문/숫자/_ 1~64자 |
| `title` | ✅ | 화면 제목 (이모지 가능) |
| `accent` | ❌ | 라이트 액센트 색 `#RRGGBB` (다크용은 자동 산출) |
| `accentDark` | ❌ | 다크 액센트 색 직접 지정 |
| `iconEmojis` | ❌ | PWA 아이콘에 사용할 멤버 이모지 배열 (2개 이상). 안드로이드에서 선명하게 표시 |

### 관리자 비밀번호 (전역)

- 저장: `localStorage['admin_password']` (관리자 페이지에서 변경)
- 기본값: `'681100'`
- 용도: ① 관리자 페이지 진입 ② 캘린더에서 **타인 일정 삭제** 시 확인

---

## 6. 데이터 영속성

### KV (서버, 전 기기 공유)
```
cal:${prefix}:events         → JSON 배열 (일정)
cal:${prefix}:users          → JSON 객체 {이름: {color, skin}}
cal:${prefix}:notices        → JSON 배열 (공지, 최신순)
cal:${prefix}:anniversaries  → JSON 배열 (기념일)
cal:_prefixes                → Set (전체 prefix — 통합 조회용)
```

### localStorage (디바이스 한정)
```
${prefix}_current_user       → 자동 로그인 사용자 이름
${prefix}_pwa_dismissed      → PWA 설치 안내 닫음 (세션)
${prefix}_alarm_on           → 알림 토글 상태
admin_password               → 관리자 비밀번호 (전 캘린더 공유)
admin_calendars              → 동적 캘린더 메타 캐시 (서버 폴백)
${prefix}_ls_*               → API 미연결(로컬 폴백) 모드용 fallback
```

### 로컬 폴백 모드
API 호출이 실패하면 자동으로 `localMode = true` 전환 → 모든 데이터를 localStorage에 저장. 화면 상단에 안내 배너 표시.

---

## 7. 새 캘린더 추가하기

### 방법 1 — 동적 (관리자 페이지)
1. `/index.html` 접속, 비밀번호 입력
2. **새 캘린더 추가** → 이름/이모지/색 입력
3. 자동 생성된 `/calendar.html?id=xxx` URL 공유

### 방법 2 — 빌트인 (HTML 파일 추가)
새 `xxx.html` 생성, 아래 템플릿에서 `prefix`/`title`/`accent`만 바꾸면 끝:

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

> KV에 `prefix`는 첫 사용자 로그인 시 자동 등록됩니다.

---

## 8. 알림 / PWA

| 항목 | 동작 |
|---|---|
| 알림 권한 | 알람 버튼 첫 클릭 시 브라우저 권한 요청. iOS Safari는 **홈 화면 추가 → standalone 실행** 필수 |
| 푸시 토큰 | `/api/tokens` 에 저장 (prefix별) |
| 새 일정/공지 | 등록 즉시 같은 prefix 가입자 전체에 푸시 |
| 내일 일정 알림 | 매일 정해진 시각에 다음날 일정 푸시 (`/api/notify-tomorrow`) |

PWA 설치 안내:
- **Android**: 페이지 하단 "📲 지금 설치하기" 카드
- **iOS**: 상단 인스톨 바 → Safari 공유 → 홈 화면에 추가

---

## 9. API 빠른 참조 (자세한 건 DEPLOY.md)

| Method | Path | 설명 |
|---|---|---|
| GET / POST / PUT / DELETE | `/api/events?prefix=xxx[&id=yyy]` | 일정 CRUD (PATCH도 지원 — 단건 수정) |
| GET | `/api/users?prefix=xxx[&all=1]` | 사용자. `all=1` 이면 전 prefix 통합 |
| POST | `/api/users?prefix=xxx` | 사용자 upsert. 색 변경 시 본인 일정 색도 자동 동기화 |
| GET / POST / DELETE | `/api/notices?prefix=xxx[&id=yyy]` | 공지 CRUD |
| GET / POST / PATCH / DELETE | `/api/anniversaries?prefix=xxx[&id=yyy]` | 기념일 CRUD |
| GET / PUT | `/api/calendars` | 동적 캘린더 메타 (관리자 페이지 전용) |
| POST | `/api/tokens` | 푸시 구독 등록 |
| GET | `/api/vapid` | 공개 키 조회 |
| GET | `/api/health` | 헬스 체크 |

---

## 10. 알려진 한계

1. **인증 부재** — prefix만 알면 누구나 데이터 접근 가능. 가족/소그룹 전용 운영 가정. 공개 운영 시 토큰 인증 필요.
2. **동시 쓰기 경합** — KV에 JSON 블롭으로 저장. 두 사용자가 동시 추가 시 한쪽 누락 가능 (가족 단위 트래픽에서는 거의 발생 안 함).
3. **관리자 비밀번호 클라이언트 보관** — `localStorage['admin_password']` 에 평문 저장. "실수 방지" 수준의 소프트 잠금. 소스 보면 알 수 있음.
4. **iOS 알림** — Safari 일반 탭은 푸시 미지원. 홈 화면 설치 후 standalone 모드에서만 동작.
5. **음력 기념일** — 한국 음력 변환 룩업 테이블 기반. 범위 밖 연도는 양력 입력 권장.

---

## 11. 자주 만지는 핵심 함수 / 영역

`common/calendar.js` 안 주요 블록 (검색 키):

| 영역 | 검색어 | 역할 |
|---|---|---|
| 부트스트랩 / 캐시 | `refreshAll`, `cache` | API 4종 병렬 로드 → cache 채움 |
| 렌더 (월별) | `renderCalendar` | 그리드, 이벤트 바/점, 선택 상태 |
| 렌더 (주별) | `renderWeekView` | 7일 세로 리스트 |
| 이벤트 목록 | `renderEventList` | 선택 기간/날짜의 일정·기념일·공휴일 통합 |
| 중요 배너 | `renderImportantBanner` | 상단 ⭐ 진행/예정 일정 요약 |
| 추가 / 수정 / 삭제 | `addEvent`, `startEdit`, `cancelEdit`, `deleteEvent` | 시간 입력 검증, 다중 선택 일괄, 관리자 PW |
| 기념일 | `generateAnniversaryVirtualEventsForRange`, `renderAnniversaryList` | 가상 이벤트 생성, 음력/D-day 계산 |
| 시간 헬퍼 | `formatTimeRange`, `timeToMin`, `fillHourOptions` | HH:MM 포맷·검증 |
| 공휴일 | `getHoliday` | API 폴백 + 하드코딩 |
| 알림 | `checkNewItemsAndNotify`, `syncNotifyPermission` | 새 일정/공지 토스트 + 권한 회복 |
| PWA | `initPWAInstall`, `serviceWorker` | iOS / Android 설치 안내 |

---

## 12. 변경 시 점검 체크리스트

- [ ] 모바일 가로폭 (320~480px) 에서 일자/일정 안 잘리는지
- [ ] 다중 선택 ↔ 일반 선택 전환 시 상태 초기화되는지
- [ ] 월별 ↔ 주별 전환 시 weekdays 헤더/grid 클래스 원복되는지
- [ ] 텍스트 모드 가로 스크롤 가능 시 스와이프가 월/주 이동이 아닌 스크롤로 처리되는지
- [ ] 시간 검증 — `from`/`to` 가 `"HH:MM"` 인 경우와 `"H"` (구버전) 모두 통과하는지
- [ ] 본인/타인 일정 삭제 시 비밀번호 확인 흐름
- [ ] PWA / SW 캐시 버전 (`cal-vX`) — 큰 UI 변경 시 올려야 클라이언트 강제 갱신
- [ ] 다크 / 라이트 양쪽에서 새 색상 변수 정의되었는지

---

## 13. 관련 문서

- [`CLAUDE.md`](./CLAUDE.md) — 폴더 구조 · 영속성 정책 · API 설계 · 코딩 정책
- [`DEPLOY.md`](./DEPLOY.md) — Vercel 배포 · KV 연결 · API 엔드포인트 전체
