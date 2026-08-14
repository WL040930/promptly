// Minimal service worker for browser notifications.
// Using ServiceWorkerRegistration.showNotification() instead of `new Notification()`
// ensures Chrome on macOS reliably displays notifications, including support for
// requireInteraction and renotify options.

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const path = event.notification.data?.path;
    if (!path) return;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (new URL(client.url).pathname === path && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(path);
        })
    );
});
