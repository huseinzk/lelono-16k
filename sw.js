// Zein Trail service worker: offline cache + daily training reminder (Android, installed app).
const CACHE = "zeintrail-v5";
const DATA = "zeintrail-data";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/three.min.js",
  "./vendor/GLTFLoader.js",
  "./vendor/leaflet.js",
  "./vendor/leaflet.css",
  "./models/runner.glb",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin === self.location.origin || isFont) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

/* ---------- Daily reminder ---------- */
const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

async function maybeRemind() {
  const c = await caches.open(DATA);
  const res = await c.match("./__reminder.json");
  if (!res) return;
  const cfg = await res.json();
  if (!cfg.notif) return;
  const key = todayKey();
  if (cfg.lastNotified === key) return;
  const now = new Date();
  const [hh, mm] = String(cfg.time || "05:30").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;
  const day = (cfg.days || []).find((d) => d.key === key);
  if (!day || day.type === "rest" || day.done) return;
  await self.registration.showNotification(`Zein Trail: ${day.title}`, {
    body: `${day.note}. Catat hasilnya setelah selesai.`,
    icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "zt-daily", renotify: false, data: { url: "./" },
  });
  cfg.lastNotified = key;
  await c.put("./__reminder.json", new Response(JSON.stringify(cfg), { headers: { "content-type": "application/json" } }));
}

self.addEventListener("periodicsync", (e) => { if (e.tag === "zt-daily") e.waitUntil(maybeRemind()); });

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  })());
});
