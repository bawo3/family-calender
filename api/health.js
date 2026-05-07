// =========================================
// DB 연결 상태 확인 엔드포인트
//   GET /api/health
// =========================================
import { send, allowCors } from './_kv.js';

// redisCmd는 모듈 내부 함수라 직접 export 안 되므로 ping을 위해 직접 구현
async function ping() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { ok: false, reason: 'env_missing' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['PING']),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const { result } = await res.json();
    return { ok: result === 'PONG', reason: result };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return;
  const result = await ping();
  const envUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null;
  return send(res, result.ok ? 200 : 503, {
    ok: result.ok,
    reason: result.reason,
    // URL 앞 15자만 노출 (토큰 유출 방지)
    url_hint: envUrl ? envUrl.slice(0, 30) + '...' : null,
  });
}
