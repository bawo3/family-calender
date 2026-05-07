// =========================================
// 푸시 구독(tokens) API
//   POST   /api/tokens?prefix=xxx  → 구독 저장 (body: PushSubscription JSON)
//   DELETE /api/tokens?prefix=xxx  → 구독 삭제 (body: {endpoint})
// =========================================
import { isValidPrefix, getJson, setJson, send, allowCors } from './_kv.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  const { prefix } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  try {
    if (req.method === 'GET') {
      const subs = await getJson(prefix, 'push_subs', []);
      // 보안상 암호키는 제외하고 기기 식별 정보만 반환
      const sanitized = subs.map((s, i) => ({
        index: i + 1,
        pageUrl: s.pageUrl ?? '(없음)',
        endpoint: s.endpoint?.replace(/^https?:\/\/[^/]+/, match => match) // 전체 endpoint 표시
      }));
      return send(res, 200, { count: subs.length, subscriptions: sanitized });
    }

    if (req.method === 'POST') {
      const sub = req.body;
      if (!sub?.endpoint) return send(res, 400, { error: 'invalid subscription' });

      const subs = await getJson(prefix, 'push_subs', []);
      // 같은 endpoint 중복 제거 후 추가
      const filtered = subs.filter(s => s.endpoint !== sub.endpoint);
      filtered.push(sub);
      await setJson(prefix, 'push_subs', filtered);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body || {};
      if (!endpoint) return send(res, 400, { error: 'endpoint required' });
      const subs = await getJson(prefix, 'push_subs', []);
      await setJson(prefix, 'push_subs', subs.filter(s => s.endpoint !== endpoint));
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method not allowed' });
  } catch(e) {
    console.error('tokens handler error:', e);
    return send(res, 500, { error: 'server error' });
  }
}
