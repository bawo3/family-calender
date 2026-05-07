// =========================================
// 캘린더 메타데이터 API — 캘린더별 설정 (최대인원 등)
//   GET /api/cal-meta?prefix=xxx     → {maxUsers:0, ...}  (0 = 무제한)
//   PUT /api/cal-meta?prefix=xxx     → 부분 업데이트 (body: {maxUsers?:N})
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;
  const { prefix } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const meta = await getJson(prefix, 'meta', {});
      return send(res, 200, meta || {});
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const current = (await getJson(prefix, 'meta', {})) || {};
      const merged = { ...current };
      if ('maxUsers' in body) {
        const n = Number(body.maxUsers);
        if (!Number.isInteger(n) || n < 0) return send(res, 400, { error: 'maxUsers must be a non-negative integer' });
        merged.maxUsers = n;
      }
      await setJson(prefix, 'meta', merged);
      return send(res, 200, merged);
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('cal-meta handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
