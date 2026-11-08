// Contenu du voyage. Le programme vient des messages de Schadrac dans la conversation « Clarifier Voyage ».
// Les textes des lieux autour de Fukuoka reprennent ce que ChatGPT a écrit dans cette conversation, avec les sources qu'il citait.
// Les jours de la semaine ont été recalculés pour novembre 2026.

export const BASES = [
  { id: "seoul", nom: "Séoul", natif: "서울", quand: "4 → 10 nov., 26 → 27 nov.", pays: "kr", region: "seoul" },
  { id: "busan", nom: "Busan", natif: "부산", quand: "10 → 14 nov.", pays: "kr", region: "busan" },
  { id: "hakata", nom: "Fukuoka", natif: "福岡", quand: "14 → 18 nov.", pays: "jp", region: "fukuoka" },
  { id: "sannomiya", nom: "Kobe", natif: "神戸", quand: "18 → 21 nov.", pays: "jp", region: "kobe" },
  { id: "tokyo", nom: "Tokyo", natif: "東京", quand: "21 → 26 nov.", pays: "jp", region: "tokyo" },
];

export const EXCURSIONS = [
  { id: "imjingak", nom: "DMZ", quand: "6 nov." },
  { id: "suwon", nom: "Suwon", quand: "9 nov." },
  { id: "nami", nom: "Île de Nami", quand: "5 nov." },
  { id: "morningcalm", nom: "Jardin Morning Calm", quand: "jeudi 5 novembre" },
  { id: "daereungwon", nom: "Gyeongju", quand: "11 nov." },
  { id: "hiroshima", nom: "Hiroshima", quand: "un jour à placer" },
  { id: "okayama", nom: "Okayama", quand: "un jour à placer" },
  { id: "rokko", nom: "Mont Rokko", quand: "21 nov." },
  { id: "kamakura", nom: "Kamakura", quand: "un jour à placer" },
];

export const REPERES = [{ id: "fuji", nom: "Mont Fuji" }];

// Trajets : suites de gares (coordonnées OpenStreetMap). jour = jour du trajet ; 0 = jour pas encore fixé.
export const TRAJETS = [
  { id: "ktx", jour: 10, type: "train", nom: "KTX 031 Séoul → Busan, 11 h 58 → 14 h 42",
    gares: ["seoul", "gwangmyeong", "cheonan_asan", "osong", "daejeon", "gimcheon_gumi", "dongdaegu", "gyeongju_gare", "ulsan", "busan"] },
  { id: "vol", jour: 14, type: "avion", nom: "Avion Busan → Fukuoka", gares: ["busan", "hakata"] },
  { id: "sanyo", jour: 18, type: "train", nom: "Shinkansen Fukuoka → Kobe",
    gares: ["hakata", "kokura", "shin_shimonoseki", "shin_yamaguchi", "tokuyama", "shin_iwakuni", "hiroshima", "mihara", "fukuyama", "okayama", "himeji", "nishi_akashi", "shin_kobe"] },
  { id: "tokaido", jour: 21, type: "train", nom: "Shinkansen Kobe → Tokyo",
    gares: ["shin_kobe", "shin_osaka", "kyoto", "maibara", "gifu_hashima", "nagoya", "mikawa_anjo", "toyohashi", "hamamatsu", "kakegawa", "shizuoka", "shin_fuji", "mishima", "atami", "odawara", "shin_yokohama", "shinagawa", "tokyo"] },
  { id: "dmz", jour: 6, type: "sortie", gares: ["seoul", "imjingak"] },
  { id: "suwon", jour: 9, type: "sortie", gares: ["seoul", "suwon"] },
  { id: "nami", jour: 5, type: "sortie", gares: ["seoul", "nami", "morningcalm"] },
  { id: "gyeongju", jour: 11, type: "sortie", gares: ["busan", "daereungwon"] },
  { id: "rokko", jour: 21, type: "sortie", gares: ["sannomiya", "rokko"] },
  { id: "kamakura", jour: 0, type: "sortie", gares: ["tokyo", "kamakura"] },
];

const J = (n, js, ville, pays, focus, texte, extra = {}) => ({ n, js, ville, pays, focus, texte, ...extra });
export const JOURS = [
  J(3, "mar", "Paris", "fr", null, "Vous partez de Paris vers Séoul.", { titre: "Mardi 3 novembre" }),
  J(4, "mer", "Séoul", "kr", "seoul", "Vous arrivez à Séoul. Votre premier hôtel est à Séoul jusqu'au 10 novembre.", { region: "seoul", titre: "Mercredi 4 novembre" }),
  J(5, "jeu", "Nami", "kr", "nami", "Vous partez pour la journée à Gapyeong. Vous entrez sur l'île de Nami par la tyrolienne le matin. Un taxi vous emmène ensuite au jardin Morning Calm pour l'après-midi.", { region: "seoul", lieu: "nami", titre: "Jeudi 5 novembre", trajet: "nami" }),
  J(6, "ven", "DMZ", "kr", "imjingak", "Vous partez pour la journée à la DMZ, la zone démilitarisée qui sépare les deux Corées.", { region: "seoul", lieu: "imjingak", titre: "Vendredi 6 novembre", trajet: "dmz" }),
  J(7, "sam", "Séoul", "kr", "seoul", "Vous passez la journée à Séoul. Vous avez noté Gyeongbokgung, Hongdae, Myeongdong le soir, Gangnam, la muraille de Séoul et le parc Naksan.", { region: "seoul", titre: "Samedi 7 novembre" }),
  // 08/11/2026 : Suwon passe au lundi, car il pleut toute la journée du dimanche ; le dimanche devient une journée en ville à partir de midi
  J(8, "dim", "Séoul", "kr", "seoul", "Il pleut toute la journée, donc vous passez l'après-midi en ville à partir de midi : le palais, le temple Jogyesa, puis les vêtements d'occasion.", { region: "seoul", titre: "Dimanche 8 novembre" }),
  J(9, "lun", "Suwon", "kr", "suwon", "Vous visitez Suwon, votre dernière journée avant le départ pour Busan : la forteresse de Hwaseong et la ville à l'intérieur de ses murs.", { region: "seoul", lieu: "suwon", titre: "Lundi 9 novembre", trajet: "suwon" }),
  J(10, "mar", "Busan", "kr", "busan", "Le KTX 031 part de la gare de Séoul à 11 h 58 et arrive à la gare de Busan à 14 h 42. Vos places sont les 10A et 10B de la voiture 6. Votre deuxième hôtel est à Busan.", { region: "busan", titre: "Mardi 10 novembre", trajet: "ktx" }),
  J(11, "mer", "Gyeongju", "kr", "daereungwon", "Vous allez à Gyeongju : les tombes royales, le pont Woljeonggyo, le village hanok et la grotte de Seokguram.", { region: "busan", lieu: "daereungwon", titre: "Mercredi 11 novembre", trajet: "gyeongju" }),
  J(12, "jeu", "Busan", "kr", "busan", "Vous passez la journée à Busan. Le programme de cette journée reste à choisir.", { region: "busan", titre: "Jeudi 12 novembre" }),
  J(13, "ven", "Busan", "kr", "busan", "Vous passez la journée à Busan. Le programme de cette journée reste à choisir.", { region: "busan", titre: "Vendredi 13 novembre" }),
  J(14, "sam", "Fukuoka", "jp", "hakata", "Vous prenez l'avion de Busan à Fukuoka. Le vol part à 17 h 55 et arrive à 18 h 55.", { region: "fukuoka", titre: "Samedi 14 novembre", trajet: "vol" }),
  J(15, "dim", "Fukuoka", "jp", "hakata", "Vous passez la journée autour de Fukuoka. La sortie de ce jour n'est pas encore choisie.", { region: "fukuoka", titre: "Dimanche 15 novembre" }),
  J(16, "lun", "Fukuoka", "jp", "hakata", "Vous passez la journée autour de Fukuoka. La sortie de ce jour n'est pas encore choisie.", { region: "fukuoka", titre: "Lundi 16 novembre" }),
  J(17, "mar", "Fukuoka", "jp", "hakata", "Vous passez la journée autour de Fukuoka. La sortie de ce jour n'est pas encore choisie.", { region: "fukuoka", titre: "Mardi 17 novembre",
    alerte: "La location de vélos de Shikanoshima et le musée du manga de Kitakyushu sont fermés ce mardi." }),
  J(18, "mer", "Kobe", "jp", "sannomiya", "Le Shinkansen vous emmène de Fukuoka à Kobe. Votre quatrième hôtel est à Kobe.", { region: "kobe", titre: "Mercredi 18 novembre", trajet: "sanyo" }),
  J(19, "jeu", "Kobe", "jp", "sannomiya", "Vous passez la journée autour de Kobe. Hiroshima et Okayama n'ont pas encore de jour fixé.", { region: "kobe", titre: "Jeudi 19 novembre" }),
  J(20, "ven", "Kobe", "jp", "sannomiya", "Vous passez la journée autour de Kobe. Hiroshima et Okayama n'ont pas encore de jour fixé.", { region: "kobe", titre: "Vendredi 20 novembre" }),
  // le jour du départ compte pour les deux villes : le mont Rokko le matin à Kobe, le soir à Tokyo
  J(21, "sam", "Kobe puis Tokyo", "jp", "rokko", "Vous montez au mont Rokko le matin, puis le Shinkansen vous emmène de Kobe à Tokyo avec vos bagages. Votre cinquième hôtel est à Tokyo.", { region: "kobe", regions: ["kobe", "tokyo"], lieu: "rokko", titre: "Samedi 21 novembre", trajet: "tokaido" }),
  J(22, "dim", "Tokyo", "jp", "tokyo", "Vous passez la journée à Tokyo. Kamakura est prévu pendant ce séjour, sans jour fixé.", { region: "tokyo", titre: "Dimanche 22 novembre" }),
  J(23, "lun", "Tokyo", "jp", "tokyo", "Vous passez la journée à Tokyo. Kamakura est prévu pendant ce séjour, sans jour fixé.", { region: "tokyo", titre: "Lundi 23 novembre",
    alerte: "Ce lundi est un jour férié au Japon." }),
  J(24, "mar", "Tokyo", "jp", "tokyo", "Vous passez la journée à Tokyo. Kamakura est prévu pendant ce séjour, sans jour fixé.", { region: "tokyo", titre: "Mardi 24 novembre" }),
  J(25, "mer", "Tokyo", "jp", "tokyo", "Vous passez la journée à Tokyo. Kamakura est prévu pendant ce séjour, sans jour fixé.", { region: "tokyo", titre: "Mercredi 25 novembre" }),
  // le jour du départ compte pour les deux villes : le matin à Tokyo, le soir à Séoul
  J(26, "jeu", "Séoul", "kr", "seoul", "Vous quittez Tokyo pour Séoul. Votre dernier hôtel est près de l'aéroport de Gimpo.", { region: "seoul", regions: ["tokyo", "seoul"], titre: "Jeudi 26 novembre" }),
  J(27, "ven", "Séoul", "kr", "seoul", "Vous repartez de Séoul.", { region: "seoul", titre: "Vendredi 27 novembre" }),
];

// Région de Fukuoka : lieux, textes repris de la conversation avec ChatGPT, sauf mention contraire.
export const FUKUOKA = [
  { id: "hakata", nom: "Hakata", natif: "博多", cat: "base", photo: "kushida", catTxt: "Votre base",
    texte: "Votre hôtel est à Fukuoka, mais son adresse n'apparaît pas dans la conversation. Le vieux quartier de Hakata relie à pied les temples Shōfuku-ji et Tōchō-ji et le sanctuaire Kushida-jinja.",
    acces: "Tous les trajets ci-dessous partent de la gare de Hakata.", foule: "Animé le soir, calme dans le vieux quartier." },
  { id: "kokusai_center", nom: "Sumo, tournoi de Kyushu", natif: "九州場所", cat: "sortie", photo: "kokusai_center", catTxt: "Sortie",
    texte: "Le tournoi de sumo de Kyushu a lieu au Fukuoka Kokusai Center du 8 au 22 novembre 2026, donc pendant vos trois jours à Fukuoka.",
    acces: "À quelques minutes de Hakata.", foule: "Les billets en prévente se sont vendus dès le premier jour.",
    source: "Dates : ville de Fukuoka. Prévente : Kumanichi. Vérifié le 15 octobre 2026." },
  { id: "karatsu_chateau", nom: "Karatsu", natif: "唐津", cat: "mer", photo: "karatsu_chateau", catTxt: "Mer et histoire",
    texte: "Le château, reconstruit en 1966, domine directement la baie. La pinède de Nijinomatsubara longe la côte sur environ 5 km. C'est la sortie la plus recommandée pour vous autour de Fukuoka.",
    acces: "Ligne JR Chikuhi depuis Hakata, environ 1 h 20 à 1 h 35.", foule: "Faible à modérée hors festival (le Karatsu Kunchi a lieu début novembre)." },
  { id: "nanatsugama", nom: "Yobuko et Nanatsugama", natif: "呼子・七ツ釜", cat: "mer", photo: "nanatsugama", catTxt: "Mer",
    texte: "Les grottes marines de Nanatsugama se visitent en bateau depuis le port de Yobuko. C'est une de vos quatre envies pour Fukuoka.",
    acces: "Aller-retour estimé à 4 h 30 à 5 h 40 depuis Hakata, avec des bus locaux après Karatsu.", foule: "Faible." },
  { id: "shikanoshima", nom: "Shikanoshima", natif: "志賀島", cat: "mer", photo: "shikanoshima", catTxt: "Mer et vélo",
    texte: "Une petite île avec un sanctuaire des marins, une plage et un observatoire. On en fait le tour à vélo, environ 10 km avec quelques montées.",
    acces: "Ferry d'environ 30 minutes depuis le port de Hakata.", foule: "Faible à modérée hors été.",
    alerte: "La location de vélos est fermée le mardi, donc le 17 novembre." },
  { id: "dazaifu", nom: "Dazaifu", natif: "太宰府", cat: "histoire", photo: "dazaifu", catTxt: "Histoire",
    texte: "Le sanctuaire Dazaifu Tenmangū est très fréquenté. Mieux vaut arriver tôt puis partir vers le temple Kanzeon-ji ou le sanctuaire Kamado.",
    acces: "Train Nishitetsu depuis Tenjin, environ 30 minutes.", foule: "Forte au sanctuaire, surtout le week-end." },
  { id: "homan", nom: "Mont Hōman", natif: "宝満山", cat: "marche", photo: "homan", catTxt: "Randonnée",
    texte: "Le sentier part près du sanctuaire Kamado et monte par de nombreux escaliers de pierre jusqu'à 829 m. La JNTO annonce environ 2 h 30 jusqu'au sommet.",
    acces: "Bus Mahoroba depuis Dazaifu jusqu'à Uchiyama.", foule: "Modérée, plus forte les beaux week-ends d'automne." },
  { id: "nanzoin", nom: "Nanzoin", natif: "南蔵院", cat: "histoire", photo: "nanzoin", catTxt: "Temple",
    texte: "Un temple au grand Bouddha couché. C'est une de vos quatre envies pour Fukuoka.",
    acces: "Train depuis Hakata jusqu'à la gare de Kido-Nanzoin-mae, au pied du temple (OpenStreetMap).", foule: "Non connue.",
    alerte: "Les trépieds, les stabilisateurs et les longues séances photo y sont interdits." },
  { id: "yoshinogari", nom: "Yoshinogari", natif: "吉野ヶ里", cat: "histoire", photo: "yoshinogari", catTxt: "Archéologie",
    texte: "Un grand parc archéologique. La plupart des bâtiments visibles sont des reconstitutions. C'est une de vos quatre envies pour Fukuoka.",
    acces: "Train depuis Hakata, puis marche depuis la gare.", foule: "Non connue." },
  { id: "mojiko", nom: "Mojiko et Kokura", natif: "門司港・小倉", cat: "sortie", photo: "mojiko", catTxt: "Ville et manga",
    texte: "La gare de Mojiko date de 1914. Un tunnel piéton passe sous le détroit de Kanmon. À Kokura, le musée du manga de Kitakyushu possède un espace de lecture d'environ 70 000 mangas.",
    acces: "Shinkansen jusqu'à Kokura puis train local, environ 1 h au total.", foule: "Modérée le week-end.",
    alerte: "Le musée du manga est fermé le mardi, donc le 17 novembre." },
  { id: "akiyoshidai", nom: "Akiyoshidai", natif: "秋吉台", cat: "marche", photo: "akiyoshidai", catTxt: "Nature",
    texte: "Un grand plateau d'herbe parsemé de rochers calcaires, au-dessus de la grotte d'Akiyoshidō dont environ 1 km se visite.",
    acces: "Shinkansen jusqu'à Shin-Yamaguchi, puis bus d'environ 40 minutes.", foule: "Faible à modérée." },
];
