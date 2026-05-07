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
