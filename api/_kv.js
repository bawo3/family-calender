// =========================================
// Upstash Redis REST API 직접 호출 헬퍼 (@vercel/kv SDK 불사용)
//
// 지원 환경변수 (둘 중 하나만 있으면 동작):
//   Vercel KV 연결 시:   KV_REST_API_URL  + KV_REST_API_TOKEN
//   Upstash 직접 연결:   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// =========================================

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis 명령 1건 실행
async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error(
      'Redis 환경변수 없음. Vercel 대시보드 → Settings → Environment Variables 에서 ' +
      'KV_REST_API_URL 과 KV_REST_API_TOKEN 을 설정하세요.'
    );
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Redis HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(`Redis 오류: ${json.error}`);
  return json.result;
}

// prefix는 영문/숫자/밑줄만 허용 (키 인젝션 방지)
const VALID_PREFIX = /^[a-zA-Z0-9_]{1,64}$/;

export function isValidPrefix(p) {
  return typeof p === 'string' && VALID_PREFIX.test(p);
}

export function calKey(prefix, type) {
  return `cal:${prefix}:${type}`;
}

// JSON 안전 조회
export async function getJson(prefix, type, fallback) {
  const raw = await redisCmd('GET', calKey(prefix, type));
  if (raw === null || raw === undefined) return fallback;
  // Upstash REST는 문자열 반환 → JSON 파싱 필요
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  return raw;
}

// JSON 저장 + prefix 인덱스 등록
export async function setJson(prefix, type, value) {
  await redisCmd('SET', calKey(prefix, type), JSON.stringify(value));
  await redisCmd('SADD', 'cal:_prefixes', prefix);
}

// 모든 prefix 목록 조회
export async function getAllPrefixes() {
  const result = await redisCmd('SMEMBERS', 'cal:_prefixes');
  return Array.isArray(result) ? result : [];
}

// 환경변수 설정 여부 확인 (health 엔드포인트용)
export function hasCredentials() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

// 공통 응답 헬퍼
export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

// CORS 허용
export function allowCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
