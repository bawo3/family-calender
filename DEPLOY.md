# 🚀 Vercel 배포 가이드

이 캘린더는 **Vercel KV (Upstash Redis)** 를 백엔드로 사용합니다.
모든 사용자 정보 · 일정 · 공지사항이 KV에 저장되어 모든 디바이스에서 같은 데이터를 봅니다.

---

## 📋 사전 준비
- [Vercel 계정](https://vercel.com)
- GitHub에 이 저장소가 push 되어 있어야 함

---

## 1️⃣ Vercel에 프로젝트 import

1. <https://vercel.com/new> 접속
2. 이 저장소 선택 → **Import**
3. Framework Preset: **Other** (정적 + Serverless Functions)
4. Build/Output Directory: 그대로 두고 **Deploy** 클릭

배포가 한 번 끝나면 빌드는 성공하지만 API는 아직 작동하지 않습니다 (KV 미연결 상태).

---

## 2️⃣ Vercel KV 연결

1. Vercel 대시보드 → 방금 만든 프로젝트 → **Storage** 탭
2. **Create Database** → **KV** 선택
3. 이름 적당히 입력 → **Create** 후 프로젝트와 **Connect**
4. 연결 시 Vercel이 자동으로 환경 변수를 주입합니다:
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`

> KV가 안 보이면 Vercel이 Marketplace 방식으로 바뀌었을 수 있습니다. **Storage** → **Marketplace** 에서 **Upstash for Redis** 를 선택해도 동일하게 동작합니다 (위 환경 변수가 자동 설정됩니다).

---

## 3️⃣ 재배포

KV 연결 후 **반드시 다시 배포** 해야 환경 변수가 함수에 적용됩니다.

- Vercel 대시보드 → **Deployments** → 최근 배포 우측 ⋯ → **Redeploy**

---

## 4️⃣ 동작 확인

배포 URL 접속 후:

| 페이지 | URL | 비고 |
|---|---|---|
| 가족 캘린더 | `/kim-family.html` | prefix=`family` |
| JHJ쀼♥ | `/jhkim-hyeju.html` | prefix=`hyeju` |
| 동적 캘린더 | `/calendar.html?id=xxx` | prefix=`cal_xxx` |
| 관리자(홈) | `/index.html` | 동적 캘린더 추가용 |

첫 페이지 진입 시 잠시 ⏳ 로딩 화면이 보이고, 비어있는 로그인 화면으로 진입합니다.
이름 + 색상 선택 후 로그인하면 KV에 사용자가 저장됩니다.

---

## 🗂️ KV 키 구조

| 키 | 타입 | 내용 |
|---|---|---|
| `cal:${prefix}:events` | JSON 배열 | 일정 목록 |
| `cal:${prefix}:users` | JSON 객체 | `{이름: {color, skin}}` |
| `cal:${prefix}:notices` | JSON 배열 | 공지 (최신순) |
| `cal:_prefixes` | Set | 등록된 모든 prefix (전체 사용자 통합 조회용) |

---

## 🔌 API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/events?prefix=xxx` | 일정 배열 조회 |
| POST | `/api/events?prefix=xxx` | 단건 추가 (body: 이벤트 객체) |
| PUT | `/api/events?prefix=xxx` | 전체 교체 (body: 배열) |
| DELETE | `/api/events?prefix=xxx&id=yyy` | 단건 삭제 |
| GET | `/api/users?prefix=xxx` | 이 캘린더의 사용자 |
| GET | `/api/users?prefix=xxx&all=1` | 모든 캘린더 사용자 통합 |
| POST | `/api/users?prefix=xxx` | 사용자 upsert (body: `{name,color,skin}`). 색상 변경 시 일정 색도 자동 동기화 |
| GET | `/api/notices?prefix=xxx` | 공지 배열 |
| POST | `/api/notices?prefix=xxx` | 공지 추가 |
| DELETE | `/api/notices?prefix=xxx&id=yyy` | 공지 삭제 |

`prefix` 는 영문/숫자/밑줄 1~64자만 허용 (보안용 검증).

---

## 🛠️ 로컬 개발 (선택)

```bash
npm install
npm install -g vercel
vercel link    # 프로젝트와 연결 (KV env 자동 동기화)
vercel dev     # http://localhost:3000
```

---

## ⚠️ 주의사항 / 한계

1. **인증 없음**: 현재 누구나 prefix만 알면 데이터 조회·수정 가능. 공개 운영 시 추후 토큰 인증 추가 필요.
2. **동시 쓰기 경합**: KV에 JSON 블롭으로 저장하므로 두 사용자가 동시에 일정 추가 시 한쪽이 누락될 수 있음. 가족/소그룹 트래픽에서는 거의 문제 없음.
3. **`admin_calendars`(동적 캘린더 목록)** 은 여전히 디바이스별 localStorage 사용. 동적 캘린더(`calendar.html?id=xxx`)를 공유하려면 각 디바이스에서 동일하게 calendar 메타를 등록해야 함 (추후 DB 화 가능).
4. **자동 로그인 키**(`${prefix}_current_user`) 는 의도적으로 localStorage 에 보관 — 디바이스마다 다른 사용자로 로그인할 수 있음.

---

## 📊 무료 한도 (참고)

Vercel KV (Upstash 무료 플랜):
- 256MB 저장
- 10,000 요청/일
- 가족 단위 사용에는 충분
