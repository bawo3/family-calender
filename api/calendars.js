// =========================================
// 캘린더 목록(admin) API — 동적 캘린더 메타데이터를 KV에 공유 저장
// 모든 사용자가 같은 목록을 보고/추가/삭제할 수 있게 함 (기존 localStorage → KV)
//
//   GET  /api/calendars        → 동적 캘린더 배열 [{id,name,emoji,color}]
//   PUT  /api/calendars        → 전체 교체 (body: 배열)
// =========================================
import { getJson, setJson, send, allowCors } from './_kv.js';

const ADMIN_PREFIX = '_admin'; // KV 키: cal:_admin:calendars

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      const cals = await getJson(ADMIN_PREFIX, 'calendars', []);
      return send(res, 200, Array.isArray(cals) ? cals : []);
    }

    if (req.method === 'PUT') {
      const arr = req.body;
      if (!Array.isArray(arr)) return send(res, 400, { error: 'array expected' });
      // 각 항목 기본 검증 (id/name 필수)
      for (const c of arr) {
        if (!c || !c.id || !c.name) return send(res, 400, { error: 'each calendar requires id and name' });
      }
      await setJson(ADMIN_PREFIX, 'calendars', arr);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('calendars handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
