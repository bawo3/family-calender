// =========================================
// 사용자(users) API
//   GET  /api/users?prefix=xxx                 → {name: {color, skin, hasPhone}}  (phone 자체는 노출 X)
//   GET  /api/users?prefix=xxx&all=1           → 위와 동일 + fromCurrent 표시
//   GET  /api/users?prefix=xxx&reveal=1        → 관리자용: phone 평문 포함 ({name:{color,skin,phone}})
//   POST /api/users?prefix=xxx                 → upsert (body: {name, color, skin, phone?})
//   POST /api/users?prefix=xxx&action=verify   → 휴대폰 번호 검증 (body: {name, phone})
//                                                반환 {ok:true} / {ok:false}
//   POST /api/users?prefix=xxx&action=set-phone → 관리자용: phone 단독 갱신 (body: {name, phone})
//                                                  phone 빈 값이면 삭제
//   DELETE /api/users?prefix=xxx&name=xxx      → 사용자 삭제
// =========================================
import { isValidPrefix, getJson, setJson, getAllPrefixes, send, allowCors } from './_kv.js';

// 응답 직전 phone 제거 + hasPhone 플래그 추가
function sanitize(users, withFromCurrent=false) {
  const out = {};
  Object.entries(users).forEach(([n, v]) => {
    const { phone, ...rest } = v || {};
    out[n] = { ...rest, hasPhone: !!phone };
    if (withFromCurrent) out[n].fromCurrent = true;
  });
  return out;
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix, all, reveal, action } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const users = await getJson(prefix, 'users', {});
      // 관리자용 reveal 모드 — phone 평문 포함
      if (reveal === '1') return send(res, 200, users);
      return send(res, 200, sanitize(users, all === '1'));
    }

    if (req.method === 'POST') {
      // 휴대폰 번호 검증 — 다른 정보는 변경하지 않음
      if (action === 'verify') {
        const { name, phone } = req.body || {};
        if (!name || !phone) return send(res, 400, { error: 'name and phone required' });
        const users = await getJson(prefix, 'users', {});
        if (!users[name]) return send(res, 404, { error: 'user not found' });
        return send(res, 200, { ok: users[name].phone === phone });
      }

      // 관리자용 휴대폰 단독 갱신 (color 등 다른 정보 보존)
      if (action === 'set-phone') {
        const { name, phone } = req.body || {};
        if (!name) return send(res, 400, { error: 'name required' });
        const users = await getJson(prefix, 'users', {});
        if (!users[name]) return send(res, 404, { error: 'user not found' });
        const cleaned = (phone || '').toString().replace(/[^0-9]/g, '');
        const updated = { ...users[name] };
        if (cleaned) updated.phone = cleaned;
        else delete updated.phone;
        users[name] = updated;
        await setJson(prefix, 'users', users);
        return send(res, 200, { ok: true });
      }

      // 일반 upsert
      const { name, color, skin, phone } = req.body || {};
      if (!name || !color) return send(res, 400, { error: 'name and color required' });
      const users = await getJson(prefix, 'users', {});
      const existing = users[name] || {};
      const oldColor = existing.color;
      users[name] = {
        color,
        skin: skin || existing.skin || 'light',
        // phone은 명시적으로 보내질 때만 갱신, 아니면 기존 값 유지
        ...(phone ? { phone } : (existing.phone ? { phone: existing.phone } : {}))
      };
      await setJson(prefix, 'users', users);
      // 색상이 바뀌면 이 사용자가 등록했던 일정의 색도 일괄 업데이트
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

    if (req.method === 'DELETE') {
      const { name } = req.query;
      if (!name) return send(res, 400, { error: 'name required' });
      const users = await getJson(prefix, 'users', {});
      if (!users[name]) return send(res, 404, { error: 'user not found' });
      delete users[name];
      await setJson(prefix, 'users', users);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('users handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
