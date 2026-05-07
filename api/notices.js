// =========================================
// 공지사항(notices) API
//   GET    /api/notices?prefix=xxx          → 공지 배열 조회 (최신순)
//   POST   /api/notices?prefix=xxx          → 단건 추가 (body: 공지 객체)
//   DELETE /api/notices?prefix=xxx&id=xxx   → 단건 삭제
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix, id } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const notices = await getJson(prefix, 'notices', []);
      return send(res, 200, notices);
    }

    if (req.method === 'POST') {
      const n = req.body;
      if (!n || !n.id || !n.text) return send(res, 400, { error: 'invalid notice' });
      const notices = await getJson(prefix, 'notices', []);
      notices.unshift(n); // 최신순 (가장 앞에 삽입)
      await setJson(prefix, 'notices', notices);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { error: 'id required' });
      const notices = await getJson(prefix, 'notices', []);
      await setJson(prefix, 'notices', notices.filter(n => n.id !== id));
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('notices handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
