// 정적 자원 캐시 목록
const CACHE = 'cal-v2';
const PRECACHE = ['/common/calendar.css', '/common/calendar.js'];

// 설치 시 정적 자원 캐시
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// 활성화 시 이전 캐시 제거
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 요청 가로채기 — API는 항상 네트워크, 나머지는 캐시 우선
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
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
      // 커스텀 액션 버튼 — 안드로이드 크롬에서 '수신거부' 옵션이 ⋮ 메뉴로 숨겨짐
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
      // 이미 열린 탭이 있으면 포커스
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // 없으면 새 탭으로 열기
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
