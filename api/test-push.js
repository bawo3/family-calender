// 테스트용 푸시 전송 엔드포인트
//   GET /api/test-push?prefix=family  → 해당 캘린더 모든 구독자에게 테스트 알림 전송
import { isValidPrefix, getJson, send, allowCors } from './_kv.js';
import { sendPushToPrefix } from './_push.js';

export default async function handler(req, res) {
  if (allowCors(req, res)) return;
  const { prefix } = req.query;
  if (!isValidPrefix(prefix)) return send(res, 400, { error: 'invalid prefix' });

  const subs = await getJson(prefix, 'push_subs', []);
  if (!subs.length) return send(res, 200, { ok: false, reason: '등록된 구독 없음 (count=0)', tip: '캘린더 페이지에서 알림 허용을 먼저 해주세요' });

  try {
    await sendPushToPrefix(prefix, {
      title: '🔔 테스트 알림',
      body: `${prefix} 캘린더 — 푸시 알림이 정상 작동합니다!`,
      tag: 'test-push'
    });
    return send(res, 200, { ok: true, sent: subs.length, message: `${subs.length}개 기기에 전송 완료` });
  } catch(e) {
    console.error('test-push error:', e);
    return send(res, 500, { ok: false, error: String(e) });
  }
}
