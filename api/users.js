// =========================================
// 사용자(users) API
//   GET  /api/users?prefix=xxx          → 이 캘린더의 사용자 객체 {name: {color, skin}}
//   GET  /api/users?prefix=xxx&all=1    → 모든 캘린더의 사용자 통합 (로그인 화면 칩용)
//                                          반환: {name: {color, skin, fromCurrent}}
//   POST /api/users?prefix=xxx          → 사용자 upsert (body: {name, color, skin})
// =========================================
import { isValidPrefix, getJson, setJson, getAllPrefixes, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix, all } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      // ?all=1: 전체 캘린더의 사용자 통합 조회
      if (all === '1') {
        const prefixes = await getAllPrefixes();
        const merged = {};
        // 현재 캘린더 우선 처리 (fromCurrent: true)
        const currentUsers = await getJson(prefix, 'users', {});
        Object.entries(currentUsers).forEach(([n, v]) => {
          merged[n] = { ...v, fromCurrent: true };
        });
        // 나머지 캘린더의 사용자도 합치되, 같은 이름이면 현재 캘린더 정보 유지
        for (const p of prefixes) {
          if (p === prefix) continue;
          const us = await getJson(p, 'users', {});
          Object.entries(us).forEach(([n, v]) => {
            if (!merged[n]) merged[n] = { ...v, fromCurrent: false };
          });
        }
        return send(res, 200, merged);
      }
      // 현재 캘린더 사용자만
      const users = await getJson(prefix, 'users', {});
      return send(res, 200, users);
    }

    if (req.method === 'POST') {
      const { name, color, skin } = req.body || {};
      if (!name || !color) return send(res, 400, { error: 'name and color required' });
      const users = await getJson(prefix, 'users', {});
      const oldColor = users[name]?.color;
      users[name] = { color, skin: skin || 'light' };
      await setJson(prefix, 'users', users);
      // 색상이 바뀌면 이 사용자가 등록했던 일정의 색도 일괄 업데이트 (서버 원자적 처리)
      if (oldColor && oldColor !== color) {
        const events = await getJson(prefix, 'events', []);
        let changed = false;
        for (const e of events) {
          if (e.user === name) { e.color = color; changed = true; }
        }
        if (changed) await setJson(prefix, 'events', events);
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('users handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
