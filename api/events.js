// =========================================
// 일정(events) API
//   GET    /api/events?prefix=xxx           → 일정 배열 조회
//   POST   /api/events?prefix=xxx           → 단건 추가 (body: 이벤트 객체)
//   PUT    /api/events?prefix=xxx           → 전체 교체 (body: 이벤트 배열) — 색상 일괄 변경 등에 사용
//   DELETE /api/events?prefix=xxx&id=xxx    → 단건 삭제
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';
import { sendPushToPrefix } from './_push.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix, id } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const events = await getJson(prefix, 'events', []);
      return send(res, 200, events);
    }

    if (req.method === 'POST') {
      const ev = req.body;
      if (!ev || !ev.id || !ev.text) return send(res, 400, { error: 'invalid event' });
      const events = await getJson(prefix, 'events', []);
      events.push(ev);
      await setJson(prefix, 'events', events);
      // 등록된 모든 기기에 푸시 알림 전송 (실패해도 200 반환)
      try {
        const dateLabel = ev.startDate === ev.endDate
          ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`;
        const ts = ev.from ? ` · ${ev.from}${ev.to ? `~${ev.to}` : ''}` : '';
        await sendPushToPrefix(prefix, {
          title: `📅 새 일정: ${ev.text}`,
          body: `${ev.user} · ${dateLabel}${ev.important ? ' ⭐중요' : ''}${ts}`,
          tag: `ev_${ev.id}`
        });
      } catch(e) { console.error('push 전송 실패:', e); }
      return send(res, 200, { ok: true });
    }

    if (req.method === 'PUT') {
      // 전체 교체 (사용자 색상 일괄 변경 등)
      const arr = req.body;
      if (!Array.isArray(arr)) return send(res, 400, { error: 'array expected' });
      await setJson(prefix, 'events', arr);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { error: 'id required' });
      const events = await getJson(prefix, 'events', []);
      await setJson(prefix, 'events', events.filter(e => e.id !== id));
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('events handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
