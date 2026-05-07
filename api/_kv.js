// =========================================
// Vercel KV(Redis) 공통 헬퍼
// 키 네이밍 규칙: cal:${prefix}:${type}
//   ex) cal:family:events, cal:hyeju:users, cal:cal_default:notices
//
// prefix 별로 격리된 JSON 블롭을 저장하므로,
// 각 캘린더는 다른 캘린더의 데이터를 침범하지 않습니다.
// =========================================
import { kv } from '@vercel/kv';

// prefix는 영문/숫자/밑줄만 허용 (보안: 키 인젝션 방지)
const VALID_PREFIX = /^[a-zA-Z0-9_]{1,64}$/;

export function isValidPrefix(p) {
  return typeof p === 'string' && VALID_PREFIX.test(p);
}

export function calKey(prefix, type) {
  return `cal:${prefix}:${type}`;
}

// JSON 안전 조회 (없으면 fallback 반환)
export async function getJson(prefix, type, fallback) {
  const v = await kv.get(calKey(prefix, type));
  if (v === null || v === undefined) return fallback;
  return v;
}

// JSON 저장 + prefix 인덱스에 등록 (loadAllUsers 등에서 활용)
export async function setJson(prefix, type, value) {
  await kv.set(calKey(prefix, type), value);
  await kv.sadd('cal:_prefixes', prefix);
}

// 등록된 모든 prefix 목록 조회 (전체 사용자 통합 조회용)
export async function getAllPrefixes() {
  const set = await kv.smembers('cal:_prefixes');
  return Array.isArray(set) ? set : [];
}

// 공통 응답 헬퍼
export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

// CORS 허용 (운영 시 origin 화이트리스트로 제한 권장)
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

export { kv };
