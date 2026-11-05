// Les outils du voyage, ajoutés le 05/11/2026 à la demande de Schadrac : « la possibilité d'en faire une application
// directement sur mon téléphone », « une fonction de traduction » et « une fonction qui permet de convertir la monnaie,
// que ce soit en euros, en won ou en yen ».
// - L'application : manifest.webmanifest et sw.js rendent la copie en ligne installable. Ce fichier enregistre le
//   service worker, propose l'installation une seule fois et règle la couleur de la barre du téléphone.
// - Le convertisseur : taux de référence de la BCE lus sur api.frankfurter.dev (sans clé), gardés sur le téléphone pour
//   servir sans réseau.
// - Le traducteur : MyMemory (api.mymemory.translated.net, sans clé, 5 000 caractères par jour et par adresse IP, ou
//   50 000 avec une adresse mail ; 500 octets au plus par demande, vu le 05/11/2026 dans sa documentation), la lecture
//   à voix haute et la dictée du navigateur, et des liens vers Papago et Google Traduction.
// Dans claude.ai, la carte vit dans un cadre qui bloque les appels vers d'autres sites : le convertisseur garde le taux
// enregistré ici et le traducteur renvoie vers Papago, Google Traduction et la copie en ligne.
import { JOURS } from "./contenu.js";

const $ = (s, el = document) => el.querySelector(s);
const echapper = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const HAUT = (() => { try { return window.self === window.top; } catch { return false; } })();
const COPIE_EN_LIGNE = "https://shadiiro.github.io/carte-coree-japon/";
const lire = (k, defaut) => { try { const v = localStorage.getItem(k); return v == null ? defaut : JSON.parse(v); } catch { return defaut; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou refusé */ } };

const SVG = {
  inverser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14M14 4l4 4-4 4"/><path d="M20 16H6M10 12l-4 4 4 4"/></svg>',
  micro: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
  ecouter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  grand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  epingle: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#14171C"/><path d="M32 12c-8.3 0-15 6.5-15 14.6C17 37.5 32 52 32 52s15-14.5 15-25.4C47 18.5 40.3 12 32 12z" fill="#E9B65A"/><circle cx="32" cy="27" r="5.5" fill="#14171C"/></svg>',
};

// ---------- Le pays où vous êtes : celui du jour pendant le voyage, sinon celui que montre la carte ----------
let paysCarte = () => null;
function paysActuel() {
  const d = new Date();
  if (d.getFullYear() === 2026 && d.getMonth() === 10) {
    const j = JOURS.find((x) => x.n === d.getDate());
    if (j?.pays === "kr" || j?.pays === "jp") return j.pays;
  }
  return paysCarte() || "kr";
}

// ---------- Les écrans posés sur la carte ----------
// Le bouton retour du téléphone ferme l'écran ouvert au lieu de quitter l'application installée : chaque écran ajoute
// une entrée à l'historique, que le retour enlève.
const PILE = [];
function ouvrirEcran(el) {
  if (PILE.some((x) => x.el === el)) return;
  const e = { el, histoire: false, retour: document.activeElement };
  el.hidden = false;
  PILE.push(e);
  if (HAUT) { try { history.pushState({ ecranOutil: PILE.length }, ""); e.histoire = true; } catch { /* l'historique reste tel quel */ } }
}
function retirer(i) {
  const [e] = PILE.splice(i, 1);
  e.el.hidden = true;
  e.el.dispatchEvent(new Event("ferme"));
  if (e.retour?.isConnected) e.retour.focus?.({ preventScroll: true });
}
function fermerEcran(el) {
  const i = PILE.findIndex((x) => x.el === el);
  if (i < 0) { el.hidden = true; return; }
  // l'écran du dessus se ferme par un retour dans l'historique, qui enlève aussi l'entrée ajoutée à son ouverture
  if (i === PILE.length - 1 && PILE[i].histoire && history.state?.ecranOutil === PILE.length) { history.back(); return; }
  retirer(i);
}
addEventListener("popstate", () => { if (PILE.length) retirer(PILE.length - 1); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && PILE.length) fermerEcran(PILE[PILE.length - 1].el); });

// ---------- L'application à installer ----------
let INVITE = null;
const autonome = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function preparerApplication() {
  if (!HAUT || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  const premiereVisite = !navigator.serviceWorker.controller;
  // quand une nouvelle version du service worker prend la main, la page se recharge une fois pour lire le nouveau code,
  // sauf si un outil est ouvert à l'écran
  if (!premiereVisite) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      let deja = false;
      try { deja = !!sessionStorage.getItem("carte-rechargee"); sessionStorage.setItem("carte-rechargee", "1"); } catch { deja = true; }
      if (PILE.length || deja) return;
      location.reload();
    });
  }
  navigator.serviceWorker.register("sw.js", { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // à la première visite, la page s'est chargée avant que le service worker la contrôle : il garde ce qu'elle a déjà lu
      if (premiereVisite) {
        const adresses = performance.getEntriesByType("resource").map((x) => x.name)
          .filter((a) => /^https:|^http:\/\/localhost/.test(a) && !/frankfurter|mymemory|wikimedia|open-meteo|openstreetmap/.test(a));
        reg.active?.postMessage({ type: "garder", adresses });
      }
      navigator.storage?.persist?.().catch(() => {});
    })
    .catch(() => { /* sans service worker, la carte marche comme avant, seulement avec du réseau */ });
}
// écouté dès le chargement de ce fichier, avant la fin de carte.js : Chrome peut proposer l'installation très tôt
if (HAUT) {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    INVITE = e;
    majBoutonsInstaller();
    if (!lire("carte-installation-refusee", false)) setTimeout(montrerBandeau, 2500);
  });
  addEventListener("appinstalled", () => { INVITE = null; cacherBandeau(); majBoutonsInstaller(); });
}
async function installer() {
  if (!INVITE) return;
  const e = INVITE;
  INVITE = null;
  cacherBandeau();
  try { await e.prompt(); await e.userChoice; } catch { /* le navigateur a refusé d'ouvrir sa fenêtre */ }
  majBoutonsInstaller();
}
function majBoutonsInstaller() { document.querySelectorAll(".bouton-installer").forEach((b) => { b.hidden = !INVITE; }); }
function cacherBandeau() { const b = $("#bandeau-appli"); if (b) b.hidden = true; }
function montrerBandeau() {
  const b = $("#bandeau-appli");
  if (!b || !INVITE || autonome()) return;
  b.innerHTML = `<span class="bandeau-icone">${SVG.epingle}</span>
    <p>Installer la carte sur ce téléphone, comme une application ? Elle s'ouvrira en plein écran depuis son icône, et les villes déjà vues resteront lisibles sans réseau.</p>
    <div class="bandeau-actions"><button type="button" class="btn" id="bandeau-plus-tard">Plus tard</button>
      <button type="button" class="btn btn-or" id="bandeau-installer">Installer</button></div>`;
  b.hidden = false;
  $("#bandeau-installer", b).addEventListener("click", installer);
  $("#bandeau-plus-tard", b).addEventListener("click", () => { ecrire("carte-installation-refusee", true); cacherBandeau(); });
}

// la barre du téléphone prend la couleur du fond de la carte, de jour comme de nuit
function suivreCouleurBarre() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (!m) return;
  const maj = () => { const c = getComputedStyle(document.documentElement).getPropertyValue("--fond").trim(); if (c) m.setAttribute("content", c); };
  maj();
  new MutationObserver(maj).observe(document.documentElement, { attributes: true, attributeFilter: ["data-carte", "data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", maj);
}

// le paragraphe de la légende sur les outils et l'installation
export function blocOutils() {
  const installation = !HAUT
    ? `L'installation se fait depuis la copie en ligne de la carte, ouverte dans Chrome ou Samsung Internet : <a href="${COPIE_EN_LIGNE}" target="_blank" rel="noopener">ouvrir la copie en ligne</a>.`
    : autonome()
      ? "La carte est ouverte ici comme une application installée."
      : "Dans Chrome, le menu à trois points propose « Ajouter à l'écran d'accueil », puis « Installer ». Dans Samsung Internet, une icône d'installation apparaît dans la barre d'adresse, et le menu à trois traits propose aussi « Ajouter la page à », puis « Écran d'accueil ».";
  return `<h3 id="legende-outils">Traduire, convertir et installer</h3>
    <p>Le bouton 文A traduit un texte entre le français, le coréen, le japonais et l'anglais. Le texte s'écrit au clavier ou se dicte avec le bouton Dicter. Le bouton Écouter lit la traduction à voix haute, et le bouton Montrer en grand l'affiche en gros caractères pour la personne en face. La traduction vient de MyMemory, un service gratuit en ligne. Les traductions déjà faites restent sur le téléphone et s'affichent même sans réseau. Les boutons Papago et Google Traduction ouvrent le même texte dans ces services.</p>
    <p>Le bouton € convertit un montant entre euros, wons et yens avec le taux de référence de la Banque centrale européenne. Le dernier taux reçu reste sur le téléphone pour les moments sans réseau. Les frais de la carte bancaire s'ajoutent à ce taux.</p>
    <p>La copie en ligne de la carte s'installe sur le téléphone comme une application. Elle s'ouvre alors en plein écran depuis son icône, et les villes déjà ouvertes restent lisibles sans réseau. Un appui long sur l'icône donne un accès direct au traducteur et au convertisseur. ${installation}</p>
    <p><button type="button" class="btn btn-or bouton-installer" hidden>Installer l'application</button></p>`;
}
export function brancherOutils(el) {
  el.querySelectorAll(".bouton-installer").forEach((b) => b.addEventListener("click", installer));
  majBoutonsInstaller();
}

// ---------- Le convertisseur ----------
const DEVISES = {
  KRW: { signe: "₩", nom: "wons", decimales: 0, reperes: [1000, 5000, 10000, 20000, 50000, 100000] },
  JPY: { signe: "¥", nom: "yens", decimales: 0, reperes: [100, 500, 1000, 3000, 5000, 10000] },
  EUR: { signe: "€", nom: "euros", decimales: 2, reperes: [1, 5, 10, 20, 50, 100] },
};
// taux de référence de la BCE du 4 novembre 2026, lus le 05/11/2026 sur api.frankfurter.dev : ils servent tant
// qu'aucun taux plus récent n'a été reçu, et toujours dans claude.ai
const TAUX_DEPART = { date: "2026-11-04", KRW: 1508.18, JPY: 178.3 };
let TAUX = (() => { const t = lire("carte-taux", null); return t?.KRW > 0 && t?.JPY > 0 && t.date >= TAUX_DEPART.date ? t : { ...TAUX_DEPART }; })();
let ETAT_TAUX = "";
let RECHERCHE_TAUX = null;
const CONV = { devise: null };

const nombre = (x, dec) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(x);
const montant = (x, d, rond = false) => `${nombre(x, rond && Number.isInteger(x) ? 0 : DEVISES[d].decimales)} ${DEVISES[d].signe}`;
const enEuros = (x, d) => (d === "EUR" ? x : x / TAUX[d]);
const depuisEuros = (e, d) => (d === "EUR" ? e : e * TAUX[d]);
const dateLongue = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// 25000, 25 000, 25.000 et 25,000 font 25 000 wons ; 12,50 et 12.50 font 12,50 €
function lireMontant(t, d) {
  let s = String(t ?? "").replace(/[\s  ']/g, "");
  if (DEVISES[d].decimales === 0) s = s.replace(/[.,]/g, "");
  else {
    s = s.replace(/,/g, ".");
    const i = s.lastIndexOf(".");
    if (i >= 0) s = s.slice(0, i).replace(/\./g, "") + s.slice(i);
  }
  s = s.replace(/[^\d.]/g, "");
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : null;
}
function lireFrais() {
  const x = parseFloat(String(lire("carte-frais-carte", "") || "").replace(",", "."));
  return Number.isFinite(x) && x > 0 && x <= 20 ? x : 0;
}

async function chercherTaux(force = false) {
  if (!force && TAUX.recu && Date.now() - TAUX.recu < 3 * 3600 * 1000) { ETAT_TAUX = "frais"; return; }
  RECHERCHE_TAUX ??= (async () => {
    try {
      const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=KRW,JPY", { cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!(d?.rates?.KRW > 0 && d?.rates?.JPY > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))) throw new Error("taux absents");
      TAUX = { date: d.date, KRW: d.rates.KRW, JPY: d.rates.JPY, recu: Date.now() };
      ecrire("carte-taux", TAUX);
      ETAT_TAUX = "frais";
    } catch {
      ETAT_TAUX = !HAUT ? "cadre" : navigator.onLine === false ? "hors-ligne" : "garde";
    } finally { RECHERCHE_TAUX = null; }
  })();
  return RECHERCHE_TAUX;
}

function construireConvertisseur(ecran) {
  ecran.innerHTML = `<div class="outil-feuille" role="dialog" aria-modal="true" aria-labelledby="conv-titre">
    <div class="liste-tete"><h2 id="conv-titre">Convertir</h2><button type="button" class="fermer-liste" aria-label="Fermer le convertisseur">×</button></div>
    <label class="outil-etiquette" for="conv-montant">Montant à convertir</label>
    <div class="conv-saisie">
      <input id="conv-montant" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="0">
      <button type="button" class="btn" id="conv-zeros" aria-label="Ajouter trois zéros au montant">000</button>
    </div>
    <div class="conv-devises" role="group" aria-label="Monnaie du montant">
      ${["KRW", "JPY", "EUR"].map((d) => `<button type="button" data-d="${d}" aria-pressed="false">${DEVISES[d].signe} ${DEVISES[d].nom[0].toUpperCase()}${DEVISES[d].nom.slice(1)}</button>`).join("")}
    </div>
    <div class="conv-resultats" id="conv-resultats" aria-live="polite"></div>
    <div class="conv-frais"><label for="conv-frais">Frais de ma carte bancaire hors zone euro</label>
      <span><input id="conv-frais" type="text" inputmode="decimal" autocomplete="off" maxlength="4" placeholder="0"> %</span></div>
    <h3 class="outil-sous-titre">Repères</h3>
    <table class="conv-table" id="conv-reperes"></table>
    <p class="outil-note" id="conv-taux"></p>
    <p class="outil-note">Au terminal de paiement, mieux vaut choisir les wons ou les yens plutôt que les euros, car la conversion faite par le commerçant coûte souvent 2 à 5 % de plus que le taux normal.</p>
  </div>`;
  const champ = $("#conv-montant", ecran);
  champ.addEventListener("input", majResultats);
  champ.addEventListener("keydown", (e) => { if (e.key === "Enter") champ.blur(); });
  // les boutons sous le champ gardent le clavier ouvert
  ecran.querySelectorAll("#conv-zeros, .conv-devises button").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("pointerdown", (e) => { if (document.activeElement === champ) e.preventDefault(); });
  });
  $("#conv-zeros", ecran).addEventListener("click", () => {
    if (champ.value.trim()) { champ.value = champ.value.trim() + "000"; majResultats(); }
    champ.focus({ preventScroll: true });
  });
  ecran.querySelectorAll(".conv-devises button").forEach((b) => b.addEventListener("click", () => {
    CONV.devise = b.dataset.d;
    majConvertisseur();
  }));
  const frais = $("#conv-frais", ecran);
  frais.value = lire("carte-frais-carte", "") || "";
  frais.addEventListener("input", () => { ecrire("carte-frais-carte", frais.value.trim()); majResultats(); });
  $(".fermer-liste", ecran).addEventListener("click", () => fermerEcran(ecran));
}

function majConvertisseur() {
  const ecran = $("#convertisseur");
  ecran.querySelectorAll(".conv-devises button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.d === CONV.devise)));
  $("#conv-zeros", ecran).hidden = CONV.devise === "EUR";
  majResultats(); majReperes(); majTaux();
}
function majResultats() {
  const d = CONV.devise, res = $("#conv-resultats");
  const x = lireMontant($("#conv-montant").value, d);
  if (x == null || x <= 0) { res.innerHTML = `<p class="outil-vide">Le montant tapé s'affiche ici dans les deux autres monnaies.</p>`; return; }
  const e = enEuros(x, d), frais = lireFrais();
  const autres = d === "EUR" ? (paysActuel() === "jp" ? ["JPY", "KRW"] : ["KRW", "JPY"]) : ["EUR", d === "KRW" ? "JPY" : "KRW"];
  res.innerHTML = `<p class="conv-depart">${montant(x, d)} valent environ</p>
    ${autres.map((k, i) => `<p class="conv-gros${i ? " conv-second" : ""}">${montant(depuisEuros(e, k), k)}</p>`).join("")}
    ${frais > 0 && d !== "EUR" ? `<p class="conv-avec-frais">Avec ${nombre(frais, Number.isInteger(frais) ? 0 : 1)} % de frais de carte, le paiement revient à environ ${montant(e * (1 + frais / 100), "EUR")}.</p>` : ""}`;
}
function majReperes() {
  const d = CONV.devise, t = $("#conv-reperes");
  const colonnes = d === "EUR" ? (paysActuel() === "jp" ? ["JPY", "KRW"] : ["KRW", "JPY"]) : ["EUR"];
  t.innerHTML = `<thead><tr><th scope="col">Montant en ${DEVISES[d].nom}</th>${colonnes.map((k) => `<th scope="col">Valeur en ${DEVISES[k].nom}</th>`).join("")}</tr></thead>
    <tbody>${DEVISES[d].reperes.map((x) => `<tr><td>${montant(x, d, true)}</td>${colonnes.map((k) => `<td>${montant(depuisEuros(enEuros(x, d), k), k)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function majTaux() {
  const p = $("#conv-taux");
  if (!p) return;
  const suite = {
    attente: " Recherche du taux du jour…",
    garde: " Le service des taux n'a pas répondu, donc le dernier taux reçu sert au calcul.",
    "hors-ligne": " Sans réseau, le dernier taux reçu sert au calcul.",
    cadre: " Dans claude.ai, le taux enregistré dans la carte sert au calcul. La copie en ligne reçoit le taux du jour.",
  }[ETAT_TAUX] || "";
  p.textContent = `Taux de référence de la Banque centrale européenne du ${dateLongue(TAUX.date)} : 1 € vaut ${nombre(TAUX.KRW, 2)} ₩ et ${nombre(TAUX.JPY, 2)} ¥.${suite}`;
}

function ouvrirConvertisseur() {
  const ecran = $("#convertisseur");
  if (!ecran) return;
  if (!ecran.dataset.pret) { construireConvertisseur(ecran); ecran.dataset.pret = "1"; }
  CONV.devise ??= paysActuel() === "jp" ? "JPY" : "KRW";
  if (ETAT_TAUX !== "frais") ETAT_TAUX = "attente";
  majConvertisseur();
  $(".outil-feuille", ecran).scrollTop = 0;
  ouvrirEcran(ecran);
  const champ = $("#conv-montant");
  champ.focus({ preventScroll: true });
  champ.select();
  chercherTaux().then(() => { majTaux(); majResultats(); majReperes(); });
}

// ---------- Le traducteur ----------
const LANGUES = {
  fr: { nom: "Français", voix: "fr-FR", dans: "en français", adjectif: "française" },
  ko: { nom: "Coréen", voix: "ko-KR", dans: "en coréen", adjectif: "coréenne" },
  ja: { nom: "Japonais", voix: "ja-JP", dans: "en japonais", adjectif: "japonaise" },
  en: { nom: "Anglais", voix: "en-US", dans: "en anglais", adjectif: "anglaise" },
};
// la phrase écrite sous la traduction montrée en grand, dans la langue de la personne en face
const AVERTISSEMENT = {
  ko: "자동 번역이라서 틀린 부분이 있을 수 있습니다.",
  ja: "自動翻訳のため、間違いがあるかもしれません。",
  en: "This is a machine translation, so it may contain mistakes.",
  fr: "Ceci est une traduction automatique, elle peut contenir des erreurs.",
};
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const PAROLE = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const HISTO = "carte-traductions";
let TRAD = null;
let ECOUTE = null;

class ErreurTrad extends Error { constructor(type, detail = "") { super(type); this.type = type; this.detail = detail; } }

const octets = (s) => new TextEncoder().encode(s).length;
// MyMemory refuse une demande de plus de 500 octets : le texte part en morceaux, coupés entre deux phrases
function morceaux(texte, max = 480) {
  const phrases = texte.match(/[^.!?。！？\n]+[.!?。！？]*\s*|\n+/g) || [texte];
  const sortie = [];
  let cours = "";
  for (const p of phrases) {
    if (octets(cours + p) <= max) { cours += p; continue; }
    if (cours.trim()) sortie.push(cours);
    cours = "";
    if (octets(p) <= max) { cours = p; continue; }
    for (const c of p) { if (octets(cours + c) > max) { sortie.push(cours); cours = ""; } cours += c; }
  }
  if (cours.trim()) sortie.push(cours);
  return sortie.map((x) => x.trim()).filter(Boolean);
}
function decoderEntites(t) {
  if (!/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) return t;
  const z = document.createElement("textarea");
  z.innerHTML = t;
  return z.value;
}
async function traduireMorceau(q, de, vers) {
  const u = new URL("https://api.mymemory.translated.net/get");
  u.searchParams.set("q", q);
  u.searchParams.set("langpair", `${de}|${vers}`);
  const mail = lire("carte-trad-mail", "");
  if (mail) u.searchParams.set("de", mail);
  let r;
  try { r = await fetch(u, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" }); }
  catch { throw new ErreurTrad(HAUT ? "reseau" : "cadre"); }
  let d;
  try { d = await r.json(); } catch { throw new ErreurTrad("service", `HTTP ${r.status}`); }
  const statut = Number(d?.responseStatus), t = String(d?.responseData?.translatedText ?? "");
  if (d?.quotaFinished === true || statut === 429 || /MYMEMORY WARNING/i.test(t)) throw new ErreurTrad("quota", t);
  if (statut !== 200 || !t.trim() || /^(QUERY LENGTH LIMIT|INVALID|PLEASE SELECT|NO QUERY)/i.test(t)) throw new ErreurTrad("service", d?.responseDetails || t);
  return decoderEntites(t).trim();
}

function etat(html, erreur = false) {
  const p = $("#trad-etat");
  if (!p) return;
  p.innerHTML = html;
  p.classList.toggle("erreur", erreur);
}
function delaiQuota(t) {
  const m = /NEXT AVAILABLE IN\s+(\d+)\s+HOURS?\s+(\d+)\s+MINUTES?/i.exec(t || "");
  if (!m) return "";
  const h = Number(m[1]), mn = Number(m[2]);
  return h ? ` Le compteur repart à zéro dans environ ${h} h ${String(mn).padStart(2, "0")}.` : ` Le compteur repart à zéro dans environ ${mn} minutes.`;
}
function messageErreur(err) {
  const ailleurs = "Les boutons Papago et Google Traduction ouvrent ce texte dans ces services.";
  switch (err?.type) {
    case "quota": return `La limite gratuite de MyMemory est atteinte pour aujourd'hui sur ce réseau.${delaiQuota(err.detail)} ${ailleurs} Une adresse mail ajoutée dans les réglages, en bas, porte la limite à 50 000 caractères par jour.`;
    case "cadre": return `Dans claude.ai, la carte ne peut pas joindre le service de traduction. ${ailleurs} La <a href="${COPIE_EN_LIGNE}" target="_blank" rel="noopener">copie en ligne de la carte</a> traduit directement.`;
    case "reseau": return `Le service de traduction ne répond pas, peut-être faute de réseau. ${ailleurs}`;
    default: return `Le service de traduction a renvoyé une erreur. ${ailleurs}`;
  }
}

const historique = () => { const h = lire(HISTO, []); return Array.isArray(h) ? h : []; };
function garderTraduction(e) {
  const h = historique().filter((x) => !(x.de === e.de && x.vers === e.vers && x.source === e.source));
  h.unshift({ de: e.de, vers: e.vers, source: e.source, trad: e.trad, quand: Date.now() });
  ecrire(HISTO, h.slice(0, 40));
  majHistorique();
}
function majHistorique() {
  const h = historique().slice(0, 12), ul = $("#trad-historique");
  if (!ul) return;
  $("#trad-histo-titre").hidden = !h.length;
  ul.innerHTML = h.map((x, i) => `<li><button type="button" data-i="${i}">
      <span class="trad-h-langues">${echapper(LANGUES[x.de]?.nom)} vers ${echapper((LANGUES[x.vers]?.nom || "").toLowerCase())}</span>
      <span class="trad-h-source" lang="${echapper(x.de)}">${echapper(x.source)}</span>
      <span class="trad-h-trad" lang="${echapper(x.vers)}">${echapper(x.trad)}</span></button></li>`).join("");
}

function majLangues() {
  $("#trad-de").value = TRAD.de;
  $("#trad-vers").value = TRAD.vers;
  const zone = $("#trad-texte");
  zone.placeholder = `Texte ${LANGUES[TRAD.de].dans}, écrit ou dicté`;
  zone.lang = TRAD.de;
  majLiens();
}
function majLiens() {
  const texte = ($("#trad-texte")?.value || "").trim() || TRAD.source || "";
  const q = encodeURIComponent(texte.slice(0, 1500));
  $("#trad-papago").href = `https://papago.naver.com/?sk=${TRAD.de}&tk=${TRAD.vers}&st=${q}`;
  $("#trad-google").href = `https://translate.google.com/?sl=${TRAD.de}&tl=${TRAD.vers}&text=${q}&op=translate`;
}
function montrerResultat(source, trad) {
  TRAD.source = source;
  TRAD.trad = trad;
  const p = $("#trad-resultat");
  p.textContent = trad;
  p.lang = TRAD.vers;
  $("#trad-resultat-cadre").hidden = false;
  majLiens();
}
function cacherResultat() { $("#trad-resultat-cadre").hidden = true; TRAD.trad = ""; }

async function traduire() {
  const zone = $("#trad-texte"), bouton = $("#trad-go"), texte = zone.value.trim();
  if (!texte) { etat("Le texte à traduire s'écrit ou se dicte d'abord dans la case."); zone.focus(); return; }
  if (TRAD.de === TRAD.vers) { etat("La langue du texte et la langue de la traduction sont les mêmes.", true); return; }
  const deja = historique().find((h) => h.de === TRAD.de && h.vers === TRAD.vers && h.source === texte);
  if (deja) {
    montrerResultat(texte, deja.trad);
    garderTraduction(deja);
    etat("Cette traduction était déjà faite : elle s'affiche sans passer par internet.");
    return;
  }
  if (HAUT && navigator.onLine === false) {
    etat("Pas de réseau pour le moment. La traduction a besoin d'internet, mais les traductions déjà faites restent dans la liste plus bas, et les boutons Papago et Google Traduction gardent le texte pour plus tard.", true);
    return;
  }
  const de = TRAD.de, vers = TRAD.vers;
  bouton.disabled = true;
  etat("Traduction en cours…");
  try {
    const sorties = [];
    for (const m of morceaux(texte)) sorties.push(await traduireMorceau(m, de, vers));
    const trad = sorties.join(vers === "ja" ? "" : " ");
    if (de !== TRAD.de || vers !== TRAD.vers) return;
    montrerResultat(texte, trad);
    garderTraduction({ de, vers, source: texte, trad });
    etat("");
    if (document.activeElement === zone && matchMedia("(pointer: coarse)").matches) zone.blur();
  } catch (err) {
    cacherResultat();
    etat(messageErreur(err), true);
  } finally { bouton.disabled = false; }
}

// ---------- la voix : lire à voix haute et dicter ----------
let VOIX = [];
function chargerVoix() { try { VOIX = window.speechSynthesis.getVoices() || []; } catch { VOIX = []; } }
if (PAROLE) { chargerVoix(); window.speechSynthesis.addEventListener?.("voiceschanged", chargerVoix); }
function lireAVoixHaute(texte, langue) {
  if (!PAROLE || !texte) return;
  chargerVoix();
  const code = LANGUES[langue].voix;
  const memes = VOIX.filter((v) => (v.lang || "").replace("_", "-").toLowerCase().startsWith(langue));
  if (VOIX.length && !memes.length) {
    etat(`Aucune voix ${LANGUES[langue].adjectif} n'est installée sur ce téléphone. Elle s'ajoute dans les réglages du téléphone, rubrique synthèse vocale.`, true);
    return;
  }
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(texte);
  u.lang = code;
  const v = memes.find((x) => x.lang.replace("_", "-") === code) || memes[0];
  if (v) u.voice = v;
  u.rate = 0.9;
  u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") etat("La lecture à voix haute n'a pas marché sur ce téléphone.", true); };
  s.speak(u);
}
// La dictée passe par la reconnaissance vocale du navigateur (celle de Google dans Chrome sur Android).
// Corrigé le 05/11/2026 après « la fonction vocale ne marche pas pour l'application » : la liste des résultats n'est
// pas itérable dans tous les navigateurs (un for…of sur e.results arrêtait tout sans message), et Chrome sur Android
// envoie les résultats intermédiaires en double puis s'arrête après une ou deux secondes de silence. La dictée demande
// donc seulement le résultat final, lit la liste par ses index et dit toujours ce qui s'est passé, avec le code reçu.
const AIDE_CLAVIER = "Le micro du clavier du téléphone sert aussi à dicter dans la case, avant un toucher sur Traduire.";
const MESSAGES_DICTEE = {
  "not-allowed": "Le micro est bloqué pour la carte. Il se débloque dans Chrome, menu à trois points, Paramètres, Paramètres des sites, puis Micro.",
  "service-not-allowed": "La reconnaissance vocale n'est pas disponible dans ce navigateur.",
  "no-speech": "Aucune parole entendue. La dictée s'arrête après deux secondes de silence, donc la phrase se dit juste après le toucher sur Dicter.",
  "audio-capture": "Aucun micro disponible, peut-être parce qu'une autre application l'utilise.",
  network: "La dictée a besoin d'internet sur ce téléphone.",
  "language-not-supported": "Cette langue n'est pas disponible pour la dictée sur ce téléphone.",
  "bad-grammar": "La dictée a refusé la demande de la carte.",
};
function boutonDictee(actif) {
  const b = $("#trad-dicter");
  if (!b) return;
  b.setAttribute("aria-pressed", String(actif));
  $("span", b).textContent = actif ? "Arrêter" : "Dicter";
}
function dicter() {
  const zone = $("#trad-texte");
  if (!Reco) {
    zone.focus();
    etat(`La dictée intégrée n'existe pas dans ce navigateur. ${AIDE_CLAVIER}`, true);
    return;
  }
  if (ECOUTE) { ECOUTE.stop(); return; }
  const avant = zone.value.trim(), langue = TRAD.de;
  let r;
  try { r = new Reco(); } catch { etat(`La dictée ne démarre pas dans ce navigateur. ${AIDE_CLAVIER}`, true); return; }
  r.lang = LANGUES[langue].voix;
  r.interimResults = false;
  r.continuous = false;
  r.maxAlternatives = 1;
  let entendu = "", erreur = "";
  r.onaudiostart = () => etat(`J'écoute : parlez ${LANGUES[langue].dans} dès maintenant.`);
  r.onresult = (e) => {
    const liste = e.results;
    let t = "";
    for (let i = Number(e.resultIndex) || 0; i < (liste?.length || 0); i++) {
      const res = liste[i], alt = res && res[0];
      if (alt && typeof alt.transcript === "string") t += alt.transcript;
    }
    t = t.trim();
    if (!t) return;
    entendu = t;
    zone.value = (avant ? `${avant} ` : "") + t;
    majLiens();
  };
  r.onnomatch = () => { erreur = "nomatch"; etat(`La phrase n'a pas été reconnue. ${AIDE_CLAVIER}`, true); };
  r.onerror = (e) => {
    erreur = e?.error || "inconnue";
    if (erreur === "aborted") return;
    etat(`${MESSAGES_DICTEE[erreur] || "La dictée s'est arrêtée."} ${AIDE_CLAVIER} (code : ${erreur})`, true);
  };
  r.onend = () => {
    ECOUTE = null;
    boutonDictee(false);
    if (entendu && langue === TRAD.de) { traduire(); return; }
    if (!erreur) etat(`Aucune phrase reconnue. ${AIDE_CLAVIER}`, true);
  };
  try {
    r.start();
    ECOUTE = r;
    boutonDictee(true);
    cacherResultat();
    etat(`Parlez ${LANGUES[langue].dans} juste après ce toucher. La traduction se lance à la fin de la phrase.`);
  } catch (err) {
    ECOUTE = null;
    boutonDictee(false);
    etat(`La dictée ne démarre pas sur ce téléphone. ${AIDE_CLAVIER} (code : ${err?.name || "start"})`, true);
  }
}

// ---------- la traduction en grand, pour la personne en face ----------
function montrerEnGrand() {
  const g = $("#grand");
  if (!g || !TRAD?.trad) return;
  g.innerHTML = `<div class="grand-carte" role="dialog" aria-modal="true" aria-labelledby="grand-texte">
    <p class="grand-aide">Écran à montrer à la personne en face.</p>
    <p class="grand-texte" id="grand-texte" lang="${TRAD.vers}">${echapper(TRAD.trad)}</p>
    <p class="grand-avert" lang="${TRAD.vers}">${echapper(AVERTISSEMENT[TRAD.vers])}</p>
    <p class="grand-origine">Votre texte : «\u00a0${echapper(TRAD.source)}\u00a0»</p>
    <div class="grand-actions">
      ${PAROLE ? `<button type="button" class="btn" id="grand-ecouter">${SVG.ecouter}Écouter</button>` : ""}
      <button type="button" class="btn" id="grand-tourner" aria-pressed="false" aria-label="Retourner le texte vers la personne en face">Retourner</button>
      <button type="button" class="btn btn-or" id="grand-fermer">Fermer</button>
    </div></div>`;
  const vers = TRAD.vers, trad = TRAD.trad;
  $("#grand-ecouter", g)?.addEventListener("click", () => lireAVoixHaute(trad, vers));
  $("#grand-tourner", g).addEventListener("click", (e) => {
    const c = $(".grand-carte", g), t = c.classList.toggle("tourne");
    e.currentTarget.setAttribute("aria-pressed", String(t));
  });
  $("#grand-fermer", g).addEventListener("click", () => fermerEcran(g));
  ouvrirEcran(g);
  $("#grand-fermer", g).focus({ preventScroll: true });
}

function construireTraducteur(ecran) {
  const options = Object.entries(LANGUES).map(([k, l]) => `<option value="${k}">${l.nom}</option>`).join("");
  ecran.innerHTML = `<div class="outil-feuille" role="dialog" aria-modal="true" aria-labelledby="trad-titre">
    <div class="liste-tete"><h2 id="trad-titre">Traduire</h2><button type="button" class="fermer-liste" aria-label="Fermer le traducteur">×</button></div>
    <div class="trad-langues">
      <select id="trad-de" aria-label="Langue du texte">${options}</select>
      <button type="button" class="outil rond trad-inverser" id="trad-inverser" aria-label="Inverser les deux langues" title="Inverser les langues">${SVG.inverser}</button>
      <select id="trad-vers" aria-label="Langue de la traduction">${options}</select>
    </div>
    <textarea id="trad-texte" rows="3" maxlength="1500" enterkeyhint="go" aria-label="Texte à traduire"></textarea>
    <div class="trad-actions">
      <button type="button" class="btn btn-or" id="trad-go">Traduire</button>
      <button type="button" class="btn" id="trad-dicter" aria-pressed="false">${SVG.micro}<span>Dicter</span></button>
      <button type="button" class="btn" id="trad-effacer">Effacer</button>
    </div>
    <p class="trad-etat" id="trad-etat" role="status" aria-live="polite"></p>
    <div class="trad-resultat-cadre" id="trad-resultat-cadre" hidden>
      <p class="trad-resultat" id="trad-resultat"></p>
      <div class="trad-actions">
        ${PAROLE ? `<button type="button" class="btn" id="trad-ecouter">${SVG.ecouter}Écouter</button>` : ""}
        <button type="button" class="btn" id="trad-grand">${SVG.grand}Montrer en grand</button>
        <button type="button" class="btn" id="trad-copier">Copier</button>
      </div>
    </div>
    <div class="trad-ailleurs"><span>Ouvrir le texte dans</span>
      <a class="btn" id="trad-papago" target="_blank" rel="noopener noreferrer">Papago</a>
      <a class="btn" id="trad-google" target="_blank" rel="noopener noreferrer">Google Traduction</a>
      ${navigator.share ? `<button type="button" class="btn" id="trad-partager">Une autre app</button>` : ""}
    </div>
    <h3 class="outil-sous-titre" id="trad-histo-titre" hidden>Dernières traductions</h3>
    <ul class="trad-historique" id="trad-historique"></ul>
    <details class="trad-reglages">
      <summary>Réglages et confidentialité</summary>
      <label class="outil-etiquette" for="trad-mail">Adresse mail pour MyMemory, facultative</label>
      <input id="trad-mail" type="email" inputmode="email" autocomplete="email" spellcheck="false" placeholder="nom@exemple.fr">
      <p class="outil-note">Sans adresse mail, MyMemory accepte 5 000 caractères par jour et par réseau. Avec une adresse mail, la limite passe à 50 000 caractères par jour. L'adresse reste sur ce téléphone et part seulement avec chaque demande de traduction.</p>
      <p class="outil-note">Le texte à traduire part chez MyMemory, un service de traduction en ligne qui peut le garder dans sa mémoire de traduction. Mieux vaut n'y écrire aucune information personnelle.</p>
      <button type="button" class="btn" id="trad-oublier">Effacer les dernières traductions</button>
    </details>
  </div>`;

  const zone = $("#trad-texte", ecran);
  $(".fermer-liste", ecran).addEventListener("click", () => fermerEcran(ecran));
  $("#trad-de", ecran).addEventListener("change", (e) => {
    const avant = TRAD.de;
    TRAD.de = e.target.value;
    if (TRAD.de === TRAD.vers) TRAD.vers = avant;
    cacherResultat(); majLangues();
  });
  $("#trad-vers", ecran).addEventListener("change", (e) => {
    const avant = TRAD.vers;
    TRAD.vers = e.target.value;
    if (TRAD.vers === TRAD.de) TRAD.de = avant;
    cacherResultat(); majLangues();
  });
  // inverser : la traduction devient le texte de départ, comme pour répondre à la personne en face
  $("#trad-inverser", ecran).addEventListener("click", () => {
    [TRAD.de, TRAD.vers] = [TRAD.vers, TRAD.de];
    if (TRAD.trad) zone.value = TRAD.trad;
    cacherResultat(); etat(""); majLangues();
  });
  $("#trad-go", ecran).addEventListener("click", traduire);
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); traduire(); } });
  zone.addEventListener("input", majLiens);
  $("#trad-dicter", ecran)?.addEventListener("click", dicter);
  $("#trad-effacer", ecran).addEventListener("click", () => {
    ECOUTE?.abort();
    zone.value = ""; TRAD.source = ""; cacherResultat(); etat(""); majLiens(); zone.focus();
  });
  $("#trad-ecouter", ecran)?.addEventListener("click", () => lireAVoixHaute(TRAD.trad, TRAD.vers));
  $("#trad-grand", ecran).addEventListener("click", montrerEnGrand);
  $("#trad-copier", ecran).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(TRAD.trad); etat("Traduction copiée."); }
    catch { etat("La copie n'a pas marché. Un appui long sur la traduction permet de la sélectionner.", true); }
  });
  $("#trad-partager", ecran)?.addEventListener("click", () => {
    const texte = zone.value.trim() || TRAD.source;
    if (texte) navigator.share({ text: texte }).catch(() => {});
  });
  $("#trad-historique", ecran).addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    const x = b && historique()[Number(b.dataset.i)];
    if (!x || !LANGUES[x.de] || !LANGUES[x.vers]) return;
    TRAD.de = x.de; TRAD.vers = x.vers;
    zone.value = x.source;
    majLangues(); montrerResultat(x.source, x.trad); etat("");
    $(".outil-feuille", ecran).scrollTo({ top: 0, behavior: "smooth" });
  });
  const mail = $("#trad-mail", ecran);
  mail.value = lire("carte-trad-mail", "") || "";
  mail.addEventListener("change", () => {
    const v = mail.value.trim();
    if (!v) { ecrire("carte-trad-mail", ""); etat("Adresse mail retirée : la limite revient à 5 000 caractères par jour."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { etat("Cette adresse mail ne semble pas complète.", true); return; }
    ecrire("carte-trad-mail", v);
    etat("Adresse mail enregistrée sur ce téléphone : la limite passe à 50 000 caractères par jour.");
  });
  $("#trad-oublier", ecran).addEventListener("click", () => { ecrire(HISTO, []); majHistorique(); etat("Les dernières traductions sont effacées de ce téléphone."); });
  ecran.addEventListener("ferme", () => { ECOUTE?.abort(); if (PAROLE) window.speechSynthesis.cancel(); });
}

function ouvrirTraducteur() {
  const ecran = $("#traducteur");
  if (!ecran) return;
  TRAD ??= { de: "fr", vers: paysActuel() === "jp" ? "ja" : "ko", source: "", trad: "" };
  if (!ecran.dataset.pret) { construireTraducteur(ecran); ecran.dataset.pret = "1"; }
  majLangues(); majHistorique();
  $(".outil-feuille", ecran).scrollTop = 0;
  ouvrirEcran(ecran);
  $("#trad-texte").focus({ preventScroll: true });
}

// ---------- Mise en route, appelée par carte.js ----------
export function preparerOutils({ pays } = {}) {
  if (typeof pays === "function") paysCarte = () => { try { return pays(); } catch { return null; } };
  $("#traduire-bouton")?.addEventListener("click", ouvrirTraducteur);
  $("#convertir-bouton")?.addEventListener("click", ouvrirConvertisseur);
  for (const id of ["traducteur", "convertisseur", "grand"]) {
    const el = $(`#${id}`);
    el?.addEventListener("click", (e) => { if (e.target === el) fermerEcran(el); });
  }
  preparerApplication();
  suivreCouleurBarre();
  // le taux du jour est rangé dès que la carte s'ouvre avec du réseau, pour servir plus tard sans réseau
  if (HAUT) setTimeout(() => chercherTaux(), 6000);
  // les raccourcis de l'icône installée ouvrent la carte avec ?outil=traduire ou ?outil=convertir
  const p = new URLSearchParams(location.search), o = p.get("outil");
  if (o) {
    p.delete("outil");
    const reste = p.toString();
    try { history.replaceState(history.state, "", location.pathname + (reste ? `?${reste}` : "") + location.hash); } catch { /* adresse inchangée */ }
    if (o === "traduire") ouvrirTraducteur();
    else if (o === "convertir") ouvrirConvertisseur();
  }
}
