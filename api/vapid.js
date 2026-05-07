// VAPID 공개키 반환 (프론트엔드에서 PushManager.subscribe()에 사용)
import { send, allowCors } from './_kv.js';

export default function handler(req, res) {
  if (allowCors(req, res)) return;
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return send(res, 503, { error: 'push not configured' });
  return send(res, 200, { publicKey: key });
}
