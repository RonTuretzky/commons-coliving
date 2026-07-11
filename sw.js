/* colive.fun service worker — the app works on the subway.
   HTML/JS/CSS: network-first (deploys land immediately and atomically —
   mixed old-JS/new-HTML loads would corrupt the store). Fonts/images:
   stale-while-revalidate. Only 2xx responses are ever cached (a transient
   503 must not poison a known-good copy). Offline navigation falls back to
   the same page ignoring the query string (gathering.html?id=… still gets
   gathering.html), and only then to the homepage. Cross-origin (RPC,
   raw.githubusercontent) is never touched — chain calls must not be cached. */
const CACHE = "colive-v2";
const CORE = [
  "index.html", "browse.html", "gatherings.html", "gathering.html", "templates.html",
  "quiz.html", "dashboard.html", "ledger.html", "chores.html", "meals.html",
  "account.html", "house.html", "person.html", "checkin.html", "create.html",
  "steward.html", "chore-builder.html", "agreement.html", "split.html",
  "assets/css/park.css", "assets/js/store.js", "assets/js/shell.js", "assets/js/rails.js",
  "assets/js/vendor/viem.js", "assets/img/logomark.png", "assets/img/logomark-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  const networkFirst = e.request.mode === "navigate" ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/");
  if (networkFirst) {
    e.respondWith(
      fetch(e.request)
        .then((res) => cachePut(e.request, res))
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true })
            .then((hit) => hit || caches.match("index.html"))
        )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => cachePut(e.request, res))
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
