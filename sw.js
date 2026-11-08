// Le service worker de la copie en ligne, qui fait de la carte une application installable.
// Demandé le 05/11/2026 : « la possibilité d'en faire une application directement sur mon téléphone ».
// La page et ses scripts viennent du réseau quand il répond, sinon de la mémoire du téléphone. Les fichiers de data/
// (rues, lieux, photos) et les bibliothèques des CDN viennent de la mémoire et se mettent à jour en arrière-plan,
// donc une ville déjà ouverte une fois reste lisible sans réseau. Les taux de change, les traductions, la météo,
// les itinéraires et les photos de Wikimedia passent toujours par le réseau.
const VERSION = "2026-11-08g";
const PAGE = "carte-page-" + VERSION;
const DONNEES = "carte-donnees";
const COQUILLE = ["./", "index.html", "carte.js", "outils.js", "contenu.js", "regions.js", "manifest.webmanifest",
  "icones/icone-192.png", "icones/icone-512.png", "icones/icone-masque-192.png", "icones/icone-masque-512.png"];
// les bibliothèques dont l'adresse porte la version : la copie gardée sert telle quelle
const DURABLES = ["cdnjs.cloudflare.com", "fonts.gstatic.com"];
// la feuille de style des polices change parfois sans changer d'adresse
const A_RAFRAICHIR = ["fonts.googleapis.com"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(PAGE);
    await c.addAll(COQUILLE.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== PAGE && k !== DONNEES) await caches.delete(k);
    await self.clients.claim();
  })());
});

// la page, ses scripts, le manifeste et le planning : le réseau d'abord, la mémoire si le réseau ne répond pas
const estCode = (u, r) => r.mode === "navigate" || /\.(?:html|js|webmanifest)$/.test(u.pathname) || u.pathname.endsWith("/")
  || u.pathname.endsWith("/planning.json") || u.pathname.endsWith("/evenements.json");
// toutes les ouvertures de la page partagent une seule copie, quelle que soit la fin de l'adresse (?outil=, ?lieu=, #ville)
const cleDe = (r) => (r.mode === "navigate" ? new URL("./", self.registration.scope).href : r);

async function reseauDabord(r) {
  const c = await caches.open(PAGE);
  try {
    // le cache du navigateur est vérifié auprès du serveur, pour qu'une correction publiée arrive tout de suite
    const rep = await (r.mode === "navigate" ? fetch(r) : fetch(r, { cache: "no-cache" }));
    if (rep.ok && rep.type === "basic") await c.put(cleDe(r), rep.clone());
    return rep;
  } catch (err) {
    const m = (await c.match(cleDe(r))) || (await c.match(r, { ignoreSearch: true }))
      || (r.mode === "navigate" ? await c.match("index.html", { ignoreSearch: true }) : null);
    if (m) return m;
    throw err;
  }
}

// la copie gardée tout de suite, et la nouvelle version en arrière-plan pour la prochaine fois
async function memoireDabord(e, r) {
  const c = await caches.open(DONNEES);
  const m = await c.match(r);
  const frais = fetch(r).then(async (rep) => {
    if (rep.ok || rep.type === "opaque") await c.put(r, rep.clone());
    return rep;
  }).catch(() => null);
  if (m) { e.waitUntil(frais); return m; }
  return (await frais) || Response.error();
}

async function memoireSeule(r) {
  const c = await caches.open(DONNEES);
  const m = await c.match(r);
  if (m) return m;
  const rep = await fetch(r);
  if (rep.ok || rep.type === "opaque") await c.put(r, rep.clone());
  return rep;
}

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin) {
    e.respondWith(estCode(u, r) ? reseauDabord(r) : memoireDabord(e, r));
    return;
  }
  if (DURABLES.includes(u.hostname)) { e.respondWith(memoireSeule(r)); return; }
  if (A_RAFRAICHIR.includes(u.hostname)) { e.respondWith(memoireDabord(e, r)); return; }
  // tout le reste va au réseau sans passer par la mémoire
});

// À la première visite, la page se charge avant que ce service worker la contrôle : elle envoie alors la liste des
// fichiers déjà lus, gardés ici pour que la carte s'ouvre sans réseau dès la visite suivante.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "garder" || !Array.isArray(e.data.adresses)) return;
  e.waitUntil((async () => {
    const c = await caches.open(DONNEES);
    for (const a of e.data.adresses.slice(0, 600)) {
      try {
        const u = new URL(a);
        const memeSite = u.origin === self.location.origin;
        if (!memeSite && !DURABLES.includes(u.hostname) && !A_RAFRAICHIR.includes(u.hostname)) continue;
        if (memeSite && /\.(?:html|js|webmanifest)$/.test(u.pathname)) continue;
        if (await c.match(a)) continue;
        // les polices sont demandées en CORS par la page : une copie opaque ne pourrait pas leur servir
        const rep = await fetch(a, memeSite ? {} : { mode: "cors", credentials: "omit" });
        if (rep.ok) await c.put(a, rep);
      } catch { /* un fichier manquant n'empêche pas de garder les autres */ }
    }
  })());
});
