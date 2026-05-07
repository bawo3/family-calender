// =========================================
// 일정(events) API
//   GET    /api/events?prefix=xxx           → 일정 배열 조회
//   POST   /api/events?prefix=xxx           → 단건 추가 (body: 이벤트 객체)
//   PATCH  /api/events?prefix=xxx&id=xxx    → 단건 수정 (body: 변경 필드) + 푸시
//   PUT    /api/events?prefix=xxx           → 전체 교체 (body: 이벤트 배열) — 색상 일괄 변경용
//   DELETE /api/events?prefix=xxx&id=xxx    → 단건 삭제 + 푸시
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';
import { sendPushToPrefix } from './_push.js';

// 시간 문자열 생성 (from === to 이면 빈 문자열)
function timeStr(from, to) {
  if (!from || String(from) === String(to)) return '';
  return ` · ${from}시${to ? `~${to}시까지` : '~'}`;
}

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
      try {
        const dateLabel = ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`;
        await sendPushToPrefix(prefix, {
          title: `📅 새 일정: ${ev.text}`,
          body: `${ev.user} · ${dateLabel}${ev.important ? ' ⭐중요' : ''}${timeStr(ev.from, ev.to)}`,
          tag: `ev_${ev.id}`
        });
      } catch(e) { console.error('push 전송 실패:', e); }
      return send(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      // 단건 수정
      if (!id) return send(res, 400, { error: 'id required' });
      const updated = req.body;
      if (!updated) return send(res, 400, { error: 'body required' });
      const events = await getJson(prefix, 'events', []);
      const idx = events.findIndex(e => e.id === id);
      if (idx === -1) return send(res, 404, { error: 'event not found' });
      const ev = { ...events[idx], ...updated };
      events[idx] = ev;
      await setJson(prefix, 'events', events);
      try {
        const dateLabel = ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`;
        await sendPushToPrefix(prefix, {
          title: `✏️ 일정 수정: ${ev.text}`,
          body: `${ev.user} · ${dateLabel}${ev.important ? ' ⭐중요' : ''}${timeStr(ev.from, ev.to)}`,
          tag: `ev_${ev.id}`
        });
      } catch(e) { console.error('push 전송 실패:', e); }
      return send(res, 200, { ok: true });
    }

    if (req.method === 'PUT') {
      // 전체 교체 (사용자 색상 일괄 변경 등) — 푸시 없음
      const arr = req.body;
      if (!Array.isArray(arr)) return send(res, 400, { error: 'array expected' });
      await setJson(prefix, 'events', arr);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { error: 'id required' });
      const events = await getJson(prefix, 'events', []);
      const target = events.find(e => e.id === id);
      await setJson(prefix, 'events', events.filter(e => e.id !== id));
      if (target) {
        try {
          const dateLabel = target.startDate === target.endDate ? target.startDate : `${target.startDate} ~ ${target.endDate}`;
          await sendPushToPrefix(prefix, {
            title: `🗑️ 일정 삭제: ${target.text}`,
            body: `${target.user} · ${dateLabel}${target.important ? ' ⭐중요' : ''}`,
            tag: `ev_del_${target.id}`
          });
        } catch(e) { console.error('push 전송 실패:', e); }
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('events handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
