// Web Push 전송 헬퍼 — Vercel 서버사이드에서만 사용
import webpush from 'web-push';
import { getJson, setJson } from './_kv.js';

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = process.env.VAPID_EMAIL || 'admin@calendar.local';
  if (!pub || !priv) return; // 환경변수 미설정 시 스킵
  webpush.setVapidDetails(`mailto:${mail}`, pub, priv);
  vapidReady = true;
}

// prefix의 모든 구독자에게 푸시 전송
export async function sendPushToPrefix(prefix, payload) {
  ensureVapid();
  if (!vapidReady) return;

  const subs = await getJson(prefix, 'push_subs', []);
  if (!subs.length) return;

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(sub, JSON.stringify({ ...payload, url: sub.pageUrl }))
    )
  );

  // 410 Gone / 404 = 만료된 구독 자동 제거
  const valid = subs.filter((_, i) => {
    const r = results[i];
    if (r.status === 'rejected') {
      const code = r.reason?.statusCode;
      return code !== 410 && code !== 404;
    }
    return true;
  });
  if (valid.length !== subs.length) await setJson(prefix, 'push_subs', valid);
}
