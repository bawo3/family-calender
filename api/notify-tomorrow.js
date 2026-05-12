// =========================================
// [Cron] 내일 시작 일정 알림 — 매일 21:00 KST 실행
// vercel.json crons 에 등록되어 자동 호출됨.
//   - 모든 prefix를 순회하며 startDate === '내일' 인 일정에 대해
//   - 해당 캘린더의 모든 푸시 구독자에게 "(내일일정) 제목" 푸시 전송
//
// 보안: Vercel Cron 은 자동으로 Authorization: Bearer ${CRON_SECRET} 헤더를 붙임.
//       CRON_SECRET 환경변수가 설정돼있으면 검증, 없으면 패스(개발용).
// =========================================
import { getJson, getAllPrefixes, send, allowCors } from './_kv.js';
import { sendPushToPrefix } from './_push.js';

// 시간 문자열 — events.js의 헬퍼와 동일
function timeStr(from, to) {
  if (!from || String(from) === String(to)) return '';
  return ` · ${from}시${to ? `~${to}시까지` : '~'}`;
}

// 한국시간 기준 오늘+N일의 YYYY-MM-DD 문자열
function dateStrKST(addDays = 0) {
  const now = new Date();
  // UTC + 9시간 = KST
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() + addDays);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  if (allowCors(req, res)) return;

  // Vercel Cron 인증 — 외부 호출 차단
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${expected}`) {
      return send(res, 401, { error: 'unauthorized' });
    }
  }

  try {
    const tomorrow = dateStrKST(1);
    const prefixes = await getAllPrefixes();
    let totalSent = 0;
    const summary = [];

    for (const prefix of prefixes) {
      if (prefix.startsWith('_')) continue; // _admin 등 메타 prefix 스킵
      const events = await getJson(prefix, 'events', []);
      const tomorrowEvents = events.filter(ev => ev.startDate === tomorrow);
      if (!tomorrowEvents.length) continue;

      for (const ev of tomorrowEvents) {
        try {
          const bodyParts = [ev.text];
          if (ev.important) bodyParts.push('⭐중요');
          if (ev.from && String(ev.from) !== String(ev.to)) bodyParts.push(`${ev.from}시~${ev.to}시까지`);
          await sendPushToPrefix(prefix, {
            title: `📅 ${ev.text}: ${tomorrow} (내일)`,
            body: `${ev.user}: ${bodyParts.join(' ')}`,
            tag: `tomorrow_ev_${ev.id}`
          });
          totalSent++;
        } catch (e) {
          console.error(`push 실패 prefix=${prefix} id=${ev.id}:`, e);
        }
      }
      summary.push({ prefix, count: tomorrowEvents.length });
    }

    return send(res, 200, { ok: true, tomorrow, sent: totalSent, summary });
  } catch (e) {
    console.error('notify-tomorrow handler error:', e);
    return send(res, 500, { error: 'server error', detail: String(e) });
  }
}
