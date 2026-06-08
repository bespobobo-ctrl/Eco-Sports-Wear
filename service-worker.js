// Eco Sports — Service Worker (offline-first app shell)
// Maqsad: bozordagi zaif internetda ilova fayllarini keshlab, internetsiz ham ochilishi.
const CACHE = 'eco-sports-cache-v2';

// Ilova "qobig'i" — internetsiz ochilishi uchun zarur fayllar
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './assets/tshirt.png',
  './assets/shorts.png',
  './assets/tracksuit.png',
  './assets/joggers.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // faqat o'qish (GET) keshlanadi

  const url = new URL(req.url);

  // 1) Supabase API — HECH QACHON keshlanmaydi (dinamik ma'lumot).
  //    Offline'da so'rov yiqiladi, ilova o'zi localStorage'ga o'tadi.
  if (url.hostname.endsWith('supabase.co')) {
    return; // brauzer odatiy tarmoq xatti-harakati
  }

  // 2) Navigatsiya (index.html) — network-first, fallback: kesh.
  //    Online bo'lsa eng yangi versiya, offline bo'lsa keshdan ochiladi.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 3) Bizning statik fayllar (css/js/assets) — stale-while-revalidate.
  //    Keshdan darhol beriladi, fonda yangilanadi.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 4) Tashqi CDN (Telegram, Supabase SDK, FontAwesome, Google Fonts, xlsx, jsPDF)
  //    — cache-first: bir marta yuklab, keyin internetsiz ham ishlaydi.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
