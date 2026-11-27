// Service worker do Um Jogo Casual.
// Guarda o app no aparelho para abrir sem internet (modo celular único).
// Ao mudar qualquer arquivo do app, aumente a versão abaixo.
const VERSAO = "v5";
const CACHE = "jogo-casual-" + VERSAO;
const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("jogo-casual-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Páginas: tenta a rede primeiro (pega atualizações), cai para o cache sem internet.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put("index.html", copia));
        return res;
      }).catch(() => caches.match("index.html"))
    );
    return;
  }

  // Fontes do Google e arquivos do app: cache primeiro, atualiza em segundo plano.
  if (url.origin === location.origin || url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const salvo = await c.match(req);
        const rede = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => salvo);
        return salvo || rede;
      })
    );
  }
});
