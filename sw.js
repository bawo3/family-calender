// 정적 자원 캐시 목록
const CACHE = 'cal-v6';
const PRECACHE = ['/common/calendar.css', '/common/calendar.js'];

// 설치 시 — HTTP 캐시 우회해서 항상 최신 파일 저장
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(PRECACHE.map(url => new Request(url, {cache: 'no-cache'})))
    )
  );
  self.skipWaiting();
});

// 활성화 시 이전 캐시 전부 제거
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 요청 가로채기 — 네트워크 우선, 오프라인 시에만 캐시 폴백
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // API는 항상 네트워크 통과

  e.respondWith(
    fetch(e.request, {cache: 'no-cache'})
      .then(res => {
        // 정상 응답이면 캐시에도 저장 (다음 오프라인 대비)
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request)) // 오프라인이면 캐시에서 반환
  );
});

// 백그라운드 푸시 알림 처리 (페이지 닫혀있어도 동작)
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch(e) { data = {}; }
  event.waitUntil(
    self.registration.showNotification(data.title ?? '📅 캘린더 알림', {
      body: data.body ?? '',
      tag: data.tag ?? 'cal-notification',
      data: { url: data.url ?? self.location.origin },
      actions: [
        { action: 'open', title: '📅 열기' }
      ]
    })
  );
});

// 알림 클릭 시 해당 캘린더 페이지 열기
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.location.origin;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
