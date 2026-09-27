const CACHE_NAME = "fiszki-web-v2";

const APP_SHELL = [
  "./",
"./index.html",
"./style.css",
"./app.js",
"./manifest.webmanifest",
"./icons/icon-192.svg",
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );

  self.skipWaiting();
});


self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
    Promise.all(
      keys
      .filter((key) => key !== CACHE_NAME)
      .map((key) => caches.delete(key))
    )
    )
  );

  self.clients.claim();
});


self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") {
    return;
  }


  const url = new URL(event.request.url);


  // lessons.json zawsze pobieramy na świeżo.
  if (url.pathname.endsWith("/lessons.json")) {

    event.respondWith(
      fetch(event.request)
    );

    return;
  }


  // Pozostałe pliki mogą korzystać z cache.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {

      if (cachedResponse) {
        return cachedResponse;
      }


      return fetch(event.request).then((networkResponse) => {

        if (
          networkResponse.ok &&
          url.origin === self.location.origin
        ) {

          const copy = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }


        return networkResponse;
      });
    })
  );
});
