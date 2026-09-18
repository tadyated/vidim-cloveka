/* Service worker – offline režim audioprocházky.
 *
 * Trasa může vést místy se slabým signálem, proto se aplikace i nahrávky
 * ukládají do mezipaměti prohlížeče při prvním načtení. Po změně obsahu
 * zvyšte číslo verze níže, jinak se posluchačům nová verze nemusí projevit.
 */

var VERZE = 'audiochuze-v5';

// Při instalaci se ukládá jen kostra aplikace a první nahrávka; zbylých
// dvacet megabajtů audia si posluchač stáhne tlačítkem na úvodní obrazovce
// nebo se uloží samo tím, že nahrávku přehraje.
var PRECACHE = [
  './',
  'index.html',
  'css/styl.css',
  'js/app.js',
  'data/prochazka.json',
  'manifest.webmanifest',
  'ikony/ikona-192.png',
  'obrazky/zahlavi.jpg',
  'audio/zona-1.mp3',
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

var MEDIA = 'audiochuze-media';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERZE).then(function (cache) {
      // Jednotlivě, aby jeden nedostupný soubor neshodil celou instalaci.
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { mode: 'no-cors' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (klice) {
      return Promise.all(klice.map(function (k) {
        return (k === VERZE || k === MEDIA) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }

  // Mapové dlaždice se záměrně neukládají – šetří se tím provoz
  // dobrovolnické infrastruktury OpenStreetMap.
  if (req.url.indexOf('tile.openstreetmap.org') !== -1) { return; }

  // Data procházky: nejdřív síť, ať se opravy projeví; při výpadku mezipaměť.
  if (req.url.indexOf('data/prochazka.json') !== -1) {
    e.respondWith(
      fetch(req).then(function (odpoved) {
        var kopie = odpoved.clone();
        caches.open(VERZE).then(function (c) { c.put(req, kopie); });
        return odpoved;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // Nahrávky mají vlastní mezipaměť, kterou aktualizace aplikace nemaže.
  var jeAudio = /\/audio\/[^/]+\.mp3$/.test(req.url);

  e.respondWith(
    caches.match(req).then(function (nalezeno) {
      if (nalezeno) { return nalezeno; }
      return fetch(req).then(function (odpoved) {
        var vlastni = req.url.indexOf(self.location.origin) === 0;
        var pismo = req.url.indexOf('https://fonts.gstatic.com') === 0 ||
                    req.url.indexOf('https://fonts.googleapis.com') === 0;
        if (odpoved && odpoved.status === 200 && (vlastni || pismo)) {
          var kopie = odpoved.clone();
          caches.open(jeAudio ? MEDIA : VERZE).then(function (c) { c.put(req, kopie); });
        }
        return odpoved;
      }).catch(function () {
        return jeAudio ? Response.error() : caches.match('index.html');
      });
    })
  );
});
