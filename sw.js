/* Service worker – offline režim audioprocházky.
 *
 * Trasa může vést místy se slabým signálem, proto se aplikace i nahrávky
 * ukládají do mezipaměti prohlížeče při prvním načtení. Po změně obsahu
 * zvyšte číslo verze níže, jinak se posluchačům nová verze nemusí projevit.
 */

var VERZE = 'audiochuze-v1';

var PRECACHE = [
  './',
  'index.html',
  'css/styl.css',
  'js/app.js',
  'data/zastavky.json',
  'manifest.webmanifest',
  'audio/zastavka-1.mp3',
  'audio/zastavka-2.mp3',
  'audio/zastavka-3.mp3',
  'audio/zastavka-4.mp3',
  'audio/zastavka-5.mp3',
  'audio/zastavka-6.mp3',
  'audio/zastavka-7.mp3',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

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
        return k === VERZE ? null : caches.delete(k);
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
  if (req.url.indexOf('data/zastavky.json') !== -1) {
    e.respondWith(
      fetch(req).then(function (odpoved) {
        var kopie = odpoved.clone();
        caches.open(VERZE).then(function (c) { c.put(req, kopie); });
        return odpoved;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (nalezeno) {
      if (nalezeno) { return nalezeno; }
      return fetch(req).then(function (odpoved) {
        if (odpoved && odpoved.status === 200 && req.url.indexOf(self.location.origin) === 0) {
          var kopie = odpoved.clone();
          caches.open(VERZE).then(function (c) { c.put(req, kopie); });
        }
        return odpoved;
      }).catch(function () {
        return caches.match('index.html');
      });
    })
  );
});
