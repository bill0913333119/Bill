// 簡易離線快取：App Shell 採 network-first，失敗時回退快取，確保工地收訊不佳仍可開啟。
const CACHE = 'defect-app-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  // API 與上傳檔不快取，避免顯示過期的缺失狀態
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/api/') || pathname.startsWith('/files/')) return
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy))
        return res
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  )
})
