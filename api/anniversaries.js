// =========================================
// 기념일/생일 API
//   GET    /api/anniversaries?prefix=xxx         → 배열 조회
//   POST   /api/anniversaries?prefix=xxx         → 단건 추가
//   DELETE /api/anniversaries?prefix=xxx&id=xxx  → 단건 삭제
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;
  const { prefix, id } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const items = await getJson(prefix, 'anniversaries', []);
      return send(res, 200, items);
    }
    if (req.method === 'POST') {
      const item = req.body;
      if (!item || !item.id || !item.type || !item.name || !item.date) {
        return send(res, 400, { error: 'invalid anniversary' });
      }
      const items = await getJson(prefix, 'anniversaries', []);
      items.push(item);
      await setJson(prefix, 'anniversaries', items);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { error: 'id required' });
      const items = await getJson(prefix, 'anniversaries', []);
      await setJson(prefix, 'anniversaries', items.filter(a => a.id !== id));
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error('anniversaries handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
