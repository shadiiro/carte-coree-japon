// Carte 2D des cinq villes du voyage. MapLibre dessine chaque ville à partir des calques d'OpenStreetMap rangés dans data/<région>/ :
// la mer et la côte, les lignes de métro et de train avec leurs couleurs officielles, les gares, les routes, les parcs, l'eau,
// le relief, les noms des quartiers et les lieux repères. Les lieux du voyage sont posés par-dessus : une photo pour les lieux
// du programme et les lieux les plus connus, une petite pastille avec un dessin pour les autres. Quand deux lieux se gênent,
// MapLibre garde le plus important et l'autre redevient un point de couleur, qui reprend sa place quand on s'approche.
import { REGIONS } from "./regions.js";
import { JOURS, EXCURSIONS, TRAJETS } from "./contenu.js";
// le traducteur, le convertisseur et l'application à installer (ajoutés le 05/11/2026)
import { preparerOutils, blocOutils, brancherOutils } from "./outils.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// les dates viennent des journées du voyage (contenu.js, liste JOURS)
const ZONES = {
  // 03/11/2026 : « etendue » garde le nom de Séoul quand la carte montre la sortie du jeudi 5 (l'île de Nami et le jardin
  // Morning Calm, à l'est des rues chargées). Sans elle, le centre de cette journée tombait hors de Séoul et la carte
  // s'appelait « Corée du Sud ».
  seoul: { titre: "Séoul", dates: "Du 4 au 9 puis du 26 au 27 novembre 2026", bornes: [126.60, 37.18, 127.22, 37.99], etendue: [126.60, 37.18, 127.60, 37.99], centre: [126.985, 37.556], zoom: 11.8, langue: "coréen" },
  busan: { titre: "Busan", dates: "Du 10 au 13 novembre 2026", bornes: [128.86, 34.98, 129.42, 35.90], centre: [129.08, 35.14], zoom: 11.6, langue: "coréen" },
  fukuoka: { titre: "Fukuoka", dates: "Du 14 au 17 novembre 2026", bornes: [129.72, 33.18, 131.42, 34.30], centre: [130.41, 33.59], zoom: 12.2, langue: "japonais" },
  kobe: { titre: "Kobe", dates: "Du 18 au 21 novembre 2026", bornes: [132.30, 34.27, 135.40, 34.98], centre: [135.19, 34.69], zoom: 12.4, langue: "japonais" },
  tokyo: { titre: "Tokyo", dates: "Du 21 au 26 novembre 2026", bornes: [139.45, 35.24, 139.95, 35.80], centre: [139.755, 35.685], zoom: 11.9, langue: "japonais" },
};
const ORDRE = ["seoul", "busan", "fukuoka", "kobe", "tokyo"];
// les deux pays du voyage et leurs villes, dans l'ordre du voyage (dates : contenu.js, JOURS)
const PAYS = {
  coree: { nom: "Corée du Sud", dates: "Du 4 au 13 puis du 26 au 27 novembre 2026", etapes: ["seoul", "busan"] },
  japon: { nom: "Japon", dates: "Du 14 au 26 novembre 2026", etapes: ["fukuoka", "kobe", "tokyo"] },
};
const PAYS_DE = { seoul: "coree", busan: "coree", fukuoka: "japon", kobe: "japon", tokyo: "japon" };
// l'étage demandé par l'adresse (#voyage, #coree, #japon ou #tokyo) ; sans adresse, la ville du jour pendant le voyage, sinon le voyage entier
function etageDemande() {
  const h = location.hash.slice(1) || params.get("region") || "";
  if (ZONES[h]) return { niveau: 2, etape: h };
  if (PAYS[h]) return { niveau: 1, pays: h };
  const d = new Date(), j = d.getFullYear() === 2026 && d.getMonth() === 10 ? JOURS.find((x) => x.n === d.getDate() && x.region) : null;
  return j && h !== "voyage" ? { niveau: 2, etape: j.region } : { niveau: 0 };
}
const DEPART = etageDemande();
// la ville dont les rues sont chargées ; aucune tant que la carte montre le voyage ou un pays
let REGION = null;
const telephone = Math.min(innerWidth, innerHeight) < 700;
const coree = () => REGION === "seoul" || REGION === "busan";
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
const zoomDepart = (r) => telephone ? ZONES[r].zoom - 0.3 : ZONES[r].zoom;

// ---------- Fichiers rangés dans la page : polices et relief ----------
// La page publiée ne peut rien télécharger hors d'elle-même : les lettres des noms et les tuiles d'altitude sont dans des JSON.
function versOctets(b64) {
  const s = atob(b64), o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o.buffer;
}
let glyphes;
const RELIEFS = {};
maplibregl.addProtocol("glyphes", async (p) => {
  glyphes ??= fetch("data/glyphes.json").then((r) => r.json());
  const [, police, plage] = /^glyphes:\/\/(.+)\/(\d+-\d+)/.exec(p.url);
  const b = (await glyphes)[`${decodeURIComponent(police)}/${plage}`];
  return { data: b ? versOctets(b) : new ArrayBuffer(0) };
});
maplibregl.addProtocol("relief", async (p) => {
  const [, r, tuile] = /^relief:\/\/([a-z]+)\/(.+)$/.exec(p.url);
  RELIEFS[r] ??= fetch(`data/${r}/relief.json`).then((x) => x.json());
  const b = (await RELIEFS[r])[tuile];
  if (!b) throw new Error("tuile hors de la région");
  return { data: versOctets(b) };
});

// Les calques sont écrits en format compact : coordonnées en cent-millièmes de degré, chaque point écrit comme l'écart avec le précédent.
function deplier(c) {
  const sortie = []; let x = 0, y = 0;
  for (let i = 0; i < c.length; i += 2) { x += c[i]; y += c[i + 1]; sortie.push([x / 1e5, y / 1e5]); }
  return sortie;
}
async function calque(r, nom) {
  const reponse = await fetch(`data/${r}/${nom}.json`);
  if (!reponse.ok) return { type: "FeatureCollection", features: [] };
  const d = await reponse.json();
  return { type: "FeatureCollection", features: d.f.map(([props, c]) => ({ type: "Feature", properties: props,
    geometry: d.g === "Point" ? { type: "Point", coordinates: [c[0] / 1e5, c[1] / 1e5] }
      : d.g === "LineString" ? { type: "LineString", coordinates: deplier(c) }
      : { type: "Polygon", coordinates: c.map(deplier) } })) };
}

// ---------- Couleurs des deux thèmes ----------
const PALETTES = {
  jour: {
    fond: "#F2EDE3", ombre: "#5C4A35", lumiere: "#FFFFFF", accent: "#8A7A60", relief: 0.38,
    parc: "#CBE2AE", foret: "#C2D9A6", palais: "#EAD8BB", universite: "#ECE0D0", cimetiere: "#D8E3CC", aeroport: "#E2E0E8", stade: "#D9E8CB", loisir: "#F1DCE4",
    eau: "#A9CFEA", mer: "#A2CAE8", eauTexte: "#3B6C93",
    autoroute: "#F4BE66", autorouteBord: "#D29438", grande: "#FFEFC0", grandeBord: "#D8BE86", moyenne: "#FFFFFF", moyenneBord: "#D6CCBA", rue: "#FFFFFF", rueBord: "#E0D7C6",
    rail: "#8F8A83", texte: "#2C2722", texteDoux: "#6B6255", halo: "rgba(255,253,248,0.92)", quartier: "#776A57", arrondissement: "#8C7553", ville: "#4B4135",
    gare: "#FFFFFF", gareBord: "#2C2722", lieuBord: "#FFFFFF", vertTexte: "#4E7A33", or: "#8E6012",
  },
  nuit: {
    fond: "#171A1F", ombre: "#000000", lumiere: "#5A5852", accent: "#24221F", relief: 0.5,
    parc: "#1F2E1F", foret: "#1C2A1B", palais: "#2C261E", universite: "#23252D", cimetiere: "#1D2A22", aeroport: "#24252C", stade: "#1E2C20", loisir: "#2D2129",
    eau: "#183049", mer: "#13283D", eauTexte: "#86AFD0",
    autoroute: "#8C6A33", autorouteBord: "#4A391D", grande: "#5B4F3A", grandeBord: "#2D271E", moyenne: "#3B3E46", moyenneBord: "#24262B", rue: "#30333A", rueBord: "#22252A",
    rail: "#6F6C66", texte: "#ECE6D8", texteDoux: "#ABA496", halo: "rgba(20,23,28,0.92)", quartier: "#B5AB97", arrondissement: "#CDBB93", ville: "#E5DCC8",
    gare: "#14171C", gareBord: "#ECE6D8", lieuBord: "#14171C", vertTexte: "#9CC27E", or: "#E9B65A",
  },
};
// thème de départ : celui demandé dans l'adresse, sinon celui du lecteur ou de l'appareil
const racine = document.documentElement;
let theme = params.get("theme") || (racine.dataset.theme === "dark" ? "nuit" : racine.dataset.theme === "light" ? "jour"
  : matchMedia("(prefers-color-scheme: dark)").matches ? "nuit" : "jour");

const v = (k) => ["coalesce", ["get", k], ""];
// le nom affiché : français s'il existe, sinon anglais, sinon le nom local
const NOM = ["case", ["!=", v("nom_fr"), ""], v("nom_fr"), ["!=", v("nom_en"), ""], v("nom_en"), v("nom")];
// les gares et les quartiers montrent aussi le nom local, écrit sur les panneaux
const NOM_ET_LOCAL = ["format", NOM, {}, ["case", ["all", ["!=", v("nom"), ""], ["!=", v("nom"), NOM]], ["concat", "\n", v("nom")], ""], { "font-scale": 0.82 }];
const zoomInterp = (...arr) => ["interpolate", ["linear"], ["zoom"], ...arr];
const CORR = ["==", ["get", "correspondance"], true];
// altitude d'un sommet, arrondie au mètre
const ALT = ["round", ["to-number", ["get", "altitude"], 0]];
// niveau de zoom à partir duquel chaque sorte de repère apparaît. Les palais, les tours, les temples et les sanctuaires arrivent tôt
// pour aider à se repérer (demandé le 16/10/2026) ; les petits monuments et les hôpitaux attendent qu'on soit dans les rues.
const ZOOM_REPERE = ["match", ["get", "type"], "palais", 11.2, "sommet", ["case", [">=", ALT, 500], 10.5, [">=", ALT, 250], 12.3, 13.8], "tour", 11.5,
  "temple", 12.5, "sanctuaire", 12.5, "musee", 12.7, "loisir", 12.4, "stade", 12.8, "achat", 13.2, "jardin", 13.2, "universite", 13.6, "eglise", 13.6,
  "monument", 13.8, 14.8];

function couches(P) {
  const typeRoute = (liste) => ["match", ["get", "type"], liste, true, false];
  const route = (id, types, minz, larg, couleur, bord, bordExtra) => [
    { id: id + "-bord", type: "line", source: "routes", minzoom: minz, filter: typeRoute(types),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": bord, "line-width": zoomInterp(...larg.map((w, i) => i % 2 ? w + bordExtra : w)) } },
    { id, type: "line", source: "routes", minzoom: minz, filter: typeRoute(types),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": couleur, "line-width": zoomInterp(...larg) } },
  ];
  const halo = { "text-halo-color": P.halo, "text-halo-width": 1.4, "text-halo-blur": 0.3 };
  return avecSeuil([
    // la terre ferme et les îles de la ville sont posées sur le fond commun des deux pays
    { id: "terre", type: "fill", source: "terre", paint: { "fill-color": P.fond } },
    { id: "relief", type: "hillshade", source: "relief",
      paint: { "hillshade-shadow-color": P.ombre, "hillshade-highlight-color": P.lumiere, "hillshade-accent-color": P.accent, "hillshade-exaggeration": P.relief } },
    // la mer reposée par-dessus l'ombrage : l'ombre des collines s'arrête à la côte
    { id: "mer", type: "fill", source: "mer", paint: { "fill-color": P.mer } },
    { id: "zones", type: "fill", source: "zones",
      paint: { "fill-color": ["match", ["get", "type"], "palais", P.palais, "universite", P.universite, "cimetiere", P.cimetiere, "aeroport", P.aeroport,
        "stade", P.stade, "loisir", P.loisir, P.universite], "fill-opacity": 0.9 } },
    { id: "vert", type: "fill", source: "vert",
      paint: { "fill-color": ["match", ["get", "type"], "parc", P.parc, P.foret], "fill-opacity": ["match", ["get", "type"], "parc", 0.95, 0.7] } },
    { id: "eau", type: "fill", source: "eau", paint: { "fill-color": P.eau } },
    { id: "rivieres", type: "line", source: "rivieres", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": P.eau, "line-width": zoomInterp(9, ["match", ["get", "type"], "river", 1, 0.2], 13, ["match", ["get", "type"], "river", 2.5, 0.8], 16, ["match", ["get", "type"], "river", 7, 3]) } },
    ...route("rue", ["residential", "unclassified", "living_street", "pedestrian"], 13.2, [13.2, 0.4, 15, 2, 17, 7], P.rue, P.rueBord, 1.2),
    ...route("moyenne", ["secondary", "tertiary"], 10.5, [10.5, 0.4, 13, 1.6, 15, 4, 17, 10], P.moyenne, P.moyenneBord, 1.5),
    ...route("grande", ["primary"], 9, [9, 0.5, 12, 1.6, 14, 4, 17, 13], P.grande, P.grandeBord, 1.6),
    ...route("autoroute", ["motorway", "trunk"], 7, [7, 0.6, 11, 1.8, 14, 5, 17, 14], P.autoroute, P.autorouteBord, 1.6),
    { id: "rail", type: "line", source: "rail", minzoom: 8, paint: { "line-color": P.rail, "line-width": zoomInterp(8, 0.6, 14, 2, 17, 3.5) } },
    { id: "rail-tirets", type: "line", source: "rail", minzoom: 12.5, paint: { "line-color": P.fond, "line-width": zoomInterp(12.5, 0.8, 17, 1.8), "line-dasharray": [3, 3] } },
    { id: "metro-bord", type: "line", source: "metro", minzoom: 12.5, layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": P.fond, "line-width": zoomInterp(12.5, 4, 15, 7.5, 17, 11) } },
    { id: "metro", type: "line", source: "metro", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "couleur"], "line-width": zoomInterp(9, 1, 12, 2.2, 15, 4.5, 17, 7), "line-opacity": 0.95 } },
    // noms de l'eau, des parcs, des forêts et des grandes zones
    { id: "arrondissements", type: "line", source: "arrondissements", minzoom: 10.5, layout: { "line-join": "round" },
      paint: { "line-color": P.arrondissement, "line-opacity": 0.55, "line-width": zoomInterp(10.5, 0.8, 15, 1.6), "line-dasharray": [3, 2] } },
    { id: "noms-eau", type: "symbol", source: "rivieres", minzoom: 10.5, filter: ["all", ["==", ["get", "type"], "river"], ["!=", v("nom_en"), ""]],
      layout: { "symbol-placement": "line", "text-field": NOM, "text-font": ["Noto Sans Italic"], "text-size": zoomInterp(10, 11, 15, 14), "symbol-spacing": 420, "text-letter-spacing": 0.08 },
      paint: { "text-color": P.eauTexte, ...halo } },
    { id: "noms-verts", type: "symbol", source: "etiquettes",
      filter: [">=", ["zoom"], ["case", [">", ["get", "aire"], 2], 11, [">", ["get", "aire"], 0.3], 12.5, [">", ["get", "aire"], 0.04], 14, 15.2]],
      layout: { "text-field": NOM, "text-font": ["Noto Sans Italic"], "text-size": zoomInterp(11, 10.5, 16, 13), "text-max-width": 8,
        "symbol-sort-key": ["-", 0, ["get", "aire"]] },
      paint: { "text-color": ["match", ["get", "genre"], "eau", P.eauTexte, "parc", P.vertTexte, "foret", P.vertTexte, P.texteDoux], ...halo } },
    { id: "noms-routes", type: "symbol", source: "routes", minzoom: 13.5,
      filter: ["all", ["!=", v("nom_en"), ""], ["match", ["get", "type"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false]],
      layout: { "symbol-placement": "line", "text-field": v("nom_en"), "text-font": ["Noto Sans Regular"], "text-size": zoomInterp(13.5, 10, 17, 12.5), "symbol-spacing": 320 },
      paint: { "text-color": P.texteDoux, ...halo } },
    // gares : un rond blanc cerclé de la couleur de la ligne ; une correspondance est plus grande et cerclée d'encre
    // 27/10/2026 : les petits ronds blancs couvraient la ville entière ; les correspondances apparaissent au zoom 12, les autres au 13,5
    { id: "gares-points", type: "circle", source: "gares", minzoom: 12, filter: ["any", CORR, [">=", ["zoom"], 13.5]],
      paint: { "circle-color": P.gare, "circle-stroke-color": ["case", CORR, P.gareBord, ["coalesce", ["get", "couleur"], P.gareBord]],
        "circle-radius": zoomInterp(10.5, ["case", CORR, 2.2, 1.4], 13, ["case", CORR, 4.2, 3], 16, ["case", CORR, 7.5, 5.5]),
        "circle-stroke-width": zoomInterp(10.5, 1, 14, 1.8, 16, 2.6) } },
    // repères de la ville : chaque sorte apparaît à son niveau de zoom
    { id: "reperes", type: "symbol", source: "reperes", filter: [">=", ["zoom"], ZOOM_REPERE],
      layout: { "icon-image": ["concat", "rp-", ["get", "type"], "-", theme], "icon-size": zoomInterp(11, 0.92, 15, 1.12),
        "text-field": ["case", ["==", ["get", "type"], "sommet"], ["concat", NOM, ["case", [">", ALT, 0], ["concat", "\n", ["to-string", ALT], " m"], ""]], NOM],
        "text-font": ["Noto Sans Regular"], "text-size": zoomInterp(12, 11, 16, 13), "text-anchor": "top", "text-offset": [0, 0.95], "text-max-width": 8,
        "text-optional": true, "symbol-sort-key": ["match", ["get", "type"], "palais", 0, "tour", 1, "sanctuaire", 2, "temple", 2, "sommet", 3, "achat", 4, 6] },
      paint: { "text-color": P.texteDoux, ...halo } },
    { id: "gares-noms", type: "symbol", source: "gares", minzoom: 12,
      filter: ["any", CORR, [">=", ["zoom"], 13.3]],
      layout: { "text-field": NOM_ET_LOCAL, "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(12, 10.5, 16, 13), "text-anchor": "top",
        "text-offset": [0, 0.7], "text-max-width": 9, "symbol-sort-key": ["case", CORR, 0, 1] },
      paint: { "text-color": P.texte, ...halo } },
    // noms des villes, arrondissements et quartiers
    { id: "noms-quartiers", type: "symbol", source: "noms",
      filter: ["any", ["all", ["match", ["get", "type"], ["suburb", "quarter"], true, false], [">=", ["zoom"], 12.6]],
        ["all", ["==", ["get", "type"], "neighbourhood"], [">=", ["zoom"], 14.6]]],
      layout: { "text-field": NOM_ET_LOCAL, "text-font": ["Noto Sans Italic"], "text-size": zoomInterp(12.6, 11, 16, 13.5), "text-max-width": 8 },
      paint: { "text-color": P.quartier, ...halo } },
    { id: "noms-arrondissements", type: "symbol", source: "arrondissements-noms", minzoom: 10.2, maxzoom: 14.6,
      layout: { "text-field": ["format", ["get", "nom"], {}, "\n", {}, ["get", "natif"], { "font-scale": 0.82 }], "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(10.2, 11, 13, 14.5), "text-transform": "uppercase",
        "text-letter-spacing": 0.12, "text-max-width": 10 },
      paint: { "text-color": P.arrondissement, ...halo } },
    { id: "noms-villes", type: "symbol", source: "noms", maxzoom: 12.2,
      filter: ["all", ["match", ["get", "type"], ["city", "town"], true, false], ["!", ["in", "区", v("nom")]], ["!", ["in", "구", v("nom")]]],
      layout: { "text-field": NOM_ET_LOCAL, "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(8, ["match", ["get", "type"], "city", 14, 11], 12, ["match", ["get", "type"], "city", 20, 14]),
        "text-max-width": 10, "symbol-sort-key": ["match", ["get", "type"], "city", 0, 1] },
      paint: { "text-color": P.ville, ...halo } },
    // les lieux du voyage : un point de couleur toujours visible, et la photo ou la pastille par-dessus quand elle a la place
    { id: "lieux-points", type: "circle", source: "lieux", filter: POINTS,
      paint: { "circle-color": ["get", "couleur"], "circle-radius": zoomInterp(9, 3.5, 15, 5.5), "circle-stroke-color": P.lieuBord, "circle-stroke-width": 1.6 } },
    // les petites pastilles sans photo n'apparaissent qu'à partir du niveau de zoom des rues, pour garder la vue d'ensemble lisible
    { id: "lieux", type: "symbol", source: "lieux", filter: PASTILLES,
      layout: { "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": zoomInterp(9, 0.7, 13, 0.88, 15, 1), "icon-padding": 1,
        "text-field": ["get", "nom"], "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(10, 11, 15, 12.5),
        "text-variable-anchor-offset": ["top", [0, 0.45], "left", [1.5, -1.6], "right", [-1.5, -1.6]], "text-justify": "auto",
        "text-max-width": 9, "text-optional": true, "symbol-sort-key": ["get", "ordre"] },
      paint: { "text-color": P.texte, ...halo } },
    // les lieux de votre programme : toujours affichés, même quand d'autres lieux sont proches, avec leur jour de visite sous le nom
    { id: "programme", type: "symbol", source: "lieux", filter: ["all", PROG, ["!=", ["get", "fam"], "hotel"]],
      layout: { "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": zoomInterp(8, 0.66, 11, 0.86, 14, 1), "icon-allow-overlap": true,
        "text-field": texteProgramme(P), "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(9, 12, 15, 14),
        "text-variable-anchor-offset": ["top", [0, 0.4], "left", [1.9, -1.9], "right", [-1.9, -1.9]], "text-justify": "auto",
        "text-max-width": 10, "text-optional": true, "symbol-sort-key": ["get", "ordre"] },
      paint: { "text-color": P.texte, "text-halo-color": P.halo, "text-halo-width": 1.8, "text-halo-blur": 0.3 } },
    // vos hôtels, posés après le programme : MapLibre place d'abord les couches du dessus, donc leur nom passe avant les autres
    { id: "hotels", type: "symbol", source: "lieux", filter: ["==", ["get", "fam"], "hotel"],
      layout: { "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": zoomInterp(8, 0.8, 11, 0.9, 14, 1), "icon-allow-overlap": true,
        "text-field": texteProgramme(P), "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(9, 12, 15, 14),
        "text-variable-anchor-offset": ["top", [0, 0.4], "left", [1.9, -1.9], "right", [-1.9, -1.9]], "text-justify": "auto",
        "text-max-width": 10, "text-optional": true },
      paint: { "text-color": P.texte, "text-halo-color": P.halo, "text-halo-width": 1.8, "text-halo-blur": 0.3 } },
    { id: "lieu-actif", type: "symbol", source: "lieux", filter: ["==", ["get", "id"], ""],
      layout: { "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": 1.3, "icon-allow-overlap": true, "text-allow-overlap": true,
        "text-field": ["get", "nom"], "text-font": ["Noto Sans Medium"], "text-size": 13.5, "text-anchor": "top", "text-offset": [0, 0.45], "text-max-width": 10 },
      paint: { "text-color": P.texte, ...halo } },
  ]);
}
// une couche de la ville n'apparaît qu'à partir du zoom où la carte montre cette ville ; la terre, la mer et le relief de la ville
// attendent le zoom 8, où leurs tuiles commencent ; en dessous, le fond commun des deux pays reste visible
const avecSeuil = (liste) => liste.map((c) => ({ ...c, minzoom: Math.max(c.minzoom ?? 0, ["terre", "mer", "relief"].includes(c.id) ? Math.max(Z_VILLE, 8) : Z_VILLE) }));
// les pastilles sans photo apparaissent au niveau 13 ; celles des restaurants, bars, boutiques et salles de jeux au niveau 15
const PASTILLES = ["any", ["get", "photo"], ["all", ["!", ["get", "proche"]], [">=", ["zoom"], 13]], [">=", ["zoom"], 15]];
const POINTS = ["any", ["!", ["get", "proche"]], [">=", ["zoom"], 14]];
const THEMES = ["jeu", "toit", "chicha", "affaire"];
// les lieux du programme (rang 0 et 1) ont leur propre couche ; les autres lieux suivent la vue choisie et le filtre
const PROG = ["<=", ["get", "rang"], 1];
const AUTRES = [">", ["get", "rang"], 1];
const RIEN = ["==", ["get", "rang"], -1];
// le nom d'un lieu du programme, puis son jour de visite en doré quand il est connu
const texteProgramme = (P) => ["format", ["get", "nom"], {}, ["case", ["!=", ["get", "jour"], ""], ["concat", "\n", ["get", "jour"]], ""], { "font-scale": 0.86, "text-color": P.or }];
// une région sans ligne de côte connue garde un fond de terre ; sinon le fond est la mer
let MER = true;
const SOURCES = ["terre", "mer", "metro", "rail", "gares", "routes", "vert", "eau", "rivieres", "noms", "reperes", "zones", "etiquettes", "arrondissements", "arrondissements-noms"];

// ---------- Les lieux du voyage ----------
const FAMILLE = { voir: "voir", histoire: "voir", mer: "voir", ville: "voir", manger: "manger", sortir: "sortir", sortie: "sortir",
  acheter: "acheter", faire: "faire", marcher: "marcher", marche: "marcher" };
const COULEUR_FAMILLE = { voir: "#3C6FB0", manger: "#E07B4F", sortir: "#A45CC0", acheter: "#2E9C88", faire: "#C24C7A", marcher: "#6E9A3A", base: "#C9902E", hotel: "#C9902E" };
const ICONES = {
  manger: "M7 3v5a2 2 0 0 0 4 0V3M9 10v11M16.5 3c-1.7 1.3-2.5 4-2.5 7.5h2.5V21",
  sortir: "M5 4h14l-7 8zM12 12v7M8 20h8",
  acheter: "M6 8h12l-1 12H7zM9 8V7a3 3 0 0 1 6 0v1",
  faire: "M12 4a8 8 0 1 0 0.01 0zM12 4v16M4 12h16",
  marcher: "M3 19l5-8 4 5 3-4 6 7z",
  voir: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0.01 0z",
  jeu: "M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L14.5 14h-5l-1 .7A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4zM8 10v4M6 12h4M15.5 11h.01M17.5 13h.01",
  affaire: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  chicha: "M6 21h12M8 21l1.5-7h5l1.5 7M9.5 11c-1.5-1.6 1.5-3.2 0-5.2M14.5 11c-1.5-1.6 1.5-3.2 0-5.2M12 10c-1.5-1.6 1.5-3.2 0-5.2",
  toit: "M3 11l9-6 9 6M5 10v10h14V10M9 20v-5h6v5M12 2v3",
  cabaret: "M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z",
  hotel: "M3 18V7M3 14h18v4M11 14V9h7a3 3 0 0 1 3 3v2M7 11.5a1.5 1.5 0 1 0 0.01 0z",
};
const svgIcone = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
// pictogrammes des repères de la ville, dessinés dans un carré de 24
const PICTOS = {
  palais: "M3 9l9-5 9 5M5 9v10M19 9v10M9 19v-6h6v6M3 19h18",
  temple: "M12 3v3M6 9h12l-2-3H8zM5 13h14l-2-3H7zM8 13v7M16 13v7M5 20h14",
  sanctuaire: "M3 6c6 1 12 1 18 0M5 10h14M7 6v14M17 6v14",
  eglise: "M12 2v6M9 5h6M6 21V12l6-3 6 3v9M10 21v-4h4v4",
  achat: "M6 8h12l-1 12H7zM9 8V7a3 3 0 0 1 6 0v1",
  universite: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  hopital: "M12 5v14M5 12h14",
  musee: "M3 9l9-5 9 5zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  tour: "M12 2v4M10 6h4l-1 14h-2zM8 20h8M9 10h6",
  stade: "M3 12a9 5 0 1 0 18 0a9 5 0 1 0 -18 0M7 12a5 2.5 0 1 0 10 0a5 2.5 0 1 0 -10 0",
  loisir: "M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M12 5v14M5 12h14",
  jardin: "M12 21v-8M12 13c-4 0-6-3-6-7 3 0 6 3 6 7zM12 13c4 0 6-3 6-7-3 0-6 3-6 7z",
  monument: "M10 20l1-13 1-3 1 3 1 13zM7 20h10",
  lieu: "M12 8a4 4 0 1 0 0.01 0z",
};
const COULEUR_REPERE = { palais: "#9A5A3A", temple: "#B0683C", sanctuaire: "#C23B2E", eglise: "#5D6D7E", achat: "#2E8C7A", universite: "#56689E",
  hopital: "#C8463F", musee: "#7A5BA0", tour: "#B9822A", stade: "#4F8A5B", loisir: "#C8648E", jardin: "#4F8A3B", monument: "#8A6E4B", lieu: "#7A7266" };

function forme(g, x, y, t, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + t, y, x + t, y + t, r); g.arcTo(x + t, y + t, x, y + t, r);
  g.arcTo(x, y + t, x, y, r); g.arcTo(x, y, x + t, y, r); g.closePath();
}
// Une épingle : la photo dans un cadre de la couleur de sa famille, avec une pointe vers le lieu exact.
// Sans photo, l'épingle est une petite pastille de la couleur de la famille avec son dessin.
function epingle(img, taille, couleur, rond, picto, anneau, marque) {
  const k = 2, pad = 6, queue = img ? 8 : 6, bord = img ? 3 : 2;
  const W = taille + pad * 2, H = pad + taille + queue + 1;
  const c = document.createElement("canvas"); c.width = W * k; c.height = H * k;
  const g = c.getContext("2d"); g.scale(k, k);
  const x = pad, y = pad, r = rond ? taille / 2 : 10;
  g.save(); g.shadowColor = "rgba(25,18,8,0.38)"; g.shadowBlur = 5; g.shadowOffsetY = 1.5; g.fillStyle = img ? couleur : anneau || "#FFFFFF";
  forme(g, x, y, taille, r); g.fill();
  g.beginPath(); g.moveTo(W / 2 - 5, y + taille - 3); g.lineTo(W / 2, y + taille + queue); g.lineTo(W / 2 + 5, y + taille - 3); g.closePath(); g.fill();
  g.restore();
  const i = anneau && !img ? 3 : bord, t = taille - 2 * i;
  if (img) {
    g.fillStyle = "#FFFFFF"; forme(g, x + i, y + i, t, Math.max(r - i, 3)); g.fill();
    g.save(); forme(g, x + i + 1.2, y + i + 1.2, t - 2.4, Math.max(r - i - 1.2, 2)); g.clip();
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x + i, y + i, t, t);
    g.restore();
  } else {
    g.fillStyle = couleur; forme(g, x + i, y + i, t, Math.max(r - i, 3)); g.fill();
    if (picto) {
      g.save(); g.translate(x + taille / 2 - t * 0.33, y + taille / 2 - t * 0.33); g.scale(t * 0.66 / 24, t * 0.66 / 24);
      g.strokeStyle = "#FFFFFF"; g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(new Path2D(picto)); g.restore();
    }
  }
  if (marque) {
    // un rond de 7 points de rayon posé sur le coin haut droit de la photo, avec son dessin blanc
    const cx = x + taille - 3, cy = y + 3;
    g.fillStyle = marque.c; g.strokeStyle = "#FFFFFF"; g.lineWidth = 1.6;
    g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    g.save(); g.translate(cx - 4.6, cy - 4.6); g.scale(9.2 / 24, 9.2 / 24);
    g.strokeStyle = "#FFFFFF"; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(new Path2D(marque.p)); g.restore();
  }
  return g.getImageData(0, 0, c.width, c.height);
}
// Un repère de la ville : un rond de couleur avec son pictogramme blanc ; un sommet est un triangle brun.
function repere(type, nuit) {
  const k = 2, T = 22, c = document.createElement("canvas"); c.width = c.height = T * k;
  const g = c.getContext("2d"); g.scale(k, k);
  if (type === "sommet") {
    g.fillStyle = nuit ? "#C9B48E" : "#7A5A36"; g.strokeStyle = nuit ? "#14171C" : "#FFFFFF"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(11, 4); g.lineTo(19, 17); g.lineTo(3, 17); g.closePath(); g.fill(); g.stroke();
  } else {
    g.fillStyle = COULEUR_REPERE[type] || COULEUR_REPERE.lieu; g.strokeStyle = nuit ? "#14171C" : "#FFFFFF"; g.lineWidth = 1.6;
    g.beginPath(); g.arc(11, 11, 9.4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.save(); g.translate(4.4, 4.4); g.scale(0.55, 0.55);
    g.strokeStyle = "#FFFFFF"; g.lineWidth = type === "hopital" ? 4 : 2.4; g.lineCap = "round"; g.lineJoin = "round";
    g.stroke(new Path2D(PICTOS[type] || PICTOS.lieu)); g.restore();
  }
  return g.getImageData(0, 0, c.width, c.height);
}
const chargerImage = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

let LIEUX = {}, MINIS = {}, CREDITS = {}, AUTOUR = [], PRATIQUE = { originaux: {}, adresses: [] };
// spécialités de la ville : quelles spécialités se goûtent dans quel lieu, et leur nom (data/<région>/gouts.json)
let DEGUST = { lieux: {}, noms: {} };
// temps de marche depuis la gare ou la station la plus proche (data/<ville>/marche.json, scripts/temps_de_marche.py) :
// [minutes, mètres, gare, nom local, métro], ou [-1] aucune gare à moins de 3 km, [-2] aucune gare à moins de 3,5 km de marche
// par un chemin direct, [-3] le trajet passe par un bateau
let MARCHE = {};
function aPied(s) {
  const m = MARCHE[s.id];
  if (!m) return "";
  let t;
  if (m[0] === -1) t = "Aucune gare ni station de métro n'est à moins de 3 km de ce lieu.";
  else if (m[0] === -2) t = "Le calcul sur les rues ne trouve aucune gare à moins de 3,5 km de marche par un chemin direct.";
  else if (m[0] === -3) t = "Le trajet depuis la gare la plus proche passe par un bateau. Le temps de marche n'est donc pas calculé.";
  else {
    const [min, metres, gare, natif, metro] = m;
    // « la station Anguk », « la gare de Hakata », « la gare d'Asakusa »
    const lieu = metro ? `station ${echapper(gare)}` : `gare ${/^[aeiouâéèêîôûāēīōū]/i.test(gare) ? "d'" : "de "}${echapper(gare)}`;
    const nomGare = `${lieu}${natif && natif !== gare ? ` (${echapper(natif)})` : ""}`;
    t = metres < 50 ? `Le lieu est à côté de la ${nomGare}.` : `${min} minute${min > 1 ? "s" : ""} à pied depuis la ${nomGare}, soit ${metres.toLocaleString("fr-FR")} m de rue.`;
  }
  return `<dt>À pied</dt><dd>${t}</dd>`;
}
// les conditions du serveur de calcul demandent sa mention et un lien pour corriger la carte (routing.openstreetmap.de, lu le 16/10/2026)
const SOURCE_MARCHE = ` Temps de marche : calculé le 16 octobre 2026 sur les rues d'OpenStreetMap par le serveur <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">OSRM de FOSSGIS</a>, à raison d'une minute pour 80 m. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Signaler une erreur de la carte</a>.`;
// jour de visite des excursions du programme : le jour du voyage quand il est fixé (contenu.js, JOURS), sinon « Un jour à placer »
const JOUR_DU_LIEU = Object.fromEntries(EXCURSIONS.map((x) => {
  const j = JOURS.find((d) => d.focus === x.id);
  return [x.id, j ? j.titre : x.quand.charAt(0).toUpperCase() + x.quand.slice(1)];
}));
const OR = "#C9902E";
const PAR_ID = {};
async function preparerLieux(r) {
  const R = REGIONS[r], items = [];
  R.lieux.forEach((s, k) => items.push({ s, rang: s.cat === "base" ? 0 : 1, pos: LIEUX[s.pos], mini: `data/miniatures/${s.photo}.jpg`, photo: true, ordre: k }));
  // un lieu de Wikivoyage garde sa photo sur la carte s'il est parmi les plus connus (le fichier le marque « photo ») ;
  // les autres ont une petite pastille, et leur photo reste dans leur fiche
  // une suggestion très connue porte sa miniature écrite dans le fichier (miniData) au lieu d'un chemin vers miniatures.json
  // « priorite » vient de scripts/niveaux.py : adresses à goûter d'abord, puis les lieux du web, puis les lieux les plus connus
  AUTOUR.forEach((a, k) => items.push({ s: a, rang: 2, pos: [a.lat, a.lon], mini: a.mini || a.miniData, photo: a.photo !== false, ordre: a.priorite ?? 500 + k }));
  // une adresse préparée par ChatGPT porte la photo de son plat quand elle sert une spécialité de la ville
  PRATIQUE.adresses.forEach((a, k) => { if (a.lat != null) items.push({ s: a, rang: 3, pos: [a.lat, a.lon], mini: a.miniData || null, photo: !!a.miniData, ordre: 100 + k }); });
  // vos hôtels passent devant tout le reste : un carré doré avec un lit, et leurs dates sous leur nom
  (HOTELS[r] || []).forEach((h) => items.push({ s: lieuHotel(h, r), rang: 0, pos: [h.lat, h.lon], mini: null, photo: false, ordre: -1 }));
  const feats = [];
  await Promise.all(items.map(async (it) => {
    const s = it.s, fam = s.cat === "base" || s.cat === "hotel" ? s.cat : FAMILLE[s.cat] || "voir", prog = it.rang <= 1;
    // le programme a un cadre doré ; les autres lieux gardent la couleur de leur sorte
    const couleur = prog ? OR : COULEUR_FAMILLE[fam];
    const src = it.photo && it.mini ? MINIS[it.mini] || (it.mini.startsWith("data:") ? it.mini : null) : null;
    const img = src ? await chargerImage(src) : null;
    const gout = !!(DEGUST.lieux[s.id]?.length || s.incontournable);
    const taille = !img ? (s.cat === "hotel" ? 36 : it.rang === 3 ? 30 : 26) : it.rang === 0 ? 46 : it.rang === 1 ? 52 : 38;
    const marque = !prog && img ? (gout ? { c: COULEUR_FAMILLE.manger, p: ICONES.manger } : s.theme ? { c: COULEUR_FAMILLE[fam], p: ICONES[s.theme] } : null) : null;
    const icone = `ep-${img ? "p" : "i"}-${s.id}`;
    if (!map.hasImage(icone)) map.addImage(icone, epingle(img, taille, couleur, !prog, ICONES[s.theme] || ICONES[fam] || ICONES[s.cat] || ICONES.voir,
      it.rang === 3 ? OR : null, marque), { pixelRatio: 2 });
    PAR_ID[s.id] = s;
    // niveau 1 : le programme ; niveau 2 : la sélection (lieux avec photo, adresses de ChatGPT, adresses à goûter) ; niveau 3 : le reste
    // 27/10/2026, demande de Schadrac d'« épurer » : la sélection ne garde que les lieux qui ont une vraie photo sur la carte ;
    // les adresses sans photo (dont celles de ChatGPT) passent dans la vue Tout et restent visibles avec leur filtre
    // 08/11/2026 : un lieu d'événement sans photo reste dans la sélection, pour que les illuminations et les fêtes se voient
    const niveau = prog ? 1 : img || s.evenement ? 2 : 3;
    // « proche » : restaurants, bars, boutiques et salles de jeux, qui n'apparaissent que tout près des rues ou avec leur filtre
    feats.push({ type: "Feature", properties: { id: s.id, nom: s.nom, rang: it.rang, fam, couleur, icone, photo: !!img, theme: s.theme || "", proche: !!s.proche,
      niveau, gout, jour: prog ? s.jourTxt || JOUR_DU_LIEU[s.id] || JOUR_DU_LIEU[s.pos] || (/sans jour fixé/.test(s.prevu || "") ? "Un jour à placer" : "") : "",
      ordre: prog ? it.rang * 1000 + it.ordre : 10000 + (img ? 0 : 5000) + (s.proche ? 2000 : 0) + it.ordre },
      geometry: { type: "Point", coordinates: [it.pos[1], it.pos[0]] } });
  }));
  return { type: "FeatureCollection", features: feats };
}

// ---------- La carte ----------
const map = new maplibregl.Map({
  container: "carte",
  style: { version: 8, glyphs: "glyphes://{fontstack}/{range}", sources: {}, layers: [{ id: "attente", type: "background", paint: { "background-color": PALETTES[theme].fond } }] },
  center: [133.5, 35.6], zoom: 5, minZoom: 3.5, maxZoom: 17.5,
  localIdeographFontFamily: "'Noto Sans KR', 'Noto Sans JP', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");
window.__carte = map;
// la page publiée est posée dans un cadre qui peut changer de taille après le chargement : la carte suit sa boîte
new ResizeObserver(() => map.resize()).observe($("#carte"));
addEventListener("resize", () => map.resize());
// la carte ne sort pas de la zone dessinée : au-delà, ni la côte ni le relief ne sont connus
function vueDepart(r) {
  const R = REGIONS[r], base = LIEUX[R.base];
  // les excursions d'une journée (contenu.js, EXCURSIONS) restent hors du cadre : la vue de départ montre la ville
  const sortie = new Set(EXCURSIONS.map((x) => x.id));
  const pts = base ? R.lieux.filter((s) => !sortie.has(s.id) && !sortie.has(s.pos)).map((s) => LIEUX[s.pos]).filter((p) => p && kmEntre(base, p) <= 12) : [];
  if (pts.length < 2) return { center: ZONES[r].centre, zoom: zoomDepart(r) };
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend([p[1], p[0]]));
  const ph = posHotel(r); if (ph) b.extend([ph[1], ph[0]]);
  const cam = map.cameraForBounds(b, { padding: telephone ? { top: 160, bottom: 190, left: 40, right: 75 } : { top: 110, bottom: 150, left: 60, right: 90 }, maxZoom: 13.2 });
  return cam ? { center: cam.center, zoom: Math.min(cam.zoom, 13.2) } : { center: ZONES[r].centre, zoom: zoomDepart(r) };
}

function appliquerTheme(t) {
  theme = t;
  racine.dataset.carte = t;
  ["jour", "nuit"].forEach((k) => $("#m-" + k).setAttribute("aria-pressed", String(k === t)));
  if (map.getLayer("pays-fond")) {
    for (const c of [...couchesFond(PALETTES[t]), ...couchesDessus(PALETTES[t])]) {
      for (const [k, val] of Object.entries(c.paint || {})) map.setPaintProperty(c.id, k, val);
    }
    map.setLayoutProperty("pays-etapes", "text-field", texteEtape(PALETTES[t]));
    map.setLayoutProperty("pays-sorties", "text-field", texteEtape(PALETTES[t]));
  }
  if (!map.getLayer("lieux")) return;
  for (const c of couches(PALETTES[t])) {
    for (const [k, val] of Object.entries(c.paint || {})) map.setPaintProperty(c.id, k, val);
  }
  map.setLayoutProperty("reperes", "icon-image", ["concat", "rp-", ["get", "type"], "-", t]);
  map.setLayoutProperty("programme", "text-field", texteProgramme(PALETTES[t]));
  map.setLayoutProperty("hotels", "text-field", texteProgramme(PALETTES[t]));
}
$("#m-jour").addEventListener("click", () => appliquerTheme("jour"));
$("#m-nuit").addEventListener("click", () => appliquerTheme("nuit"));

// ---------- Fiches ----------
function kmEntre(a, b) {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function echapper(t) { return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function lier(t) { return echapper(t).replace(/https?:\/\/[^\s<]+[^\s<.,;)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">lien</a>`); }
function lignesPratiques(p) {
  if (!p) return "";
  const l = [];
  if (p.adresse) l.push(["Adresse", echapper(p.adresse)]);
  if (p.horaires) l.push(["Horaires", lier(p.horaires)]);
  if (p.fermetures?.length) l.push(["Fermé", p.fermetures.map(lier).join("<br>")]);
  if (p.prix) l.push(["Prix", lier(p.prix)]);
  if (p.trajet) {
    const t = p.trajet, bouts = [];
    if (t.moyen) bouts.push(lier(t.moyen));
    if (t.duree_min) bouts.push(`Environ ${t.duree_min} minutes${t.depuis ? ` depuis ${echapper(t.depuis)}` : ""}.`);
    if (t.prix) bouts.push(`Billet : ${lier(t.prix)}`);
    if (bouts.length) l.push(["Trajet", bouts.join(" ")]);
  }
  if (p.affluence || p.affluence_detail) l.push(["Affluence", lier([p.affluence, p.affluence_detail].filter(Boolean).join(". "))]);
  if (p.moment) l.push(["Quand y aller", lier(p.moment)]);
  if (p.reservation) l.push(["Réservation", lier(p.reservation)]);
  return l.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
}
function sourcesPratiques(p, adresse) {
  const liens = (p.sources || []).map((x, k) => `<a href="${echapper(x.url)}" target="_blank" rel="noopener" title="${echapper(x.pour)}">source ${k + 1}</a>`).join(", ");
  let t = adresse ? ` Fiche du 15 octobre 2026. Position : ${echapper(p.position)}.` : " Horaires, prix et trajet : fiche du 15 octobre 2026.";
  if (liens) t += ` Sources : ${liens}.`;
  if (p.doutes) t += `<br>Point non vérifié : ${echapper(p.doutes)}`;
  return t;
}
const LANGUE = { fr: "en français", en: "en anglais", ko: "en coréen", ja: "en japonais" };
function sourceFiche(s) {
  if (s.position) return "";
  if (s.source) return s.source;
  if (s.article) return `Texte d'après Wikivoyage en anglais, article « ${s.article} », traduit en français. Position : Wikivoyage.`;
  if (s.wiki) {
    let t = `Texte d'après Wikipédia ${LANGUE[s.wiki[0]]}, article « ${s.wiki[1]} »`;
    if (s.wiki2) t += ` et article « ${s.wiki2[1]} »`;
    return t + ". Position : OpenStreetMap.";
  }
  return "Texte d'après la JNTO et les offices de tourisme.";
}
function posLieu(s) { return s.pos ? LIEUX[s.pos] : [s.lat, s.lon]; }
function lienCarte(s) {
  const [lat, lon] = posLieu(s);
  if (lat == null && !coree()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.natif || s.nom} ${s.adresse || ""}`)}`;
  // En Corée, Google Maps ne donnait pas d'itinéraire à pied en 2023 : on ouvre Naver Map.
  if (coree()) return `https://map.naver.com/p/search/${encodeURIComponent(s.natif || s.nom)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=transit`;
}
function ouvrirFiche(s) {
  const R = REGIONS[REGION];
  const fam = s.cat === "base" || s.cat === "hotel" ? s.cat : FAMILLE[s.cat] || "voir";
  const cr = s.credit || CREDITS[s.photo];
  // une suggestion a sa photo dans un paquet data/<région>/photos-suggestions-<n>.json, lu au premier clic : l'image se remplit après
  const image = s.image || (s.imageSug != null ? "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" : typeof s.photo === "string" ? `data/photos/${s.photo}.jpg` : null);
  // informations pratiques de ChatGPT : celles de l'adresse elle-même, ou celles d'un lieu du programme
  const p = s.horaires || s.trajet || s.adresse ? s : PRATIQUE.originaux?.[s.id];
  const pos = posLieu(s);
  const fiche = $("#fiche");
  fiche.innerHTML = `${image ? `<div class="photo"><img src="${image}" alt="${echapper(s.nom)}">` : `<div class="photo sans-photo" style="background:${COULEUR_FAMILLE[fam]}"><span class="grande-icone">${svgIcone(ICONES[s.theme] || ICONES[fam] || ICONES.voir)}</span>`}
      <button type="button" class="fermer" aria-label="Fermer la fiche">×</button>
      ${image && cr ? `<span class="credit">Photo : ${echapper(cr.auteur || "Wikimedia Commons")} · ${echapper(cr.licence)}</span>` : ""}</div>
    <div class="corps"><div class="cat">${echapper(s.catTxt)}</div><h2>${echapper(s.nom)}${s.natif ? `<span class="natif">${echapper(s.natif)}</span>` : ""}</h2>
      ${s.alerte ? `<div class="alerte">${s.alerte}</div>` : ""}
      <dl>${s.texte ? `<dt>${s.hotel ? "Vos nuits" : "Le lieu"}</dt><dd>${echapper(s.texte)}</dd>` : ""}
        ${s.prevu ? `<dt>Pourquoi</dt><dd>${s.prevu}</dd>` : ""}${s.dedans ? `<dt>${echapper(s.dedans.titre)}</dt><dd><ul class="fiche-dedans">${s.dedans.lignes.map(([t, x]) => `<li><b>${echapper(t)}.</b> ${echapper(x)}</li>`).join("")}</ul></dd>` : ""}${evenementsFiche(s)}${s.pourquoi ? `<dt>Pour vous</dt><dd>${echapper(s.pourquoi)}</dd>` : ""}${conseilJour(s)}${aGouter(s)}
        ${s.photoPlat ? `<dt>Photo</dt><dd>Cette photo montre le plat. Elle a été prise dans un autre lieu.</dd>` : ""}
        ${s.cat !== "base" && s.cat !== "hotel" && pos[0] != null ? ligneDistance(pos) : ""}
        ${depuisHotel(s)}${aPied(s)}${lignesHotel(s)}${s.acces ? `<dt>Trajet</dt><dd>${s.acces}</dd>` : ""}${s.foule ? `<dt>Affluence</dt><dd>${s.foule}</dd>` : ""}${lignesPratiques(p)}${ligneDetaxe(fam)}</dl>
      ${!s.acces && !p && s.cat !== "base" && s.cat !== "hotel" ? `<div class="source">Le trajet en transports et l'affluence ne sont pas encore renseignés.</div>` : ""}
      <div class="actions"><a class="btn" target="_blank" rel="noopener" href="${s.hotel ? lienHotel(s) : lienCarte(s)}">${coree() ? "Ouvrir dans Naver Map" : "Itinéraire dans Google Maps"}</a>${s.hotel ? `
        <button type="button" class="btn" id="montrer-chauffeur">Montrer au chauffeur de taxi</button>` : ""}</div>
      <div class="plan-fiche"></div>
      <div class="source">${sourceFiche(s)}${p && (p !== s || s.position) ? sourcesPratiques(p, s === p) : ""}${MARCHE[s.id] || MARCHE_HOTEL.lieux[s.id] || (s.hotel && MARCHE_HOTEL.gare) ? SOURCE_MARCHE : ""}</div></div>`;
  fiche.dataset.id = s.id;
  fiche.hidden = false; $("#liste").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true; fermerVilles();
  fiche.querySelector(".fermer").addEventListener("click", fermerFiche);
  fiche.querySelectorAll(".lien-spec").forEach((b) => b.addEventListener("click", () => ouvrirSpecialites(b.dataset.spec)));
  planFiche(s);
  fiche.querySelector("#montrer-chauffeur")?.addEventListener("click", () => montrerChauffeur(s));
  // copie en ligne : une photo absente du dossier se lit sur Wikimedia Commons, d'après le fichier cité dans son crédit
  const imFiche = fiche.querySelector(".photo img"), fichierCommons = cr?.fichier || (/File:/.test(cr?.source || "") ? decodeURIComponent(cr.source.split("File:")[1]) : null);
  if (imFiche && fichierCommons && !String(imFiche.getAttribute("src")).startsWith("data:")) imFiche.addEventListener("error", () => {
    imFiche.src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fichierCommons)}?width=960`;
  }, { once: true });
  // le bouton « Voir sa fiche » d'un magasin cité dans la fiche d'un hôtel, et le lien de la détaxe vers la légende
  fiche.querySelectorAll(".lien-lieu").forEach((b) => b.addEventListener("click", () => { const t = lieuParId(b.dataset.id); if (t) ouvrirFiche(t); }));
  fiche.querySelectorAll(".lien-legende").forEach((b) => b.addEventListener("click", () => ouvrirLegende("detaxe")));
  if (s.imageSug != null) photosSuggestions(REGION, s.imageSug).then((d) => { const im = fiche.querySelector(".photo img"); if (im && fiche.dataset.id === s.id && d[s.id]) im.src = d[s.id]; });
  map.setFilter("lieu-actif", ["==", ["get", "id"], s.id]);
  if (pos[0] != null) {
    // la fiche couvre le bas de l'écran du téléphone et la gauche de l'écran d'ordinateur : le lieu se place dans la partie libre
    const bas = telephone ? fiche.getBoundingClientRect().height + 30 : 40;
    map.easeTo({ center: [pos[1], pos[0]], zoom: Math.max(map.getZoom(), 14.2), duration: reduit ? 0 : 900,
      padding: { top: 90, bottom: bas, left: telephone ? 20 : 640, right: 20 } });
  }
}
const PHOTOS_SUG = {};
// ---------- la détaxe ----------
// Demandée le 03/11/2026 : « shopping en Corée ou au Japon ». Corée : VisitKorea, guide de la détaxe (vcontsId=248765), lu le
// 03/11/2026. Japon : douane japonaise (customs.go.jp/kaigairyoko/taxrefund.htm) et JNTO, lus le 03/11/2026. Le Japon est passé
// au remboursement au départ le 1er novembre 2026.
const DETAXE = {
  court: {
    kr: "Un magasin coréen affilié à la détaxe retire la taxe à la caisse, sur présentation du passeport. Le ticket doit faire au moins 15 000 wons et moins de 1 000 000 wons. Cette remise s'arrête à 5 000 000 wons pour tout le séjour.",
    jp: "Depuis le 1er novembre 2026, vous payez la taxe dans le magasin. Elle vous est rendue à l'aéroport de départ, avant l'enregistrement des bagages, pour les achats d'au moins 5 000 yens hors taxe dans un même magasin le même jour.",
  },
  long: {
    kr: ["Un magasin coréen affilié à la détaxe retire la taxe tout de suite à la caisse. Il faut montrer son passeport.",
      "Le ticket doit faire au moins 15 000 wons et moins de 1 000 000 wons. Cette remise immédiate s'arrête à 5 000 000 wons pour tout le séjour.",
      "Un achat qui n'a pas eu de remise se rembourse à l'aéroport de départ. La douane vérifie les objets, le passeport et le bordereau du magasin. Un guichet ou une borne de l'aéroport rend ensuite la taxe.",
      "Les objets doivent quitter la Corée dans les 3 mois. Vous quittez la Corée le 14 novembre depuis Busan, puis le 27 novembre depuis Séoul."],
    jp: ["Le Japon a changé sa détaxe le 1er novembre 2026. Vous payez maintenant le prix avec la taxe dans le magasin.",
      "La taxe vous est rendue au départ du Japon, dans les 90 jours, pour les achats d'au moins 5 000 yens hors taxe dans un même magasin le même jour.",
      "Vous passez votre passeport sur une borne de détaxe de l'aéroport, avant l'enregistrement des bagages. Un bagage enregistré ne peut plus être repris pour cette démarche. Si la borne affiche un résultat rouge, la douane demande à voir les objets.",
      "Les aliments, les boissons et les cosmétiques entamés au Japon ne sont pas remboursés.",
      "À Haneda et à Narita, Visit Japan Web permet aussi de faire la démarche par le wifi du hall de départ, avant le contrôle de sécurité. Vous quittez le Japon le 26 novembre depuis Tokyo."],
  },
  source: `Corée : <a href="https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=248765" target="_blank" rel="noopener">guide de la détaxe de VisitKorea</a>. Japon : <a href="https://www.customs.go.jp/kaigairyoko/taxrefund.htm" target="_blank" rel="noopener">douane japonaise</a> et <a href="https://www.japan.travel/en/us/blog/everything-you-need-to-know-japans-new-tax-free-shopping-system/" target="_blank" rel="noopener">JNTO</a>. Lus le 3 novembre 2026.`,
};
// la ligne « Détaxe » des fiches de boutiques et de marchés, selon le pays de la ville montrée
function ligneDetaxe(fam) {
  if (fam !== "acheter" || !REGION) return "";
  return `<dt>Détaxe</dt><dd>${DETAXE.court[coree() ? "kr" : "jp"]} <button type="button" class="lien-legende">Lire la règle entière</button></dd>`;
}
// les spécialités qu'on peut goûter dans ce lieu ; chaque nom ouvre le plat dans le panneau des spécialités
function aGouter(s) {
  const ids = DEGUST.lieux[s.id] || [];
  if (!ids.length) return "";
  return `<dt>À goûter</dt><dd>${ids.map((k) => `<button type="button" class="lien-spec" data-spec="${echapper(k)}">${echapper(DEGUST.noms[k])}</button>`).join(", ")}</dd>`;
}
function photosSuggestions(r, n) {
  PHOTOS_SUG[`${r}-${n}`] ??= fetch(`data/${r}/photos-suggestions-${n}.json`).then((x) => x.json()).catch(() => ({}));
  return PHOTOS_SUG[`${r}-${n}`];
}
function fermerFiche() {
  $("#fiche").hidden = true;
  if (map.getLayer("lieu-actif")) map.setFilter("lieu-actif", ["==", ["get", "id"], ""]);
  map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduit ? 0 : 400 });
}

// ---------- Vues, filtres et liste des adresses sans point ----------
// Trois vues, demandées le 16/10/2026. La vue Programme montre vos lieux seuls. La vue Sélection ajoute les lieux avec photo, les
// adresses préparées par ChatGPT et les adresses où goûter une spécialité. La vue Tout ajoute les petites pastilles, visibles de près.
// Un filtre de sorte montre toute cette sorte, même de loin, quelle que soit la vue. Le programme reste affiché dans tous les cas.
// 27/10/2026 : la femme de Schadrac voyait mal « nos activités, ce qu'on a prévu » au milieu des suggestions. La carte s'ouvre
// donc sur la vue Programme ; les boutons Sélection et Tout rendent les suggestions.
let filtre = "tout", vue = "programme", autourActif = false, LIEUX_GEO = null;
function filtresAutres() {
  if (filtre !== "tout") {
    const f = ["all", AUTRES, filtre === "gout" ? ["==", ["get", "gout"], true] : ["==", ["get", THEMES.includes(filtre) ? "theme" : "fam"], filtre]];
    return [f, f];
  }
  if (vue === "programme") return [RIEN, RIEN];
  if (vue === "selection") { const f = ["all", AUTRES, ["==", ["get", "niveau"], 2]]; return [f, ["all", f, [">=", ["zoom"], 13.5]]]; }
  return [["all", AUTRES, PASTILLES], ["all", AUTRES, POINTS]];
}
function choisirVue(v) {
  vue = v;
  document.body.classList.toggle("vue-programme", v === "programme");
  document.querySelectorAll("#vues button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  choisirFiltre("tout");
}
function choisirFiltre(f) {
  filtre = f;
  document.querySelectorAll("#filtres button[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === f)));
  if (map.getLayer("lieux")) {
    const [a, b] = filtresAutres();
    map.setFilter("lieux", a);
    map.setFilter("lieux-points", b);
    if (autourActif) majAutour();
  }
  const sansPoint = sansPointDuFiltre();
  const b = $("#sans-point");
  b.hidden = !sansPoint.length;
  b.textContent = `${sansPoint.length} sans point sur la carte`;
  $("#liste").hidden = true;
}
function sansPointDuFiltre() {
  return PRATIQUE.adresses.filter((a) => a.lat == null && filtre !== "tout" && !THEMES.includes(filtre) && (filtre === "gout" ? !!DEGUST.lieux[a.id] : FAMILLE[a.cat] === filtre));
}
function ouvrirListe() {
  const l = $("#liste"), items = sansPointDuFiltre();
  l.innerHTML = `<div class="liste-tete"><strong>Ces adresses n'ont pas de point vérifié sur la carte.</strong>
      <button type="button" class="fermer-liste" aria-label="Fermer la liste">×</button></div>
    <p class="liste-aide">Touchez une adresse pour lire sa fiche. Son bouton cherche le lieu par son nom dans ${coree() ? "Naver Map" : "Google Maps"}.</p>
    <ul>${items.map((a, k) => `<li><button type="button" data-k="${k}">${echapper(a.nom)}${a.natif ? ` <span class="natif">${echapper(a.natif)}</span>` : ""}<span class="liste-cat">${echapper(a.catTxt)}</span></button></li>`).join("")}</ul>`;
  l.querySelector(".fermer-liste").addEventListener("click", () => { l.hidden = true; });
  l.querySelectorAll("li button").forEach((b) => b.addEventListener("click", () => { l.hidden = true; ouvrirFiche(items[+b.dataset.k]); }));
  l.hidden = false; $("#fiche").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true; fermerVilles();
}
document.querySelectorAll("#filtres button[data-f]").forEach((b) => b.addEventListener("click", () => choisirFiltre(b.dataset.f)));
document.querySelectorAll("#vues button[data-v]").forEach((b) => b.addEventListener("click", () => choisirVue(b.dataset.v)));
$("#sans-point").addEventListener("click", ouvrirListe);

// ---------- Autour d'ici ----------
// Demandé par Schadrac le 17/10/2026, après un essai sur son téléphone : « quand on zoome il faut qu'on puisse voir uniquement ce
// qu'il y a aux alentours ». Accord donné le même jour sur la proposition.
// Le bouton garde les lieux à moins de 800 m du centre de l'écran, à vol d'oiseau, soit environ 10 minutes à pied à 80 m par minute.
// Il en montre 15 au plus, dans l'ordre de preparerLieux : les lieux avec photo, puis les lieux trouvés sur le web, puis les plus
// connus. Le programme et les hôtels restent affichés. La vue choisie (Programme, Sélection ou Tout) et le filtre de sorte
// s'appliquent aussi : le premier essai montrait 15 lieux en vue Sélection, qui n'en montrait que 3 au même endroit. Le cercle et
// les lieux se recalculent quand la carte s'arrête de bouger. Le mode s'arrête quand on change de ville ou quand on dézoome hors de
// la ville (afficherEtage).
const AUTOUR_M = 800, AUTOUR_MAX = 15;
function distanceM(a, b) {
  const k = Math.PI / 180, x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k), y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371000;
}
function cercleAutour(c, r) {
  const k = Math.PI / 180, pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    pts.push([c[0] + (r / (111320 * Math.cos(c[1] * k))) * Math.cos(t), c[1] + (r / 111320) * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}
// les mêmes règles que filtresAutres, sans les conditions de zoom
function dansLaVue(p) {
  if (filtre === "gout") return p.gout === true;
  if (filtre !== "tout") return THEMES.includes(filtre) ? p.theme === filtre : p.fam === filtre;
  if (vue === "programme") return false;
  return vue === "selection" ? p.niveau === 2 : true;
}
function texteAutour(n, montres) {
  if (filtre === "tout" && vue === "programme") return "La vue Programme montre seulement les lieux de votre programme et vos hôtels.";
  const nomFiltre = filtre !== "tout" ? ` du filtre ${$(`#filtres button[data-f="${filtre}"]`)?.textContent.trim() || ""}` : vue === "selection" ? " de la sélection" : "";
  if (!n) return `Aucun lieu${nomFiltre} n'est à moins de 800 m du centre de l'écran.`;
  if (n === 1) return `La carte montre le seul lieu${nomFiltre} situé à moins de 800 m du centre de l'écran.`;
  if (n <= montres) return `La carte montre les ${n} lieux${nomFiltre} situés à moins de 800 m du centre de l'écran.`;
  return `La carte montre ${montres} lieux${nomFiltre} sur les ${n} situés à moins de 800 m du centre de l'écran. Les plus connus passent en premier.`;
}
function majAutour() {
  if (!autourActif || !LIEUX_GEO || !map.getLayer("lieux")) return;
  const c = map.getCenter().toArray();
  const pres = LIEUX_GEO.features.filter((f) => f.properties.rang > 1 && dansLaVue(f.properties) && distanceM(c, f.geometry.coordinates) <= AUTOUR_M)
    .sort((a, b) => a.properties.ordre - b.properties.ordre);
  const ids = pres.slice(0, AUTOUR_MAX).map((f) => f.properties.id);
  const garde = ["in", ["get", "id"], ["literal", ids]];
  map.setFilter("lieux", garde);
  map.setFilter("lieux-points", garde);
  map.getSource("autour")?.setData(cercleAutour(c, AUTOUR_M));
  $("#autour-texte").textContent = texteAutour(pres.length, ids.length);
}
function activerAutour() {
  if (!map.getLayer("lieux")) return;
  autourActif = true;
  $("#autour-bouton").setAttribute("aria-pressed", "true");
  $("#autour-info").hidden = false;
  const c = map.getCenter().toArray();
  if (!map.getSource("autour")) map.addSource("autour", { type: "geojson", data: cercleAutour(c, AUTOUR_M) });
  // le cercle passe sous les lieux : un fond doré très léger et un bord en tirets
  if (!map.getLayer("autour-fond")) map.addLayer({ id: "autour-fond", type: "fill", source: "autour", paint: { "fill-color": OR, "fill-opacity": 0.07 } }, "lieux-points");
  if (!map.getLayer("autour-bord")) map.addLayer({ id: "autour-bord", type: "line", source: "autour", paint: { "line-color": OR, "line-width": 2, "line-dasharray": [2, 2] } }, "lieux-points");
  // la carte se cadre sur le cercle, dans la partie de l'écran que les boutons ne couvrent pas
  const r = AUTOUR_M, k = Math.PI / 180, dLat = r / 111320, dLon = r / (111320 * Math.cos(c[1] * k));
  const haut = document.querySelector("header.chrome")?.getBoundingClientRect().bottom || 120;
  const bas = innerHeight - ($("#bas")?.getBoundingClientRect().top ?? innerHeight - 160);
  map.fitBounds([[c[0] - dLon, c[1] - dLat], [c[0] + dLon, c[1] + dLat]], { padding: { top: haut + 10, bottom: bas + 10, left: 16, right: 16 }, duration: reduit ? 0 : 700 });
  majAutour();
}
function quitterAutour() {
  if (!autourActif) return;
  autourActif = false;
  $("#autour-bouton").setAttribute("aria-pressed", "false");
  $("#autour-info").hidden = true;
  for (const id of ["autour-bord", "autour-fond"]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource("autour")) map.removeSource("autour");
  if (map.getLayer("lieux")) choisirFiltre(filtre);
}
$("#autour-bouton").addEventListener("click", () => (autourActif ? quitterAutour() : activerAutour()));
$("#autour-fermer").addEventListener("click", quitterAutour);
map.on("moveend", () => { if (autourActif && !map.isMoving()) majAutour(); });

// ---------- Votre position en direct ----------
// Demandé le 05/11/2026 : « mets-moi la géolocalisation ». Le cadre de claude.ai refuse la position à toutes les pages qu'il
// héberge : le bouton Ma position lit la position seulement quand la carte est ouverte directement dans le navigateur, sur la
// copie en ligne (COPIE_EN_LIGNE). Dans claude.ai, le même bouton ouvre cette copie.
// Le bouton passe par quatre états : éteint, recherche, carte qui suit la position, position montrée sans suivre.
// Un glissement du doigt sur la carte arrête le suivi ; le bouton recentre alors la carte sur vous.
const COPIE_EN_LIGNE = "https://shadiiro.github.io/carte-coree-japon/";
const BLEU_POSITION = "#1A73E8";
const POSITION_POSSIBLE = (() => {
  try {
    if (!("geolocation" in navigator) || !window.isSecureContext || window.self !== window.top) return false;
    const regle = document.permissionsPolicy || document.featurePolicy;
    return !(regle && typeof regle.allowsFeature === "function" && !regle.allowsFeature("geolocation"));
  } catch { return false; }
})();
let POS = null, SUIVI = "off", VEILLE = null, CAP = null, CAP_ECOUTE = false, CAP_PROCHAIN = false, MSG_POS = "", MINUTEUR_POS = null;
let fondPret;
const FOND_PRET = new Promise((ok) => { fondPret = ok; });
const boutonPos = $("#ma-position");
const lienPos = $("#position-ailleurs");
const TEXTES_POS = {
  off: "Montrer ma position", veille: "Montrer ma position", attente: "Recherche de votre position : touchez pour annuler",
  suivi: "Arrêter de suivre ma position", vu: "Recentrer la carte sur ma position",
};
function etatPosition(e) {
  SUIVI = e;
  if (!boutonPos) return;
  boutonPos.dataset.etat = e;
  boutonPos.classList.toggle("attente", e === "attente");
  boutonPos.setAttribute("aria-label", TEXTES_POS[e]);
  boutonPos.title = TEXTES_POS[e];
}
function messagePosition(t, duree = 8000) {
  message(t); MSG_POS = t;
  clearTimeout(MINUTEUR_POS);
  MINUTEUR_POS = setTimeout(() => { if ($("#message").textContent === MSG_POS) message(""); }, duree);
}
// un éventail bleu dégradé, pointe au centre de l'image, tourné vers le haut : la direction où regarde le téléphone
function conePosition() {
  const t = 168, m = t / 2, c = document.createElement("canvas");
  c.width = c.height = t;
  const g = c.getContext("2d"), d = g.createRadialGradient(m, m, 0, m, m, m);
  d.addColorStop(0, "rgba(26, 115, 232, 0.6)"); d.addColorStop(0.7, "rgba(26, 115, 232, 0.22)"); d.addColorStop(1, "rgba(26, 115, 232, 0)");
  g.fillStyle = d; g.beginPath(); g.moveTo(m, m); g.arc(m, m, m, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
  return g.getImageData(0, 0, t, t);
}
function donneesPosition() {
  if (!POS) return { type: "FeatureCollection", features: [] };
  const c = [POS.lng, POS.lat], cap = CAP ?? POS.capGps;
  return { type: "FeatureCollection", features: [
    { ...cercleAutour(c, Math.max(POS.precision, 4)), properties: { role: "precision" } },
    { type: "Feature", properties: { role: "point", cap: cap == null ? -1 : Math.round(cap) }, geometry: { type: "Point", coordinates: c } },
  ] };
}
// les couches de la position passent au-dessus de tout le reste de la carte, après le fond des deux pays
function couchesPosition() {
  if (map.getSource("ma-position")) return;
  if (!map.hasImage("ma-position-cone")) map.addImage("ma-position-cone", conePosition(), { pixelRatio: 2 });
  map.addSource("ma-position", { type: "geojson", data: donneesPosition() });
  const precision = ["==", ["get", "role"], "precision"], point = ["==", ["get", "role"], "point"];
  map.addLayer({ id: "ma-position-precision", type: "fill", source: "ma-position", filter: precision, paint: { "fill-color": BLEU_POSITION, "fill-opacity": 0.12 } });
  map.addLayer({ id: "ma-position-bord", type: "line", source: "ma-position", filter: precision, paint: { "line-color": BLEU_POSITION, "line-opacity": 0.4, "line-width": 1 } });
  map.addLayer({ id: "ma-position-cap", type: "symbol", source: "ma-position", filter: ["all", point, [">=", ["get", "cap"], 0]],
    layout: { "icon-image": "ma-position-cone", "icon-rotate": ["get", "cap"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "ma-position-point", type: "circle", source: "ma-position", filter: point,
    paint: { "circle-radius": 7, "circle-color": BLEU_POSITION, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2.5 } });
}
function majPosition() { map.getSource("ma-position")?.setData(donneesPosition()); }
function horsCarte() {
  const b = ETAGES?.bornes;
  return !!b && (POS.lng < b[0] || POS.lng > b[2] || POS.lat < b[1] || POS.lat > b[3]);
}
// premier : la carte vient d'être demandée sur la position, elle s'approche des rues ; sinon elle suit sans changer de zoom
function allerAMaPosition(premier) {
  if (!POS) return;
  if (horsCarte()) {
    if (premier) messagePosition("Votre position est en dehors de la carte, qui couvre seulement la Corée du Sud et le Japon.");
    etatPosition("vu");
    return;
  }
  if (!premier && map.isMoving()) return;
  map.easeTo({ center: [POS.lng, POS.lat], zoom: premier ? Math.max(map.getZoom(), 15.5) : map.getZoom(),
    duration: reduit ? 0 : premier ? 1200 : 600, essential: true });
  if (premier && POS.precision > 250) messagePosition(`Votre position est connue à environ ${texteDistance(POS.precision)} près.`);
}
async function recevoirPosition(p) {
  const k = p.coords;
  POS = { lng: k.longitude, lat: k.latitude, precision: k.accuracy || 50,
    capGps: Number.isFinite(k.heading) && (k.speed ?? 0) > 0.7 ? k.heading : null };
  await FOND_PRET;
  if (!POS) return;
  couchesPosition();
  majPosition();
  if (SUIVI === "veille") etatPosition("vu");
  else if (SUIVI === "attente") { etatPosition("suivi"); allerAMaPosition(true); }
  else if (SUIVI === "suivi") allerAMaPosition(false);
}
function erreurPosition(e) {
  if (e.code === 1) {
    const demande = SUIVI === "attente";
    arreterPosition();
    if (demande) messagePosition("Le navigateur ne donne pas votre position à la carte. Autorisez la position pour ce site dans les réglages du navigateur, puis touchez de nouveau le bouton.", 14000);
    return;
  }
  if (!POS && SUIVI === "attente") messagePosition(e.code === 3
    ? "Votre position met du temps à arriver. La recherche continue."
    : "Le téléphone ne trouve pas votre position. Vérifiez que la localisation du téléphone est activée.");
}
function demarrerPosition(suivre) {
  etatPosition(suivre ? "attente" : "veille");
  if (VEILLE != null) return;
  VEILLE = navigator.geolocation.watchPosition(recevoirPosition, erreurPosition, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
}
function arreterPosition() {
  if (VEILLE != null) navigator.geolocation.clearWatch(VEILLE);
  VEILLE = null; POS = null;
  majPosition();
  etatPosition("off");
}
// la boussole du téléphone : le cap de l'iPhone (webkitCompassHeading), ou l'orientation absolue d'Android, calculée avec la
// formule de la spécification W3C DeviceOrientation ; le cap est lissé pour que l'éventail ne tremble pas
function capBoussole(alpha, beta, gamma) {
  const k = Math.PI / 180, x = (beta || 0) * k, y = (gamma || 0) * k, z = (alpha || 0) * k;
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
  let cap = Math.atan(vx / vy);
  if (vy < 0) cap += Math.PI; else if (vx < 0) cap += 2 * Math.PI;
  return cap / k;
}
function ecouterBoussole() {
  if (CAP_ECOUTE) return;
  CAP_ECOUTE = true;
  const nom = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  addEventListener(nom, (e) => {
    let cap = null;
    if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) cap = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) cap = capBoussole(e.alpha, e.beta, e.gamma);
    if (cap == null || !Number.isFinite(cap)) return;
    cap = (cap + (screen.orientation?.angle || 0) + 360) % 360;
    const ecart = CAP == null ? 0 : ((cap - CAP + 540) % 360) - 180;
    if (CAP != null && Math.abs(ecart) < 2) return;
    CAP = CAP == null ? cap : (CAP + ecart * 0.35 + 360) % 360;
    if (POS && !CAP_PROCHAIN) { CAP_PROCHAIN = true; requestAnimationFrame(() => { CAP_PROCHAIN = false; majPosition(); }); }
  });
}
function demanderBoussole() {
  const D = window.DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission === "function") D.requestPermission().then((r) => { if (r === "granted") ecouterBoussole(); }).catch(() => {});
  else ecouterBoussole();
}
if (POSITION_POSSIBLE && boutonPos) {
  boutonPos.hidden = false;
  etatPosition("off");
  boutonPos.addEventListener("click", () => {
    demanderBoussole();
    if (SUIVI === "off" || SUIVI === "veille") demarrerPosition(true);
    else if (SUIVI === "vu") { etatPosition("suivi"); allerAMaPosition(true); }
    else arreterPosition();
  });
  map.on("dragstart", () => { if (SUIVI === "suivi") etatPosition("vu"); });
  // une position déjà autorisée s'affiche dès l'ouverture, sans déplacer la carte
  FOND_PRET.then(() => navigator.permissions?.query({ name: "geolocation" })).then((st) => {
    if (st?.state === "granted" && SUIVI === "off") { demarrerPosition(false); ecouterBoussole(); }
  }).catch(() => {});
} else if (lienPos && !location.href.startsWith(COPIE_EN_LIGNE)) {
  // dans claude.ai : le bouton ouvre la copie en ligne sur la même ville
  lienPos.hidden = false;
  lienPos.addEventListener("click", () => { lienPos.href = COPIE_EN_LIGNE + location.hash; });
}

// ---------- Légende et sources ----------
function ouvrirLegende(partie) {
  const l = $("#legende");
  const detaxe = (pays, titre) => `<p><strong>${titre}.</strong> ${DETAXE.long[pays].join(" ")}</p>`;
  const rp = (t, nom) => `<li><img src="${imageVersUrl(repere(t, theme === "nuit"))}" width="22" height="22" alt="">${nom}</li>`;
  const fam = (f, nom) => `<li><span class="trait" style="background:${COULEUR_FAMILLE[f]};width:14px;height:14px;border-radius:50%"></span>${nom}</li>`;
  l.innerHTML = `<div class="liste-tete"><h2>Lire la carte</h2><button type="button" class="fermer-liste" aria-label="Fermer la légende">×</button></div>
    <p>La fiche d'un lieu du programme ou de la vue Sélection donne le temps de marche depuis la gare ou la station de métro la plus proche. Quand le lieu est à moins de 3 km de votre hôtel, elle donne aussi le temps de marche depuis l'hôtel.</p>
    <p>Le bouton Guide du jour pose trois questions : votre envie, votre humeur et le moment de la sortie. Une case accepte un mot libre pour le guide. Le guide tient compte du programme, du planning, de la veille et du changement de ville. Il propose une sortie complète avec ses heures, ses étapes et deux autres possibilités. Des boutons permettent ensuite de demander une sortie moins loin, plus calme, plus animée, moins chère ou différente. La météo prévue s'affiche quand le jour est à moins de 16 jours : elle vient d'Open-Meteo, lu par le connecteur Exa de claude.ai.</p>
    <p>Le planning signale un lieu fermé le jour où il est prévu, en orange, avec la phrase de sa fiche. Les idées du jour ne proposent aucun lieu fermé ce jour-là. Un lieu dont la fiche ne cite aucun jour de fermeture ne déclenche aucune alerte, donc il peut quand même être fermé.</p>
    <p>Le bouton Planning range des lieux par jour. Les lieux du jour choisi portent un numéro doré sur la carte, reliés dans l'ordre par un trait doré. Le planning est le même pour toutes les personnes qui ouvrent la carte dans claude.ai avec le droit de la modifier.</p>
    <h3 id="legende-detaxe">Acheter détaxé</h3>
    ${detaxe("kr", "En Corée du Sud")}${detaxe("jp", "Au Japon")}
    <p>La fiche de chaque hôtel donne le magasin Uniqlo le plus proche. Le filtre Boutiques montre ces magasins sur la carte.</p>
    <p class="source">${DETAXE.source}</p>
    ${blocOutils()}
    <h3>Les étages de la carte</h3>
    <p>La carte montre le voyage entier quand on la regarde de loin : vos cinq villes, vos trains en trait doré et votre vol en pointillés. Elle montre les villes d'un pays et vos sorties d'une journée quand on zoome sur ce pays. Quand on zoome sur une ville, la carte charge ses rues, son métro et ses lieux. La carte reste simple entre deux villes du voyage, sans rues ni lieux.</p>
    <p>La ligne au-dessus du titre dit où vous êtes. Un clic sur un de ses mots remonte à cet étage. Le titre ouvre la liste de l'étage suivant : les pays, puis les villes, puis les sorties et les arrondissements.</p>
    <h3>Les lieux du voyage</h3>
    <p>Un carré doré avec un lit blanc marque votre hôtel. Ses dates sont écrites en doré sous son nom. Sa fiche donne son adresse dans la langue du pays. Le bouton « Montrer au chauffeur de taxi » affiche cette adresse en grand, avec une phrase qui demande d'aller à l'hôtel.</p>
    <p>Une grande photo carrée dans un cadre doré est un lieu de votre programme. Elle reste affichée à tous les niveaux de zoom. Son jour de visite est écrit en doré sous son nom.</p>
    <p>Une photo ronde est un lieu choisi pour vous. Son cadre a la couleur de sa sorte de lieu. Un petit rond orange avec une fourchette marque une adresse où goûter une spécialité de la ville. La photo d'une adresse à goûter montre le plus souvent son plat. Sa fiche dit alors que cette photo a été prise dans un autre lieu.</p>
    <p>Une pastille au bord doré est une adresse choisie pour vous, avec ses horaires et ses prix. Une petite pastille avec un dessin est un autre lieu de Wikivoyage ou d'OpenStreetMap.</p>
    <h3>Les trois vues</h3>
    <p>La carte s'ouvre sur la vue Programme, qui montre vos lieux, vos hôtels et les repères de la ville. La vue Sélection ajoute seulement les lieux qui ont une vraie photo. La vue Tout ajoute les petites pastilles sans photo quand on s'approche des rues. Les petits ronds des stations de métro apparaissent en zoomant : d'abord les correspondances, puis toutes les stations.</p>
    <p>Un filtre montre tous les lieux de sa sorte, même de loin. Le filtre À goûter montre les adresses où goûter une spécialité. Le filtre Jeux vidéo montre les salles d'arcade et les PC bang. Le filtre Rooftops montre les bars sur un toit ou avec une vue. Le filtre Chicha montre les bars à chicha. Le filtre Bonnes affaires montre les grands magasins d'occasion de mangas et de figurines, les friperies, les vêtements de marque d'occasion, les magasins d'usine de marques et deux boutiques d'armes décoratives à Asakusa.</p>
    <p>Le bouton Autour d'ici garde seulement les lieux à moins de 800 m du centre de l'écran, soit environ 10 minutes à pied. Il en montre 15 au plus, les plus connus d'abord. Il garde la vue et le filtre choisis. Le programme et vos hôtels restent affichés. Un cercle doré montre la zone. La zone suit le centre de l'écran quand vous déplacez la carte. Un second toucher sur le bouton rend tous les lieux.</p>
    <ul>${fam("voir", "Visites")}${fam("manger", "Restaurants")}${fam("sortir", "Sorties")}${fam("acheter", "Boutiques")}${fam("faire", "Activités")}${fam("marcher", "Balades")}${fam("hotel", "Votre hôtel")}${fam("base", "Gare principale")}</ul>
    <h3>Les repères de la ville</h3>
    <ul>${rp("palais", "Palais, château ou porte")}${rp("temple", "Temple bouddhiste")}${rp("sanctuaire", "Sanctuaire shinto")}${rp("eglise", "Église ou cathédrale")}${rp("achat", "Grand magasin ou marché")}${rp("musee", "Musée")}${rp("tour", "Tour ou belvédère")}${rp("jardin", "Jardin")}${rp("monument", "Monument ou mémorial")}${rp("universite", "Université")}${rp("hopital", "Hôpital")}${rp("stade", "Stade")}${rp("loisir", "Parc d'attractions, zoo ou aquarium")}${rp("sommet", "Sommet, avec son altitude")}</ul>
    <p>Les grands repères apparaissent dès qu'on regarde un quartier entier : les palais, les tours, les temples et les sanctuaires. Les petits monuments et les hôpitaux apparaissent quand on arrive dans les rues.</p>
    <h3>Les transports</h3>
    <p>Chaque ligne de métro ou de train de ville garde sa couleur officielle. Une gare est un rond blanc cerclé de la couleur de sa ligne. Un rond plus grand cerclé de noir est une correspondance entre deux lignes ou plus. Une voie de train sans couleur est grise. Le nom de chaque gare est écrit en anglais, puis en ${REGION ? ZONES[REGION].langue : "coréen ou en japonais"} comme sur les panneaux.</p>
    <p><button type="button" class="btn" id="ouvrir-sources">Voir d'où viennent les données</button></p>`;
  l.querySelector(".fermer-liste").addEventListener("click", () => { l.hidden = true; });
  l.querySelector("#ouvrir-sources").addEventListener("click", ouvrirSources);
  brancherOutils(l);
  l.hidden = false; $("#fiche").hidden = true; $("#liste").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true; fermerVilles();
  if (partie === "detaxe") l.querySelector("#legende-detaxe")?.scrollIntoView({ block: "start" });
}
function imageVersUrl(img) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0); return c.toDataURL();
}
$("#ouvrir-legende").addEventListener("click", ouvrirLegende);
function ouvrirSources() {
  const d = $("#sources");
  d.querySelector(".boite").innerHTML = `<h2>D'où viennent les données</h2><ul>
    <li>Rues, côte, métro, trains, gares, parcs, eau, noms des quartiers et repères : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© les contributeurs d'OpenStreetMap</a>, licence ODbL, récupérés le 15 octobre 2026 avec l'API Overpass. Les couleurs des lignes sont celles écrites dans OpenStreetMap.</li>
    <li>Contour des terres et relief des deux pays : calculés le 16 octobre 2026 à partir des tuiles d'altitude Terrarium aux zooms 5 et 8. La côte suit la ligne des 0 m d'altitude, donc elle reste approximative quand on regarde de loin. La carte porte aussi le nom des pays, des îles et des mers. Les villes repères le long du trajet sont placées sur leur gare dans OpenStreetMap. Les arrondissements viennent d'OpenStreetMap. Chaque lieu de la ville est rangé dans l'arrondissement dont le nom est le plus proche.</li>
    <li>Relief : tuiles d'altitude Terrarium (<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles sur AWS</a>), qui assemblent SRTM et d'autres sources publiques.</li>
    <li>Textes des lieux ajoutés : Wikivoyage en anglais, licence CC BY-SA, traduits en français. Photos : Wikimedia Commons, auteur et licence écrits sur chaque photo. Un lieu ajouté qui a une photo la montre sur la carte. Les autres lieux ajoutés ont une pastille.</li>
    <li>Spécialités à goûter : textes d'après Wikivoyage en anglais, traduits en français. L'article exact est écrit sous chaque plat. Photos des plats et des marchés : image principale de l'article Wikipédia en anglais du plat, sur Wikimedia Commons, avec son auteur et sa licence. Les adresses où goûter un plat sont les lieux de la carte dont le texte cite ce plat, relus un par un le 16 octobre 2026.</li>
    <li>Restaurants, bars et boutiques : Wikivoyage en anglais, traduits en français. Wikivoyage n'est pas toujours à jour, donc il vaut mieux vérifier dans Google Maps qu'un lieu est encore ouvert.</li>
    <li>Salles d'arcade, PC bang, bars à chicha et bars sur un toit sans texte : OpenStreetMap, récupérés le 15 octobre 2026. Bars sur un toit avec texte et cabaret ROKUSAN ANGEL : guide Michelin, Time Out, Metropolis, Arrival Guides et site officiel, cités dans chaque fiche.</li>
    <li>Horaires, prix, trajets et adresses : fiches préparées par ChatGPT le 15 octobre 2026, avec leurs sources dans chaque fiche.</li>
    <li>Bonnes affaires : pages officielles des magasins, des chaînes et des centres, lues le 17 octobre 2026. Chaque fiche cite ses pages. Les positions viennent du géocodeur de l'institut géographique du Japon (GSI) et d'OpenStreetMap.</li>
    <li>Météo : prévision d'<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>, lue par le connecteur Exa de la personne qui regarde la carte. Elle couvre les 16 jours qui suivent.</li>
    <li>Jours de fermeture : fiches préparées par ChatGPT et horaires de Wikivoyage, relus un par un le 16 octobre 2026. Le lundi 23 novembre est férié au Japon d'après le <a href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html" target="_blank" rel="noopener">Cabinet Office japonais</a>.</li>
    <li>Hôtels : adresses envoyées par Schadrac le 16 octobre 2026. Le <a href="https://msearch.gsi.go.jp/" target="_blank" rel="noopener">service d'adresses de l'Institut géographique du Japon</a> place les hôtels de Fukuoka, de Kobe et de Tokyo. L'hôtel de Gimpo est placé par OpenStreetMap. Les hôtels de Séoul et de Busan sont placés d'après les numéros de leur rue, à environ 100 m près. La fiche de chaque hôtel dit d'où vient sa position. Phrases pour le chauffeur : guides de conversation coréen et japonais de <a href="https://en.wikivoyage.org/wiki/Korean_phrasebook" target="_blank" rel="noopener">Wikivoyage</a>, licence CC BY-SA.</li>
    <li>Temps de marche : trajet sur les rues et les chemins d'OpenStreetMap, calculé le 16 octobre 2026 par le serveur <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">OSRM de FOSSGIS</a>, depuis la gare ou la station la plus proche. Une minute compte pour 80 m de rue, comme dans les annonces immobilières au Japon. Le temps ne compte ni l'attente aux feux, ni les escaliers, ni la marche dans la gare. La gare est placée sur son point OpenStreetMap, qui peut être au milieu d'une grande gare. Une erreur de la carte se signale sur <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">OpenStreetMap</a>.</li>
    <li>Dessin de la carte : <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre GL JS</a> 5.24. Lettres : police Noto Sans (licence OFL).</li></ul>
    <p><button type="button" class="btn" id="fermer-sources">Fermer</button></p>`;
  d.hidden = false;
  $("#fermer-sources").addEventListener("click", () => { d.hidden = true; });
}
// le bouton Recentrer revient à la vue de départ de l'étage où l'on est
$("#recentrer").addEventListener("click", () => {
  $("#fiche").hidden = true; if (map.getLayer("lieu-actif")) map.setFilter("lieu-actif", ["==", ["get", "id"], ""]);
  aller(ICI.niveau <= 0 ? "voyage" : ICI.niveau === 1 ? `pays:${ICI.pays}` : `etape:${ICI.etape}`);
});

// ---------- Le menu de l'étage suivant ----------
// sur le voyage : les deux pays ; sur un pays : ses villes ; sur une ville : ses sorties d'une journée et ses arrondissements
function fermerVilles() { $("#villes").hidden = true; $("#choix-ville").setAttribute("aria-expanded", "false"); }
function remplirVilles() {
  const m = $("#villes"), n = ICI.niveau;
  const ligne = (cle, nom, plus, actif, detail = "") => `<button type="button" role="menuitem" data-aller="${cle}"${actif ? ' aria-current="true"' : ""}>
    <span class="v-nom">${echapper(nom)}</span><span class="v-dates">${echapper(plus)}</span>${detail ? `<span class="v-plus">${echapper(detail)}</span>` : ""}</button>`;
  let html;
  if (n <= 0) {
    html = `<h3>Les deux pays du voyage</h3>` + Object.entries(PAYS).map(([p, x]) => ligne(`pays:${p}`, x.nom, x.dates.replace(" 2026", ""), false,
      x.etapes.map((r) => ZONES[r].titre).join(", "))).join("");
  } else if (n === 1) {
    html = `<h3>Les villes du voyage</h3>` + PAYS[ICI.pays].etapes.map((r) => ligne(`etape:${r}`, ZONES[r].titre, ZONES[r].dates.replace(" 2026", ""), false)).join("");
  } else {
    const r = ICI.etape, arr = ETAGES.etapes[r]?.arrondissements || [];
    html = `<h3>Les sorties depuis ${echapper(ZONES[r].titre)}</h3>` + SORTIES[r].map((so) => ligne(`sortie:${r}:${so.id}`, so.nom, jourSortie(r, so), ICI.sous?.so === so)).join("")
      + (arr.length ? `<h3>Les arrondissements de ${echapper(ZONES[r].titre)}</h3>` + arr.map((a) => ligne(`arr:${r}:${a.id}`, a.nom, `${a.n} lieux`, ICI.sous?.a === a,
        `${a.natif} : ${a.exemples.join(", ")}`)).join("") : "");
  }
  m.innerHTML = html;
  m.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => aller(b.dataset.aller)));
}
$("#choix-ville").addEventListener("click", () => {
  const m = $("#villes"); remplirVilles(); m.hidden = !m.hidden;
  $("#choix-ville").setAttribute("aria-expanded", String(!m.hidden));
});

// ---------- Clics sur la carte ----------
const popup = new maplibregl.Popup({ closeButton: false, offset: 12, maxWidth: "260px" });
const NOM_TYPE = { palais: "Palais, château ou porte", temple: "Temple bouddhiste", sanctuaire: "Sanctuaire shinto", eglise: "Église", achat: "Grand magasin ou marché",
  universite: "Université", hopital: "Hôpital", musee: "Musée", tour: "Tour ou belvédère", stade: "Stade", loisir: "Parc d'attractions, zoo ou aquarium",
  jardin: "Jardin", monument: "Monument ou mémorial", sommet: "Sommet", lieu: "Lieu" };
map.on("click", (e) => {
  fermerVilles();
  const zone = [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]];
  // une ville ou une sortie du voyage, vue de loin : la carte y va
  const ep = map.getLayer("pays-etapes") ? map.queryRenderedFeatures(zone, { layers: ["pays-etapes", "pays-sorties"] })[0] : null;
  if (ep) { popup.remove(); aller(ep.properties.id.includes(":") ? `sortie:${ep.properties.id}` : `etape:${ep.properties.id}`); return; }
  if (!map.getLayer("lieux")) return;
  const f = map.queryRenderedFeatures(zone, { layers: ["plan-points", "lieu-actif", "hotels", "programme", "lieux", "lieux-points"].filter((id) => map.getLayer(id)) })
    .find((x) => PAR_ID[x.properties.id]);
  if (f) { popup.remove(); ouvrirFiche(PAR_ID[f.properties.id]); return; }
  const g = map.queryRenderedFeatures(zone, { layers: ["gares-points", "gares-noms", "reperes"] })[0];
  if (!g) { popup.remove(); return; }
  const p = g.properties, gare = g.layer.id.startsWith("gares");
  const titre = p.nom_fr || p.nom_en || p.nom;
  const quoi = gare ? (p.correspondance ? `Gare de correspondance entre ${p.lignes} lignes` : p.metro ? "Station de métro" : "Gare") : NOM_TYPE[p.type] || "Lieu";
  popup.setLngLat(g.geometry.coordinates)
    .setHTML(`<strong>${echapper(titre)}</strong>${p.nom && p.nom !== titre ? `<br><span lang="${coree() ? "ko" : "ja"}">${echapper(p.nom)}</span>` : ""}<br><small>${quoi}${p.altitude ? `, ${echapper(Math.round(+p.altitude) || p.altitude)} m` : ""}</small>`)
    .addTo(map);
});
for (const id of ["pays-etapes", "pays-sorties", "hotels", "programme", "lieux", "lieux-points", "lieu-actif", "gares-points", "reperes"]) {
  map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
}

// ---------- Chargement d'une région ----------
const CACHE = {};
async function donneesRegion(r) {
  CACHE[r] ??= (async () => {
    const [autour, pratique, degust, marche, marcheHotel, ...calques] = await Promise.all([
      fetch(`data/${r}/autour.json`).then((x) => x.json()).catch(() => []),
      fetch(`data/${r}/pratique.json`).then((x) => x.json()).catch(() => ({ originaux: {}, adresses: [] })),
      fetch(`data/${r}/gouts.json`).then((x) => x.json()).catch(() => ({ lieux: {}, noms: {} })),
      fetch(`data/${r}/marche.json`).then((x) => x.json()).catch(() => ({})),
      fetch(`data/${r}/marche-hotel.json`).then((x) => x.json()).catch(() => ({ gare: null, lieux: {} })),
      ...SOURCES.map((n) => calque(r, n)),
    ]);
    return { autour, pratique, degust, marche, marcheHotel, calques };
  })();
  return CACHE[r];
}
function viderCarte() {
  for (const c of couches(PALETTES[theme]).reverse()) if (map.getLayer(c.id)) map.removeLayer(c.id);
  for (const s of [...SOURCES, "relief", "lieux"]) if (map.getSource(s)) map.removeSource(s);
}
let chargement = Promise.resolve();
// deplacer : la carte va à la vue de départ de la ville (choix dans le menu) ; sinon elle reste où l'on a zoomé soi-même
function changerRegion(r, deplacer = true) {
  REGION_DEMANDEE = r;
  chargement = chargement.then(() => chargerRegion(r, deplacer));
  return chargement;
}
function message(t) { const m = $("#message"); m.textContent = t || ""; m.hidden = !t; }
async function chargerRegion(r, deplacer) {
  if (r === REGION && map.getSource("lieux")) {
    if (deplacer) map.flyTo({ ...vueDepart(r), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduit ? 0 : 1400 });
    return;
  }
  if (deplacer) { $("#chargement").classList.remove("fini"); $("#charge-titre").textContent = ZONES[r].titre; }
  else message(`Chargement des rues de ${ZONES[r].titre}…`);
  $("#fiche").hidden = true; $("#liste").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true; CTL_IDEES?.abort(); JOUR_IDEES = null; popup.remove();
  quitterAutour();
  const d = await donneesRegion(r);
  REGION = r;
  AUTOUR = d.autour; PRATIQUE = d.pratique; DEGUST = d.degust; MARCHE = d.marche; MARCHE_HOTEL = d.marcheHotel;
  if (JOUR_PLAN && !joursDe(r).some((j) => j.n === JOUR_PLAN)) { JOUR_PLAN = null; dessinerPlan(); } ARR_GEO = d.calques[SOURCES.indexOf("arrondissements")];
  viderCarte();
  MER = d.calques[SOURCES.indexOf("terre")].features.length > 0;
  const osm = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
  SOURCES.forEach((n, i) => map.addSource(n, { type: "geojson", data: d.calques[i], attribution: osm, tolerance: 0.3 }));
  map.addSource("relief", { type: "raster-dem", tiles: [`relief://${r}/{z}/{x}/{y}`], tileSize: 256, encoding: "terrarium", minzoom: 8, maxzoom: 11, bounds: ZONES[r].bornes });
  LIEUX_GEO = await preparerLieux(r);
  map.addSource("lieux", { type: "geojson", data: LIEUX_GEO });
  // les couches de la ville passent sous le trajet et les noms des pays
  for (const c of couches(PALETTES[theme])) map.addLayer(c, "pays-trajets-bord");
  if (deplacer) map.jumpTo({ ...vueDepart(r), padding: { top: 0, bottom: 0, left: 0, right: 0 } });
  choisirFiltre("tout");
  majJoursBarre();
  await new Promise((ok) => map.once("idle", ok));
  map.resize();
  $("#chargement").classList.add("fini"); message("");
  majEtage();
}

// ---------- Démarrage ----------
appliquerTheme(theme);
$("#charge-titre").textContent = DEPART.etape ? ZONES[DEPART.etape].titre : DEPART.pays ? PAYS[DEPART.pays].nom : "Corée et Japon";
map.on("load", async () => {
  try {
    for (const t of Object.keys(PICTOS).concat("sommet")) for (const nuit of [false, true]) map.addImage(`rp-${t}-${nuit ? "nuit" : "jour"}`, repere(t, nuit), { pixelRatio: 2 });
    const [lieux, minis, credits] = await Promise.all([
      fetch("data/lieux.json").then((r) => r.json()), fetch("data/miniatures.json").then((r) => r.json()).catch(() => ({})),
      fetch("data/photos/credits.json").then((r) => r.json()).catch(() => ({})),
    ]);
    LIEUX = lieux; MINIS = minis; CREDITS = credits;
    await chargerFond();
    fondPret();
    if (DEPART.niveau === 2) await changerRegion(DEPART.etape, true);
    else {
      // le voyage entier ou un pays : la carte cadre ses villes et ses sorties, sans charger de rues
      const pts = DEPART.niveau === 1 ? pointsPays(DEPART.pays) : ORDRE.map(baseEtape);
      const b = new maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p));
      const cam = map.cameraForBounds(b, { padding: marges(), maxZoom: DEPART.niveau === 1 ? Z_VILLE - 0.3 : Z_PAYS - 0.15 });
      if (cam) map.jumpTo({ center: cam.center, zoom: DEPART.niveau === 1 ? Math.max(cam.zoom, Z_PAYS + 0.05) : cam.zoom });
      await new Promise((ok) => map.once("idle", ok));
      $("#chargement").classList.add("fini");
    }
    majEtage();
    if (params.get("vue")) choisirVue(params.get("vue"));
    if (params.get("filtre")) choisirFiltre(params.get("filtre"));
    if (params.get("specs")) ouvrirSpecialites(params.get("specs") === "1" ? null : params.get("specs"));
    if (params.get("zoom")) map.jumpTo({ zoom: +params.get("zoom") });
    if (params.get("centre")) map.jumpTo({ center: params.get("centre").split(",").map(Number) });
    if (params.get("lieu") && PAR_ID[params.get("lieu")]) ouvrirFiche(PAR_ID[params.get("lieu")]);
    if (!["lieu", "specs", "vue", "filtre"].some((k) => params.has(k)) && params.get("journee") !== "0") journeeAuLancement();
  } catch (err) {
    console.error(err);
    $("#charge-txt").textContent = "La carte n'a pas pu se charger : " + err.message;
  }
});
addEventListener("hashchange", () => { const h = location.hash.slice(1); if (ZONES[h]) aller(`etape:${h}`); else if (PAYS[h]) aller(`pays:${h}`); else if (h === "voyage") aller("voyage"); });
map.on("error", (e) => { if (!String(e.error?.message).includes("hors de la région")) console.warn(e.error?.message || e); });

// ---------- Idées du jour : trois idées choisies par Claude parmi les lieux de la carte ----------
// La page interroge Claude avec la capacité « sample », sur le compte Claude de la personne qui regarde la carte (demandé le 15/10/2026).
// Claude ne lit pas le web : il reçoit le programme du jour, vos goûts et une liste de lieux proches tirée de la carte,
// et il répond par trois identifiants de cette liste. Une réponse est gardée dans ce navigateur, par ville et par jour.
const GOUTS = "Ils aiment les jeux vidéo et les salles d'arcade, les bars sur un toit, les bars calmes et la chicha. Ils n'aiment pas trop les boîtes de nuit. Ils voyagent sans voiture, en métro, en bus et en train.";
const SANS_CLAUDE = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];
let SAMPLE = null, JOUR_IDEES = null, CTL_IDEES = null;
// un jour de changement de ville compte pour les deux villes : le 21 pour Kobe et Tokyo, le 26 pour Tokyo et Séoul
const joursDe = (r) => JOURS.filter((j) => j.region === r || j.regions?.includes(r));
function jourParDefaut(r) {
  const js = joursDe(r), d = surPlace();
  return (d.an === 2026 && d.mois === 10 && js.find((j) => j.n === d.jour)) || js[0];
}
function lireIdees(cle) { try { return JSON.parse(localStorage.getItem(cle) || "null"); } catch { return null; } }
function garderIdees(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage refusé : la réponse reste à l'écran */ } }
const cleIdees = (j) => `idees:${REGION}:${j.n}`;
const etiquetteJour = (j) => `${j.js[0].toUpperCase()}${j.js.slice(1)}. ${j.n}`;

// ---------- Le guide du jour (16/10/2026) ----------
// Demandes de Schadrac le 16/10 : « pour faire les propositions du jour, il faut nous questionner », puis « tes questions sont pas
// ouf », puis « une vraie intelligence émotionnelle, comme un vrai guide humain ».
// Trois questions (l'envie, l'humeur, le moment), un mot libre pour le guide, et ce que la carte sait déjà de la journée : le
// programme, le planning, la veille, le changement de ville, la dernière soirée. Claude répond par une sortie complète : une
// phrase de titre, pourquoi elle convient, des étapes avec leur heure, et deux autres possibilités. Des boutons permettent de
// réagir à la sortie (moins loin, plus calme, plus animé, moins cher, changer le repas, autre idée), selon la méthode des outils
// de recommandation « par critique » (Li Chen et Pearl Pu, User Modeling and User-Adapted Interaction, 2012).
// Les questions retenues suivent aussi l'étude de Baltrunas, Ludwig et Ricci (IUI 2011, 33 personnes, 1 524 réponses) : la
// distance, le temps disponible et la foule comptaient pour tous les types de lieux.
// La météo en direct vient d'Open-Meteo, lu par le connecteur Exa de la personne qui regarde la carte (voir plus bas).
// Heure du coucher du soleil, calculée sans internet (formules de position du soleil publiées par l'observatoire naval des
// États-Unis, reprises par la bibliothèque SunCalc ; hauteur -0,833° pour le bord du disque et la réfraction).
// Rend des minutes après minuit, heure de la Corée et du Japon (UTC+9, sans heure d'été).
function coucherSoleil(lat, lon, n) {
  const rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009, e = rad * 23.4397;
  const d = Date.UTC(2026, 10, n, 3) / 864e5 - 0.5 + J1970 - J2000;      // midi heure locale, en jours depuis J2000
  const lw = rad * -lon, phi = rad * lat;
  const nc = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + nc;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = J0 + (w + lw) / (2 * Math.PI) + nc;
  const jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const utc = (jset + 0.5 - J1970) * 864e5;
  return Math.round(((utc / 6e4 + 9 * 60) % 1440 + 1440) % 1440);
}
const ENVIES_GUIDE = [["vue", "Voir quelque chose d'impressionnant"], ["flaner", "Flâner dans un quartier"], ["manger", "Bien manger une spécialité"],
  ["jouer", "Vous amuser : arcade, bowling, sport"], ["musique", "Musique ou bar calme"], ["ralentir", "Ralentir dans un jardin"], ["unique", "Une chose qu'on ne fait qu'ici"]];
const HUMEURS = [["anime", "En forme, envie d'animation"], ["calme", "Un peu fatigués, envie de calme"], ["plaisir", "Envie de vous faire plaisir"], ["surprise", "Envie d'être surpris"]];
const QUANDS = [["heure", "Une heure, maintenant"], ["matin", "Le matin"], ["aprem", "L'après-midi"], ["soir", "La soirée"], ["journee", "Toute la journée"]];
const REGLAGES = [
  { cle: "meteo", texte: "Quel temps fait-il ?", choix: [["auto", "Selon la prévision"], ["beau", "Beau temps"], ["gris", "Gris ou frais"], ["pluie", "Pluie"]] },
  { cle: "budget", texte: "Quel budget pour cette sortie ?", choix: [["petit", "Petit"], ["normal", "Normal"], ["large", "Sans compter"]] },
  { cle: "trajet", texte: "Jusqu'où acceptez-vous d'aller ?", choix: [["auto", "Selon la durée"], ["pied", "15 min à pied"], ["30", "30 min de trajet"], ["60", "1 h de trajet"], ["loin", "Plus loin"]] },
];
// distance à vol d'oiseau gardée : selon la durée choisie, sauf réglage contraire (15 minutes à 80 m par minute font 1,2 km ;
// le trajet en métro ou en train est estimé par la distance, faute d'horaires de transport dans la carte)
const DISTANCE_DUREE = { heure: 1.5, matin: 10, aprem: 10, soir: 10, journee: 400 };
const DISTANCE_REGLAGE = { pied: 1.2, 30: 8, 60: 25, loin: 400 };
const HEURES = { heure: "à partir de maintenant, pour une heure environ", matin: "entre 9 h et 12 h 30", aprem: "entre 13 h et 18 h", soir: "entre 18 h et 23 h", journee: "entre 9 h et 21 h" };
const ETAPES = { heure: "une seule étape", matin: "deux ou trois étapes", aprem: "deux ou trois étapes", soir: "deux ou trois étapes", journee: "trois ou quatre étapes" };
// trois salles d'arcade de ChatGPT sont rangées en « Sortie du soir » : leur nom les rend aux jeux (vu le 16/10/2026)
const JEU = (s) => s.theme === "jeu" || /arcade|gigo/i.test(s.nom || "");
// les lieux possibles pour chaque envie ; Claude choisit ensuite les plus justes d'après leur texte
const POUR_ENVIE = {
  vue: (s) => (["voir", "histoire", "ville", "sortie", "mer", "marcher", "marche"].includes(s.cat) && !JEU(s)) || s.theme === "toit",
  flaner: (s) => ["ville", "sortie", "marcher", "marche", "histoire", "voir", "acheter"].includes(s.cat) && !JEU(s),
  manger: (s) => FAMILLE[s.cat] === "manger",
  jouer: (s) => FAMILLE[s.cat] === "faire" || JEU(s),
  musique: (s) => !JEU(s) && ((FAMILLE[s.cat] === "sortir" && s.cat !== "sortie") || ["toit", "chicha", "cabaret"].includes(s.theme)),
  ralentir: (s) => ["marcher", "marche", "mer", "histoire", "voir"].includes(s.cat) && !JEU(s),
  unique: () => true,
};
const CONSIGNE_ENVIE = {
  vue: "Ils veulent voir quelque chose d'impressionnant : une vue, un monument ou un paysage.",
  flaner: "Ils veulent flâner dans un quartier, à pied, avec des arrêts qui leur plaisent.",
  manger: "Ils veulent bien manger, de préférence une spécialité de la ville.",
  jouer: "Ils veulent s'amuser : salle d'arcade, bowling ou activité sportive.",
  musique: "Ils veulent de la musique ou un bar calme.",
  ralentir: "Ils veulent ralentir, dans un jardin ou un lieu calme.",
  unique: "Ils veulent faire une chose qu'on ne fait qu'ici.",
};
const CONSIGNE_HUMEUR = {
  anime: "Ils sont en forme et veulent de l'animation.",
  calme: "Ils sont un peu fatigués et veulent du calme. Choisis des lieux proches les uns des autres, avec peu de marche et peu de monde. Évite les lieux dont la fiche dit qu'ils sont très fréquentés.",
  plaisir: "Ils veulent se faire plaisir. Choisis des lieux qui marqueront leur journée, même s'ils coûtent plus cher.",
  surprise: "Ils veulent être surpris. Choisis des lieux auxquels ils n'auraient pas pensé, loin des plus connus.",
};
const REP_DEFAUT = { envie: "", humeur: "", quand: "", meteo: "auto", budget: "normal", trajet: "auto" };
function lireReponses() { try { return { ...REP_DEFAUT, ...JSON.parse(localStorage.getItem("guide:reponses") || "{}") }; } catch { return { ...REP_DEFAUT }; } }
function garderReponses() { try { localStorage.setItem("guide:reponses", JSON.stringify(REPONSES)); } catch { /* sans stockage, les réponses valent pour cet écran */ } }
let REPONSES = lireReponses(), MOT_GUIDE = "", REACTION = null;
const departDuJourChoisi = (j) => { try { return localStorage.getItem(`idees:depart:${j.n}`); } catch { return null; } };
// l'heure et la date sur place : la Corée et le Japon vivent à UTC+9, sans heure d'été
const surPlace = () => { if (window.__surPlace) return window.__surPlace; const d = new Date(Date.now() + 9 * 36e5); return { an: d.getUTCFullYear(), mois: d.getUTCMonth(), jour: d.getUTCDate(), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
const estAujourdhui = (j) => { const p = surPlace(); return p.an === 2026 && p.mois === 10 && p.jour === j.n; };
const heureTexte = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
const lieuExcursion = (j) => j.lieu && REGIONS[REGION].lieux.find((s) => s.id === j.lieu || s.pos === j.lieu);
const typeTrajet = (j) => TRAJETS.find((t) => t.id === j?.trajet)?.type;
// le moment par défaut : celui de l'heure qu'il est sur place le jour même, sinon l'après-midi
function quandDuJour(j) {
  if (REPONSES.quand && (REPONSES.quand !== "heure" || estAujourdhui(j))) return REPONSES.quand;
  if (!estAujourdhui(j)) return "aprem";
  const m = surPlace().min;
  return m < 11 * 60 ? "matin" : m < 17 * 60 ? "aprem" : "soir";
}


// ---------- la météo en direct ----------
// Demandée le 16/10/2026 : « il faudrait la météo en direct, mon gars ». La page ne joint aucun site elle-même : elle passe par le
// connecteur Exa de la personne qui regarde la carte (capacité « mcp »), qui lit le service gratuit Open-Meteo. Essayé le
// 16/10/2026 depuis Claude : Exa rend le JSON d'Open-Meteo dans un texte, avec la température du moment, les heures et le coucher
// du soleil. Open-Meteo prévoit jusqu'à 16 jours (open-meteo.com/en/docs, lu le 16/10/2026) ; ses codes météo sont ceux de l'OMM.
// Sans le connecteur Exa, la météo se règle à la main dans « Plus de réglages ».
let MCP = null;
const METEO = {};
const CODES_METEO = { 0: "ciel dégagé", 1: "ciel plutôt dégagé", 2: "partiellement nuageux", 3: "ciel couvert", 45: "brouillard", 48: "brouillard givrant",
  51: "bruine légère", 53: "bruine", 55: "bruine forte", 56: "bruine verglaçante", 57: "forte bruine verglaçante", 61: "pluie faible", 63: "pluie modérée",
  65: "forte pluie", 66: "pluie verglaçante", 67: "forte pluie verglaçante", 71: "neige faible", 73: "neige modérée", 75: "forte neige", 77: "grains de neige",
  80: "averses faibles", 81: "averses", 82: "violentes averses", 85: "averses de neige", 86: "fortes averses de neige", 95: "orage", 96: "orage avec grêle",
  97: "fort orage", 99: "orage avec forte grêle" };
const FENETRES = { matin: [9, 12], aprem: [13, 18], soir: [18, 23], journee: [9, 21] };
const dateIso = (n) => `2026-11-${String(n).padStart(2, "0")}`;
const joursAvant = (n) => { const p = surPlace(); return Math.round((Date.UTC(2026, 10, n) - Date.UTC(p.an, p.mois, p.jour)) / 864e5); };
const cleMeteo = (j) => `${REGION}:${j.n}`;
async function chargerMeteo(j) {
  const cle = cleMeteo(j), avant = joursAvant(j.n);
  if (["ok", "encours"].includes(METEO[cle]?.etat)) return;
  if (avant < 0 || avant > 15) { METEO[cle] = { etat: "loin", avant }; return; }
  if (!MCP) { METEO[cle] = { etat: "sans" }; return; }
  const dep = departIdees(j), d = dateIso(j.n), tz = coree() ? "Asia%2FSeoul" : "Asia%2FTokyo";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${dep.pos[0].toFixed(4)}&longitude=${dep.pos[1].toFixed(4)}`
    + "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code"
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset&timezone=${tz}&start_date=${d}&end_date=${d}`;
  METEO[cle] = { etat: "encours" };
  try {
    const r = await MCP.callTool("Exa", "web_fetch_exa", { urls: [url], maxCharacters: 8000 }, { cache: { staleTime: 300000, gcTime: 1800000 } });
    const texte = [...(r?.content || []).filter((c) => c.type === "text").map((c) => c.text), typeof r?.payload === "string" ? r.payload : JSON.stringify(r?.payload || "")].join("\n");
    const i = texte.indexOf('{"latitude"'), k = texte.lastIndexOf("}");
    const donnees = JSON.parse(texte.slice(i, k + 1));
    if (!donnees.daily?.time?.length) throw { code: "lecture" };
    METEO[cle] = { etat: "ok", donnees, lu: r?.cache?.storedAt || Date.now() };
  } catch (e) { METEO[cle] = { etat: "erreur", code: e?.code || "lecture" }; }
}
// le temps prévu pendant le moment choisi : températures et risque de pluie heure par heure
function fenetreMeteo(m, quand) {
  const h = m.donnees.hourly;
  if (!h?.time) return null;
  const [a, b] = quand === "heure" ? [Math.floor(surPlace().min / 60), Math.floor(surPlace().min / 60) + 1] : FENETRES[quand];
  const idx = h.time.map((t, i) => [Number(t.slice(11, 13)), i]).filter(([x]) => x >= a && x <= b).map(([, i]) => i);
  if (!idx.length) return null;
  const temps = idx.map((i) => h.temperature_2m[i]), pluie = idx.map((i) => h.precipitation_probability?.[i] ?? 0);
  return { min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)), pluie: Math.max(...pluie), a, b };
}
function phrasesMeteo(j, quand) {
  const m = METEO[cleMeteo(j)];
  if (m?.etat !== "ok") return null;
  const d = m.donnees, dj = d.daily, c = d.current, l = [];
  if (c && estAujourdhui(j)) l.push(`En ce moment, il fait ${Math.round(c.temperature_2m)} °C, ressenti ${Math.round(c.apparent_temperature)} °C, avec ${CODES_METEO[c.weather_code] || "un temps non décrit"}.`);
  l.push(`Ce jour-là, la température va de ${Math.round(dj.temperature_2m_min[0])} à ${Math.round(dj.temperature_2m_max[0])} °C, avec ${CODES_METEO[dj.weather_code[0]] || "un temps non décrit"}. Le risque de pluie monte jusqu'à ${dj.precipitation_probability_max[0]} %.`);
  const f = fenetreMeteo(m, quand);
  if (f) l.push(`Entre ${f.a} h et ${f.b} h, il fera de ${f.min} à ${f.max} °C, avec un risque de pluie de ${f.pluie} % au plus.`);
  return { l, f, coucher: dj.sunset?.[0]?.slice(11, 16).replace(":", " h ") };
}
function meteoHtml(j) {
  const m = METEO[cleMeteo(j)], ville = ZONES[REGION].titre;
  let corps = "";
  if (!m || m.etat === "encours") corps = `La météo prévue à ${ville} se charge.`;
  else if (m.etat === "ok") { const p = phrasesMeteo(j, quandDuJour(j)); corps = `${p.l.join(" ")} <span class="question-aide">Source : Open-Meteo, lu à ${heureTexte(Math.round(((m.lu / 6e4) + 9 * 60) % 1440))}.</span>`; }
  else if (m.etat === "loin") corps = m.avant < 0 ? "Ce jour est passé." : `La prévision de ce jour sera disponible à partir du ${j.n - 15 > 0 ? `${j.n - 15} novembre` : `${31 + j.n - 15} octobre`}. Le temps se règle en attendant dans « Plus de réglages ».`;
  else if (m.etat === "sans") corps = "La météo en direct passe par le connecteur Exa de claude.ai, absent ici. Le temps se règle dans « Plus de réglages ».";
  else {
    const msg = { needs_reauth: "Il faut reconnecter Exa dans les réglages de claude.ai, partie Connecteurs.", server_not_connected: "Il faut ajouter Exa dans les réglages de claude.ai, partie Connecteurs.",
      not_in_manifest: "La météo en direct attend votre accord pour utiliser Exa.", approval_required: "La météo en direct attend votre accord pour utiliser Exa.",
      server_unavailable: "Le service météo ne répond pas pour le moment." }[m.code] || "La météo n'a pas pu être lue.";
    corps = `${msg} <button type="button" class="lien-spec" id="meteo-reessayer">Réessayer</button>`;
  }
  return `<p class="meteo-direct" id="meteo-direct"><strong>Météo.</strong> ${corps}</p>`;
}
function majMeteo(j) {
  const el = document.querySelector("#meteo-direct");
  if (!el || JOUR_IDEES !== j) return;
  el.outerHTML = meteoHtml(j);
  document.querySelector("#meteo-reessayer")?.addEventListener("click", () => { delete METEO[cleMeteo(j)]; majMeteo(j); chargerMeteo(j).then(() => majMeteo(j)); });
}
(async () => { try { MCP = window.claude?.use ? await window.claude.use("mcp") : null; } catch { MCP = null; } })();

function choixDepart(j) {
  const l = [["hotel", "De l'hôtel"], ["carte", "Du centre de la carte"]];
  const x = lieuExcursion(j);
  if (x) l.unshift(["sortie", `De ${x.nom}`]);
  if (lieuxDuJour(j.n).some((e) => e.pos && e.region === REGION)) l.push(["plan", "Du dernier lieu prévu"]);
  return l;
}
function reponseDepart(j) {
  const ok = choixDepart(j).map((c) => c[0]), r = departDuJourChoisi(j);
  return ok.includes(r) ? r : lieuExcursion(j) ? "sortie" : "hotel";
}
function departIdees(j) {
  const R = REGIONS[REGION], r = reponseDepart(j);
  if (r === "carte") { const c = map.getCenter(); return { pos: [c.lat, c.lng], nom: "le centre de la carte" }; }
  if (r === "plan") { const e = lieuxDuJour(j.n).filter((x) => x.pos && x.region === REGION).at(-1); if (e) return { pos: e.pos, nom: e.nom }; }
  if (r === "sortie") { const x = lieuExcursion(j); if (x) return { pos: LIEUX[x.pos], nom: x.nom }; }
  const h = hotelDeLaNuit(j.n) || hotelDeLaNuit(j.n - 1) || hotelPrincipal(REGION);
  return h ? { pos: [h.lat, h.lon], nom: "votre hôtel", hotel: h } : { pos: LIEUX[R.base], nom: R.baseNom };
}

// ce qu'un guide humain saurait de votre journée sans vous le demander
function contexteDuJour(j) {
  const l = [], n = j.n, ville = ZONES[REGION].titre, veille = jourDe(n - 1), lendemain = jourDe(n + 1);
  const changeVille = j.trajet && typeTrajet(j) !== "sortie";
  if (n === 4) l.push("Vous êtes arrivés de Paris aujourd'hui, après un long vol.");
  else if (changeVille || n === 26) l.push("Vous changez de ville aujourd'hui, avec vos bagages.");
  if (typeTrajet(j) === "sortie") l.push(`Vous partez aujourd'hui en excursion : ${j.ville}.`);
  if (typeTrajet(veille) === "sortie") l.push(`Hier, vous avez passé la journée en excursion : ${veille.ville}.`);
  if (n === 26) l.push("C'est la dernière soirée du voyage.");
  else if (!changeVille && lendemain && (lendemain.region !== j.region || (lendemain.trajet && typeTrajet(lendemain) !== "sortie"))) l.push(`C'est votre dernière journée à ${ville}.`);
  if (j.alerte) l.push(j.alerte);
  const plan = lieuxDuJour(n);
  if (plan.length) l.push(`Vous avez déjà prévu ce jour-là : ${plan.map((e) => e.nom).join(", ")}.`);
  return l;
}

// les lieux possibles : ouverts ce jour-là, pas encore prévus, dans la distance acceptée, conformes à l'envie ;
// des restaurants s'ajoutent pour qu'une sortie de plusieurs heures puisse inclure un repas
function candidatsIdees(j, dep, quand, exclus) {
  const R = REGIONS[REGION], soir = quand === "soir";
  let max = REPONSES.trajet !== "auto" ? DISTANCE_REGLAGE[REPONSES.trajet] : DISTANCE_DUREE[quand];
  if (REACTION?.cle === "loin") max = Math.max(1.2, Math.min(max, REACTION.max) / 2);
  const prevus = new Set(lieuxDuJour(j.n).map((e) => e.lieu)), vus = new Set();
  const tous = [...R.lieux.filter((s) => s.cat !== "base").map((s) => ({ s, pos: LIEUX[s.pos] })), ...AUTOUR.map((a) => ({ s: a, pos: [a.lat, a.lon] })),
    ...PRATIQUE.adresses.filter((a) => a.lat != null).map((a) => ({ s: a, pos: [a.lat, a.lon] }))]
    .filter((x) => x.pos && x.pos[0] != null && !prevus.has(x.s.id) && !exclus.has(x.s.id) && !(vus.has(x.s.id) || !vus.add(x.s.id)))
    .filter((x) => { const k = fermeLe(x.s.id, j.n); return k !== "jour" && !(k === "soir" && (soir || quand === "journee")); })
    .map((x) => ({ ...x, km: kmEntre(dep.pos, x.pos) })).filter((x) => x.km <= max).sort((a, b) => a.km - b.km);
  const envie = POUR_ENVIE[REPONSES.envie] || POUR_ENVIE.unique;
  const parFam = {}, liste = [], pris = new Set();
  const prendre = (x) => { if (!pris.has(x.s.id)) { pris.add(x.s.id); liste.push(x); } };
  for (const x of tous.filter((y) => envie(y.s))) {
    const f = FAMILLE[x.s.cat] || "voir";
    parFam[f] = (parFam[f] || 0) + 1;
    if (REPONSES.envie || parFam[f] <= 15) prendre(x);
    if (liste.length >= 70) break;
  }
  if (quand !== "heure" && REPONSES.envie !== "manger") tous.filter((y) => FAMILLE[y.s.cat] === "manger").slice(0, 15).forEach(prendre);
  return { liste: liste.slice(0, 90), max };
}
// horaires, prix et affluence d'un lieu : ceux de sa fiche, ou ceux de la fiche pratique d'un lieu du programme
const pratiqueDe = (s) => (s.horaires || s.prix ? s : PRATIQUE.originaux?.[s.id] || {});
const court = (t, n) => String(t).replace(/\s+/g, " ").slice(0, n);
function ligneIdee(x, j) {
  const s = x.s, p = pratiqueDe(s), m = MARCHE[s.id], plats = (DEGUST.lieux[s.id] || []).map((k) => DEGUST.noms[k]).filter(Boolean);
  const foule = s.foule || p.affluence;
  return [s.id, s.nom + (s.natif ? ` (${s.natif})` : ""), s.catTxt || "", `à ${x.km.toFixed(1)} km`,
    m && m[0] > 0 ? `${m[0]} min à pied de ${m[4] ? "la station" : "la gare"} ${m[2]}` : "",
    court(s.texte || "", 170), plats.length ? `spécialités : ${plats.join(", ")}` : "", p.horaires ? `horaires : ${court(p.horaires, 140)}` : "",
    p.prix ? `prix : ${court(p.prix, 80)}` : "", foule ? `affluence : ${court(foule, 80)}` : "", p.reservation ? `réservation : ${court(p.reservation, 80)}` : "",
    fermeLe(s.id, j.n) === "soir" ? "fermé le soir ce jour-là" : ""].filter(Boolean).join(" | ");
}
const texteDe = (liste, v) => liste.find((c) => c[0] === v)?.[1] || "";

function lignesMeteo(j, quand) {
  const R = REPONSES, p = R.meteo === "auto" ? phrasesMeteo(j, quand) : null;
  if (p) {
    const regles = [p.f && p.f.pluie >= 50 ? "La pluie est probable pendant la sortie. Choisis des lieux couverts quand la liste en contient." : "",
      p.f && p.f.max <= 8 ? "Il fera froid. Évite les longues attentes dehors." : ""].filter(Boolean).join(" ");
    return `- Météo prévue par Open-Meteo : ${p.l.join(" ")}${regles ? ` ${regles}` : ""}${p.coucher ? ` Le soleil se couche à ${p.coucher}.` : ""}`;
  }
  if (R.meteo === "auto") return "- Météo : non connue.";
  return `- Météo : ${texteDe(REGLAGES[0].choix, R.meteo).toLowerCase()}.${R.meteo === "pluie" ? " Choisis des lieux couverts quand la liste en contient." : R.meteo === "gris" ? " Évite les longues promenades exposées au vent." : ""}`;
}
function promptGuide(j, dep, quand, liste) {
  const R = REPONSES, veille = lieuxDuJour(j.n - 1);
  const passes = [...new Set(PLAN.filter((e) => e.jour < j.n).map((e) => e.nom))].slice(0, 40);
  const coucher = Math.floor(coucherSoleil(dep.pos[0], dep.pos[1], j.n) / 5) * 5;
  const maintenant = quand === "heure" && estAujourdhui(j) ? ` Il est ${heureTexte(surPlace().min)} sur place.` : "";
  const avant = REACTION?.precedente;
  const reaction = avant ? `
La sortie proposée juste avant s'appelait « ${avant.titre.replace(/[.!?…]+$/, "")} ». Ses étapes étaient : ${avant.etapes.map((e) => `${e.heure} ${PAR_ID[e.id]?.nom || e.id}`).join(", ")}.
Leur réaction à cette sortie : ${REACTION.consigne}
Propose une nouvelle sortie complète qui tient compte de cette réaction.
` : "";
  return `Tu es le guide personnel d'un couple de Français en voyage en Corée du Sud puis au Japon. Tu les connais bien. ${GOUTS}
Tu parles comme un guide humain attentif. Tu tiens compte de leur fatigue, de leur journée, de leur humeur et de ce qu'ils te disent. Tu leur proposes une sortie qui leur fera vraiment plaisir. Tu restes simple, précis et chaleureux.

Ce que tu sais de leur journée :
- ${j.titre} 2026, à ${ZONES[REGION].titre}. C'est le jour ${j.n - 2} d'un voyage de 25 jours.
- Programme prévu : ${j.texte}
${contexteDuJour(j).map((x) => `- ${x}`).join("\n")}
${veille.length ? `- Prévu la veille : ${veille.map((e) => e.nom).join(", ")}.\n` : ""}${passes.length ? `- Lieux déjà prévus les jours précédents, à ne pas reproposer : ${passes.join(", ")}.\n` : ""}- Point de départ : ${dep.nom}.${maintenant} Le soleil se couche vers ${heureTexte(coucher)}.

Ce qu'ils t'ont répondu :
- Envie : ${R.envie ? CONSIGNE_ENVIE[R.envie] : "Ils n'ont pas d'envie précise."}
- Humeur : ${R.humeur ? CONSIGNE_HUMEUR[R.humeur] : "Ils n'ont rien dit de leur humeur."}
- Moment : ${texteDe(QUANDS, quand).toLowerCase()}, ${HEURES[quand]}.
${lignesMeteo(j, quand)}
- Budget : ${R.budget === "petit" ? "petit. Préfère les lieux gratuits ou peu chers d'après les prix de la liste." : R.budget === "large" ? "sans compter." : "normal."}
${MOT_GUIDE.trim() ? `- Leur mot pour toi : « ${MOT_GUIDE.trim().slice(0, 300).replace(/[.!?…]+$/, "")} ». Tiens-en compte en priorité.\n` : ""}${reaction}
Ce que tu dois faire :
- Compose une seule sortie de ${ETAPES[quand]}, dans l'ordre de la visite, ${HEURES[quand]}.
- Choisis seulement des lieux de la liste ci-dessous, avec leur identifiant exact.
- Ne place pas un lieu à une heure où ses horaires le disent fermé. Pour une vue, place-la avant le coucher du soleil ou juste au moment où il se couche.
- Préfère des étapes proches les unes des autres. Une sortie de plusieurs heures peut inclure un repas dans un restaurant de la liste.
- Ajoute deux autres possibilités de la liste, chacune avec une phrase qui dit quand la préférer.
- N'invente aucun fait sur un lieu. Appuie-toi seulement sur le texte de la liste. Le conseil d'une étape vient de sa fiche : horaires, prix, réservation ou affluence. Sans information dans la fiche, le conseil reste vide.

Écris en français, en phrases simples et complètes. Adresse-toi au couple avec « vous ». N'utilise ni tiret long, ni métaphore. Ne commence aucune phrase par un verbe, par « Ce que », par « Ce qui » ou par « Voici ».

Réponds seulement avec ce JSON :
{"titre":"Une phrase qui décrit la sortie","pourquoi":"Deux phrases qui disent pourquoi elle leur convient aujourd'hui","etapes":[{"id":"identifiant exact","heure":"18 h","quoi":"Une ou deux phrases sur ce qu'ils y feront","conseil":"Une phrase tirée de la fiche, ou vide"}],"autres":[{"id":"identifiant exact","texte":"Une phrase"}]}

Liste des lieux (identifiant | nom | sorte | distance depuis le point de départ | marche depuis la gare | texte | spécialités | horaires | prix | affluence | réservation | remarque) :
${liste.map((x) => ligneIdee(x, j)).join("\n")}`;
}

function lienTrajet(de, s) {
  const p = posLieu(s);
  if (coree() || !de || p[0] == null) return lienCarte(s);
  return `https://www.google.com/maps/dir/?api=1&origin=${de[0]},${de[1]}&destination=${p[0]},${p[1]}&travelmode=transit`;
}
function sortieHtml(res) {
  let prec = res.pos;
  const etapes = res.etapes.map((e, k) => {
    const s = PAR_ID[e.id];
    if (!s) return "";
    const pos = posLieu(s), p = pratiqueDe(s), fam = FAMILLE[s.cat] || "voir";
    const ecart = prec && pos[0] != null ? `À ${texteDistance(metresEntre(prec, pos))} à vol d'oiseau ${k ? "de l'étape précédente" : `de ${echapper(res.depart)}`}.` : "";
    const lien = lienTrajet(prec, s);
    if (pos[0] != null) prec = pos;
    const faits = [ecart, p.horaires ? `Horaires : ${echapper(court(p.horaires, 110))}${String(p.horaires).length > 110 ? "…" : ""}` : ""].filter(Boolean).join(" ");
    return `<li><div class="etape-tete"><span class="etape-heure">${echapper(e.heure)}</span><span class="pastille" style="background:${COULEUR_FAMILLE[fam]}"></span><strong>${echapper(s.nom)}</strong></div>
      <p>${echapper(e.quoi)}</p>${e.conseil ? `<p class="etape-conseil">${echapper(e.conseil)}</p>` : ""}${faits ? `<p class="idee-faits">${faits}</p>` : ""}
      <button type="button" class="outil" data-id="${echapper(e.id)}">Voir sur la carte</button>
      <a class="outil" target="_blank" rel="noopener" href="${lien}">Itinéraire</a>
      ${DB && !PLAN_LECTURE_SEULE ? `<button type="button" class="outil" data-plan="${echapper(e.id)}">${joursDuLieu(e.id).includes(JOUR_IDEES.n) ? "Déjà au planning" : "Ajouter au planning"}</button>` : ""}</li>`;
  }).join("");
  const autres = (res.autres || []).filter((a) => PAR_ID[a.id]).map((a) =>
    `<li><button type="button" class="plan-nom" data-id="${echapper(a.id)}">${echapper(PAR_ID[a.id].nom)}</button> <span class="plan-info">${echapper(a.texte)}</span></li>`).join("");
  const repas = res.etapes.some((e) => FAMILLE[PAR_ID[e.id]?.cat] === "manger");
  const reactions = [["loin", "Moins loin"], ["calme", "Plus calme"], ["anime", "Plus animé"], ["cher", "Moins cher"], ...(repas ? [["repas", "Changer le repas"]] : []), ["autre", "Autre idée"]];
  return `<div class="sortie"><p class="sortie-titre">${echapper(res.titre)}</p><p>${echapper(res.pourquoi)}</p>
    <ol class="etapes">${etapes}</ol>
    ${autres ? `<p class="question-texte">Vous pouvez aussi choisir :</p><ul class="autres">${autres}</ul>` : ""}
    <p class="question-texte">Cette sortie vous convient-elle ?</p>
    <div class="jours reactions" role="group" aria-label="Réagir à la sortie">${reactions.map(([k, t]) => `<button type="button" data-reaction="${k}">${t}</button>`).join("")}</div>
    ${DB && !PLAN_LECTURE_SEULE ? `<p><button type="button" class="btn btn-or" id="plan-tout">Tout ajouter au planning</button></p>` : ""}</div>`;
}
function groupeChoix(cle, texte, liste, val, aide = "") {
  return `<div class="question"><p class="question-texte">${echapper(texte)}${aide ? ` <span class="question-aide">${aide}</span>` : ""}</p>
    <div class="jours" role="group" aria-label="${echapper(texte)}">${liste.map(([v, t]) =>
      `<button type="button" data-q="${cle}" data-v="${echapper(v)}" aria-pressed="${val === v}">${echapper(t)}</button>`).join("")}</div></div>`;
}
function questionsHtml(j) {
  const quands = estAujourdhui(j) ? QUANDS : QUANDS.filter((c) => c[0] !== "heure");
  const sait = contexteDuJour(j);
  return `${sait.length ? `<p class="guide-sait"><strong>Votre guide sait déjà ceci.</strong> ${sait.map(echapper).join(" ")}</p>` : ""}
    ${groupeChoix("envie", "De quoi avez-vous envie ?", ENVIES_GUIDE, REPONSES.envie, "Sans réponse, le guide choisit.")}
    ${groupeChoix("humeur", "Comment vous sentez-vous ?", HUMEURS, REPONSES.humeur)}
    ${groupeChoix("quand", "Quand sortez-vous et pour combien de temps ?", quands, quandDuJour(j))}
    <div class="question"><label class="question-texte" for="mot-guide">Avez-vous un mot pour votre guide ?</label>
      <textarea id="mot-guide" class="mot-guide" rows="2" maxlength="300" placeholder="Par exemple : on a mal aux pieds, ou c'est notre anniversaire.">${echapper(MOT_GUIDE)}</textarea></div>
    <details class="reglages"><summary>Plus de réglages</summary>
      ${REGLAGES.map((q) => groupeChoix(q.cle, q.texte, q.choix, REPONSES[q.cle])).join("")}
      ${groupeChoix("depart", "D'où partez-vous ?", choixDepart(j), reponseDepart(j))}</details>`;
}

function afficherIdees(corps, enCours) {
  const l = $("#idees"), j = JOUR_IDEES, garde = lireIdees(cleIdees(j)), sortie = garde?.etapes ? garde : null;
  const resultat = corps ?? (sortie ? sortieHtml(sortie) : "");
  l.innerHTML = `<div class="liste-tete"><h2>Votre guide du jour</h2><button type="button" class="fermer-liste" aria-label="Fermer le guide">×</button></div>
    <div class="jours" role="group" aria-label="Choisir le jour">${joursDe(REGION).map((x) =>
      `<button type="button" data-n="${x.n}" aria-pressed="${x === j}"${enCours ? " disabled" : ""}>${etiquetteJour(x)}</button>`).join("")}</div>
    <p class="liste-aide">${echapper(j.texte)}</p>
    ${meteoHtml(j)}
    ${resultat ? `<div class="idees-corps">${resultat}</div>` : ""}
    <details class="questions"${resultat && !enCours ? "" : " open"}><summary>${resultat ? "Changer mes réponses" : "Trois questions suffisent pour proposer une sortie."}</summary>
      ${questionsHtml(j)}
      <p>${enCours ? "" : `<button type="button" class="btn btn-or" id="demander-idees">${sortie ? "Demander une nouvelle sortie" : "Demander une sortie"}</button>`}</p></details>
    ${enCours ? `<p><button type="button" class="btn" id="arreter-idees">Arrêter</button></p>` : ""}
    <p class="liste-aide">Le guide est Claude. Il choisit seulement parmi les lieux de la carte qui sont ouverts ce jour-là d'après leur fiche. Les horaires restent à vérifier avant d'y aller.</p>`;
  l.querySelector(".fermer-liste").addEventListener("click", () => { CTL_IDEES?.abort(); l.hidden = true; });
  l.querySelectorAll('[aria-label="Choisir le jour"] button').forEach((b) => b.addEventListener("click", () => { JOUR_IDEES = joursDe(REGION).find((x) => x.n === +b.dataset.n); REACTION = null; afficherIdees(); }));
  l.querySelector("#mot-guide")?.addEventListener("input", (e) => { MOT_GUIDE = e.target.value; });
  l.querySelectorAll("button[data-q]").forEach((b) => b.addEventListener("click", () => {
    const cle = b.dataset.q, v = b.dataset.v;
    if (cle === "depart") { try { localStorage.setItem(`idees:depart:${j.n}`, v); } catch { /* sans stockage, le choix vaut pour cet écran */ } }
    // une envie ou une humeur se désélectionne d'un second toucher
    else REPONSES[cle] = (cle === "envie" || cle === "humeur") && REPONSES[cle] === v ? "" : v;
    garderReponses();
    const val = cle === "depart" ? v : cle === "quand" ? quandDuJour(j) : REPONSES[cle];
    if (cle === "quand") majMeteo(j);
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === val)));
  }));
  l.querySelectorAll(".idees-corps [data-id]").forEach((b) => b.addEventListener("click", () => { const s = PAR_ID[b.dataset.id]; if (s) { l.hidden = true; ouvrirFiche(s); } }));
  l.querySelectorAll(".idees-corps button[data-plan]").forEach((b) => b.addEventListener("click", async () => {
    const s = PAR_ID[b.dataset.plan]; if (!s) return;
    b.disabled = true; await ajouterAuPlan(s, JOUR_IDEES.n); b.textContent = "Ajouté au planning";
  }));
  l.querySelector("#plan-tout")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const etapes = (lireIdees(cleIdees(JOUR_IDEES)) || sortie)?.etapes || [];
    for (const e of etapes) { const s = PAR_ID[e.id]; if (s && !joursDuLieu(e.id).includes(JOUR_IDEES.n)) await ajouterAuPlan(s, JOUR_IDEES.n); }
    b.textContent = "Ajouté au planning";
  });
  l.querySelectorAll("[data-reaction]").forEach((b) => b.addEventListener("click", () => reagir(b.dataset.reaction, lireIdees(cleIdees(JOUR_IDEES)) || sortie)));
  l.querySelector("#demander-idees")?.addEventListener("click", () => { REACTION = null; demanderIdees(); });
  l.querySelector("#arreter-idees")?.addEventListener("click", () => CTL_IDEES?.abort());
  majMeteo(j);
  if (!["ok", "encours"].includes(METEO[cleMeteo(j)]?.etat)) chargerMeteo(j).then(() => majMeteo(j));
}

// une réaction redemande une sortie corrigée : elle garde les réponses et dit au guide ce qui ne va pas
function reagir(cle, precedente) {
  if (!precedente?.etapes) return;
  const ids = precedente.etapes.map((e) => e.id), repas = ids.filter((id) => FAMILLE[PAR_ID[id]?.cat] === "manger");
  const consignes = {
    loin: "La sortie est trop loin. Choisis des lieux plus proches du point de départ et plus proches les uns des autres.",
    calme: "Ils veulent une sortie plus calme, avec moins de monde et moins de marche.",
    anime: "Ils veulent une sortie plus animée.",
    cher: "Ils veulent une sortie moins chère. Préfère les lieux gratuits ou peu chers d'après les prix de la liste.",
    repas: "Ils veulent un autre repas. Garde les autres étapes si elles conviennent et remplace le restaurant.",
    autre: "Ils veulent une idée différente. Ne reprends aucun lieu de la sortie précédente.",
  };
  const exclus = cle === "repas" ? repas : cle === "autre" ? [...ids, ...(precedente.autres || []).map((a) => a.id)] : [];
  REACTION = { cle, consigne: consignes[cle], precedente, exclus, max: precedente.max || 10 };
  demanderIdees();
}

function ouvrirIdees(n) {
  if (typeof n === "number") JOUR_IDEES = joursDe(REGION).find((x) => x.n === n) || JOUR_IDEES;
  if (!JOUR_IDEES || !joursDe(REGION).includes(JOUR_IDEES)) JOUR_IDEES = jourParDefaut(REGION);
  REACTION = null;
  $("#idees").hidden = false; $("#fiche").hidden = true; $("#liste").hidden = true; $("#legende").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true; fermerVilles();
  afficherIdees();
}

async function demanderIdees() {
  const j = JOUR_IDEES, cle = cleIdees(j), quand = quandDuJour(j), dep = departIdees(j);
  const { liste, max } = candidatsIdees(j, dep, quand, new Set(REACTION?.exclus || []));
  if (!liste.length) {
    afficherIdees(`<p class="liste-aide">Aucun lieu de la carte ne correspond à ces réponses ce jour-là. Une autre envie, un autre moment ou un trajet plus long dans « Plus de réglages » donnera des lieux.</p>`, false);
    return;
  }
  const ids = new Set(liste.map((x) => x.s.id));
  CTL_IDEES = new AbortController();
  afficherIdees(`<p class="attente">Votre guide prépare une sortie parmi ${liste.length} lieu${liste.length > 1 ? "x" : ""} de la carte…</p>`, true);
  try {
    const r = await SAMPLE.json(promptGuide(j, dep, quand, liste), { signal: CTL_IDEES.signal, cache: false });
    const etapes = (Array.isArray(r?.etapes) ? r.etapes : []).filter((e) => e && ids.has(String(e.id))).slice(0, 4)
      .map((e) => ({ id: String(e.id), heure: String(e.heure || ""), quoi: String(e.quoi || ""), conseil: String(e.conseil || "") }));
    if (!etapes.length) throw { code: "sans_lieu" };
    const dans = new Set(etapes.map((e) => e.id));
    const autres = (Array.isArray(r?.autres) ? r.autres : []).filter((a) => a && ids.has(String(a.id)) && !dans.has(String(a.id))).slice(0, 2)
      .map((a) => ({ id: String(a.id), texte: String(a.texte || "") }));
    const res = { titre: String(r.titre || ""), pourquoi: String(r.pourquoi || ""), etapes, autres, quand: Date.now(), reponses: { ...REPONSES },
      depart: dep.nom, pos: dep.pos, max };
    garderIdees(cle, res);
    REACTION = null;
    afficherIdees(sortieHtml(res), false);
  } catch (e) {
    if (SANS_CLAUDE.includes(e?.code)) {
      $("#idees-bouton").hidden = true;
      afficherIdees(`<p class="liste-aide">Le guide n'est pas disponible sur cet appareil ou ce compte.</p>`, false);
      return;
    }
    const msg = { cancelled: "La demande a été arrêtée.", rate_limited: "Claude reçoit trop de demandes pour le moment. Il faut réessayer dans quelques minutes.",
      session_expired: "Il faut se reconnecter à Claude.", sans_lieu: "Le guide n'a choisi aucun lieu de la liste. Une nouvelle demande peut aboutir." }[e?.code]
      || "La réponse du guide n'a pas pu être lue. Une nouvelle demande peut aboutir.";
    afficherIdees(`<p class="liste-aide">${msg}</p>`, false);
  }
}

$("#idees-bouton").addEventListener("click", () => ouvrirIdees());
// le bouton n'apparaît que si la page peut interroger Claude (carte ouverte dans Claude)
(async () => {
  try { SAMPLE = window.claude?.use ? await window.claude.use("sample") : null; } catch { SAMPLE = null; }
  $("#idees-bouton").hidden = !SAMPLE;
})();

// ---------- Spécialités à goûter : les plats de la ville, leur photo et les adresses de la carte où les goûter ----------
// Demandé le 16/10/2026 : « des endroits genre restaurant, marché […] avec des spécialités ». Les plats, leur texte et leur source
// viennent de raw/specialites.json ; les adresses sont les lieux de la carte reliés à chaque plat par scripts/relier_specialites.py.
const SPECS = {};
function specialites(r) {
  SPECS[r] ??= fetch(`data/${r}/specialites.json`).then((x) => x.json()).catch(() => []);
  return SPECS[r];
}
const lieuParId = (id) => PAR_ID[id] || PRATIQUE.adresses.find((a) => a.id === id);
async function ouvrirSpecialites(vise) {
  const l = $("#specs"), r = REGION;
  const tete = `<div class="liste-tete"><h2>Spécialités à goûter à ${ZONES[r].titre}</h2><button type="button" class="fermer-liste" aria-label="Fermer les spécialités">×</button></div>`;
  l.innerHTML = tete + `<p class="attente">Chargement des spécialités…</p>`;
  l.hidden = false; $("#fiche").hidden = true; $("#liste").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#planning").hidden = true; fermerVilles();
  l.querySelector(".fermer-liste").addEventListener("click", () => { l.hidden = true; });
  const plats = await specialites(r);
  if (r !== REGION || l.hidden) return;
  const bouton = (s) => `<button type="button" class="outil${R_PROG.has(s.id) ? " prog" : ""}" data-id="${echapper(s.id)}">${echapper(s.nom)}</button>`;
  l.innerHTML = tete + `<p class="liste-aide">Chaque plat porte sa photo, ce qu'il est et les adresses de la carte où le goûter. Une adresse au bord doré fait partie de votre programme.</p>
    <p><button type="button" class="btn" id="montrer-gout">Montrer ces adresses sur la carte</button></p>
    <ul class="specs-liste">${plats.map((x) => {
      const ou = x.lieux.map(lieuParId).filter(Boolean);
      return `<li id="spec-${echapper(x.id)}"${x.id === vise ? ' class="vise"' : ""}>
        ${x.photo ? `<img src="${x.photo}" alt="${echapper(x.nom)}" loading="lazy">` : `<span class="spec-vide">${svgIcone(ICONES.manger)}</span>`}
        <div><strong>${echapper(x.nom)}</strong><span class="liste-cat">${echapper(x.ou)}</span>
        <p>${echapper(x.texte)}</p>
        ${ou.length ? `<div class="spec-ou"><span>Où le goûter :</span>${ou.map(bouton).join("")}</div>` : `<p class="liste-aide">Aucun lieu de la carte ne sert ce plat pour l'instant.</p>`}
        <p class="spec-source">Source : ${echapper(x.source)}.${x.credit ? ` Photo : ${echapper(x.credit.auteur)} · ${echapper(x.credit.licence)}.` : ""}</p></div></li>`;
    }).join("")}</ul>`;
  l.querySelector(".fermer-liste").addEventListener("click", () => { l.hidden = true; });
  l.querySelector("#montrer-gout").addEventListener("click", () => { l.hidden = true; choisirFiltre("gout"); });
  l.querySelectorAll(".spec-ou button[data-id]").forEach((b) => b.addEventListener("click", () => { const s = lieuParId(b.dataset.id); if (s) ouvrirFiche(s); }));
  if (vise) l.querySelector(`#spec-${CSS.escape(vise)}`)?.scrollIntoView({ block: "start" });
}
// identifiants des lieux du programme, pour dorer leur bouton dans le panneau
const R_PROG = new Set(Object.values(REGIONS).flatMap((R) => R.lieux.map((s) => s.id)));
$("#specs-bouton").addEventListener("click", () => ouvrirSpecialites());

// ---------- La carte à étages : le voyage, puis un pays, puis une ville, puis un arrondissement ou une sortie ----------
// Demandée le 15/10/2026 (« je clique Japon et là tu me mets la carte du Japon, et après des sous-menus de sous-menus »),
// plan accepté le 16/10/2026. Le fond des deux pays vient de data/pays/ (scripts/carte_etages.py). Une ville charge ses rues,
// son métro et ses lieux quand on s'approche d'elle, ou quand on la choisit dans le menu.
let ETAGES = null;
// où l'on est : niveau 0 le voyage, 1 un pays, 2 une ville du voyage, 3 un arrondissement ou une sortie de cette ville
let ICI = { niveau: -1 };
// après un choix dans le menu, l'étage choisi reste affiché tant qu'on ne déplace pas la carte
let VISE = null;
let REGION_DEMANDEE = null;
// les contours des arrondissements de la ville chargée (data/<ville>/arrondissements.json)
let ARR_GEO = { type: "FeatureCollection", features: [] };
function dansAnneau(p, anneau) {
  let c = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [x1, y1] = anneau[i], [x2, y2] = anneau[j];
    if ((y1 > p[1]) !== (y2 > p[1]) && p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
const PHOTO_ETAPE = { seoul: "gyeongbokgung", busan: "gamcheon", fukuoka: "ohori", kobe: "meriken", tokyo: "tokyo_gare" };
// ---------- le coucher du soleil (27/10/2026) ----------
// Demandé par Schadrac le 27/10 : en novembre la nuit tombe vers 17 h 30 à Séoul, contre 19 h 07 le 15 avril 2024 (Open-Meteo),
// le mois de son premier voyage. Heures calculées pour la ville de chaque jour avec l'algorithme de la NOAA, minutes tronquées
// (scratchpad coucher.py) : à une minute près d'Open-Meteo du 4 au 11 novembre, et de l'observatoire du Japon (NAOJ,
// eco.mtk.nao.ac.jp/koyomi/dni/2026/s1311.html) pour Tokyo du 21 au 26.
const COUCHER = {
  seoul: { 4: "17 h 31", 5: "17 h 30", 6: "17 h 29", 7: "17 h 29", 8: "17 h 28", 9: "17 h 27", 26: "17 h 16" },
  busan: { 10: "17 h 22", 11: "17 h 21", 12: "17 h 21", 13: "17 h 20" },
  fukuoka: { 14: "17 h 17", 15: "17 h 16", 16: "17 h 16", 17: "17 h 15" },
  kobe: { 18: "16 h 53", 19: "16 h 53", 20: "16 h 52", 21: "16 h 52" },
  tokyo: { 21: "16 h 31", 22: "16 h 31", 23: "16 h 30", 24: "16 h 30", 25: "16 h 30", 26: "16 h 29" },
};
// les lieux du programme qui se visitent dehors et de jour : randonnées, jardins, temples, palais, forteresse, villages.
// Naksan, le pont Woljeonggyo, le mont Rokko et Dadaepo sont laissés de côté, parce qu'on y va aussi le soir pour les lumières.
const DEHORS = new Set(["gyeongbokgung", "eunpyeong", "ansan", "imjingak", "suwon", "minsokchon", "nami", "morningcalm",
  "haedong", "gamcheon", "daereungwon", "seokguram", "gyochon",
  "karatsu_chateau", "nanatsugama", "shikanoshima", "dazaifu", "homan", "nanzoin", "yoshinogari", "akiyoshidai",
  "nunobiki", "takedao", "himeji_chateau", "engyoji", "korakuen", "kurashiki", "peace", "shukkeien",
  "kamakura", "yanaka", "shibamata", "kiyosumi"]);
function conseilJour(s) {
  // les jours de voyage entre deux villes (ceux qui comptent pour deux régions dans contenu.js) ne sont pas des jours de visite
  const h = DEHORS.has(s.id) ? Object.entries(COUCHER[REGION] || {}).filter(([n]) => !JOURS.find((j) => j.n === +n)?.regions).map(([, x]) => x) : [];
  if (!h.length) return "";
  const tot = h.reduce((a, b) => (a < b ? a : b)), tard = h.reduce((a, b) => (a > b ? a : b));
  const quand = tot === tard ? `à ${tot}` : `entre ${tot} et ${tard}`;
  return `<dt>Avant la nuit</dt><dd>Ce lieu se visite dehors. Pendant vos jours dans cette ville, le soleil se couche ${quand}. Une visite commencée le matin ou en début d'après-midi se termine avant la nuit.</dd>`;
}
// les sorties d'une journée depuis chaque ville, avec les lieux du programme qui les composent
const SORTIES = {
  seoul: [{ id: "dmz", nom: "DMZ", membres: ["imjingak"] }, { id: "suwon", nom: "Suwon", membres: ["suwon"] },
    { id: "minsokchon", nom: "Village folklorique", membres: ["minsokchon"] }, { id: "nami", nom: "Nami et Morning Calm", membres: ["nami", "morningcalm"] }],
  busan: [{ id: "gyeongju", nom: "Gyeongju", membres: ["daereungwon", "woljeonggyo", "seokguram", "gyochon"] },
    { id: "haedong", nom: "Haedong Yonggungsa", membres: ["haedong"] }],
  fukuoka: [{ id: "dazaifu", nom: "Dazaifu", membres: ["dazaifu"] }, { id: "nanzoin", nom: "Nanzoin", membres: ["nanzoin"] },
    { id: "homan", nom: "Mont Hōman", membres: ["homan"] }, { id: "shikanoshima", nom: "Shikanoshima", membres: ["shikanoshima"] },
    { id: "yoshinogari", nom: "Yoshinogari", membres: ["yoshinogari"] }, { id: "karatsu", nom: "Karatsu et Yobuko", membres: ["karatsu_chateau", "nanatsugama"] },
    { id: "mojiko", nom: "Mojiko et Kokura", membres: ["mojiko"] }, { id: "akiyoshidai", nom: "Akiyoshidai", membres: ["akiyoshidai"] }],
  kobe: [{ id: "rokko", nom: "Mont Rokko", membres: ["rokko"] }, { id: "takedao", nom: "Takedao", membres: ["takedao"] },
    { id: "himeji", nom: "Himeji", membres: ["himeji_chateau", "engyoji"] }, { id: "okayama", nom: "Okayama et Kurashiki", membres: ["korakuen", "kurashiki"] },
    { id: "hiroshima", nom: "Hiroshima", membres: ["peace", "shukkeien"] }],
  tokyo: [{ id: "kamakura", nom: "Kamakura", membres: ["kamakura"] }, { id: "shibamata", nom: "Shibamata", membres: ["shibamata"] },
    { id: "suginami", nom: "Musée de l'animation de Suginami", membres: ["suginami_anime"] }],
};
// largeur de la carte comparée à celle d'un téléphone : un écran large montre plus de pays au même zoom, donc les étages changent plus loin
const DECALAGE = Math.log2(Math.max($("#carte").clientWidth || innerWidth, 320) / 390);
// (MapLibre compte ses zooms en tuiles de 512 pixels : au zoom 4,2, un téléphone montre environ 1 700 km de large)
const Z_PAYS = 4.2 + DECALAGE;   // en dessous, la carte montre le voyage entier
const Z_VILLE = 6.8 + DECALAGE;  // au-dessus, et au-dessus d'une ville du voyage, la carte montre cette ville et charge ses rues

const lieuProgramme = (r, id) => REGIONS[r].lieux.find((s) => s.id === id);
const posProgramme = (r, id) => { const s = lieuProgramme(r, id); const p = s && LIEUX[s.pos]; return p ? [p[1], p[0]] : null; };
function centreSortie(r, so) {
  const pts = so.membres.map((id) => posProgramme(r, id)).filter(Boolean);
  return pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null;
}
function jourSortie(r, so) {
  const s = lieuProgramme(r, so.membres[0]);
  if (!s) return "";
  return JOUR_DU_LIEU[s.id] || JOUR_DU_LIEU[s.pos] || (/sans jour fixé/.test(s.prevu || "") ? "Un jour à placer" : "Sortie possible");
}
const baseEtape = (r) => { const p = LIEUX[REGIONS[r].base]; return [p[1], p[0]]; };
function kmLngLat(a, b) { return kmEntre([a[1], a[0]], [b[1], b[0]]); }

// ---------- les couches du fond commun ----------
function couchesFond(P) {
  return [
    { id: "pays-fond", type: "background", paint: { "background-color": P.mer } },
    { id: "pays-terre", type: "fill", source: "pays-terre", paint: { "fill-color": P.fond } },
    { id: "pays-relief", type: "hillshade", source: "pays-relief",
      paint: { "hillshade-shadow-color": P.ombre, "hillshade-highlight-color": P.lumiere, "hillshade-accent-color": P.accent, "hillshade-exaggeration": P.relief } },
  ];
}
const texteEtape = (P) => ["format", ["get", "nom"], { "font-scale": 1.15 }, ["case", ["!=", ["get", "quand"], ""], ["concat", "\n", ["get", "quand"]], ""], { "font-scale": 0.82, "text-color": P.or }];
function couchesDessus(P) {
  const halo = { "text-halo-color": P.halo, "text-halo-width": 1.6, "text-halo-blur": 0.3 };
  const train = ["==", ["get", "type"], "train"];
  return [
    // votre trajet : les trains en trait doré plein, l'avion en pointillés
    { id: "pays-trajets-bord", type: "line", source: "pays-trajets", maxzoom: Z_VILLE + 1.2, filter: train, layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": P.halo, "line-width": zoomInterp(4, 4.5, 9, 8) } },
    { id: "pays-trajets", type: "line", source: "pays-trajets", maxzoom: Z_VILLE + 1.2, filter: train, layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": P.or, "line-width": zoomInterp(4, 2.2, 9, 4) } },
    { id: "pays-avion", type: "line", source: "pays-trajets", maxzoom: Z_VILLE + 1.2, filter: ["==", ["get", "type"], "avion"], layout: { "line-cap": "round" },
      paint: { "line-color": P.or, "line-width": zoomInterp(4, 2, 9, 3.5), "line-dasharray": [1.2, 2] } },
    { id: "pays-trajets-noms", type: "symbol", source: "pays-trajets", minzoom: Z_PAYS - 0.3, maxzoom: Z_VILLE,
      layout: { "symbol-placement": "line", "text-field": ["get", "etiquette"], "text-font": ["Noto Sans Medium"], "text-size": 11.5, "symbol-spacing": 500,
        "text-max-angle": 35, "text-offset": [0, -0.9] },
      paint: { "text-color": P.or, ...halo } },
    // les villes repères le long du trajet
    { id: "pays-villes-points", type: "circle", source: "pays-villes", minzoom: Z_PAYS, maxzoom: Z_VILLE,
      paint: { "circle-color": P.texteDoux, "circle-radius": 2.6, "circle-stroke-color": P.halo, "circle-stroke-width": 1.2 } },
    { id: "pays-villes", type: "symbol", source: "pays-villes", minzoom: Z_PAYS, maxzoom: Z_VILLE,
      layout: { "text-field": ["get", "nom"], "text-font": ["Noto Sans Regular"], "text-size": 11.5, "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.6, "text-optional": true },
      paint: { "text-color": P.texteDoux, ...halo } },
    // les noms des pays, des îles et des mers
    { id: "pays-noms", type: "symbol", source: "pays-noms", maxzoom: Z_VILLE + 0.6,
      filter: ["any", ["match", ["get", "type"], ["pays", "voisin", "mer"], true, false], [">=", ["zoom"], Z_PAYS]],
      layout: { "text-field": ["format", ["get", "nom"], {}, ["case", ["!=", ["get", "natif"], ""], ["concat", "\n", ["get", "natif"]], ""], { "font-scale": 0.78 }],
        "text-font": ["match", ["get", "type"], "mer", ["literal", ["Noto Sans Italic"]], ["literal", ["Noto Sans Medium"]]],
        "text-size": ["match", ["get", "type"], "pays", 16, "voisin", 12.5, "ile", 12, 12.5],
        "text-transform": ["match", ["get", "type"], ["pays", "voisin"], "uppercase", "none"],
        "text-letter-spacing": ["match", ["get", "type"], ["pays", "voisin"], 0.16, 0.03], "text-max-width": 8 },
      paint: { "text-color": ["match", ["get", "type"], "mer", P.eauTexte, "pays", P.ville, "ile", P.arrondissement, P.texteDoux], ...halo } },
    // les sorties d'une journée : une photo ronde au cadre doré, avec leur jour
    { id: "pays-sorties", type: "symbol", source: "pays-sorties", maxzoom: Z_VILLE,
      layout: { visibility: "none", "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": zoomInterp(5, 0.7, 9, 0.9), "icon-padding": 2,
        "text-field": texteEtape(P), "text-font": ["Noto Sans Medium"], "text-size": 11.5, "text-optional": true, "text-max-width": 9,
        "text-variable-anchor-offset": ["top", [0, 0.4], "left", [1.5, -1.5], "right", [-1.5, -1.5]], "symbol-sort-key": ["get", "ordre"] },
      paint: { "text-color": P.texte, ...halo } },
    // les cinq villes du voyage : une grande photo carrée au cadre doré, toujours affichée, avec ses dates
    { id: "pays-etapes", type: "symbol", source: "pays-etapes", maxzoom: Z_VILLE,
      layout: { "icon-image": ["get", "icone"], "icon-anchor": "bottom", "icon-size": zoomInterp(4, 0.72, 8, 0.95), "icon-allow-overlap": true,
        "text-field": texteEtape(P), "text-font": ["Noto Sans Medium"], "text-size": 13.5, "text-optional": true, "text-max-width": 10,
        "text-variable-anchor-offset": ["top", [0, 0.35], "left", [2, -1.9], "right", [-2, -1.9]] },
      paint: { "text-color": P.texte, "text-halo-color": P.halo, "text-halo-width": 1.8, "text-halo-blur": 0.3 } },
  ];
}

// ---------- les données du fond commun ----------
function arcAvion(a, b) {
  // une courbe douce entre deux villes, pour distinguer le vol des trains
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = [b[0] - a[0], b[1] - a[1]];
  const c = [m[0] - d[1] * 0.25, m[1] + d[0] * 0.25], pts = [];
  for (let t = 0; t <= 1.0001; t += 0.05) pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
  return pts;
}
function geoTrajets() {
  return { type: "FeatureCollection", features: TRAJETS.filter((t) => t.type === "train" || t.type === "avion").map((t) => {
    let pts = t.gares.map((g) => LIEUX[g]).filter(Boolean).map((p) => [p[1], p[0]]);
    if (t.type === "avion") pts = arcAvion(pts[0], pts[pts.length - 1]);
    const j = JOURS.find((d) => d.n === t.jour);
    return { type: "Feature", properties: { type: t.type, etiquette: `${t.nom}${j ? ` le ${j.titre.toLowerCase()}` : ""}` }, geometry: { type: "LineString", coordinates: pts } };
  }) };
}
const point = (pos, props) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: pos } });
async function geoEtapes() {
  const feats = [];
  for (const r of ORDRE) {
    const src = MINIS[`data/miniatures/${PHOTO_ETAPE[r]}.jpg`], img = src ? await chargerImage(src) : null, icone = `pays-ep-${r}`;
    if (!map.hasImage(icone)) map.addImage(icone, epingle(img, 54, OR, false, ICONES.voir), { pixelRatio: 2 });
    feats.push(point(baseEtape(r), { id: r, nom: ZONES[r].titre, quand: ZONES[r].dates.replace(" 2026", ""), icone }));
  }
  return { type: "FeatureCollection", features: feats };
}
async function geoSorties() {
  const feats = [];
  for (const r of ORDRE) for (const [k, so] of SORTIES[r].entries()) {
    const c = centreSortie(r, so), s = lieuProgramme(r, so.membres[0]);
    if (!c || !s) continue;
    const src = MINIS[`data/miniatures/${s.photo}.jpg`], img = src ? await chargerImage(src) : null, icone = `pays-so-${so.id}`;
    if (!map.hasImage(icone)) map.addImage(icone, epingle(img, 38, OR, true, ICONES.voir), { pixelRatio: 2 });
    const quand = jourSortie(r, so);
    feats.push(point(c, { id: `${r}:${so.id}`, nom: so.nom, quand, icone, ordre: (/novembre/.test(quand) ? 0 : 10) + k }));
  }
  return { type: "FeatureCollection", features: feats };
}
async function chargerFond() {
  const [etages, terre] = await Promise.all([fetch("data/pays/etages.json").then((x) => x.json()), calque("pays", "terre")]);
  ETAGES = etages;
  // buffer 0 : avec la marge habituelle, un fil de terre apparaissait sur la mer intérieure de Seto au bord de certaines tuiles
  map.addSource("pays-terre", { type: "geojson", data: terre, tolerance: 0.4, buffer: 0 });
  map.addSource("pays-relief", { type: "raster-dem", tiles: ["relief://pays/{z}/{x}/{y}"], tileSize: 256, encoding: "terrarium", minzoom: 4, maxzoom: 6,
    bounds: etages.bornes, attribution: "Relief : Terrain Tiles (AWS)" });
  map.addSource("pays-trajets", { type: "geojson", data: geoTrajets() });
  map.addSource("pays-villes", { type: "geojson", data: { type: "FeatureCollection", features: etages.villes.map((v) => point(v.pos, { nom: v.nom })) } });
  map.addSource("pays-noms", { type: "geojson", data: { type: "FeatureCollection", features: etages.noms.map((n) => point(n.pos, { nom: n.nom, natif: n.natif, type: n.type })) } });
  map.addSource("pays-etapes", { type: "geojson", data: await geoEtapes() });
  map.addSource("pays-sorties", { type: "geojson", data: await geoSorties() });
  if (map.getLayer("attente")) map.removeLayer("attente");
  for (const c of couchesFond(PALETTES[theme])) map.addLayer(c);
  for (const c of couchesDessus(PALETTES[theme])) map.addLayer(c);
  map.addSource("plan", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  for (const c of couchesPlan()) map.addLayer(c);
  const b = etages.bornes;
  map.setMaxBounds([[b[0], b[1]], [b[2], b[3]]]);
}

// ---------- où l'on est ----------
const largeurKm = () => { const b = map.getBounds(); return kmLngLat([b.getWest(), map.getCenter().lat], [b.getEast(), map.getCenter().lat]); };
function etapeContenant(c) {
  return ORDRE.find((r) => { const b = ZONES[r].etendue || ZONES[r].bornes; return c.lng >= b[0] && c.lng <= b[2] && c.lat >= b[1] && c.lat <= b[3]; }) || null;
}
const etapeProche = (c) => ORDRE.reduce((m, r) => (kmLngLat([c.lng, c.lat], baseEtape(r)) < kmLngLat([c.lng, c.lat], baseEtape(m)) ? r : m), ORDRE[0]);
function sousProche(r, c) {
  const w = largeurKm(), ici = [c.lng, c.lat];
  const sortie = (rayon) => { for (const so of SORTIES[r]) { const p = centreSortie(r, so); if (p && kmLngLat(ici, p) <= rayon) return { type: "sortie", r, so }; } return null; };
  // de près, une sortie nomme l'étage seulement si elle est à moins d'une demi-largeur d'écran du centre (corrigé le 16/10/2026 :
  // centrée sur l'hôtel de Kita-Shinjuku, la carte s'appelait « Musée de l'animation de Suginami », à 5 km de là)
  if (w <= 6.5) { const s = sortie(w / 2); if (s) return s; }
  // un arrondissement : la carte montre moins de 6,5 km de large et son centre est dans les limites de l'arrondissement
  if (w <= 6.5 && r === REGION) {
    const f = ARR_GEO.features.find((x) => x.properties.garde && x.geometry.coordinates.some((anneau) => dansAnneau(ici, anneau)));
    const a = f && (ETAGES.etapes[r]?.arrondissements || []).find((x) => x.id === f.properties.id);
    if (a) return { type: "arr", r, a };
  }
  // une sortie hors des arrondissements : la carte montre moins de 60 km de large et son centre est à moins de 8 km de la sortie
  return w <= 60 ? sortie(8) : null;
}
function etageCourant() {
  const z = map.getZoom(), c = map.getCenter();
  // la fin du déplacement demandé par le menu : l'étage choisi est retenu là où la carte s'est arrêtée (les bords de la carte
  // peuvent l'avoir décalée)
  if (VISE?.attente) { VISE = { centre: [c.lng, c.lat], zoom: z, ici: VISE.ici }; return VISE.ici; }
  if (VISE && kmLngLat([c.lng, c.lat], VISE.centre) < 2 && Math.abs(z - VISE.zoom) < 0.8) return VISE.ici;
  VISE = null;
  if (z < Z_PAYS) return { niveau: 0 };
  const e = z >= Z_VILLE ? etapeContenant(c) : null;
  if (!e) return { niveau: 1, pays: PAYS_DE[etapeProche(c)] };
  const s = sousProche(e, c);
  return { niveau: s ? 3 : 2, pays: PAYS_DE[e], etape: e, sous: s };
}
function majEtage() {
  if (!ETAGES || map.isMoving()) return;
  ICI = etageCourant();
  afficherEtage();
  if (ICI.etape && ICI.etape !== REGION && ICI.etape !== REGION_DEMANDEE) changerRegion(ICI.etape, false);
}
map.on("moveend", majEtage);

function afficherEtage() {
  const n = ICI.niveau, fil = [];
  if (n >= 1) fil.push(["voyage", "Voyage"]);
  if (n >= 2) fil.push([`pays:${ICI.pays}`, PAYS[ICI.pays].nom]);
  if (n >= 3) fil.push([`etape:${ICI.etape}`, ZONES[ICI.etape].titre]);
  $("#fil").innerHTML = fil.map(([k, t]) => `<button type="button" data-aller="${k}">${echapper(t)}</button><span class="sep" aria-hidden="true">›</span>`).join("");
  $("#fil").hidden = !fil.length;
  $("#fil").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => aller(b.dataset.aller)));
  let titre, dates;
  if (n === 0) { titre = "Corée et Japon"; dates = "Du 3 au 27 novembre 2026"; }
  else if (n === 1) { titre = PAYS[ICI.pays].nom; dates = PAYS[ICI.pays].dates; }
  else if (n === 2) { titre = ZONES[ICI.etape].titre; dates = ZONES[ICI.etape].dates; }
  else if (ICI.sous.type === "sortie") {
    const q = jourSortie(ICI.etape, ICI.sous.so), v = ZONES[ICI.etape].titre;
    titre = ICI.sous.so.nom;
    dates = /novembre/.test(q) ? `Sortie du ${q.toLowerCase()} depuis ${v}` : /placer/.test(q) ? `Sortie depuis ${v} dont le jour reste à placer` : `Sortie possible depuis ${v}`;
  }
  else { titre = ICI.sous.a.nom; dates = `Arrondissement de ${ZONES[ICI.etape].titre}`; }
  $("#titre").textContent = titre; $("#dates").textContent = dates;
  document.title = `${titre} en carte`;
  // les vues, les filtres et les spécialités servent quand les rues de la ville sont chargées
  document.body.classList.toggle("loin", n < 2 || REGION !== ICI.etape);
  if (document.body.classList.contains("loin")) quitterAutour();
  // les sorties d'une journée apparaissent à partir de l'étage d'un pays, même sur un téléphone où ce pays se voit de loin
  map.setLayoutProperty("pays-sorties", "visibility", n >= 1 ? "visible" : "none");
  const h = n === 0 ? "voyage" : n === 1 ? ICI.pays : ICI.etape;
  if (location.hash.slice(1) !== h) history.replaceState(null, "", "#" + h);
  if (!$("#villes").hidden) remplirVilles();
}

// ---------- se déplacer d'un étage à l'autre ----------
// la place prise par le titre en haut, par les boutons à droite et en bas ; un nom de ville déborde de sa photo sur les côtés
const marges = () => telephone ? { top: 180, bottom: 130, left: 70, right: 90 } : { top: 120, bottom: 150, left: 90, right: 110 };
function cadrer(points, maxZoom, ici) {
  const b = new maplibregl.LngLatBounds();
  points.forEach((p) => b.extend(p));
  const cam = map.cameraForBounds(b, { padding: marges(), maxZoom });
  if (!cam) return;
  if (ici) VISE = { attente: true, ici };
  map.flyTo({ center: cam.center, zoom: cam.zoom, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduit ? 0 : 1400, essential: true });
}
const pointsPays = (p) => PAYS[p].etapes.flatMap((r) => [baseEtape(r), ...SORTIES[r].map((so) => centreSortie(r, so)).filter(Boolean)]);
function aller(cle) {
  fermerVilles(); $("#fiche").hidden = true; $("#liste").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true; $("#planning").hidden = true;
  const [type, a, b] = cle.split(":");
  if (type === "voyage") return cadrer(ORDRE.map(baseEtape), Z_PAYS - 0.15, { niveau: 0 });
  if (type === "pays") return cadrer(pointsPays(a), Z_VILLE - 0.3, { niveau: 1, pays: a });
  if (type === "etape") {
    if (REGION === a) return map.flyTo({ ...vueDepart(a), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduit ? 0 : 1400 });
    return changerRegion(a, true);
  }
  if (type === "sortie") {
    const so = SORTIES[a].find((x) => x.id === b);
    if (REGION !== a) changerRegion(a, false);
    return cadrer(so.membres.map((id) => posProgramme(a, id)).filter(Boolean), 13.2, { niveau: 3, pays: PAYS_DE[a], etape: a, sous: { type: "sortie", r: a, so } });
  }
  if (type === "arr") {
    const x = ETAGES.etapes[a].arrondissements.find((y) => y.id === b), bo = x.bornes;
    return cadrer([[bo[0], bo[1]], [bo[2], bo[3]]], 15, { niveau: 3, pays: PAYS_DE[a], etape: a, sous: { type: "arr", r: a, a: x } });
  }
}

// ---------- Le planning jour par jour, partagé entre les personnes qui ouvrent la carte ----------
// Demandé le 16/10/2026 : « Commence par le planning jour par jour, partagé avec ma femme. »
// Chaque lieu prévu est un document de la base partagée de la carte (capacité « db »), dans la collection « planning » :
// { jour, lieu, region, nom, pos: [lat, lon], ordre, ajoute }, plus deux champs facultatifs ajoutés le 07/11/2026 pour l'emploi du temps
// demandé par Schadrac (« je veux que tu le remplisses ») : heure (« 10 h 30 ») et quoi (ce qui est prévu à cette étape). Un document par lieu et par jour : deux personnes qui ajoutent
// chacune un lieu au même moment n'écrasent pas le travail de l'autre. Le planning se lit en direct sur tous les appareils.
// Hors de claude.ai, la base n'existe pas : le planning se montre vide et ses boutons ne s'affichent pas.
let DB = null, PLAN = [], PLAN_PRET = false, PLAN_LECTURE_SEULE = false;
// la copie en ligne n'a pas la base : elle lit une copie du planning de claude.ai, datée, en lecture seule (data/planning.json)
let PLAN_COPIE = "";
// le jour montré sur la carte et dans le panneau ; il reste affiché quand on ouvre une fiche depuis le panneau
let JOUR_PLAN = null;
const COLLECTION_PLAN = "planning";
const jourDe = (n) => JOURS.find((j) => j.n === n);
const titreJour = (n) => jourDe(n)?.titre || `${n} novembre`;
// 27/10/2026 : un lieu du programme dont le jour est déjà écrit (contenu.js : DMZ le 6, Suwon le 8, Gyeongju le 11, Rokko le 21 ;
// regions.js : « Prévu le mercredi 11 novembre ») entre de lui-même dans le planning de ce jour, sans passer par la base partagée.
// Il passe avant les lieux ajoutés à la main et ne se retire pas depuis le panneau.
const JOUR_ECRIT = /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) (\d{1,2}) novembre/i;
let PLAN_AUTO = null;
function planAuto() {
  if (PLAN_AUTO) return PLAN_AUTO;
  if (!Object.keys(LIEUX).length) return [];
  PLAN_AUTO = [];
  for (const [r, R] of Object.entries(REGIONS)) R.lieux.forEach((s, k) => {
    if (s.cat === "base") return;
    const j = JOURS.find((d) => d.lieu && (d.lieu === s.id || d.lieu === s.pos)), m = (s.prevu || "").match(JOUR_ECRIT);
    const n = j ? j.n : m ? +m[1] : null, pos = LIEUX[s.pos];
    if (n && pos) PLAN_AUTO.push({ jour: n, lieu: s.id, region: r, nom: s.nom, pos: [pos[0], pos[1]], ordre: k, auto: true });
  });
  return PLAN_AUTO;
}
const lieuxDuJour = (n) => [...planAuto().filter((a) => a.jour === n && a.region === REGION && !PLAN.some((e) => e.jour === n && e.lieu === a.lieu)),
  ...PLAN.filter((e) => e.jour === n)].sort((a, b) => (a.auto === b.auto ? a.ordre - b.ordre : a.auto ? -1 : 1));
const joursDuLieu = (id) => PLAN.filter((e) => e.lieu === id).map((e) => e.jour).sort((a, b) => a - b);
function messagePlan(t) { const m = $("#plan-etat"); if (m) m.textContent = t; }

function erreurPlan(e) {
  if (e?.code === "invalid_argument") {
    PLAN_LECTURE_SEULE = true;
    messagePlan("Ce compte peut lire le planning sans pouvoir le modifier.");
  } else if (e?.code === "quota_exceeded") {
    messagePlan("La base de la carte est pleine. Il faut retirer des lieux avant d'en ajouter.");
  } else {
    messagePlan("Le planning n'a pas pu s'enregistrer. Il faut réessayer dans un instant.");
  }
  rafraichirPlan();
}
async function ajouterAuPlan(s, n) {
  if (!DB || PLAN_LECTURE_SEULE) return;
  const pos = posLieu(s);
  const fin = lieuxDuJour(n).reduce((m, e) => Math.max(m, e.ordre), 0);
  try {
    await DB.collection(COLLECTION_PLAN).doc(`j${n}_${s.id}`).set({ jour: n, lieu: s.id, region: REGION, nom: s.nom,
      pos: pos[0] != null ? [pos[0], pos[1]] : null, ordre: Math.max(fin + 1, Date.now()), ajoute: new Date().toISOString() });
  } catch (e) { erreurPlan(e); }
}
async function retirerDuPlan(id, n) {
  if (!DB || PLAN_LECTURE_SEULE) return;
  try { await DB.collection(COLLECTION_PLAN).doc(`j${n}_${id}`).delete(); } catch (e) { erreurPlan(e); }
}
// monter ou descendre un lieu : les deux lieux voisins échangent leur rang, une écriture après l'autre
async function deplacerDansPlan(n, i, sens) {
  const l = lieuxDuJour(n), a = l[i], b = l[i + sens];
  if (!DB || PLAN_LECTURE_SEULE || !a || !b || a.auto || b.auto) return;
  try {
    await DB.collection(COLLECTION_PLAN).doc(`j${n}_${a.lieu}`).update({ ordre: b.ordre });
    await DB.collection(COLLECTION_PLAN).doc(`j${n}_${b.lieu}`).update({ ordre: a.ordre });
  } catch (e) { erreurPlan(e); }
}

// ---------- le jour choisi, dessiné sur la carte : un trait doré dans l'ordre et un numéro par lieu ----------
function couchesPlan() {
  return [
    { id: "plan-trait", type: "line", source: "plan", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": OR, "line-width": zoomInterp(8, 2.5, 15, 4.5), "line-dasharray": [1.5, 1.2], "line-opacity": 0.95 } },
    { id: "plan-points", type: "circle", source: "plan", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": OR, "circle-radius": zoomInterp(8, 9, 15, 12), "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } },
    { id: "plan-numeros", type: "symbol", source: "plan", filter: ["==", ["geometry-type"], "Point"],
      layout: { "text-field": ["to-string", ["get", "rang"]], "text-font": ["Noto Sans Medium"], "text-size": zoomInterp(8, 11, 15, 13.5),
        "text-allow-overlap": true, "icon-allow-overlap": true },
      paint: { "text-color": "#FFFFFF" } },
  ];
}
// ---------- la barre des jours, visible en bas de l'écran dans une ville (27/10/2026) ----------
// Un bouton par jour passé dans la ville montrée, avec le nombre de lieux prévus. Le toucher ouvre le planning de ce jour : la carte
// se cadre sur ses lieux, numérotés dans l'ordre et reliés par le trait doré. Un second toucher referme le planning.
function majJoursBarre() {
  const b = $("#jours-barre");
  if (!b) return;
  const js = REGION ? joursDe(REGION) : [], ouvert = !$("#planning").hidden;
  // panneau du jour ouvert : les filtres de sorte se cachent pour laisser la carte visible (index.html, body.plan-ouvert)
  document.body.classList.toggle("plan-ouvert", ouvert);
  b.hidden = !js.length;
  b.innerHTML = `<span class="jours-titre">Jour</span>` + js.map((x) => {
    const c = lieuxDuJour(x.n).length;
    return `<button type="button" data-n="${x.n}" aria-pressed="${ouvert && x.n === JOUR_PLAN}">${etiquetteJour(x)}${c ? ` · ${c}` : ""}</button>`;
  }).join("");
  b.querySelectorAll("button").forEach((k) => k.addEventListener("click", () => {
    const n = +k.dataset.n;
    if (n === JOUR_PLAN && !$("#planning").hidden) return fermerPlanning();
    ouvrirPlanning(n);
    cadrerJour(n);
  }));
}
function dessinerPlan() {
  majJoursBarre();
  const src = map.getSource("plan");
  if (!src) return;
  const l = JOUR_PLAN ? lieuxDuJour(JOUR_PLAN).filter((e) => e.pos) : [];
  const pts = l.map((e) => [e.pos[1], e.pos[0]]);
  // le trait part de l'hôtel de la nuit précédente et finit à l'hôtel de la nuit suivante, quand ils sont dans la ville montrée
  const a = l.length ? departDuJour(JOUR_PLAN) : null, b = l.length ? retourDuJour(JOUR_PLAN) : null;
  const trace = [...(a ? [[a.lon, a.lat]] : []), ...pts, ...(b ? [[b.lon, b.lat]] : [])];
  src.setData({ type: "FeatureCollection", features: [
    ...(trace.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trace } }] : []),
    ...l.map((e, i) => ({ type: "Feature", properties: { rang: i + 1, id: e.lieu }, geometry: { type: "Point", coordinates: pts[i] } })),
  ] });
}
function cadrerJour(n) {
  const pts = lieuxDuJour(n).filter((e) => e.pos).map((e) => [e.pos[1], e.pos[0]]);
  if (!pts.length) return;
  for (const x of [departDuJour(n), retourDuJour(n)]) if (x) pts.push([x.lon, x.lat]);
  // une fiche ouverte avant laisse sa marge sur la carte : ajoutée à celle du cadrage, elle dépassait l'écran et MapLibre
  // refusait de bouger (essayé le 16/10/2026 : « Map cannot fit within canvas »)
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  if (pts.length === 1) return map.flyTo({ center: pts[0], zoom: Math.max(map.getZoom(), 14), duration: reduit ? 0 : 900 });
  const b = new maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p));
  // 27/10/2026 : sur téléphone, la marge du bas suit la vraie hauteur des boutons et du panneau ; la marge fixe de 380 px
  // laissait les points numérotés sous la barre des jours
  const haut = document.querySelector("header.chrome")?.getBoundingClientRect().bottom || 160;
  const bas = innerHeight - ($("#bas")?.getBoundingClientRect().top ?? innerHeight - 380);
  const marge = telephone ? { top: haut + 30, bottom: Math.min(bas + 30, innerHeight - haut - 140), left: 50, right: 60 } : { top: 120, bottom: 120, left: 660, right: 100 };
  map.fitBounds(b, { padding: marge, maxZoom: 15.5, duration: reduit ? 0 : 900 });
}

// ---------- le panneau du planning ----------
const metresEntre = (a, b) => Math.round(kmEntre(a, b) * 1000);
function texteDistance(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`; }

// ---------- les idées à côté du programme (27/10/2026) ----------
// Demandées par Schadrac le 27/10 : « des idées à côté de votre programme ». Quand un jour est choisi, le panneau propose jusqu'à
// 5 lieux de la carte à moins de 800 m à vol d'oiseau (environ 10 minutes à pied à 80 m par minute) d'un lieu prévu ce jour-là,
// ou de l'hôtel quand le jour est vide. Les sortes qu'ils aiment passent devant (GOUTS : jeux vidéo, toits, chicha, et les
// bonnes affaires qu'il a demandées le 17/10), puis les adresses où goûter une spécialité, puis les lieux de la sélection.
// Un lieu fermé ce jour-là est écarté, et deux lieux au plus d'une même sorte sont gardés. Tout est calculé dans la page, sans
// Claude : les idées marchent donc aussi pour une personne invitée à la carte.
const IDEES_M = 800, IDEES_MAX = 5, GOUT_THEME = { jeu: 3, toit: 3, chicha: 3, affaire: 3 };
function ideesACote(n, l) {
  if (!LIEUX_GEO) return [];
  // l'hôtel sert toujours de point de départ, pour les idées du soir : le premier essai ne donnait aucune idée le jour de la DMZ,
  // loin de tout lieu de la carte, ni le 22 à Tokyo, où rien n'est à moins de 800 m de l'hôtel de Kitashinjuku ; sous 3 idées,
  // le rayon passe donc à 1,5 km
  const ancres = l.filter((e) => e.pos && e.region === REGION).map((e) => ({ nom: e.nom, pos: e.pos }));
  const h = retourDuJour(n) || departDuJour(n);
  if (h) ancres.push({ nom: "votre hôtel", pos: [h.lat, h.lon] });
  if (!ancres.length) return [];
  const proches = trouverIdees(n, l, ancres, IDEES_M);
  return proches.length >= 3 ? proches : trouverIdees(n, l, ancres, 1500);
}
function trouverIdees(n, l, ancres, rayon) {
  const pris = new Set(l.map((e) => e.lieu)), parSorte = {};
  return LIEUX_GEO.features.filter((f) => f.properties.rang >= 2 && !pris.has(f.properties.id) && fermeLe(f.properties.id, n) !== "jour")
    .map((f) => {
      const p = f.properties, pos = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      let près = null;
      for (const a of ancres) { const m = metresEntre(a.pos, pos); if (!près || m < près.m) près = { m, nom: a.nom }; }
      return { id: p.id, sorte: p.theme || p.fam, m: près.m, pres: près.nom, score: (GOUT_THEME[p.theme] || 0) + (p.gout ? 2 : 0) + (p.niveau === 2 ? 1 : 0) - près.m / 400 };
    })
    .filter((x) => x.m <= rayon && PAR_ID[x.id]).sort((a, b) => b.score - a.score)
    .filter((x) => (parSorte[x.sorte] = (parSorte[x.sorte] || 0) + 1) <= 2).slice(0, IDEES_MAX);
}
function blocIdees(n, l) {
  const idees = ideesACote(n, l);
  if (!idees.length) return "";
  return `<h3 class="plan-idees-titre">Des idées à côté ${l.length ? "de ce jour et de votre hôtel" : "de votre hôtel"}</h3><ul class="plan-idees">${idees.map((x) => {
    const s = PAR_ID[x.id];
    return `<li><button type="button" class="plan-nom" data-idee="${echapper(x.id)}">${echapper(s.nom)}</button>
      <span class="plan-info">${s.catTxt ? echapper(s.catTxt) + ". " : ""}À ${texteDistance(x.m)} à vol d'oiseau de ${echapper(x.pres)}.</span>
      ${DB && !PLAN_LECTURE_SEULE ? `<button type="button" class="lien-spec" data-ajouter-idee="${echapper(x.id)}">Ajouter à ce jour</button>` : ""}</li>`;
  }).join("")}</ul>`;
}
function ouvrirPlanning(n) {
  const js = joursDe(REGION);
  JOUR_PLAN = n && js.some((j) => j.n === n) ? n : JOUR_PLAN && js.some((j) => j.n === JOUR_PLAN) ? JOUR_PLAN : jourParDefaut(REGION).n;
  $("#planning").hidden = false; $("#fiche").hidden = true; $("#liste").hidden = true; $("#legende").hidden = true; $("#idees").hidden = true; $("#specs").hidden = true;
  fermerVilles();
  afficherPlanning();
  dessinerPlan();
}
function fermerPlanning() { $("#planning").hidden = true; JOUR_PLAN = null; dessinerPlan(); }
function afficherPlanning() {
  const p = $("#planning"), n = JOUR_PLAN, j = jourDe(n), l = lieuxDuJour(n);
  const compte = (x) => lieuxDuJour(x.n).length;
  let etat;
  if (!DB) etat = PLAN_COPIE ? `Cette copie montre le planning tel qu'il était enregistré dans claude.ai le ${PLAN_COPIE}. Il se modifie seulement dans la carte ouverte dans claude.ai.`
    : "Le planning se lit et s'enregistre seulement quand la carte est ouverte dans claude.ai.";
  else if (!PLAN_PRET) etat = "Le planning se charge.";
  else if (PLAN_LECTURE_SEULE) etat = "Ce compte peut lire le planning sans pouvoir le modifier.";
  else etat = "Le planning est le même sur tous les appareils qui ouvrent cette carte.";
  const lignes = l.map((e, i) => {
    const s = PAR_ID[e.lieu], m = MARCHE[e.lieu], prec = l[i - 1];
    // le premier lieu du jour se mesure depuis l'hôtel : à pied quand il est à moins de 3 km, sinon à vol d'oiseau
    const dep = i === 0 && e.region === REGION ? departDuJour(n) || retourDuJour(n) : null, mh = dep?.principal ? MARCHE_HOTEL.lieux[e.lieu] : null;
    const ecart = prec?.pos && e.pos ? `À ${texteDistance(metresEntre(prec.pos, e.pos))} à vol d'oiseau du lieu précédent.`
      : mh ? `${mh[0]} min à pied de votre hôtel.` : dep && e.pos ? `À ${texteDistance(metresEntre([dep.lat, dep.lon], e.pos))} à vol d'oiseau de votre hôtel.` : "";
    const pied = m && m[0] > 0 ? `${m[0]} min à pied de ${m[4] ? "la station" : "la gare"} ${echapper(m[2])}.` : "";
    const autre = e.region !== REGION ? ` <span class="liste-cat">${echapper(ZONES[e.region]?.titre || "")}</span>` : "";
    return `<li><span class="plan-rang">${i + 1}</span>
      <div class="plan-texte">${e.heure ? `<span class="plan-heure">${echapper(e.heure)}</span> ` : ""}<button type="button" class="plan-nom" data-lieu="${echapper(e.lieu)}" data-region="${echapper(e.region)}">${echapper(e.nom)}</button>${autre}
        ${e.quoi ? `<span class="plan-quoi">${echapper(e.quoi)}</span>` : ""}
        <span class="plan-info">${[s?.catTxt ? echapper(s.catTxt) + "." : "", pied, ecart].filter(Boolean).join(" ")}</span>
        ${e.auto ? `<span class="plan-info">Prévu dans votre programme.</span>` : ""}
        ${fermeLe(e.lieu, n) ? `<span class="plan-ferme">${phraseFermeture(e.lieu, n)}</span>` : ""}</div>
      ${DB && !PLAN_LECTURE_SEULE && !e.auto ? `<div class="plan-boutons">
        <button type="button" data-monter="${i}" aria-label="Monter ${echapper(e.nom)}"${i === 0 || l[i - 1].auto ? " disabled" : ""}>↑</button>
        <button type="button" data-descendre="${i}" aria-label="Descendre ${echapper(e.nom)}"${i === l.length - 1 ? " disabled" : ""}>↓</button>
        <button type="button" data-retirer="${echapper(e.lieu)}" aria-label="Retirer ${echapper(e.nom)} du planning">×</button></div>` : ""}</li>`;
  }).join("");
  p.innerHTML = `<div class="liste-tete"><h2>Le planning de ${echapper(ZONES[REGION].titre)}</h2><button type="button" class="fermer-liste" aria-label="Fermer le planning">×</button></div>
    <div class="jours" role="group" aria-label="Choisir le jour">${joursDe(REGION).map((x) =>
      `<button type="button" data-n="${x.n}" aria-pressed="${x.n === n}"${fermesDuJour(x.n) ? ' class="jour-ferme"' : ""}>${etiquetteJour(x)}${compte(x) ? ` · ${compte(x)}` : ""}${fermesDuJour(x.n) ? ` · ${fermesDuJour(x.n)} fermé${fermesDuJour(x.n) > 1 ? "s" : ""}` : ""}</button>`).join("")}</div>
    <p class="liste-aide">${echapper(j?.texte || "")}${j?.alerte ? ` ${echapper(j.alerte)}` : ""}</p>
    ${COUCHER[REGION]?.[n] ? `<p class="liste-aide plan-coucher">Le soleil se couche à ${COUCHER[REGION][n]} ce jour-là.</p>` : ""}
    ${l.length ? phraseTrait(n) : ""}
    ${l.length ? `<ol class="plan-liste">${lignes}</ol><p><button type="button" class="btn" id="plan-cadrer">Montrer ce jour sur la carte</button></p>`
      : `<p class="liste-aide">Aucun lieu n'est encore prévu le ${echapper(titreJour(n).toLowerCase())}. Le bouton « Ajouter au planning » se trouve dans la fiche de chaque lieu.</p>`}
    ${blocIdees(n, l)}
    ${SAMPLE ? `<p><button type="button" class="btn btn-or" id="plan-idees">Demander au guide pour ce jour</button></p>` : ""}
    <p class="liste-aide" id="plan-etat" aria-live="polite">${etat}</p>`;
  p.querySelector(".fermer-liste").addEventListener("click", fermerPlanning);
  p.querySelectorAll(".jours button").forEach((b) => b.addEventListener("click", () => { JOUR_PLAN = +b.dataset.n; afficherPlanning(); dessinerPlan(); cadrerJour(JOUR_PLAN); }));
  p.querySelector("#plan-cadrer")?.addEventListener("click", () => cadrerJour(n));
  p.querySelector("#plan-idees")?.addEventListener("click", () => ouvrirIdees(n));
  p.querySelectorAll(".plan-nom[data-lieu]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.region !== REGION) return aller(`etape:${b.dataset.region}`);
    const s = PAR_ID[b.dataset.lieu]; if (s) ouvrirFiche(s);
  }));
  p.querySelectorAll("[data-idee]").forEach((b) => b.addEventListener("click", () => { const s = PAR_ID[b.dataset.idee]; if (s) ouvrirFiche(s); }));
  p.querySelectorAll("[data-ajouter-idee]").forEach((b) => b.addEventListener("click", () => { const s = PAR_ID[b.dataset.ajouterIdee]; if (s) ajouterAuPlan(s, n); }));
  p.querySelectorAll("[data-monter]").forEach((b) => b.addEventListener("click", () => deplacerDansPlan(n, +b.dataset.monter, -1)));
  p.querySelectorAll("[data-descendre]").forEach((b) => b.addEventListener("click", () => deplacerDansPlan(n, +b.dataset.descendre, 1)));
  p.querySelectorAll("[data-retirer]").forEach((b) => b.addEventListener("click", () => retirerDuPlan(b.dataset.retirer, n)));
}

// ---------- dans la fiche d'un lieu : les jours où il est prévu, et le bouton pour l'ajouter ----------
function planFiche(s) {
  const zone = $("#fiche .plan-fiche");
  if (!zone || !s || s.cat === "base" || s.cat === "hotel") return;
  const jours = joursDuLieu(s.id);
  const prevu = jours.map((x) => `<span class="plan-prevu">Prévu le ${echapper(titreJour(x).toLowerCase())}
      ${DB && !PLAN_LECTURE_SEULE ? `<button type="button" class="lien-spec" data-retirer-fiche="${x}">Retirer</button>` : ""}
      <button type="button" class="lien-spec" data-voir-jour="${x}">Voir ce jour</button></span>${fermeLe(s.id, x) ? `<p class="plan-ferme">${phraseFermeture(s.id, x)}</p>` : ""}`).join("");
  const choix = DB && !PLAN_LECTURE_SEULE ? `<details class="plan-ajout"><summary>Ajouter au planning</summary><div class="jours">${joursDe(REGION)
    .filter((x) => !jours.includes(x.n)).map((x) => { const k = fermeLe(s.id, x.n);
      return `<button type="button" data-ajouter="${x.n}"${k ? ' class="jour-ferme"' : ""}>${etiquetteJour(x)}${k === "jour" ? " · fermé" : k === "soir" ? " · fermé le soir" : ""}</button>`; }).join("")}</div></details>` : "";
  zone.innerHTML = prevu + choix;
  zone.querySelectorAll("[data-ajouter]").forEach((b) => b.addEventListener("click", () => ajouterAuPlan(s, +b.dataset.ajouter)));
  zone.querySelectorAll("[data-retirer-fiche]").forEach((b) => b.addEventListener("click", () => retirerDuPlan(s.id, +b.dataset.retirerFiche)));
  zone.querySelectorAll("[data-voir-jour]").forEach((b) => b.addEventListener("click", () => { ouvrirPlanning(+b.dataset.voirJour); cadrerJour(+b.dataset.voirJour); }));
}

function rafraichirPlan() {
  if (!$("#planning").hidden) afficherPlanning();
  if (!$("#journee").hidden && JOUR_FENETRE) ouvrirJournee(JOUR_FENETRE, true);
  const f = $("#fiche");
  if (!f.hidden && f.dataset.id) planFiche(PAR_ID[f.dataset.id]);
  dessinerPlan();
}

// 07/11/2026 : le bouton Planning ouvre d'abord la fenêtre de la journée, plus simple à lire que le panneau posé sur la carte
$("#planning-bouton").addEventListener("click", () => ($("#planning").hidden ? ouvrirJournee() : fermerPlanning()));
// la base partagée arrive après le premier affichage de la carte : le planning s'allume quand elle répond
(async () => {
  try { DB = window.claude?.use ? await window.claude.use("db") : null; } catch { DB = null; }
  if (!DB) {
    try {
      const r = await fetch("data/planning.json");
      if (r.ok) { const c = await r.json(); PLAN = (c.lieux || []).filter((e) => e && typeof e.jour === "number" && e.lieu); PLAN_COPIE = c.copie || ""; }
    } catch { /* sans copie du planning, seuls les lieux du programme s'affichent */ }
    PLAN_PRET = true; rafraichirPlan(); return;
  }
  DB.collection(COLLECTION_PLAN).onSnapshot((snap) => {
    PLAN = snap.docs.map((d) => d.data()).filter((e) => e && typeof e.jour === "number" && e.lieu);
    PLAN_PRET = true;
    rafraichirPlan();
  }, () => { DB = null; PLAN_PRET = true; rafraichirPlan(); });
})();

// ---------- Vos hôtels ----------
// Demandé le 16/10/2026 : « Commence par les hôtels. » Schadrac a envoyé six adresses. Elles sont rangées par ville dans
// raw/hotels.json, recopié ici par scripts/patch_hotels.py, avec la source de chaque position. L'hôtel « principal » d'une ville
// sert de point de départ aux distances de ses fiches ; l'hôtel de Gimpo attend ses dates et ne sert à aucune distance.
const HOTELS = {"seoul": [{"id": "hotel_seoul", "principal": true, "nom": "Onkoreastay", "nomConnu": true, "du": 4, "au": 10, "adresse": "230-13, Yulgok-ro, Jongno-gu, 03123 Séoul, Corée du Sud", "adresseLocale": "서울특별시 종로구 율곡로 230-13", "codePostal": "03123", "lat": 37.575415, "lon": 127.004146, "precision": 0, "position": "Position donnée par la fiche de l'hôtel Onkoreastay sur ViaMichelin, lue le 16/10/2026, qui donne aussi l'adresse 230-13 Yulgok-ro. Ce point est à environ 60 m de l'estimation faite avant d'avoir le nom de l'hôtel. Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026."}, {"id": "hotel_gimpo", "principal": false, "nom": "Royal Square Hotel Seoul", "nomConnu": true, "du": 26, "au": 27, "adresse": "30, Gonghang-daero, Gangseo-gu, 07623 Séoul, Corée du Sud", "adresseLocale": "서울특별시 강서구 공항대로 30", "codePostal": "07623", "lat": 37.5608281, "lon": 126.8103747, "precision": 0, "position": "Position exacte : OpenStreetMap connaît le Royal Square Hotel au numéro 30 de Gonghang-daero (Nominatim, 16/10/2026). Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026."}], "busan": [{"id": "hotel_busan", "principal": true, "nom": "Tinto Hotel Busan Station", "nomConnu": true, "du": 10, "au": 14, "adresse": "16-18, Beomil-ro 102beon-gil, Dong-gu, 48744 Busan, Corée du Sud", "adresseLocale": "부산광역시 동구 범일로102번길 16-18", "codePostal": "48744", "lat": 35.1386, "lon": 129.0603, "precision": 100, "position": "Position estimée à environ 100 m près. L'annuaire dorojuso.kr donne l'adresse 범일로102번길 16-18 avec le code postal 48744. Il ne donne pas de coordonnées. La rue Beomil-ro 102beon-gil part de la grande rue Beomil-ro vers l'est dans OpenStreetMap. Un numéro vaut environ 5 m depuis le début d'une petite rue coréenne en « gil » (page de la ville de Hanam sur les adresses par nom de rue : « 70×5m »). Les numéros pairs sont du côté droit de la rue. Le numéro 16 est donc à environ 80 m du début de la rue, du côté sud. Le complément -18 n'est expliqué par aucune de ces sources, donc le point reste approximatif. Les fiches Hotels.com du Tinto Hotel donnent la même adresse, sans coordonnées lisibles. Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026."}], "fukuoka": [{"id": "hotel_fukuoka", "principal": true, "nom": "Portside Avenue", "nomConnu": true, "du": 14, "au": 18, "adresse": "12-3 Tsushimakōji, Hakata-ku, Fukuoka, Japon", "adresseLocale": "福岡県福岡市博多区対馬小路12-3", "lat": 33.599602, "lon": 130.401031, "precision": 0, "position": "Position du numéro 12-3 donnée par le service d'adresses de l'Institut géographique du Japon (msearch.gsi.go.jp, 16/10/2026), qui écrit l'adresse 福岡県福岡市博多区対馬小路１２番３号. Les fiches Expedia et LIVE JAPAN de PortSide Avenue Hakata donnent la même adresse. Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026.", "natif": "ポートサイドアベニュー"}], "kobe": [{"id": "hotel_kobe", "principal": true, "nom": "Hotel CHIC", "nomConnu": true, "natif": "ホテルCHIC", "du": 18, "au": 21, "adresse": "4-4 Ajidoro-chō, Nada-ku, Kobe, Japon", "adresseLocale": "兵庫県神戸市灘区味泥町4-4", "lat": 34.703148, "lon": 135.22644, "precision": 0, "position": "Position du numéro 4-4 donnée par le service d'adresses de l'Institut géographique du Japon (msearch.gsi.go.jp, 16/10/2026), qui écrit l'adresse 兵庫県神戸市灘区味泥町４番４号. OpenStreetMap place le Hotel CHIC à 11 m de ce point. Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026."}], "tokyo": [{"id": "hotel_tokyo", "principal": true, "nom": "Mi-Hotel Kitashinjuku", "nomConnu": true, "du": 21, "au": 26, "adresse": "4-19-11 Kita-Shinjuku, Shinjuku-ku, Tokyo, Japon", "adresseLocale": "東京都新宿区北新宿4-19-11", "lat": 35.706734, "lon": 139.691605, "precision": 0, "position": "Position du numéro 4-19-11 donnée par le service d'adresses de l'Institut géographique du Japon (msearch.gsi.go.jp, 16/10/2026), qui écrit l'adresse 東京都新宿区北新宿四丁目１９番１１号. La fiche de Rakuten Travel (tour.l-tike.com) place « ミホテル 北新宿 » à cette adresse, sous le nom Japan Apartment Stay. Nom et nuits : application de réservation de Schadrac, capture du 16 octobre 2026.", "natif": "ミホテル 北新宿"}], "phrases": {"ko": {"texte": "호텔로 가 주세요.", "lecture": "hotel-ro ga juseyo", "sens": "conduisez-moi à l'hôtel s'il vous plaît", "source": "La phrase vient du guide de conversation coréen de Wikivoyage en anglais (Korean phrasebook, révision 5301909 du 1er juillet 2026). C'est la phrase « _____로 가 주세요. » de la partie Taxi, complétée par le mot 호텔 (hôtel) de la même page."}, "ja": {"texte": "ホテルまでお願いします。", "lecture": "hoteru made onegaishimasu", "sens": "conduisez-moi à l'hôtel s'il vous plaît", "source": "La phrase vient du guide de conversation japonais de Wikivoyage en anglais (Japanese phrasebook, révision 5379293 du 5 octobre 2026). C'est la phrase « _____までお願いします。 » de la partie Taxi, complétée par le mot ホテル (hôtel) de la même page."}}};
const PHRASES_TAXI = HOTELS.phrases;
// temps de marche depuis l'hôtel principal de la ville montrée (data/<ville>/marche-hotel.json, scripts/marche_hotel.py)
let MARCHE_HOTEL = { gare: null, lieux: {} };
const hotelPrincipal = (r) => (HOTELS[r] || []).find((h) => h.principal);
const posHotel = (r) => { const h = hotelPrincipal(r); return h ? [h.lat, h.lon] : null; };
// l'hôtel où l'on dort la nuit qui commence le jour n, dans la ville montrée : la nuit du 9 au 10 novembre est à Séoul
const hotelDeLaNuit = (n, r = REGION) => (HOTELS[r] || []).find((h) => h.du != null && h.du <= n && n < h.au);
const departDuJour = (n) => hotelDeLaNuit(n - 1), retourDuJour = (n) => hotelDeLaNuit(n);
const nuits = (h) => h.au - h.du;
const NOMBRES = ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
const COREE = new Set(["seoul", "busan"]);

// un hôtel devient un lieu de la carte : un carré doré avec un lit blanc, au premier rang
function lieuHotel(h, r) {
  const jour = h.du != null ? `Du ${h.du} au ${h.au} novembre` : "Dates à confirmer";
  return { id: h.id, nom: h.nom, natif: h.natif || "", cat: "hotel", catTxt: "Votre hôtel", lat: h.lat, lon: h.lon, hotel: h, region: r, jourTxt: jour,
    texte: h.du != null
      ? `Vous dormez dans cet hôtel du ${titreJour(h.du).toLowerCase()} au ${titreJour(h.au).toLowerCase()}, soit ${NOMBRES[nuits(h)] || nuits(h)} nuit${nuits(h) > 1 ? "s" : ""}.`
      : "Les nuits passées dans cet hôtel ne sont pas encore indiquées sur la carte.",
    source: `Adresse envoyée par Schadrac le 16 octobre 2026. ${h.position}${h.nomConnu ? "" : " Le nom de l'hôtel n'est pas encore connu."}` };
}
// les gares de base ne portent plus la phrase « son adresse n'apparaît pas encore » : les distances partent maintenant de l'hôtel
for (const [r, R] of Object.entries(REGIONS)) {
  if (!hotelPrincipal(r)) continue;
  for (const s of R.lieux) if (s.cat === "base") {
    s.catTxt = s.id === "hakata" ? "Quartier de la gare" : "Gare principale";
    s.texte = s.texte.replace(/\s*Votre hôtel est [^.]*\.\s*/, " ").replace(/\s*Les distances de cette région sont mesurées depuis cette gare\./, "").trim();
  }
}

// la ligne « Distance » d'une fiche : depuis l'hôtel de la ville, sinon depuis sa gare de base
function ligneDistance(pos) {
  const R = REGIONS[REGION], ph = posHotel(REGION);
  const d = (p) => kmEntre(p, pos).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  // avec la position en direct (copie en ligne) : la distance depuis l'endroit où vous êtes, quand vous êtes dans la même région
  const m = POS ? metresEntre([POS.lat, POS.lng], pos) : null;
  const ici = m != null && m < 60000 ? ` À ${texteDistance(m)} à vol d'oiseau de votre position.` : "";
  return ph ? `<dt>Distance</dt><dd>À ${d(ph)} km à vol d'oiseau de votre hôtel.${ici}</dd>`
    : `<dt>Distance</dt><dd>À ${d(LIEUX[R.base])} km à vol d'oiseau de ${R.baseNom}.${ici}</dd>`;
}
// le temps de marche depuis l'hôtel, pour un lieu à moins de 3 km de lui
function depuisHotel(s) {
  const m = MARCHE_HOTEL.lieux[s.id], h = hotelPrincipal(REGION);
  if (!m || !h) return "";
  const doute = h.precision ? ` La position de l'hôtel est estimée à environ ${h.precision} m près, donc ce temps peut varier d'une ou deux minutes.` : "";
  return `<dt>Depuis l'hôtel</dt><dd>${m[0]} minute${m[0] > 1 ? "s" : ""} à pied, soit ${m[1].toLocaleString("fr-FR")} m de rue.${doute}</dd>`;
}
// les lignes propres à la fiche d'un hôtel : ses adresses, la précision de sa position et sa gare la plus proche
function lignesHotel(s) {
  const h = s.hotel;
  if (!h) return "";
  const l = [`<dt>Adresse</dt><dd>${echapper(h.adresse)}</dd>`,
    `<dt>Adresse locale</dt><dd lang="${COREE.has(s.region) ? "ko" : "ja"}">${echapper(h.adresseLocale)}</dd>`];
  if (h.precision) l.push(`<dt>Position</dt><dd>Le point de la carte est estimé à environ ${h.precision} m près. Le bouton de navigation cherche l'adresse exacte.</dd>`);
  const g = s.region === REGION && h.principal ? MARCHE_HOTEL.gare : null;
  if (g) {
    const lieu = g[4] ? `station ${echapper(g[2])}` : `gare ${/^[aeiouâéèêîôûāēīōū]/i.test(g[2]) ? "d'" : "de "}${echapper(g[2])}`;
    l.push(`<dt>À pied</dt><dd>La ${lieu}${g[3] && g[3] !== g[2] ? ` (${echapper(g[3])})` : ""} est à ${g[0]} minutes à pied, soit ${g[1].toLocaleString("fr-FR")} m de rue.</dd>`);
  }
  const magasins = (UNIQLO_HOTEL[h.id] || []).map(lieuParId).filter(Boolean);
  if (magasins.length) {
    const d = (m) => kmEntre([h.lat, h.lon], [m.lat, m.lon]).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    l.push(`<dt>Uniqlo</dt><dd>${magasins.map((m, k) => `${k ? `${echapper(m.nom)} est` : `Le magasin le plus proche est ${echapper(m.nom)},`} à ${d(m)} km à vol d'oiseau. <button type="button" class="lien-lieu" data-id="${m.id}">Voir sa fiche</button>`).join("<br>")}</dd>`);
  }
  return l.join("");
}
// Demandé le 28/10/2026 (« on va acheter des vêtements là-bas ») et ajouté le 03/11/2026 : les magasins Uniqlo près de chaque
// hôtel, relevés sur map.uniqlo.com le 03/11/2026 (data/<ville>/autour.json, lieux « web_<ville>_uniqlo_… »)
const UNIQLO_HOTEL = {
  hotel_seoul: ["web_seoul_uniqlo_dongdaemun", "web_seoul_uniqlo_myeongdong"], hotel_gimpo: ["web_seoul_uniqlo_gimpo"],
  hotel_busan: ["web_busan_uniqlo_beomil"], hotel_fukuoka: ["web_fukuoka_uniqlo_tenjin"], hotel_kobe: ["web_kobe_uniqlo_hat"],
  hotel_tokyo: ["web_tokyo_uniqlo_takadanobaba", "web_tokyo_uniqlo_shinjuku"],
};
// le lien de navigation d'un hôtel cherche son adresse écrite, plus juste que le point de la carte quand celui-ci est estimé
function lienHotel(s) {
  const a = encodeURIComponent(s.hotel.adresseLocale);
  return COREE.has(s.region) ? `https://map.naver.com/p/search/${a}` : `https://www.google.com/maps/dir/?api=1&destination=${a}&travelmode=transit`;
}

// une phrase sous le jour du planning : d'où part le trait doré et où il finit
function phraseTrait(n) {
  const a = departDuJour(n), b = retourDuJour(n);
  if (!a && !b) return "";
  const p = a && b ? (a === b ? "Le trait doré de la carte part de votre hôtel et y revient." : `Le trait doré de la carte part de ${echapper(a.nom)} et finit à ${echapper(b.nom)}.`)
    : a ? "Le trait doré de la carte part de votre hôtel." : "Le trait doré de la carte finit à votre hôtel.";
  return `<p class="liste-aide">${p}</p>`;
}

// ---------- l'écran à montrer au chauffeur de taxi ----------
// un numéro comme 230-13 ou 4-19-11 ne se coupe jamais en fin de ligne (vu le 16/10/2026 : « 230- » puis « 13 » à la ligne)
const numerosEntiers = (t) => echapper(t).replace(/\d[\d-]*\d/g, (m) => `<span class="insecable">${m}</span>`);
function montrerChauffeur(s) {
  const h = s.hotel, langue = COREE.has(s.region) ? "ko" : "ja", ph = PHRASES_TAXI[langue];
  const c = $("#chauffeur");
  c.innerHTML = `<div class="chauffeur-carte" role="dialog" aria-modal="true" aria-labelledby="chauffeur-adresse">
      <p class="chauffeur-aide">Vous montrez cet écran au chauffeur de taxi.</p>
      ${h.nomConnu ? `<p class="chauffeur-nom" lang="${h.natif ? langue : "en"}">${echapper(h.natif || h.nom)}</p>` : ""}
      <p class="chauffeur-adresse" id="chauffeur-adresse" lang="${langue}">${numerosEntiers(h.adresseLocale)}</p>
      <p class="chauffeur-phrase" lang="${langue}">${echapper(ph.texte)}</p>
      <p class="chauffeur-sens">Cette phrase se lit « ${echapper(ph.lecture)} » et veut dire « ${echapper(ph.sens)} ».</p>
      <button type="button" class="btn chauffeur-fermer">Fermer</button>
      <p class="chauffeur-source">${echapper(ph.source)}</p></div>`;
  c.hidden = false;
  const fermer = () => { c.hidden = true; document.removeEventListener("keydown", echap); };
  const echap = (e) => { if (e.key === "Escape") fermer(); };
  document.addEventListener("keydown", echap);
  c.querySelector(".chauffeur-fermer").addEventListener("click", fermer);
  c.querySelector(".chauffeur-fermer").focus();
}
$("#chauffeur").addEventListener("click", (e) => { if (e.target.id === "chauffeur") e.target.hidden = true; });

// ---------- Les jours de fermeture ----------
// Demandé le 16/10/2026 : « ajouter les jours de fermeture, c'est super intéressant, c'est important ». Les 193 textes des fiches
// de ChatGPT et des horaires de Wikivoyage ont été relus un par un ; les 70 lieux fermés au moins un jour du voyage sont rangés
// dans raw/fermetures.json par scripts/fermetures.py, recopié ici par scripts/patch_fermetures.py.
// Un lieu sans règle ne donne aucune alerte : sa fiche ne cite aucune fermeture pendant le voyage, ou n'en cite aucune.
const FERMETURES = {"gyeongbokgung":{"jours":[2],"texte":"Mardi ; pendant le séjour à Séoul : 10 novembre 2026.","source":"chatgpt"},"cg_seoul_maji":{"jours":[1,2],"texte":"Lundi ; pendant le séjour : 9 novembre 2026. || Mardi ; pendant le séjour : 10 novembre 2026.","source":"chatgpt"},"cg_seoul_root_samcheong":{"jours":[1],"texte":"Lundi ; pendant le séjour : 9 novembre 2026.","source":"chatgpt"},"cg_seoul_ildeung_sikdang":{"jours":[1],"texte":"Lundi ; pendant votre séjour : 9 novembre 2026.","source":"chatgpt"},"cg_seoul_gwanghwamun_gukbap":{"jours":[0],"texte":"Dimanche ; pendant votre séjour : 8 novembre 2026.","source":"chatgpt"},"cg_seoul_entry55_sadang":{"jours":[1,2],"texte":"Lundi ; pendant le séjour : 9 novembre 2026. || Mardi ; pendant le séjour : 10 novembre 2026.","source":"chatgpt"},"cg_seoul_seoul_folk_flea_market":{"jours":[2],"texte":"Mardi ; pendant le séjour : 10 novembre 2026.","source":"chatgpt"},"cg_seoul_boramae_escalade":{"jours":[1],"texte":"Lundi ; pendant le séjour : 9 novembre 2026.","source":"chatgpt"},"sug_seoul_tokyo_jazz":{"jours":[0],"texte":"19 h à 3 h (fermé le dimanche)","source":"wv"},"sug_seoul_gupo_noodle":{"jours":[0],"texte":"11 h à 1 h 30 du lundi au samedi","source":"wv"},"sug_seoul_nambuk_tongil":{"jours":[0],"texte":"11 h à 21 h 30 du lundi au samedi","source":"wv"},"sug_seoul_matsumototei":{"jours":[1],"texte":"11 h 30 à 20 h 30 (fermé le lundi)","source":"wv"},"sug_seoul_non_space":{"jours":[3],"texte":"12 h à 21 h (fermé le mercredi)","source":"wv"},"cg_busan_ilmi_milmyeon":{"jours":[0],"texte":"Dimanche ; aucune fermeture régulière entre le 10 et le 14 novembre.","source":"chatgpt"},"cg_busan_sandong_wantang_jiaoziguan":{"dates":[14],"texte":"Deuxième et quatrième samedis du mois ; pendant le séjour : samedi 14 novembre 2026.","source":"chatgpt"},"cg_busan_subok_dwaeji_gukbap":{"jours":[0],"texte":"Dimanche ; aucune fermeture régulière entre le 10 et le 14 novembre.","source":"chatgpt"},"cg_busan_chess_154":{"jours":[0,1],"texte":"Dimanche et lundi ; aucune de ces fermetures régulières ne tombe entre le mardi 10 et le samedi 14 novembre.","source":"chatgpt"},"cg_busan_gwangalli_golbang":{"jours":[2],"texte":"Mardi ; pendant le séjour : 10 novembre 2026.","source":"chatgpt"},"cg_busan_alt_comma":{"jours":[2],"texte":"Mardi ; pendant le séjour : 10 novembre 2026.","source":"chatgpt"},"cg_busan_green_on_the_brown_pottery_busanjin":{"jours":[1],"texte":"Lundi ; aucune fermeture régulière entre le 10 et le 14 novembre.","source":"chatgpt"},"sug_busan_gyeongju_simsang":{"jours":[2],"texte":"11 h à 19 h (fermé le mardi)","source":"wv"},"sug_busan_sukyeong_sikdang":{"jours":[2],"texte":"11 h à 21 h (fermé le mardi)","source":"wv"},"cg_fukuoka_udon_taira":{"jours":[0],"dates":[23],"texte":"dimanche (15 novembre 2026) || jours fériés","source":"chatgpt"},"cg_fukuoka_karo_no_uron":{"jours":[2],"texte":"Mardi, donc le 17 novembre durant votre séjour.","source":"chatgpt"},"cg_fukuoka_hagakure_udon":{"jours":[0],"dates":[23],"texte":"dimanche (15 novembre 2026) || jours fériés; congés spéciaux non publiés","source":"chatgpt"},"cg_fukuoka_hakata_gomasabaya":{"soirs":[0],"texte":"Dimanche soir, donc le 15 novembre ; fermetures exceptionnelles : non trouvé.","source":"chatgpt"},"cg_fukuoka_jazzclub_kingfish":{"jours":[1],"texte":"Lundi, donc le 16 novembre.","source":"chatgpt"},"cg_fukuoka_jazz_cafe_backstage":{"jours":[0],"dates":[23],"texte":"Dimanche et jours fériés selon le guide municipal, donc le 15 novembre.","source":"chatgpt"},"cg_fukuoka_live_bar_michael":{"jours":[0,1],"texte":"dimanche (15 novembre 2026) || lundi (16 novembre 2026)","source":"chatgpt"},"cg_fukuoka_marche_uminonakamichi_sentier":{"jours":[2],"texte":"En 2026, fermeture le mardi du 10 novembre au 30 décembre, donc le 17 novembre durant votre séjour ; 31 décembre et 1er janvier.","source":"chatgpt"},"sug_fukuoka_umeyama_tetpei_shokudo":{"jours":[1],"texte":"11 h 30 à 21 h (fermé le lundi)","source":"wv"},"cg_kobe_grill_ippei_shinkaichi":{"jours":[3,4],"texte":"Mercredi et jeudi, donc les 18 et 19 novembre.","source":"chatgpt"},"cg_kobe_takadaya_kyomise":{"jours":[0],"dates":[23],"texte":"Dimanche et jours fériés, donc les 22 et 23 novembre.","source":"chatgpt"},"cg_kobe_ann_ann_chinois_kobe":{"jours":[0],"dates":[16],"texte":"Dimanche et troisième lundi du mois ; pendant votre séjour, dimanche 22 novembre.","source":"chatgpt"},"cg_kobe_ajikami_kobe":{"jours":[2],"texte":"Mardi ; le mardi 24 est après votre départ de Kobe.","source":"chatgpt"},"cg_kobe_grill_jujiya":{"jours":[0],"texte":"Dimanche et congés irréguliers, donc fermeture habituelle le 22 novembre.","source":"chatgpt"},"cg_kobe_savoy_east_gate":{"jours":[0],"dates":[2],"texte":"Dimanche et premier lundi du mois ; fermé le dimanche 22 novembre.","source":"chatgpt"},"cg_kobe_shiawasenomura_gym_badminton":{"dates":[17],"texte":"Troisième mardi du mois, soit le 17 novembre, avant votre arrivée ; autres mardis ouverture à 13:00.","source":"chatgpt"},"sug_kobe_otis":{"jours":[0],"texte":"12 h à 23 h du lundi au samedi","source":"wv"},"sug_kobe_sankanou":{"jours":[2],"texte":"17 h 30 à 23 h 30 (fermé le mardi)","source":"wv"},"sug_kobe_micchan":{"jours":[2],"texte":"11 h 30 à 14 h 30, puis 17 h 30 à 21 h 30 (fermé le mardi)","source":"wv"},"sug_kobe_tachikoma":{"jours":[4],"texte":"17 h à 23 h 30 (fermé le jeudi)","source":"wv"},"sug_kobe_mac_bar":{"jours":[0],"texte":"À partir de 18 h du lundi au samedi","source":"wv"},"sug_kobe_heisuiken":{"jours":[0,1],"texte":"10 h à 18 h du mardi au samedi","source":"wv"},"sug_kobe_iseya":{"jours":[1],"texte":"9 h à 19 h (fermé le lundi)","source":"wv"},"sug_kobe_yae":{"jours":[0],"texte":"17 h à 23 h du lundi au samedi","source":"wv"},"sug_kobe_chouya":{"jours":[0],"texte":"17 h 30 à 23 h du lundi au samedi","source":"wv"},"sug_kobe_fujiya":{"jours":[3],"texte":"11 h à 20 h (fermé le mercredi)","source":"wv"},"sug_kobe_torisoba_ota":{"jours":[1],"texte":"11 h à 22 h (fermé le lundi)","source":"wv"},"sug_kobe_senju":{"jours":[1],"texte":"11 h à 16 h, puis 17 h à minuit (fermé le lundi)","source":"wv"},"sug_kobe_asuka":{"jours":[0,3],"texte":"11 h à 22 h (fermé le mercredi et le dimanche)","source":"wv"},"sug_kobe_bar_hips":{"jours":[1],"texte":"22 h à 4 h (fermé le lundi)","source":"wv"},"sug_kobe_bar_rude_boy":{"jours":[2],"texte":"20 h à 4 h (fermé le mardi)","source":"wv"},"sug_kobe_bar_vagabond":{"jours":[0,1],"texte":"19 h à 2 h du mardi au samedi","source":"wv"},"suginami_anime":{"jours":[1],"dates":[24],"ouvert":[23],"texte":"Lundi, sauf lundi férié où le musée ouvre puis ferme le lendemain ; fermé le mardi 24 novembre 2026 selon cette règle. || 28 décembre–4 janvier.","source":"chatgpt"},"cg_tokyo_kanda_matsuya":{"jours":[0,1],"texte":"Dimanche et lundi, même férié selon le guide 2026 ; fermé le lundi 23 novembre.","source":"chatgpt"},"cg_tokyo_ninja_tokyo_otemachi":{"jours":[0],"dates":[23],"texte":"Dimanche et jours fériés japonais ; fermé le lundi 23 novembre 2026.","source":"chatgpt"},"cg_tokyo_kawada_ningyocho":{"jours":[0],"dates":[23],"texte":"Dimanche et jours fériés, donc lundi 23 novembre.","source":"chatgpt"},"cg_tokyo_asakusa_kaguwa":{"jours":[1],"texte":"Lundi selon le calendrier habituel ; le lundi 23 novembre est donc à écarter sauf ouverture exceptionnelle confirmée.","source":"chatgpt"},"sug_tokyo_marugo_tonkatsu":{"jours":[1,2],"texte":"11 h 30 à 14 h, puis 17 h à 20 h (fermé le lundi et le mardi)","source":"wv"},"sug_tokyo_sushi_isshin":{"jours":[0],"texte":"18 h à 22 h du lundi au samedi","source":"wv"},"sug_tokyo_sushisay_main_store":{"jours":[3],"texte":"8 h 30 à 14 h 30, puis 17 h à 20 h en semaine (fermé le mercredi)","source":"wv"},"sug_tokyo_nodaiwa":{"jours":[0],"texte":"11 h à 13 h 30, puis 17 h à 20 h du lundi au samedi","source":"wv"},"sug_tokyo_ristorante_da_nino":{"jours":[0],"texte":"11 h 30 à 14 h, puis 18 h à 23 h du lundi au samedi","source":"wv"},"sug_tokyo_murghi":{"jours":[5],"soirs":[4],"texte":"Fermé le vendredi et le jeudi soir","source":"wv"},"sug_tokyo_restaurant_kinoshita":{"jours":[1],"texte":"12 h à 14 h, puis 18 h à 21 h (fermé le lundi)","source":"wv"},"sug_tokyo_martiniburger":{"jours":[0,1],"texte":"11 h à 22 h du mardi au samedi","source":"wv"},"sug_tokyo_marone":{"jours":[1],"texte":"11 h à 1 h (fermé le lundi)","source":"wv"},"sug_tokyo_chanko_tomoegata":{"jours":[1],"texte":"11 h 30 à 14 h, puis 17 h à 23 h (fermé le lundi)","source":"wv"},"sug_tokyo_cigars_cafe_lwan":{"jours":[1],"texte":"11 h à 21 h du mardi au vendredi, 12 h à 20 h le week-end","source":"wv"},"web_seoul_aff_gwangjang":{"jours":[0],"texte":"Le marché ferme le dimanche, ses friperies aussi","source":"fiche"}};
// 0 = dimanche ; le 1er novembre 2026 est un dimanche
const jourSemaine = (n) => new Date(2026, 10, n).getDay();
// « jour » quand le lieu est fermé ce jour-là, « soir » quand il ferme seulement le soir, sinon null
function fermeLe(id, n) {
  const f = FERMETURES[id];
  if (!f || !n || f.ouvert?.includes(n)) return null;
  if (f.dates?.includes(n) || f.jours?.includes(jourSemaine(n))) return "jour";
  if (f.soirs?.includes(jourSemaine(n))) return "soir";
  return null;
}
function phraseFermeture(id, n) {
  const k = fermeLe(id, n), f = FERMETURES[id];
  if (!k) return "";
  const texte = echapper(f.texte.replace(/\.? \|\| /g, " ; ")).replace(/\.$/, "");
  return `Ce lieu est fermé ${k === "soir" ? "le soir " : ""}ce jour-là. ${f.source === "wv" ? "Ses horaires disent" : "Sa fiche dit"} « ${texte} ».`;
}
// combien de lieux prévus un jour sont fermés ce jour-là
const fermesDuJour = (n) => PLAN.filter((e) => e.jour === n && fermeLe(e.lieu, n)).length;

// ---------- Les outils du voyage : l'application, le convertisseur et le traducteur (outils.js) ----------
// Le pays de la carte sert de choix par défaut hors des dates du voyage : la langue du traducteur et la monnaie du convertisseur.
preparerOutils({
  pays: () => {
    const p = ICI.niveau >= 2 && ICI.etape ? PAYS_DE[ICI.etape] : ICI.niveau === 1 ? ICI.pays : null;
    return p === "coree" ? "kr" : p === "japon" ? "jp" : null;
  },
});

// ---------- la fenêtre de la journée et le mode d'emploi (07/11/2026) ----------
// Demandés par Schadrac le 7/11 : il trouvait la carte « compliquée d'accès », jusqu'au planning. La fenêtre s'ouvre seule au premier
// lancement de chaque jour, et le bouton Planning la rouvre. Elle montre les étapes du jour dans l'ordre, avec l'heure et ce qu'il y a
// à faire, toutes villes confondues, sans passer par le panneau de la carte. Le mode d'emploi s'ouvre depuis cette fenêtre et depuis
// le bouton rond « ? ».
let JOUR_FENETRE = null;
const etapesDuJour = (n) => [...planAuto().filter((a) => a.jour === n && !PLAN.some((e) => e.jour === n && e.lieu === a.lieu)), ...PLAN.filter((e) => e.jour === n)]
  .sort((a, b) => (a.auto === b.auto ? (a.ordre ?? 0) - (b.ordre ?? 0) : a.auto ? -1 : 1));
function jourDuMoment() {
  const d = surPlace(), dans = d.an === 2026 && d.mois === 10;
  return (dans && JOURS.find((j) => j.n === d.jour)) || (dans && JOURS.find((j) => j.n > d.jour)) || (dans && d.jour > 27 ? JOURS[JOURS.length - 1] : JOURS[0]);
}
function fermerJournee() { $("#journee").hidden = true; document.removeEventListener("keydown", echapJournee); }
function echapJournee(e) { if (e.key === "Escape") fermerJournee(); }
function montrerJournee() {
  const f = $("#journee");
  if (f.hidden) { f.hidden = false; document.addEventListener("keydown", echapJournee); }
  f.querySelector(".boite").scrollTop = 0;
}
function ouvrirJournee(n, garder = false) {
  const j = jourDe(n) || jourDuMoment(), f = $("#journee"), b = f.querySelector(".boite");
  JOUR_FENETRE = j.n;
  const i = JOURS.indexOf(j), prec = JOURS[i - 1], suiv = JOURS[i + 1], d = surPlace();
  const auj = d.an === 2026 && d.mois === 10 && d.jour === j.n, l = etapesDuJour(j.n);
  const lignes = l.map((e, k) => `<li><span class="plan-rang">${k + 1}</span><div class="plan-texte">
      <span>${e.heure ? `<span class="plan-heure">${echapper(e.heure)}</span> ` : ""}<button type="button" class="plan-nom" data-lieu="${echapper(e.lieu)}" data-region="${echapper(e.region || "")}">${echapper(e.nom)}</button></span>
      ${e.quoi ? `<span class="plan-quoi">${echapper(e.quoi)}</span>` : ""}</div></li>`).join("");
  const vide = DB && !PLAN_PRET ? "Le planning se charge." : "Aucune étape n'est encore prévue ce jour-là. Le bouton « Ajouter au planning » de chaque fiche sert à en placer une.";
  b.innerHTML = `<div class="journee-tete"><div><p class="journee-sur">${auj ? "Aujourd'hui" : "Votre journée"} · ${echapper(j.ville)}</p>
      <h2 id="journee-titre">${echapper(j.titre || titreJour(j.n))}</h2></div>
      <button type="button" class="fermer-liste" data-fermer aria-label="Fermer la fenêtre">×</button></div>
    <div class="journee-nav">${prec ? `<button type="button" class="btn" data-n="${prec.n}">‹ ${etiquetteJour(prec)}</button>` : "<span></span>"}
      ${suiv ? `<button type="button" class="btn" data-n="${suiv.n}">${etiquetteJour(suiv)} ›</button>` : ""}</div>
    <p class="liste-aide">${echapper(j.texte || "")}${j.alerte ? ` ${echapper(j.alerte)}` : ""}</p>
    ${j.region ? `<p><button type="button" class="btn btn-or" data-carte>Voir ce jour sur la carte</button></p>` : ""}
    ${l.length ? `<ol class="plan-liste">${lignes}</ol><p class="liste-aide">Le nom d'une étape ouvre sa fiche, avec son adresse, ses horaires et son trajet.</p>` : `<p class="liste-aide">${vide}</p>`}
    ${evenementsJour(j)}
    <div class="journee-boutons"><button type="button" class="btn" data-aide>Comment se servir de la carte</button></div>`;
  b.querySelector("[data-fermer]").addEventListener("click", fermerJournee);
  b.querySelectorAll(".journee-nav [data-n]").forEach((x) => x.addEventListener("click", () => ouvrirJournee(+x.dataset.n)));
  b.querySelector("[data-carte]")?.addEventListener("click", () => voirJourSurCarte(j));
  b.querySelector("[data-aide]").addEventListener("click", ouvrirAide);
  b.querySelectorAll(".plan-nom[data-lieu]").forEach((x) => x.addEventListener("click", () => ouvrirEtape(x.dataset.lieu, x.dataset.region)));
  if (!garder || f.hidden) montrerJournee();
}
async function voirJourSurCarte(j) {
  fermerJournee();
  const r = j.region === REGION || j.regions?.includes(REGION) ? REGION : j.region;
  if (r !== REGION) await aller(`etape:${r}`);
  ouvrirPlanning(j.n); cadrerJour(j.n);
}
async function ouvrirEtape(id, r) {
  fermerJournee();
  if (r && r !== REGION) await aller(`etape:${r}`);
  if (PAR_ID[id]) ouvrirFiche(PAR_ID[id]);
}
function journeeAuLancement() {
  const d = surPlace(), cle = `journee:vue:${d.an}-${d.mois}-${d.jour}`;
  try { if (localStorage.getItem(cle)) return; localStorage.setItem(cle, "1"); } catch { /* sans stockage, la fenêtre s'ouvre à chaque lancement */ }
  ouvrirJournee();
}
const AIDE = [
  ["Votre journée", "La fenêtre de la journée s'ouvre seule au premier lancement de chaque jour. Elle contient les étapes du jour dans l'ordre, avec l'heure et le programme de chacune, puis les illuminations, les fêtes et les marchés de la ville ce jour-là. Le bouton Planning situé en bas de l'écran la rouvre à tout moment, et les flèches passent d'un jour à l'autre."],
  ["Le jour sur la carte", "Le bouton « Voir ce jour sur la carte » numérote les étapes et les relie par un trait doré depuis votre hôtel. La barre « Jour » au bas de l'écran montre de la même façon chaque jour passé dans la ville. Le panneau qui s'ouvre alors sert à changer l'ordre des étapes ou à en retirer une."],
  ["La fiche d'un lieu", "Le nom d'une étape ou un point touché sur la carte ouvre la fiche du lieu. La fiche contient la photo, l'adresse, les horaires, le trajet et les sources du lieu. Le bouton « Ajouter au planning » de la fiche sert à placer le lieu dans le jour de votre choix. Sur un téléphone, une fiche ouverte cache les boutons du bas, et la croix de la fiche les fait revenir."],
  ["Les lieux affichés", "Le choix Programme affiche seulement les lieux prévus et vos hôtels. Le choix Sélection ajoute les adresses conseillées, et le choix Tout affiche chaque lieu de la carte. Les pastilles de couleur apparaissent avec les choix Sélection et Tout. Une pastille comme Visites, Restaurants ou Boutiques sert à garder une seule sorte de lieux à l'écran."],
  ["Les autres villes du voyage", "Le nom de la ville écrit en haut de l'écran ouvre la liste des villes du voyage. Le fil « Voyage › Corée › Séoul » placé au-dessus sert à revenir en arrière."],
  ["Les outils", "Les boutons ronds en haut à droite servent à traduire un texte, à convertir les euros en wons ou en yens, à montrer votre position et à recentrer la carte. Le bouton « ? » rouvre ce mode d'emploi."],
  ["Les mises à jour", "Une modification faite par Claude apparaît après une fermeture puis une réouverture de l'application."],
];
function ouvrirAide() {
  const b = $("#journee").querySelector(".boite");
  b.innerHTML = `<div class="journee-tete"><div><p class="journee-sur">Mode d'emploi</p><h2 id="journee-titre">Comment se servir de la carte</h2></div>
      <button type="button" class="fermer-liste" data-fermer aria-label="Fermer la fenêtre">×</button></div>
    <ol class="aide-liste">${AIDE.map(([t, x]) => `<li><h3>${echapper(t)}</h3><p>${echapper(x)}</p></li>`).join("")}</ol>
    <div class="journee-boutons"><button type="button" class="btn btn-or" data-retour>Voir votre journée</button></div>`;
  b.querySelector("[data-fermer]").addEventListener("click", fermerJournee);
  b.querySelector("[data-retour]").addEventListener("click", () => ouvrirJournee(JOUR_FENETRE));
  montrerJournee();
}
$("#aide-bouton").addEventListener("click", ouvrirAide);
$("#journee").addEventListener("click", (e) => { if (e.target.id === "journee") fermerJournee(); });

// ---------- l'écran du téléphone moins chargé (07/11/2026) ----------
// Une fiche ou un panneau ouvert cache les rangées de boutons du bas, pour prendre la hauteur de l'écran (index.html,
// body.panneau-ouvert). La vue Programme cache les pastilles de sorte : elle montre peu de lieux, donc le tri ne sert pas.
const PANNEAUX = ["fiche", "liste", "legende", "idees", "specs", "planning"].map((i) => $("#" + i)).filter(Boolean);
const majPanneau = () => {
  document.body.classList.toggle("panneau-ouvert", PANNEAUX.some((p) => !p.hidden));
  document.body.classList.toggle("plan-ouvert", !$("#planning").hidden);
};
new MutationObserver(majPanneau).observe($("#bas"), { attributes: true, attributeFilter: ["hidden"], subtree: true });
document.body.classList.toggle("vue-programme", vue === "programme");
majPanneau();

// ---------- les événements du voyage (08/11/2026) ----------
// Demandés par Schadrac le 8/11 : « tout ce qui est illumination, feux d'artifice, événements spéciaux », en Corée et au Japon.
// data/evenements.json liste chaque événement avec son lieu, sa ville et ses dates (du, au) ; la fiche du lieu les montre, et la
// fenêtre de la journée montre ceux de la ville ce jour-là. Un événement sans date de fin (« au » absent) court jusqu'à la fin du voyage.
let EVENEMENTS = [];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
fetch("data/evenements.json").then((r) => (r.ok ? r.json() : [])).then((l) => {
  EVENEMENTS = Array.isArray(l) ? l : [];
  if (!$("#journee").hidden && JOUR_FENETRE) ouvrirJournee(JOUR_FENETRE, true);
}).catch(() => { /* sans le fichier, les fiches et la fenêtre restent sans événements */ });
function evenementsFiche(s) {
  const l = EVENEMENTS.filter((e) => e.lieu === s.id);
  if (!l.length) return "";
  return `<dt>Pendant votre voyage</dt><dd><ul class="fiche-dedans">${l.map((e) => `<li><b>${echapper(e.titre)}.</b> ${echapper(e.quand)} ${echapper(e.texte)}
    ${e.source ? `<span class="source">Sources : ${e.source}</span>` : ""}</li>`).join("")}</ul></dd>`;
}
function evenementsJour(j) {
  const iso = `2026-11-${String(j.n).padStart(2, "0")}`, villes = [j.region, ...(j.regions || [])].filter(Boolean);
  const l = EVENEMENTS.filter((e) => villes.includes(e.region) && e.du <= iso && (!e.au || iso <= e.au));
  if (!l.length) return "";
  return `<h3 class="journee-ev">Les événements ce jour-là</h3><ul class="journee-ev-liste">${l.map((e) => `<li>
      <button type="button" class="plan-nom" data-lieu="${echapper(e.lieu)}" data-region="${echapper(e.region)}">${echapper(e.titre)}</button>
      <span class="plan-quoi">${echapper(e.nom)}. ${echapper(e.quand)}</span></li>`).join("")}</ul>`;
}
