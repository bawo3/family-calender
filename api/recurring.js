// =========================================
// 반복 일정(recurring) API
//   GET    /api/recurring?prefix=xxx           → 반복 일정 배열 조회
//   POST   /api/recurring?prefix=xxx           → 단건 추가 (body: 반복 일정 객체)
//   DELETE /api/recurring?prefix=xxx&id=xxx    → 단건 삭제
//
// 반복 일정 객체 구조:
// {
//   id, user, color, text,
//   freq: 'daily' | 'weekly' | 'monthly',
//   days: ['mon','tue',...],   // weekly일 때
//   dayOfMonth: 15,             // monthly일 때
//   startDate: 'YYYY-MM-DD',    // 반복 시작일
//   endDate:   'YYYY-MM-DD',    // 반복 종료일 (필수)
//   from: 'HH:MM', to: 'HH:MM'
// }
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix, id } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const list = await getJson(prefix, 'recurring', []);
      return send(res, 200, list);
    }

    if (req.method === 'POST') {
      const item = req.body;
      if (!item || !item.id || !item.text || !item.freq || !item.startDate || !item.endDate) {
        return send(res, 400, { error: 'invalid recurring item' });
      }
      const list = await getJson(prefix, 'recurring', []);
      list.push(item);
      await setJson(prefix, 'recurring', list);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { error: 'id required' });
      const list = await getJson(prefix, 'recurring', []);
      await setJson(prefix, 'recurring', list.filter(r => r.id !== id));
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('recurring handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
