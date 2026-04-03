var CACHE_NAME = "setupiq-shell-v1";
var SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Never cache API calls or POST requests
  if (request.method !== "GET" || request.url.includes("/api/")) {
    return;
  }

  // Network-first for navigation, cache-first for assets
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () { return caches.match("/index.html"); })
    );
  } else {
    event.respondWith(
      caches.match(request).then(function (cached) { return cached || fetch(request); })
    );
  }
});
