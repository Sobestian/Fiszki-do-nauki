// Fiszki: jednorazowa migracja Service Workera v1 -> v2.
// Umiesc w katalogu, z ktorego GitHub Pages publikuje strone.
// Zachowaj DOKLADNIE nazwe starego pliku: service-worker.js.
// Ten skrypt nie buforuje v2 do pracy offline.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // CacheStorage jest wspolne dla wszystkich aplikacji na tej samej domenie.
    // Kasujemy TYLKO cache poprzedniej wersji Fiszek, a nie cudze cache.
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('fiszki-web-'))
        .map((name) => caches.delete(name))
    );

    const scope = self.registration.scope;
    await self.clients.claim();

    // Po migracji nie zostawiamy stalego Service Workera.
    await self.registration.unregister();

    // Odswiezamy otwarte karty i PWA we wlasnym zakresie strony.
    const pages = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    await Promise.all(
      pages
        .filter((page) => page.url.startsWith(scope))
        .map((page) => page.navigate(page.url).catch(() => undefined))
    );
  })());
});
