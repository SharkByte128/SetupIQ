/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "setupiq-shell-v1";
const SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache API calls or POST requests
  if (request.method !== "GET" || request.url.includes("/api/")) {
    return;
  }

  // Network-first for navigation, cache-first for assets
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html") as Promise<Response>)
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

export {};
