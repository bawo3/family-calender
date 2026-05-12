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

// 날짜 레이블 (하루면 날짜만, 기간이면 ~ 표시)
function dateLabel(ev) {
  return ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} ~ ${ev.endDate}`;
}

// 알림 2번째 줄용 body: "이름: 일정내용 [중요도] [시간]"
function buildBody(user, ev) {
  const parts = [ev.text];
  if (ev.important) parts.push('⭐중요');
  if (ev.from && String(ev.from) !== String(ev.to)) {
    parts.push(`${ev.from}시~${ev.to}시까지`);
  }
  return `${user}: ${parts.join(' ')}`;
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
        await sendPushToPrefix(prefix, {
          title: `📅 ${ev.text}: ${dateLabel(ev)}`,
          body: buildBody(ev.user, ev),
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
        await sendPushToPrefix(prefix, {
          title: `✏️ ${ev.text}: ${dateLabel(ev)}`,
          body: buildBody(ev.user, ev),
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
          await sendPushToPrefix(prefix, {
            title: `🗑️ ${target.text}: ${dateLabel(target)}`,
            body: buildBody(target.user, target),
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
