#!/usr/bin/env node
/**
 * Massive Season Load Test — 2000 Customers (Turkish + German)
 *
 * Creates 2000 unique customers with realistic purchasing patterns
 * spanning the full kitesurfing season (April 1 – October 15).
 * Lessons, rentals, and all activities are spread across DIFFERENT DAYS.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  2000 CUSTOMERS: 1000 Turkish (TRY) + 1000 German (EUR)            │
 * │                                                                      │
 * │  PRIMARY SEGMENTS                                                    │
 * │  A. Individual Private Lessons      — 200 customers                  │
 * │  B. Semi-Private (2-person group)   — 400 customers (200 pairs)      │
 * │  C. Lesson Package + booked lessons — 250 customers                  │
 * │  D. Semi-Private Package (2-person) — 200 customers (100 pairs)      │
 * │  E. All-Inclusive Package           — 100 customers                  │
 * │  F. Accom + Lesson Package          — 100 customers                  │
 * │  G. Rental-focused (1-3 rentals)    — 150 customers                  │
 * │  H. Event participants              — 100 customers                  │
 * │  I. Shop-focused                    — 100 customers                  │
 * │  J. Membership-focused              — 100 customers                  │
 * │  K. Ultra-mixed (everything)        — 200 customers                  │
 * │                                                                      │
 * │  SECONDARY EXTRAS (random, on different days)                        │
 * │  30% also get a rental · 20% shop · 15% membership · 10% accom      │
 * │  10% event · 8% repair · 5% family · 5% waiver · 5% rating          │
 * │                                                                      │
 * │  LESSON DURATIONS: 60% 1.5h · 30% 2h · 10% 1h                      │
 * │  TARGET: ~250 lessons per instructor (10 instructors)                │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Usage:   node tests/scripts/testflows/MassiveTurkishCustomerTest.mjs
 * Reset:   node tests/scripts/cleanup.mjs --execute
 */

import {
  API, PASSWORD, ADMIN_EMAIL,
  log, ok, fail, title, api, apiOk, adminLogin,
} from '../_shared.mjs';

// ═══════════════════════════════════════════════════════════════════
//  ENTITY IDS (from production DB)
// ═══════════════════════════════════════════════════════════════════

const INSTRUCTORS = [
  { id: '8a71ef5a-89be-47a5-bc57-0dfef7e65c64', name: 'Ali Kırmızı' },
  { id: '77dfa61f-b433-4b71-b9d8-99d774500262', name: 'Arda Şimşek' },
  { id: '2dd6d117-6e98-4530-9cc9-11432ced8189', name: 'Berke Horasanli' },
  { id: 'bbc10e8e-687a-4c21-a4fd-0a1c8dbefaa7', name: 'Cagan Selcuk Yucel' },
  { id: '1e539cce-8c77-4869-91b9-0e39f7efd4af', name: 'Dinçer Yazgan' },
  { id: 'ba39789a-f957-4125-ac2a-f61fad37b5c4', name: 'Elif Sarı' },
  { id: '9307e939-7c6e-4c6d-b5a6-272a62a3cbde', name: 'Kemal Furkan Doğanlı' },
  { id: '6810a7c8-3655-49eb-8a1d-603f00fadd3f', name: 'Malek Laroussi' },
  { id: '59ab99e9-7165-4bcb-94c3-4bbb1badad11', name: 'Oguzhan Bentürk' },
  { id: 'b18bdec1-b991-48a9-9dc7-0ff81db6ba2e', name: 'Siyabend Şanlı' },
];

const LESSON_SERVICES = [
  { id: '63755242-a699-4b74-a7b7-e4d5a404ec67', name: 'Group Kite Foil Lesson', price: 50, cat: 'group', disc: 'kite_foil', max: 2 },
  { id: '65f5471e-ff80-4e7d-8c04-ecf73486178d', name: 'Group Kitesurfing Lesson', price: 50, cat: 'private', disc: 'kite', max: 1 },
  { id: '1e4bbe2e-7363-4dae-bd5b-e1767f8ba7bd', name: 'Group Wingfoil Lesson', price: 50, cat: 'semi-private', disc: 'wing', max: 2 },
  { id: '4327d7ce-02ee-49a2-a97b-40861d2dc372', name: 'Premium Private Kite Lesson', price: 120, cat: 'private', disc: 'premium', max: 1 },
  { id: 'df4d6eb8-7583-4b63-b4d2-8792ec2b3b5f', name: 'Private E-foil Lesson', price: 150, cat: 'private', disc: 'efoil', max: 1 },
  { id: 'd3d039d1-08bd-4004-824c-acb2f72ed37d', name: 'Private Kite Foil Lesson', price: 90, cat: 'private', disc: 'kite_foil', max: 1 },
  { id: 'fa23aa65-8e33-425a-89d0-66436881ec03', name: 'Private Kitesurfing Lesson', price: 90, cat: 'private', disc: 'kite', max: 1 },
  { id: '66eefe3c-271c-44da-afdc-a87a7d97a25d', name: 'Private Supervision Service', price: 60, cat: 'private', disc: 'kite', max: 1 },
  { id: 'fe8fff3b-b543-4cca-a442-95604174281d', name: 'Private Wingfoil Lesson', price: 90, cat: 'private', disc: 'wing', max: 1 },
  { id: '8c9f79f0-1d69-47dd-8229-f598455a58f1', name: 'Semi Private Kite Foil Lesson', price: 60, cat: 'semi-private', disc: 'kite_foil', max: 2 },
  { id: 'ff10e649-1911-42d3-81b5-80f86127645a', name: 'Semi Private Kitesurfing Lesson', price: 60, cat: 'semi-private', disc: 'kite', max: 2 },
  { id: '450799f4-4333-44e2-8fa0-ed6d5b40717e', name: 'Semi Private Premium Lesson', price: 90, cat: 'semi-private', disc: 'premium', max: 2 },
  { id: '1f31a1e3-d16e-47fe-b08e-1c69c0c2f871', name: 'Semi Private Supervision Service', price: 50, cat: 'semi-private', disc: 'kite', max: 2 },
  { id: 'b1164b62-55b9-47fd-a49f-6c7ee1581362', name: 'Semi Private Wingfoil Lesson', price: 60, cat: 'semi-private', disc: 'wing', max: 2 },
];

const PRIVATE_LESSONS = LESSON_SERVICES.filter(s => s.max === 1);
const SEMI_PRIVATE_LESSONS = LESSON_SERVICES.filter(s => s.max === 2);

const PACKAGES = {
  sls_rental:         { id: 'fb1b0860-0a58-4757-82f4-91946a38ff7c', name: '1 Week of Half Day SLS Rental', price: 420, type: 'rental', hours: 0, sessions: 0, rentalDays: 7, accomNights: 0 },
  rider_progression:  { id: '1ebc9b92-d413-490f-8a1a-2c324e93363f', name: '10h – Rider Progression Pack', price: 700, type: 'lesson', hours: 10, sessions: 10, rentalDays: 0, accomNights: 0 },
  starter_6h:         { id: '63caae97-520a-4a19-b8d5-db8bf3cab5c5', name: '6Hours- Starter Package', price: 470, type: 'lesson', hours: 6, sessions: 6, rentalDays: 0, accomNights: 0 },
  group_starter_6h:   { id: 'd70666f9-a0ca-488d-b9c2-86c672670c00', name: '6Hours-Group Starter Pack', price: 280, type: 'lesson', hours: 6, sessions: 6, rentalDays: 0, accomNights: 0 },
  rider_8h:           { id: '22af8b3d-087a-4198-b2bd-7efb7689aae7', name: '8h – Rider Pack', price: 600, type: 'lesson', hours: 8, sessions: 8, rentalDays: 0, accomNights: 0 },
  group_progression:  { id: '5b1e7929-36e7-4980-899b-6f85e2d0c4f3', name: '9Hours – Group Progression Pack', price: 420, type: 'lesson', hours: 9, sessions: 9, rentalDays: 0, accomNights: 0 },
  all_inclusive:      { id: '32ab3bf7-93db-422f-8113-b1150bf5ed64', name: 'All Inclusive Beginner Package', price: 1930, type: 'all_inclusive', hours: 12, sessions: 6, rentalDays: 7, accomNights: 8, lessonServiceId: 'fa23aa65-8e33-425a-89d0-66436881ec03', rentalServiceId: '80cd62e7-f712-4110-807a-c9e459000094' },
  kitesurf_learning:  { id: 'c61ad7d5-29f5-467b-bd97-ba7a54a54571', name: 'Kitesurf Learning Package', price: 1540, type: 'accommodation_lesson', hours: 12, sessions: 6, rentalDays: 0, accomNights: 7, lessonServiceId: 'fa23aa65-8e33-425a-89d0-66436881ec03' },
  downwinder:         { id: '27b0271b-03ef-4a82-b14a-64beae154ee5', name: 'Mordoğan To DPC Urla Downwinder', price: 55, type: 'downwinders', hours: 1, sessions: 1, rentalDays: 0, accomNights: 0 },
  semi_private_10h:   { id: '7c28e424-b463-43d2-b239-470c2741b8c9', name: 'Semi-Private Beginner Pack', price: 550, type: 'lesson', hours: 10, sessions: 5, rentalDays: 0, accomNights: 0 },
  pro_camp:           { id: '7817aa87-f042-4bf9-b7dd-e3c24288963b', name: 'UKC Pro Camp 2', price: 1255, type: 'camps', hours: 10, sessions: 5, rentalDays: 0, accomNights: 3, lessonServiceId: '4327d7ce-02ee-49a2-a97b-40861d2dc372' },
};

const SHOP = {
  rebel:   { id: '65f2d889-f097-4c08-9bb1-2cfc5f71cb73', name: 'Duotone Rebel D/LAB', price: 3000 },
  wetsuit: { id: '53c3229e-e4b9-42b5-a978-8eeb08f5f39d', name: 'Ion hot shorty wesuit', price: 145 },
};

const MEMBERSHIPS = {
  daily:    { id: 10, name: 'Entrance of DPC-Urla - Daily', price: 10 },
  weekly:   { id: 11, name: 'Entrance of DPC-Urla - Weekly', price: 60 },
  monthly:  { id: 12, name: 'Entrance of DPC-Urla - Monthly', price: 180 },
  seasonal: { id: 13, name: 'Entrance of DPC-Urla - Seasonal', price: 300 },
};

const ACCOM_UNITS = [
  { id: '023fc831-9f0e-49fd-a277-4f88064238f1', name: 'Burlahan Hotel Standart Room', price: 120 },
  { id: 'e5061102-01cd-4b62-9498-36f4a9c67ad2', name: 'Farm Studio House', price: 70 },
];

const RENTAL_SERVICES = [
  { id: 'fb10d3db-1a50-4cdd-960c-0851c2f7836e', name: '1H - D/LAB', price: 48, tier: '1h' },
  { id: '98652e7a-7df3-4ff1-8f1f-c1f080f2a170', name: '1H - SLS', price: 40, tier: '1h' },
  { id: 'f8322e81-9396-4fec-8bda-81ec2dcc3414', name: '1H - Standard', price: 35, tier: '1h' },
  { id: 'e951db65-ae9c-4170-a2f8-22795862edbc', name: '4H - D/LAB', price: 75, tier: '4h' },
  { id: '93dba16f-bed5-4e08-826e-1e114c0faad0', name: '4H - SLS', price: 65, tier: '4h' },
  { id: '80cd62e7-f712-4110-807a-c9e459000094', name: '4H - Standard', price: 55, tier: '4h' },
  { id: '32c0410c-de88-46b0-ba19-aaa74175bd8c', name: '8H - D/LAB', price: 95, tier: '8h' },
  { id: 'a4a2188d-6951-449d-ae47-53c59dc3bcd4', name: '8H - SLS', price: 85, tier: '8h' },
  { id: '15df7631-d620-427d-ba98-0e462e4cc7c5', name: '8H - Standard', price: 75, tier: '8h' },
];

const PRIVATE_PKG_OPTIONS = [
  PACKAGES.rider_progression,
  PACKAGES.starter_6h,
  PACKAGES.rider_8h,
];

const SEMI_PRIVATE_PKG_OPTIONS = [
  PACKAGES.group_starter_6h,
  PACKAGES.group_progression,
  PACKAGES.semi_private_10h,
];

// ═══════════════════════════════════════════════════════════════════
//  NAME GENERATORS — Turkish + German
// ═══════════════════════════════════════════════════════════════════

const TR_NAMES_M = [
  'Ahmet','Ali','Alp','Arda','Ayhan','Barış','Berat','Burak','Can','Cem',
  'Cenk','Cihan','Çağrı','Deniz','Doğan','Doruk','Ege','Efe','Emir','Emre',
  'Enes','Engin','Erdem','Eren','Erhan','Erkan','Erol','Ersin','Fatih','Ferhat',
  'Fikret','Furkan','Gökhan','Güney','Hakan','Halil','Hasan','Hikmet','Hüseyin','İlker',
  'İsmail','Kaan','Kamil','Kemal','Kerem','Koray','Levent','Mahir','Mehmet','Melih',
  'Mert','Mesut','Mete','Murat','Mustafa','Necati','Nuri','Onur','Oğuz','Okan',
  'Orhan','Osman','Özgür','Polat','Ramazan','Recep','Rıza','Samet','Selçuk','Selim',
  'Semih','Sercan','Serhat','Serkan','Sinan','Soner','Şahin','Tahir','Taner','Tarik',
  'Taylan','Tolga','Tufan','Tuncay','Turan','Uğur','Umut','Utku','Volkan','Yavuz',
  'Yiğit','Yunus','Yusuf','Zafer','Berk','Çağlar','Gürkan','İbrahim','Şükrü','Turgut',
];
const TR_NAMES_F = [
  'Aslı','Ayça','Aylin','Aysel','Ayşe','Başak','Belgin','Berna','Betül','Burcu',
  'Cansu','Cemre','Çiğdem','Damla','Defne','Deniz','Derya','Dilan','Dilek','Ebru',
  'Ece','Ekin','Ela','Elif','Emine','Esra','Eylem','Ezgi','Fatma','Funda',
  'Gamze','Gizem','Gökçe','Güliz','Gülşen','Hande','Havva','Hazal','Hilal','Hülya',
  'Irem','İdil','İlknur','İpek','Kader','Lale','Melek','Meltem','Merve','Melike',
  'Mine','Müge','Naz','Nazlı','Neslihan','Nihal','Nil','Nisa','Nur','Özge',
  'Özlem','Pelin','Pınar','Rabia','Rüya','Seda','Selin','Serap','Sevgi','Sibel',
  'Simge','Sinem','Şebnem','Şule','Tomris','Tuba','Tuğba','Tülay','Ülkü','Yasemin',
  'Yeşim','Yıldız','Zehra','Zeynep','Zülal','Açelya','Bade','Ceren','Duygu','Fulya',
  'Gönül','Helin','İnci','Kadriye','Leman','Nermin','Perihan','Serpil','Şeyda','Zübeyde',
];
const TR_LAST = [
  'Yılmaz','Kaya','Demir','Çelik','Şahin','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir',
  'Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek',
  'Polat','Korkmaz','Çakır','Erdoğan','Akar','Bulut','Güneş','Aksoy','Kaplan','Aktaş',
  'Bayrak','Bozkurt','Durmaz','Taş','Güler','Uçar','Yavuz','Avcı','Tekin','Ateş',
  'Altın','Başar','Coşkun','Duman','Erdem','Fidan','Genç','Güngör','Işık','Karaca',
  'Köse','Mutlu','Öz','Pala','Sarı','Toprak','Tümer','Uysal','Vardar','Yaşar',
  'Zengin','Akgül','Baran','Candan','Dağlı','Elmas','Gül','Hakim','İnan','Kaptan',
  'Bayram','Tanrıverdi','Sezer','Ulusoy','Soyer','Ergün','Albayrak','Tuncer','Ergin','Aras',
  'Turan','Karadağ','Yüksel','Alkan','Çakmak','Eroğlu','Peker','Dinç','Soylu','Türker',
  'Aksu','Bıçak','Cengiz','Durmuş','Ekinci','Fevzi','Gencer','Hatipoğlu','İlhan','Kabak',
];
const TR_CITIES = [
  'Istanbul','Ankara','Izmir','Antalya','Bursa','Konya','Adana','Gaziantep',
  'Mersin','Kayseri','Eskişehir','Trabzon','Samsun','Muğla','Bodrum','Çeşme',
  'Kuşadası','Fethiye','Marmaris','Alaçatı','Urla','Dikili','Ayvalık','Datça',
  'Kaş','Kalkan','Didim','Altınoluk','Assos','Akyaka','Gökçeada','Bozcaada',
];

const DE_NAMES_M = [
  'Alexander','Andreas','Anton','Benjamin','Bernhard','Christian','Christoph','Daniel','David','Dominik',
  'Erik','Fabian','Felix','Finn','Florian','Friedrich','Georg','Hannes','Henrik','Jan',
  'Jonas','Julian','Karl','Kevin','Klaus','Lars','Leon','Liam','Luca','Lukas',
  'Malte','Marcel','Markus','Martin','Mathias','Max','Maximilian','Michael','Moritz','Nico',
  'Niklas','Noah','Oliver','Oskar','Pascal','Patrick','Paul','Peter','Philipp','Rafael',
  'Robert','Robin','Roman','Samuel','Sebastian','Simon','Stefan','Sven','Thomas','Tim',
  'Tobias','Tom','Uwe','Valentin','Vincent','Werner','Wilhelm','Wolfgang','Yannik','Zander',
  'Adrian','Bastian','Cedric','Dennis','Elias','Frank','Gregor','Hans','Ingo','Jens',
  'Kai','Leonhard','Marius','Nils','Otto','Ralf','Steffen','Thorsten','Ulrich','Viktor',
  'Aaron','Benedikt','Cornelius','Dirk','Emil','Ferdinand','Gustav','Helmut','Ignaz','Jochen',
];
const DE_NAMES_F = [
  'Alexandra','Amelie','Anke','Anna','Annette','Barbara','Birgit','Carolin','Charlotte','Christina',
  'Clara','Daniela','Elena','Elisabeth','Elke','Emma','Eva','Franziska','Frieda','Greta',
  'Hanna','Heike','Helena','Ines','Irene','Jana','Jennifer','Jessica','Julia','Karin',
  'Katharina','Katrin','Kerstin','Klara','Laura','Lena','Leonie','Lina','Lisa','Luisa',
  'Maja','Manuela','Maria','Marie','Marina','Marta','Martina','Melanie','Mia','Miriam',
  'Monika','Nadja','Nele','Nicole','Nina','Paula','Petra','Sabine','Sandra','Sara',
  'Silke','Simone','Sofia','Sophia','Stefanie','Susanne','Svenja','Tanja','Theresa','Ulrike',
  'Ursula','Vanessa','Vera','Verena','Viktoria','Andrea','Brigitte','Claudia','Doris','Erika',
  'Gabi','Heidi','Ilse','Jasmin','Kristina','Lara','Margit','Natalie','Olivia','Regina',
  'Rita','Ronja','Ruth','Sabrina','Sonja','Tamara','Ute','Vivian','Wiebke','Yvonne',
];
const DE_LAST = [
  'Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann',
  'Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann',
  'Braun','Krüger','Hofmann','Hartmann','Lange','Schmitt','Werner','Schmitz','Krause','Meier',
  'Lehmann','Schmid','Schulze','Maier','Köhler','Herrmann','König','Walter','Mayer','Huber',
  'Kaiser','Fuchs','Peters','Lang','Scholz','Möller','Weiß','Jung','Hahn','Schubert',
  'Vogel','Friedrich','Keller','Günther','Frank','Berger','Winkler','Roth','Beck','Lorenz',
  'Baumann','Franke','Albrecht','Schuster','Simon','Ludwig','Böhm','Winter','Kraus','Martin',
  'Vogt','Stein','Jäger','Otto','Sommer','Groß','Seidel','Heinrich','Brandt','Haas',
];
const DE_CITIES = [
  'Hamburg','Berlin','München','Köln','Frankfurt','Stuttgart','Düsseldorf','Leipzig',
  'Dortmund','Essen','Bremen','Dresden','Hannover','Nürnberg','Duisburg','Bochum',
  'Wuppertal','Bielefeld','Bonn','Münster','Mannheim','Augsburg','Wiesbaden','Kiel',
  'Rostock','Freiburg','Heidelberg','Lübeck','Sylt','Konstanz','Lindau','Travemünde',
];

function sanitize(str) {
  return str.toLowerCase()
    .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] || c)
    .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
    .replace(/[^a-z0-9]/g, '');
}

function generateProfile(index) {
  const isTurkish = index < 1000;
  const isFemale = index % 2 === 1;
  const localIdx = isTurkish ? index : index - 1000;

  let firstName, lastName, city, country, currency, phonePrefix;
  if (isTurkish) {
    const names = isFemale ? TR_NAMES_F : TR_NAMES_M;
    firstName = names[localIdx % names.length];
    lastName = TR_LAST[Math.floor(localIdx / 2) % TR_LAST.length];
    city = TR_CITIES[localIdx % TR_CITIES.length];
    country = 'Turkey';
    currency = 'TRY';
    phonePrefix = '+9053';
  } else {
    const names = isFemale ? DE_NAMES_F : DE_NAMES_M;
    firstName = names[localIdx % names.length];
    lastName = DE_LAST[Math.floor(localIdx / 2) % DE_LAST.length];
    city = DE_CITIES[localIdx % DE_CITIES.length];
    country = 'Germany';
    currency = 'EUR';
    phonePrefix = '+491';
  }

  const email = `${sanitize(firstName)}.${sanitize(lastName)}${index}@testmail.com`;
  const phone = `${phonePrefix}${String(50000000 + index).slice(-8)}`;
  const year = 1975 + (index % 35);
  const month = String(1 + (index % 12)).padStart(2, '0');
  const day = String(1 + (index % 28)).padStart(2, '0');
  const weight = 50 + (index % 50);

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    date_of_birth: `${year}-${month}-${day}`,
    weight,
    city,
    country,
    preferred_currency: currency,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  SEASON DATE SYSTEM (April 1 – October 15)
// ═══════════════════════════════════════════════════════════════════

const SEASON_YEAR = new Date().getFullYear();
const SEASON_START = new Date(SEASON_YEAR, 3, 1);  // Apr 1
const SEASON_END = new Date(SEASON_YEAR, 9, 15);   // Oct 15
const SEASON_DAYS = Math.round((SEASON_END - SEASON_START) / 86400000); // ~198
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

function dateToStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Spread index evenly across season with slight jitter */
function seasonDate(index, total) {
  const base = Math.floor((index / total) * SEASON_DAYS);
  const jitter = ((index * 7 + index * index) % 7) - 3; // ±3 days jitter
  const day = Math.max(0, Math.min(SEASON_DAYS - 1, base + jitter));
  const d = new Date(SEASON_START);
  d.setDate(d.getDate() + day);
  return d;
}

/** Offset from a base date bounded within season */
function offsetSeasonDate(baseDate, offsetDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  if (d > SEASON_END) return SEASON_END;
  if (d < SEASON_START) return SEASON_START;
  return d;
}

function isPast(d) { return d < TODAY; }

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/** Weighted duration: 60% 1.5h, 30% 2h, 10% 1h */
function pickDuration() {
  const r = Math.random();
  if (r < 0.6) return 1.5;
  if (r < 0.9) return 2;
  return 1;
}

/** Pick a morning or afternoon time slot (half-hour granularity) */
function pickTimeSlot() {
  if (Math.random() < 0.6) {
    return pick([8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5]);
  } else {
    return pick([14, 14.5, 15, 15.5, 16, 16.5]);
  }
}

let instructorIdx = 0;
function nextInstructor() {
  const inst = INSTRUCTORS[instructorIdx % INSTRUCTORS.length];
  instructorIdx++;
  return inst;
}

// Timeout-aware API wrapper (15s timeout, 2 retries)
async function apiT(method, path, body, token, timeoutMs = 15000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${API}${path}`;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { method, headers, signal: controller.signal };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      clearTimeout(timer);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, ok: res.ok, data };
    } catch (e) {
      if (attempt === 1) throw new Error(`${method} ${path} timed out after 2 attempts`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function createUser(profile, roleId, token) {
  const res = await apiT('POST', '/users', { ...profile, password: PASSWORD, role_id: roleId }, token);
  if (res.ok) return res.data.id || res.data.user?.id;
  if (res.status === 409) {
    const lookupRes = await apiT('GET', `/users?search=${encodeURIComponent(profile.email)}`, null, token);
    if (!lookupRes.ok) throw new Error(`User lookup failed: ${lookupRes.status}`);
    const users = Array.isArray(lookupRes.data) ? lookupRes.data : lookupRes.data.users || lookupRes.data.data || [];
    const found = users.find(u => u.email === profile.email);
    if (found) return found.id;
    throw new Error(`User ${profile.email} exists but lookup failed`);
  }
  throw new Error(`POST /users → ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
}

async function batchCreate(profiles, roleId, token, concurrency = 10) {
  const results = [];
  for (let i = 0; i < profiles.length; i += concurrency) {
    const batch = profiles.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        const userId = await createUser(p, roleId, token);
        return { ...p, userId };
      })
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
      else log(`    ⚠ user create failed: ${r.reason?.message?.slice(0, 100)}`);
    }
    if (i % 100 === 0 && i > 0) log(`    ... created ${results.length}/${profiles.length} users`);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  WALLET FUNDING — varied descriptions & currencies
// ═══════════════════════════════════════════════════════════════════

const TR_FUND_DESCS = [
  'Havale - Garanti Bankası', 'Nakit ödeme', 'EFT yatırma', 'Yapı Kredi havale',
  'İş Bankası transfer', 'Ziraat Bankası havale', 'Nakit depozito', 'Akbank EFT',
  'Halkbank havale', 'QNB Finansbank transfer',
];
const EUR_FUND_DESCS = [
  'Bank transfer - Deutsche Bank', 'Cash deposit', 'Wire transfer - Commerzbank',
  'SEPA transfer', 'Sparkasse wire', 'Cash payment at reception',
  'Online bank transfer', 'Volksbank transfer', 'PayPal deposit', 'Credit card top-up',
];

async function fundWallet(userId, amount, currency, token) {
  const desc = currency === 'TRY' ? pick(TR_FUND_DESCS) : pick(EUR_FUND_DESCS);
  await apiT('POST', '/wallet/manual-adjust', {
    userId, amount, currency, description: desc,
  }, token);
}

async function fundSegment(seg, amountEUR, amountTRY, token) {
  for (let i = 0; i < seg.length; i += 20) {
    const batch = seg.slice(i, i + 20);
    await Promise.allSettled(batch.map(u => {
      const isTRY = u.preferred_currency === 'TRY';
      return fundWallet(u.userId, isTRY ? amountTRY : amountEUR, u.preferred_currency, token);
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BOOKING ACTIONS
// ═══════════════════════════════════════════════════════════════════

async function completeBooking(bookingId, token) {
  try { await apiT('PUT', `/bookings/${bookingId}`, { status: 'completed' }, token); } catch { /* ok */ }
}

async function bookPrivateLesson(userId, token, date) {
  const service = pick(PRIVATE_LESSONS);
  const inst = nextInstructor();
  const dateStr = dateToStr(date);
  const startHour = pickTimeSlot();
  const duration = pickDuration();
  try {
    const booking = await apiOk('POST', '/bookings?force=true', {
      date: dateStr, start_hour: startHour, duration,
      student_user_id: userId, instructor_user_id: inst.id,
      service_id: service.id, status: 'completed',
    }, token);
    const bId = booking.id || booking.booking?.id;
    return bId;
  } catch {
    try {
      const altDate = offsetSeasonDate(date, isPast(date) ? -1 : 1);
      const booking = await apiOk('POST', '/bookings?force=true', {
        date: dateToStr(altDate), start_hour: pickTimeSlot(), duration,
        student_user_id: userId, instructor_user_id: inst.id,
        service_id: service.id, status: 'completed',
      }, token);
      const bId = booking.id || booking.booking?.id;
      return bId;
    } catch { return null; }
  }
}

async function bookGroupLesson(student1Id, student2Id, token, date) {
  const service = pick(SEMI_PRIVATE_LESSONS);
  const inst = nextInstructor();
  const dateStr = dateToStr(date);
  const startHour = pickTimeSlot();
  const duration = pickDuration();
  try {
    const booking = await apiOk('POST', '/bookings/group', {
      date: dateStr, start_hour: startHour, duration,
      instructor_user_id: inst.id, service_id: service.id,
      participants: [
        { userId: student1Id, isPrimary: true, paymentStatus: 'paid' },
        { userId: student2Id, isPrimary: false, paymentStatus: 'paid' },
      ],
    }, token);
    const bId = booking.id || booking.booking?.id;
    if (bId) await completeBooking(bId, token);
    return bId;
  } catch {
    try {
      const altDate = offsetSeasonDate(date, isPast(date) ? -2 : 2);
      const booking = await apiOk('POST', '/bookings/group', {
        date: dateToStr(altDate), start_hour: pickTimeSlot(), duration,
        instructor_user_id: inst.id, service_id: service.id,
        participants: [
          { userId: student1Id, isPrimary: true, paymentStatus: 'paid' },
          { userId: student2Id, isPrimary: false, paymentStatus: 'paid' },
        ],
      }, token);
      const bId = booking.id || booking.booking?.id;
      if (bId) await completeBooking(bId, token);
      return bId;
    } catch { return null; }
  }
}

async function bookPackageLessons(userId, cpId, sessionsCount, token, baseDateIndex, totalSlots) {
  const inst = nextInstructor();
  const service = pick(PRIVATE_LESSONS);
  let booked = 0;
  for (let i = 0; i < sessionsCount; i++) {
    const date = seasonDate(baseDateIndex + i * 3, totalSlots);
    const duration = pickDuration();
    try {
      const b = await apiOk('POST', '/bookings?force=true', {
        date: dateToStr(date), start_hour: pickTimeSlot(), duration,
        student_user_id: userId, instructor_user_id: inst.id,
        service_id: service.id, status: 'completed',
        use_package: true, customer_package_id: cpId,
      }, token);
      const bId = b.id || b.booking?.id;
      booked++;
    } catch { /* skip conflicts */ }
  }
  return booked;
}

async function bookGroupPackageLessons(s1Id, s2Id, cpId1, cpId2, sessionsCount, token, baseDateIndex, totalSlots) {
  const inst = nextInstructor();
  const service = pick(SEMI_PRIVATE_LESSONS);
  let booked = 0;
  for (let i = 0; i < sessionsCount; i++) {
    const date = seasonDate(baseDateIndex + i * 4, totalSlots);
    const duration = pickDuration();
    try {
      const b = await apiOk('POST', '/bookings/group', {
        date: dateToStr(date), start_hour: pickTimeSlot(), duration,
        instructor_user_id: inst.id, service_id: service.id,
        participants: [
          { userId: s1Id, isPrimary: true, usePackage: true, customerPackageId: cpId1, paymentStatus: 'package' },
          { userId: s2Id, isPrimary: false, usePackage: true, customerPackageId: cpId2, paymentStatus: 'package' },
        ],
      }, token);
      const bId = b.id || b.booking?.id;
      if (bId) await completeBooking(bId, token);
      booked++;
    } catch { /* skip conflicts */ }
  }
  return booked;
}

// ═══════════════════════════════════════════════════════════════════
//  PACKAGE PURCHASES
// ═══════════════════════════════════════════════════════════════════

async function purchasePrivatePackage(userId, token) {
  const pkg = pick(PRIVATE_PKG_OPTIONS);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId, servicePackageId: pkg.id, packageName: pkg.name,
    totalHours: pkg.hours, purchasePrice: pkg.price, currency: 'EUR',
    includesLessons: true, includesRental: false, includesAccommodation: false, packageType: pkg.type,
  }, token);
  return { cpId: res.id, pkg };
}

async function purchaseSemiPrivatePackage(userId, token) {
  const pkg = pick(SEMI_PRIVATE_PKG_OPTIONS);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId, servicePackageId: pkg.id, packageName: pkg.name,
    totalHours: pkg.hours, purchasePrice: pkg.price, currency: 'EUR',
    includesLessons: true, includesRental: false, includesAccommodation: false, packageType: pkg.type,
  }, token);
  return { cpId: res.id, pkg };
}

async function purchaseAllInclusive(userId, token) {
  const pkg = PACKAGES.all_inclusive;
  const unit = pick(ACCOM_UNITS);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId, servicePackageId: pkg.id, packageName: pkg.name,
    totalHours: pkg.hours, purchasePrice: pkg.price, currency: 'EUR',
    includesLessons: true, includesRental: true, includesAccommodation: true,
    packageType: 'all_inclusive', rentalDays: pkg.rentalDays,
    accommodationNights: pkg.accomNights, accommodationUnitId: unit.id,
  }, token);
  return res.id;
}

async function purchaseAccomLessonPkg(userId, token) {
  const pkg = PACKAGES.kitesurf_learning;
  const unit = pick(ACCOM_UNITS);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId, servicePackageId: pkg.id, packageName: pkg.name,
    totalHours: pkg.hours, purchasePrice: pkg.price, currency: 'EUR',
    includesLessons: true, includesRental: false, includesAccommodation: true,
    packageType: 'accommodation_lesson', accommodationNights: pkg.accomNights,
    accommodationUnitId: unit.id,
  }, token);
  return res.id;
}

async function purchaseEventPackage(userId, token) {
  const event = pick([PACKAGES.downwinder, PACKAGES.pro_camp]);
  const res = await apiOk('POST', '/services/customer-packages', {
    customerId: userId, servicePackageId: event.id, packageName: event.name,
    totalHours: event.hours, purchasePrice: event.price, currency: 'EUR',
    includesLessons: event.hours > 0, includesRental: event.rentalDays > 0,
    includesAccommodation: event.accomNights > 0, packageType: event.type,
  }, token);
  return res.id;
}

// ═══════════════════════════════════════════════════════════════════
//  RENTAL / SHOP / MEMBERSHIP / ACCOMMODATION / EXTRAS
// ═══════════════════════════════════════════════════════════════════

async function createRental(userId, token, date) {
  const r = Math.random();
  const tier = r < 0.3 ? '1h' : r < 0.7 ? '4h' : '8h';
  const equip = pick(RENTAL_SERVICES.filter(s => s.tier === tier));
  const startDate = dateToStr(date);
  const endDate = dateToStr(offsetSeasonDate(date, 1));
  try {
    const rental = await apiOk('POST', '/rentals', {
      user_id: userId, equipment_ids: [equip.id],
      rental_days: 1, start_date: startDate, end_date: endDate,
      payment_method: 'wallet',
    }, token);
    const rId = rental.id || rental.rental?.id;
    if (rId) {
      try { await apiT('PATCH', `/rentals/${rId}/activate`, null, token); } catch { /* ok */ }
      if (isPast(date)) {
        try { await apiT('PATCH', `/rentals/${rId}/complete`, null, token); } catch { /* ok */ }
      }
    }
    return rId;
  } catch { return null; }
}

async function createShopOrder(userId, userToken) {
  const product = pick([SHOP.rebel, SHOP.wetsuit]);
  const sizes = product === SHOP.rebel ? ['5m', '7m', '9m', '10m'] : ['S', 'M', 'L', 'XL'];
  const size = pick(sizes);
  try {
    const order = await apiOk('POST', '/shop-orders', {
      items: [{
        product_id: product.id, quantity: 1,
        selected_size: size, selected_variant: { label: size, price: product.price },
      }],
      payment_method: 'wallet',
      notes: `${product.name} (${size})`,
    }, userToken);
    return (order.order || order).id;
  } catch { return null; }
}

async function purchaseMembership(userId, userToken) {
  const membership = pick([MEMBERSHIPS.daily, MEMBERSHIPS.weekly, MEMBERSHIPS.monthly, MEMBERSHIPS.seasonal]);
  try {
    const res = await apiOk('POST', `/member-offerings/${membership.id}/purchase`, {
      paymentMethod: 'wallet',
    }, userToken);
    return res.purchase?.id || res.id;
  } catch { return null; }
}

async function createAccommodationBooking(userId, token, date) {
  const unit = pick(ACCOM_UNITS);
  const nights = 2 + Math.floor(Math.random() * 5);
  const checkIn = dateToStr(date);
  const checkOut = dateToStr(offsetSeasonDate(date, nights));
  try {
    const booking = await apiOk('POST', '/accommodation/bookings', {
      unit_id: unit.id, check_in_date: checkIn, check_out_date: checkOut,
      guests_count: 1, guest_id: userId, payment_method: 'wallet',
    }, token);
    const bId = booking.id;
    try { await apiT('PATCH', `/accommodation/bookings/${bId}/confirm`, null, token); } catch { /* ok */ }
    if (bId && isPast(date)) {
      try { await apiT('PATCH', `/accommodation/bookings/${bId}/checkout`, null, token); } catch { /* ok */ }
    }
    return bId;
  } catch { return null; }
}

async function submitRepairRequest(userToken) {
  const types = ['kite', 'bar', 'board', 'harness', 'wetsuit', 'pump'];
  const items = [
    'Duotone Rebel 9m', 'Core XR7 12m', 'Cabrinha Switchblade 10m',
    'North Orbit 8m', 'Naish Pivot 11m', 'Duotone Neo 7m',
    'F-One Bandit 11m', 'Slingshot Rally GT 10m',
  ];
  const descriptions = [
    'Torn canopy near the center strut, approximately 15cm tear.',
    'Broken leading edge bladder — leaking air after hard crash.',
    'Depower line shows signs of wear and may snap.',
    'Zipper stuck and won\'t close properly.',
    'Footstrap screws stripped, needs re-threading.',
    'Valve leaking slowly, needs replacement.',
    'Trailing edge fraying at multiple points.',
    'Bar throw length mechanism jammed.',
  ];
  try {
    await apiOk('POST', '/repair-requests', {
      equipmentType: pick(types), itemName: pick(items),
      description: pick(descriptions), priority: pick(['low', 'medium', 'high']),
    }, userToken);
    return true;
  } catch { return false; }
}

async function addFamilyMember(userId, token) {
  const relationships = ['son', 'daughter', 'child', 'spouse', 'sibling'];
  const rel = pick(relationships);
  const isChild = ['son', 'daughter', 'child'].includes(rel);
  const year = isChild ? (SEASON_YEAR - 5 - Math.floor(Math.random() * 10)) : (1975 + Math.floor(Math.random() * 25));
  const childNames = ['Yusuf', 'Zeynep', 'Elif', 'Emre', 'Ayşe', 'Mehmet', 'Lina', 'Noah', 'Mia', 'Leon', 'Sophia', 'Felix'];
  try {
    await apiOk('POST', `/students/${userId}/family`, {
      full_name: `${pick(childNames)} Test`,
      date_of_birth: `${year}-06-15`,
      relationship: rel,
      gender: pick(['male', 'female']),
    }, token);
    return true;
  } catch { return false; }
}

async function submitWaiver(userId, token) {
  const sigData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  try {
    await apiOk('POST', '/waivers/submit', {
      user_id: userId, waiver_version: '1.0',
      language_code: 'en', signature_data: sigData,
      agreed_to_terms: true,
    }, token);
    return true;
  } catch { return false; }
}

async function submitRating(bookingId, userToken) {
  const rating = 3 + Math.floor(Math.random() * 3);
  const comments = [
    'Great lesson, learned a lot!', 'Very patient instructor.',
    'Amazing experience on the water.', 'Would recommend to friends.',
    'Good pace, well structured session.', 'Perfect conditions and great teaching.',
    'Absolutely loved it, booking again!', 'Professional and fun.',
  ];
  try {
    await apiOk('POST', '/ratings', {
      bookingId, rating, feedbackText: pick(comments),
      serviceType: 'lesson',
    }, userToken);
    return true;
  } catch { return false; }
}

async function loginUser(email) {
  try {
    const res = await apiOk('POST', '/auth/login', { email, password: PASSWORD });
    return res.token;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

const TOTAL = 2000;
const SEG = {
  A: 200, B: 400, C: 250, D: 200, E: 100,
  F: 100, G: 150, H: 100, I: 100, J: 100, K: 200,
};

(async () => {
  const startTime = Date.now();
  const stats = {
    users: 0, privateLessons: 0, groupLessons: 0, completedLessons: 0,
    packages: 0, rentals: 0, shopOrders: 0, events: 0, memberships: 0,
    repairs: 0, accommodations: 0, familyMembers: 0, waivers: 0,
    ratings: 0, errors: 0,
  };

  try {
    // ── Phase 0: Cleanup ────────────────────────────────────────
    title('Phase 0 · Database Cleanup');
    log('  Running cleanup.mjs --execute ...');
    const { execSync } = await import('child_process');
    try {
      execSync('node tests/scripts/cleanup.mjs --execute', {
        cwd: process.cwd(), stdio: 'pipe', timeout: 120000,
      });
      ok('Database cleaned');
    } catch (e) {
      log(`  ⚠ Cleanup warning: ${e.message?.slice(0, 100)}`);
    }

    // ── Phase 1: Admin login & role lookup ──────────────────────
    title('Phase 1 · Admin Login');
    const token = await adminLogin();
    ok('Admin logged in');

    const roles = await apiOk('GET', '/roles', null, token);
    const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
    if (!studentRole) throw new Error('Student role not found');
    ok(`Student role: ${studentRole.id}`);

    // ── Phase 2: Generate profiles ──────────────────────────────
    title('Phase 2 · Generate 2000 Customer Profiles (1000 TR + 1000 DE)');
    const allProfiles = [];
    for (let i = 0; i < TOTAL; i++) allProfiles.push(generateProfile(i));
    const trCount = allProfiles.filter(p => p.country === 'Turkey').length;
    const deCount = allProfiles.filter(p => p.country === 'Germany').length;
    ok(`Generated ${allProfiles.length} profiles (${trCount} Turkish/TRY, ${deCount} German/EUR)`);

    // ── Phase 3: Create users ───────────────────────────────────
    title('Phase 3 · Create Users');
    const allUsers = await batchCreate(allProfiles, studentRole.id, token, 10);
    stats.users = allUsers.length;
    ok(`Created ${allUsers.length} users`);

    // ── Phase 4: Segment & Fund ─────────────────────────────────
    title('Phase 4 · Segment Users & Fund Wallets');
    let off = 0;
    const segA = allUsers.slice(off, off += SEG.A);
    const segB = allUsers.slice(off, off += SEG.B);
    const segC = allUsers.slice(off, off += SEG.C);
    const segD = allUsers.slice(off, off += SEG.D);
    const segE = allUsers.slice(off, off += SEG.E);
    const segF = allUsers.slice(off, off += SEG.F);
    const segG = allUsers.slice(off, off += SEG.G);
    const segH = allUsers.slice(off, off += SEG.H);
    const segI = allUsers.slice(off, off += SEG.I);
    const segJ = allUsers.slice(off, off += SEG.J);
    const segK = allUsers.slice(off, off += SEG.K);

    // TRY amounts are ~38x EUR
    await fundSegment(segA, 500,  19000,  token); ok(`  A (${segA.length}) funded`);
    await fundSegment(segB, 500,  19000,  token); ok(`  B (${segB.length}) funded`);
    await fundSegment(segC, 1000, 38000,  token); ok(`  C (${segC.length}) funded`);
    await fundSegment(segD, 800,  30000,  token); ok(`  D (${segD.length}) funded`);
    await fundSegment(segE, 2500, 95000,  token); ok(`  E (${segE.length}) funded`);
    await fundSegment(segF, 2000, 76000,  token); ok(`  F (${segF.length}) funded`);
    await fundSegment(segG, 500,  19000,  token); ok(`  G (${segG.length}) funded`);
    await fundSegment(segH, 1500, 57000,  token); ok(`  H (${segH.length}) funded`);
    await fundSegment(segI, 4000, 152000, token); ok(`  I (${segI.length}) funded`);
    await fundSegment(segJ, 400,  15200,  token); ok(`  J (${segJ.length}) funded`);
    await fundSegment(segK, 5000, 190000, token); ok(`  K (${segK.length}) funded`);

    // ── Phase 5: Segment A — Private Lessons ────────────────────
    title(`Phase 5 · Segment A — Private Lessons (${segA.length})`);
    for (let i = 0; i < segA.length; i++) {
      const date = seasonDate(i, segA.length);
      const bId = await bookPrivateLesson(segA[i].userId, token, date);
      if (bId) { stats.privateLessons++; if (isPast(date)) stats.completedLessons++; }
      else stats.errors++;
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segA.length}`);
    }
    ok(`${stats.privateLessons} private lessons booked`);

    // ── Phase 6: Segment B — Semi-Private Pairs ─────────────────
    title(`Phase 6 · Segment B — Semi-Private Group Lessons (${segB.length} → ${segB.length / 2} pairs)`);
    let groupCount = 0;
    for (let i = 0; i < segB.length - 1; i += 2) {
      const date = seasonDate(i / 2, segB.length / 2);
      const bId = await bookGroupLesson(segB[i].userId, segB[i + 1].userId, token, date);
      if (bId) { groupCount++; stats.groupLessons++; if (isPast(date)) stats.completedLessons++; }
      else stats.errors++;
      if (i % 50 === 0 && i > 0) log(`    ... ${i / 2}/${segB.length / 2} pairs`);
    }
    ok(`${groupCount} semi-private group lessons booked (2 students each)`);

    // ── Phase 7: Segment C — Lesson Packages + Lessons ──────────
    title(`Phase 7 · Segment C — Lesson Packages (${segC.length})`);
    let pkgLessons = 0;
    for (let i = 0; i < segC.length; i++) {
      try {
        const { cpId, pkg } = await purchasePrivatePackage(segC[i].userId, token);
        stats.packages++;
        const sessions = Math.min(pkg.sessions || 3, 4);
        const booked = await bookPackageLessons(segC[i].userId, cpId, sessions, token, i * 5, segC.length * 5);
        stats.privateLessons += booked;
        pkgLessons += booked;
      } catch { stats.errors++; }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segC.length}`);
    }
    ok(`${stats.packages} packages, ${pkgLessons} package lessons booked`);

    // ── Phase 8: Segment D — Semi-Private Packages ──────────────
    title(`Phase 8 · Segment D — Semi-Private Packages (${segD.length} → ${segD.length / 2} pairs)`);
    let spPkgLessons = 0;
    for (let i = 0; i < segD.length - 1; i += 2) {
      try {
        const { cpId: cp1 } = await purchaseSemiPrivatePackage(segD[i].userId, token);
        const { cpId: cp2 } = await purchaseSemiPrivatePackage(segD[i + 1].userId, token);
        stats.packages += 2;
        const booked = await bookGroupPackageLessons(
          segD[i].userId, segD[i + 1].userId, cp1, cp2, 3, token, i * 4, segD.length * 4
        );
        stats.groupLessons += booked;
        spPkgLessons += booked;
      } catch { stats.errors++; }
      if (i % 20 === 0 && i > 0) log(`    ... ${i / 2}/${segD.length / 2} pairs`);
    }
    ok(`${spPkgLessons} semi-private package lessons booked`);

    // ── Phase 9: Segment E — All-Inclusive ──────────────────────
    title(`Phase 9 · Segment E — All-Inclusive (${segE.length})`);
    let aiCount = 0;
    for (let i = 0; i < segE.length; i++) {
      try { await purchaseAllInclusive(segE[i].userId, token); stats.packages++; aiCount++; }
      catch { stats.errors++; }
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segE.length}`);
    }
    ok(`${aiCount} All-Inclusive packages`);

    // ── Phase 10: Segment F — Accom + Lesson ────────────────────
    title(`Phase 10 · Segment F — Accommodation+Lesson (${segF.length})`);
    let alCount = 0;
    for (let i = 0; i < segF.length; i++) {
      try {
        const cpId = await purchaseAccomLessonPkg(segF[i].userId, token);
        if (cpId) { stats.packages++; alCount++; }
        else stats.errors++;
      } catch { stats.errors++; }
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segF.length}`);
    }
    ok(`${alCount} Accommodation+Lesson packages`);

    // ── Phase 11: Segment G — Rentals ───────────────────────────
    title(`Phase 11 · Segment G — Rentals (${segG.length})`);
    for (let i = 0; i < segG.length; i++) {
      const rentalCount = 1 + Math.floor(Math.random() * 3);
      for (let r = 0; r < rentalCount; r++) {
        const date = seasonDate(i * 3 + r * 50, segG.length * 3 + 150);
        const rId = await createRental(segG[i].userId, token, date);
        if (rId) stats.rentals++;
        else stats.errors++;
      }
      if (i % 50 === 0 && i > 0) log(`    ... ${i}/${segG.length}`);
    }
    ok(`${stats.rentals} rentals created across season`);

    // ── Phase 12: Segment H — Events ────────────────────────────
    title(`Phase 12 · Segment H — Events (${segH.length})`);
    for (let i = 0; i < segH.length; i++) {
      try {
        const id = await purchaseEventPackage(segH[i].userId, token);
        if (id) stats.events++;
        else stats.errors++;
      } catch { stats.errors++; }
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segH.length}`);
    }
    ok(`${stats.events} event packages`);

    // ── Phase 13: Segment I — Shop ──────────────────────────────
    title(`Phase 13 · Segment I — Shop Orders (${segI.length})`);
    for (let i = 0; i < segI.length; i++) {
      const userToken = await loginUser(segI[i].email);
      if (userToken) {
        const orderId = await createShopOrder(segI[i].userId, userToken);
        if (orderId) stats.shopOrders++;
        else stats.errors++;
      } else stats.errors++;
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segI.length}`);
    }
    ok(`${stats.shopOrders} shop orders`);

    // ── Phase 14: Segment J — Memberships ───────────────────────
    title(`Phase 14 · Segment J — Memberships (${segJ.length})`);
    for (let i = 0; i < segJ.length; i++) {
      const userToken = await loginUser(segJ[i].email);
      if (userToken) {
        const id = await purchaseMembership(segJ[i].userId, userToken);
        if (id) stats.memberships++;
        else stats.errors++;
      } else stats.errors++;
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segJ.length}`);
    }
    ok(`${stats.memberships} memberships`);

    // ── Phase 15: Segment K — Ultra-Mixed ───────────────────────
    title(`Phase 15 · Segment K — Ultra-Mixed (${segK.length})`);
    for (let i = 0; i < segK.length; i++) {
      const u = segK[i];
      try {
        // 1. Lesson package + book lessons
        const { cpId, pkg } = await purchasePrivatePackage(u.userId, token);
        stats.packages++;
        const sessions = Math.min(pkg.sessions || 3, 3);
        const booked = await bookPackageLessons(u.userId, cpId, sessions, token, i * 6, segK.length * 6);
        stats.privateLessons += booked;

        // 2. Group lesson with next customer
        if (i + 1 < segK.length) {
          const date = seasonDate(i * 2 + 100, segK.length * 2 + 200);
          const gId = await bookGroupLesson(u.userId, segK[i + 1].userId, token, date);
          if (gId) stats.groupLessons++;
        }

        // 3. Rental on different day
        const rentalDate = seasonDate(i * 3 + 50, segK.length * 3 + 150);
        const rId = await createRental(u.userId, token, rentalDate);
        if (rId) stats.rentals++;

        // 4. Shop order
        const userToken = await loginUser(u.email);
        if (userToken) {
          const shopId = await createShopOrder(u.userId, userToken);
          if (shopId) stats.shopOrders++;

          // 5. Membership
          const memId = await purchaseMembership(u.userId, userToken);
          if (memId) stats.memberships++;
        }

        // 6. Event
        const evId = await purchaseEventPackage(u.userId, token);
        if (evId) stats.events++;

      } catch { stats.errors++; }
      if (i % 25 === 0 && i > 0) log(`    ... ${i}/${segK.length}`);
    }
    ok('Segment K completed (ultra-mixed)');

    // ── Phase 16: Secondary Extras ──────────────────────────────
    title('Phase 16 · Secondary Extras (random cross-segment)');

    // 30% extra rentals
    log('  Extra rentals (30%)...');
    const rentalExtras = pickN(allUsers, Math.floor(allUsers.length * 0.30));
    for (let i = 0; i < rentalExtras.length; i++) {
      const date = seasonDate(i * 2 + 500, rentalExtras.length * 2 + 600);
      const rId = await createRental(rentalExtras[i].userId, token, date);
      if (rId) stats.rentals++;
      if (i % 100 === 0 && i > 0) log(`    ... ${i}/${rentalExtras.length}`);
    }
    ok(`  +${rentalExtras.length} extra rental attempts`);

    // 20% extra shop orders
    log('  Extra shop orders (20%)...');
    const shopExtras = pickN(allUsers, Math.floor(allUsers.length * 0.20));
    for (const u of shopExtras) {
      const userToken = await loginUser(u.email);
      if (userToken) {
        const id = await createShopOrder(u.userId, userToken);
        if (id) stats.shopOrders++;
      }
    }
    ok(`  +${shopExtras.length} extra shop attempts`);

    // 15% extra memberships
    log('  Extra memberships (15%)...');
    const memExtras = pickN(allUsers, Math.floor(allUsers.length * 0.15));
    for (const u of memExtras) {
      const userToken = await loginUser(u.email);
      if (userToken) {
        const id = await purchaseMembership(u.userId, userToken);
        if (id) stats.memberships++;
      }
    }
    ok(`  +${memExtras.length} extra membership attempts`);

    // 10% accommodation bookings
    log('  Extra accommodation bookings (10%)...');
    const accomExtras = pickN(allUsers, Math.floor(allUsers.length * 0.10));
    for (let i = 0; i < accomExtras.length; i++) {
      const date = seasonDate(i * 3 + 200, accomExtras.length * 3 + 300);
      const bId = await createAccommodationBooking(accomExtras[i].userId, token, date);
      if (bId) stats.accommodations++;
    }
    ok(`  +${stats.accommodations} accommodation bookings`);

    // 10% extra events
    log('  Extra event packages (10%)...');
    const eventExtras = pickN(allUsers, Math.floor(allUsers.length * 0.10));
    for (const u of eventExtras) {
      const id = await purchaseEventPackage(u.userId, token);
      if (id) stats.events++;
    }
    ok(`  +${eventExtras.length} extra event attempts`);

    // 8% repair requests
    log('  Repair requests (8%)...');
    const repairExtras = pickN(allUsers, Math.floor(allUsers.length * 0.08));
    for (const u of repairExtras) {
      const userToken = await loginUser(u.email);
      if (userToken) {
        const didRepair = await submitRepairRequest(userToken);
        if (didRepair) stats.repairs++;
      }
    }
    ok(`  ${stats.repairs} repair requests`);

    // 5% family members
    log('  Family members (5%)...');
    const familyExtras = pickN(allUsers, Math.floor(allUsers.length * 0.05));
    for (const u of familyExtras) {
      const count = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < count; f++) {
        const didAdd = await addFamilyMember(u.userId, token);
        if (didAdd) stats.familyMembers++;
      }
    }
    ok(`  ${stats.familyMembers} family members added`);

    // 5% waivers
    log('  Waivers (5%)...');
    const waiverExtras = pickN(allUsers, Math.floor(allUsers.length * 0.05));
    for (const u of waiverExtras) {
      const didWaiver = await submitWaiver(u.userId, token);
      if (didWaiver) stats.waivers++;
    }
    ok(`  ${stats.waivers} waivers submitted`);

    // 5% ratings (from segA users who have completed bookings)
    log('  Ratings (5%)...');
    const ratingCandidates = pickN(segA.slice(0, 50), 25);
    for (const u of ratingCandidates) {
      const userToken = await loginUser(u.email);
      if (userToken) {
        try {
          const bookings = await apiOk('GET', `/bookings?student_user_id=${u.userId}&limit=1`, null, token);
          const bList = Array.isArray(bookings) ? bookings : bookings.bookings || bookings.data || [];
          if (bList.length > 0) {
            const didRate = await submitRating(bList[0].id, userToken);
            if (didRate) stats.ratings++;
          }
        } catch { /* ok */ }
      }
    }
    ok(`  ${stats.ratings} ratings submitted`);

    // ── Phase 17: Summary ───────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalLessons = stats.privateLessons + stats.groupLessons;
    title('COMPLETE — Massive Season Load Test');
    log(`\n  Duration: ${elapsed}s`);
    log(`  Season:   Apr 1 – Oct 15, ${SEASON_YEAR}`);
    log('  ──────────────────────────────────────');
    log(`  Users created:          ${stats.users}`);
    log(`  Private lessons:        ${stats.privateLessons}`);
    log(`  Group lessons (2-pers): ${stats.groupLessons}`);
    log(`  TOTAL lessons:          ${totalLessons} (~${Math.round(totalLessons / INSTRUCTORS.length)} per instructor)`);
    log(`  Completed lessons:      ${stats.completedLessons}`);
    log(`  Packages purchased:     ${stats.packages}`);
    log(`  Rentals:                ${stats.rentals}`);
    log(`  Shop orders:            ${stats.shopOrders}`);
    log(`  Event packages:         ${stats.events}`);
    log(`  Memberships:            ${stats.memberships}`);
    log(`  Accommodation bookings: ${stats.accommodations}`);
    log(`  Repair requests:        ${stats.repairs}`);
    log(`  Family members:         ${stats.familyMembers}`);
    log(`  Waivers:                ${stats.waivers}`);
    log(`  Ratings:                ${stats.ratings}`);
    log(`  Errors (skipped):       ${stats.errors}`);
    log('  ──────────────────────────────────────');
    log(`  Duration breakdown:     ~60% 1.5h, ~30% 2h, ~10% 1h`);
    log(`  Currency split:         1000 TRY + 1000 EUR`);
    log('');

  } catch (err) {
    fail(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
})();
