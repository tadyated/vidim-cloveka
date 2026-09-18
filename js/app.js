/* Audioprocházka – aplikační logika.
 *
 * Návrhové zásady:
 *  – Veškerá data o procházce jsou v data/zastavky.json; tento soubor se needituje
 *    při změně obsahu, jen při změně chování.
 *  – Automatické přehrávání je nadstavba, nikoli podmínka. Bez svolení k poloze
 *    zůstává procházka plně použitelná ručně.
 *  – Poloha se nikam neodesílá; zpracovává se výhradně v prohlížeči.
 */
(function () {
  'use strict';

  /* --- Výchozí hodnoty, které lze přepsat v JSON ---------------------- */

  var VYCHOZI = {
    polomer: 30,          // metry – vzdálenost, při níž se zastávka spustí
    hystereze: 1.6,       // násobek poloměru; teprve za ním je posluchač „venku“
    presnost_limit: 60,   // metry – horší odečet polohy se pro spouštění ignoruje
    skok: 15              // sekundy tlačítek −15 / +15
  };

  var TICHO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';

  /* --- Stav ----------------------------------------------------------- */

  var data = null;
  var zastavky = [];
  var stav = [];              // { prehrano, uvnitr, vzdalenost }
  var aktivni = -1;           // index právě přehrávané zastávky
  var automatika = true;
  var mapa = null;
  var znacky = [];
  var kruhy = [];
  var znackaUzivatele = null;
  var kruhPresnosti = null;
  var sledovaciId = null;
  var wakeLock = null;
  var mapaVycentrovana = false;

  var zvuk = document.getElementById('zvuk');

  /* --- Pomocné funkce -------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function vzdalenost(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var f1 = lat1 * Math.PI / 180;
    var f2 = lat2 * Math.PI / 180;
    var df = (lat2 - lat1) * Math.PI / 180;
    var dl = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatCas(s) {
    if (!isFinite(s) || s < 0) { s = 0; }
    var m = Math.floor(s / 60);
    var z = Math.floor(s % 60);
    return m + ':' + (z < 10 ? '0' : '') + z;
  }

  function formatVzdalenost(m) {
    if (m === null || m === undefined || !isFinite(m)) { return '—'; }
    if (m < 1000) { return Math.round(m) + ' m'; }
    return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  function hlaseni(text) {
    var el = $('hlaseni');
    if (!text) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = text;
    el.hidden = false;
  }

  function nastaveni(klic) {
    var n = (data && data.nastaveni) || {};
    return (n[klic] !== undefined && n[klic] !== null) ? n[klic] : VYCHOZI[klic];
  }

  function polomerZastavky(i) {
    var z = zastavky[i];
    return (z && z.polomer) ? z.polomer : nastaveni('polomer');
  }

  /* --- Načtení dat ----------------------------------------------------- */

  function nactiData() {
    return fetch('data/zastavky.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function (json) {
        data = json;
        zastavky = json.zastavky || [];
        stav = zastavky.map(function () {
          return { prehrano: false, uvnitr: false, vzdalenost: null };
        });
        vyplnUvod();
      });
  }

  function vyplnUvod() {
    var p = data.prochazka || {};
    document.title = p.nazev || 'Audioprocházka';
    if (p.nadtitulek) { $('nadtitulek').textContent = p.nadtitulek; }
    $('uvod-nadpis').textContent = p.nazev || 'Audioprocházka';
    $('uvod-perex').textContent = p.perex || '';
    $('hlavicka-titulek').textContent = p.nazev || 'Audioprocházka';
    $('paticka-text').textContent = p.paticka || (p.nazev || 'Audioprocházka');

    $('fakt-pocet').textContent = zastavky.length;

    var minuty = zastavky.reduce(function (s, z) { return s + (z.stopaz_min || 0); }, 0);
    $('fakt-delka').textContent = minuty ? (minuty + ' min') : '–';
    $('fakt-trasa').textContent = p.delka_trasy || '–';
  }

  /* --- Mapa ------------------------------------------------------------ */

  function postavMapu() {
    var p = data.prochazka || {};
    mapa = L.map('mapa', { zoomControl: true, attributionControl: true });

    var dlazdice = (p.dlazdice) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var uvedeni = (p.dlazdice_uvedeni) || '&copy; přispěvatelé <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    L.tileLayer(dlazdice, { maxZoom: 19, attribution: uvedeni }).addTo(mapa);

    zastavky.forEach(function (z, i) {
      var kruh = L.circle([z.lat, z.lon], {
        radius: polomerZastavky(i),
        color: '#e0a458',
        weight: 1,
        opacity: 0.6,
        fillColor: '#e0a458',
        fillOpacity: 0.09
      }).addTo(mapa);
      kruhy.push(kruh);

      var znacka = L.marker([z.lat, z.lon], {
        icon: L.divIcon({
          className: '',
          html: '<div class="znacka">' + (i + 1) + '</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        title: z.nazev,
        keyboard: true,
        alt: 'Zastávka ' + (i + 1) + ': ' + z.nazev
      }).addTo(mapa);

      znacka.on('click', function () { prehraj(i, 'mapa'); });
      znacky.push(znacka);
    });

    if (zastavky.length) {
      mapa.fitBounds(L.latLngBounds(zastavky.map(function (z) { return [z.lat, z.lon]; })).pad(0.25));
    } else {
      mapa.setView([49.7475, 13.3776], 14);
    }
  }

  /* --- Seznam ----------------------------------------------------------- */

  function postavSeznam() {
    var ol = $('seznam');
    ol.innerHTML = '';

    zastavky.forEach(function (z, i) {
      var li = document.createElement('li');
      li.className = 'zastavka';
      li.id = 'zastavka-' + i;

      var hlava = document.createElement('div');
      hlava.className = 'zastavka-hlava';

      var cislo = document.createElement('div');
      cislo.className = 'zastavka-cislo';
      cislo.textContent = String(i + 1);
      cislo.setAttribute('aria-hidden', 'true');

      var texty = document.createElement('div');
      texty.className = 'zastavka-texty';

      var nazev = document.createElement('p');
      nazev.className = 'zastavka-nazev';
      nazev.textContent = z.nazev;

      var meta = document.createElement('p');
      meta.className = 'zastavka-meta';
      var stopaz = document.createElement('span');
      stopaz.textContent = z.stopaz_min ? (z.stopaz_min + ' min') : '';
      var oddelovac = document.createTextNode(z.stopaz_min ? ' · ' : '');
      var vzd = document.createElement('span');
      vzd.className = 'zastavka-vzdalenost';
      vzd.id = 'vzdalenost-' + i;
      vzd.textContent = '—';
      meta.appendChild(stopaz);
      meta.appendChild(oddelovac);
      meta.appendChild(vzd);

      texty.appendChild(nazev);
      if (z.misto) {
        var misto = document.createElement('p');
        misto.className = 'zastavka-meta';
        misto.textContent = z.misto;
        texty.appendChild(misto);
      }
      texty.appendChild(meta);

      hlava.appendChild(cislo);
      hlava.appendChild(texty);
      li.appendChild(hlava);

      var akce = document.createElement('div');
      akce.className = 'zastavka-akce';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn zastavka-prehrat';
      btn.id = 'prehrat-' + i;
      btn.textContent = 'Přehrát';
      btn.addEventListener('click', function () {
        if (aktivni === i && !zvuk.paused) { zvuk.pause(); } else { prehraj(i, 'rucne'); }
      });
      akce.appendChild(btn);

      if (z.lat && z.lon) {
        var navigace = document.createElement('a');
        navigace.className = 'btn zastavka-odkaz';
        navigace.href = 'https://www.openstreetmap.org/?mlat=' + z.lat + '&mlon=' + z.lon + '#map=18/' + z.lat + '/' + z.lon;
        navigace.target = '_blank';
        navigace.rel = 'noopener';
        navigace.textContent = 'Ukázat v mapě';
        akce.appendChild(navigace);
      }

      li.appendChild(akce);

      if (z.prepis) {
        var det = document.createElement('details');
        det.className = 'zastavka-prepis';
        var sum = document.createElement('summary');
        sum.textContent = 'Přepis nahrávky';
        var p = document.createElement('p');
        p.textContent = z.prepis;
        det.appendChild(sum);
        det.appendChild(p);
        li.appendChild(det);
      }

      ol.appendChild(li);
    });
  }

  function obnovSeznam() {
    zastavky.forEach(function (z, i) {
      var li = $('zastavka-' + i);
      if (!li) { return; }
      li.classList.toggle('je-prehrano', stav[i].prehrano);
      li.classList.toggle('je-aktivni', aktivni === i);
      li.classList.toggle('je-blizko', stav[i].uvnitr && aktivni !== i);

      var vzd = $('vzdalenost-' + i);
      if (vzd) { vzd.textContent = formatVzdalenost(stav[i].vzdalenost); }

      var btn = $('prehrat-' + i);
      if (btn) {
        if (aktivni === i && !zvuk.paused) { btn.textContent = 'Pozastavit'; }
        else if (stav[i].prehrano) { btn.textContent = 'Přehrát znovu'; }
        else { btn.textContent = 'Přehrát'; }
      }

      var el = znacky[i] && znacky[i].getElement();
      if (el) {
        var d = el.querySelector('.znacka');
        if (d) {
          d.className = 'znacka' +
            (aktivni === i ? ' znacka-aktivni' : (stav[i].prehrano ? ' znacka-prehrano' : ''));
        }
      }
    });
  }

  /* --- Přehrávání ------------------------------------------------------- */

  function prehraj(i, duvod) {
    var z = zastavky[i];
    if (!z || !z.audio) { return; }

    if (aktivni !== i) {
      aktivni = i;
      zvuk.src = z.audio;
      zvuk.currentTime = 0;
      $('prehravac-cislo').textContent = 'Zastávka ' + (i + 1) + (duvod === 'auto' ? ' · spuštěno polohou' : '');
      $('prehravac-nazev').textContent = z.nazev;
      $('prehravac').hidden = false;
    }

    var slib = zvuk.play();
    if (slib && slib.catch) {
      slib.catch(function () {
        hlaseni('Prohlížeč zablokoval automatické přehrání. Spusťte nahrávku tlačítkem Přehrát.');
      });
    }

    stav[i].prehrano = true;
    if (duvod === 'auto') {
      hlaseni('Zastávka ' + (i + 1) + ' – ' + z.nazev + ': nahrávka se spustila automaticky.');
    }
    obnovSeznam();

    var li = $('zastavka-' + i);
    if (li && duvod === 'auto') { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function obnovPrehravac() {
    $('ikona-prehrat').textContent = zvuk.paused ? '▶' : '❚❚';
    $('btn-prehrat').setAttribute('aria-label', zvuk.paused ? 'Přehrát' : 'Pozastavit');
    $('cas-ted').textContent = formatCas(zvuk.currentTime);
    $('cas-celkem').textContent = formatCas(zvuk.duration);
    var pozice = $('pozice');
    if (zvuk.duration && isFinite(zvuk.duration)) {
      pozice.value = String(Math.round((zvuk.currentTime / zvuk.duration) * 1000));
    } else {
      pozice.value = '0';
    }
  }

  /* --- Geolokace --------------------------------------------------------- */

  function spustSledovani() {
    if (!('geolocation' in navigator)) {
      $('stav-gps').textContent = 'Poloha není dostupná';
      $('stav-gps').className = 'odznak odznak-chyba';
      hlaseni('Tento prohlížeč neumí určit polohu. Procházka funguje ručně – nahrávky spouštějte tlačítkem u zastávky.');
      return;
    }

    sledovaciId = navigator.geolocation.watchPosition(naPolohu, naChybu, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000
    });
  }

  function naPolohu(poz) {
    var lat = poz.coords.latitude;
    var lon = poz.coords.longitude;
    var presnost = poz.coords.accuracy;

    $('stav-gps').textContent = 'Poloha ±' + Math.round(presnost) + ' m';
    $('stav-gps').className = 'odznak ' + (presnost <= nastaveni('presnost_limit') ? 'odznak-ok' : 'odznak-ceka');

    if (mapa) {
      if (!znackaUzivatele) {
        znackaUzivatele = L.circleMarker([lat, lon], {
          radius: 7, color: '#ffffff', weight: 2,
          fillColor: '#4a90d9', fillOpacity: 1
        }).addTo(mapa).bindTooltip('Vaše poloha');
        kruhPresnosti = L.circle([lat, lon], {
          radius: presnost, color: '#4a90d9', weight: 1,
          opacity: 0.4, fillColor: '#4a90d9', fillOpacity: 0.08
        }).addTo(mapa);
      } else {
        znackaUzivatele.setLatLng([lat, lon]);
        kruhPresnosti.setLatLng([lat, lon]);
        kruhPresnosti.setRadius(presnost);
      }
      if (!mapaVycentrovana) {
        mapaVycentrovana = true;
        var body = zastavky.map(function (z) { return [z.lat, z.lon]; });
        body.push([lat, lon]);
        mapa.fitBounds(L.latLngBounds(body).pad(0.2));
      }
    }

    var kandidat = -1;
    var nejblizsi = Infinity;

    zastavky.forEach(function (z, i) {
      var d = vzdalenost(lat, lon, z.lat, z.lon);
      stav[i].vzdalenost = d;

      var r = polomerZastavky(i);
      var ven = r * nastaveni('hystereze');

      if (d <= r) {
        if (!stav[i].uvnitr) { stav[i].uvnitr = true; }
      } else if (d > ven) {
        stav[i].uvnitr = false;
      }

      if (stav[i].uvnitr && !stav[i].prehrano && d < nejblizsi) {
        nejblizsi = d;
        kandidat = i;
      }
    });

    if (automatika && kandidat !== -1 &&
        presnost <= nastaveni('presnost_limit') &&
        (aktivni === -1 || zvuk.paused || zvuk.ended)) {
      prehraj(kandidat, 'auto');
    }

    obnovSeznam();
  }

  function naChybu(chyba) {
    $('stav-gps').className = 'odznak odznak-chyba';
    if (chyba.code === 1) {
      $('stav-gps').textContent = 'Poloha nepovolena';
      hlaseni('Bez přístupu k poloze se nahrávky nespustí samy. Procházka ale funguje – spouštějte je tlačítkem u zastávky. Povolení lze kdykoli změnit v nastavení prohlížeče.');
    } else if (chyba.code === 3) {
      $('stav-gps').textContent = 'Poloha se nedaří určit';
    } else {
      $('stav-gps').textContent = 'Poloha nedostupná';
      hlaseni('Polohu se nepodařilo určit. Nahrávky spouštějte tlačítkem u zastávky.');
    }
  }

  /* --- Zámek obrazovky ---------------------------------------------------- */

  function drzObrazovku() {
    if (!('wakeLock' in navigator)) { return; }
    navigator.wakeLock.request('screen').then(function (z) {
      wakeLock = z;
      wakeLock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* nevadí */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !wakeLock) { drzObrazovku(); }
  });

  /* --- Start --------------------------------------------------------------- */

  function start() {
    $('uvod').hidden = true;
    $('aplikace').hidden = false;

    // Odemčení zvuku uživatelským gestem – bez něj iOS ani Android
    // nedovolí pozdější automatické spuštění.
    zvuk.src = TICHO;
    var slib = zvuk.play();
    if (slib && slib.then) {
      slib.then(function () { zvuk.pause(); }).catch(function () { /* nevadí */ });
    }

    postavMapu();
    postavSeznam();
    setTimeout(function () { if (mapa) { mapa.invalidateSize(); } }, 120);

    spustSledovani();
    drzObrazovku();
    obnovSeznam();
  }

  /* --- Události ------------------------------------------------------------ */

  function navazUdalosti() {
    $('btn-start').addEventListener('click', start);

    $('btn-prehrat').addEventListener('click', function () {
      if (aktivni === -1) { prehraj(0, 'rucne'); return; }
      if (zvuk.paused) { zvuk.play(); } else { zvuk.pause(); }
    });

    $('btn-zpet').addEventListener('click', function () {
      zvuk.currentTime = Math.max(0, zvuk.currentTime - nastaveni('skok'));
    });
    $('btn-vpred').addEventListener('click', function () {
      zvuk.currentTime = Math.min(zvuk.duration || 0, zvuk.currentTime + nastaveni('skok'));
    });

    $('pozice').addEventListener('input', function () {
      if (zvuk.duration && isFinite(zvuk.duration)) {
        zvuk.currentTime = (Number(this.value) / 1000) * zvuk.duration;
      }
    });

    $('btn-reset').addEventListener('click', function () {
      stav.forEach(function (s) { s.prehrano = false; s.uvnitr = false; });
      automatika = true;
      hlaseni('Automatické přehrávání bylo obnoveno. Všechny zastávky se mohou spustit znovu.');
      obnovSeznam();
    });

    ['timeupdate', 'play', 'pause', 'loadedmetadata', 'ended'].forEach(function (u) {
      zvuk.addEventListener(u, function () {
        obnovPrehravac();
        if (u === 'play' || u === 'pause' || u === 'ended') { obnovSeznam(); }
      });
    });

    zvuk.addEventListener('error', function () {
      if (zvuk.src && zvuk.src.indexOf('data:') !== 0) {
        hlaseni('Nahrávku se nepodařilo načíst. Zkontrolujte připojení nebo cestu k souboru.');
      }
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', function () { zvuk.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { zvuk.pause(); });
    }
  }

  /* --- Inicializace --------------------------------------------------------- */

  navazUdalosti();

  nactiData().catch(function (e) {
    $('uvod-perex').textContent = 'Data procházky se nepodařilo načíst (' + e.message + '). ' +
      'Otevřete stránku přes webový server, nikoli jako soubor z disku.';
    $('btn-start').disabled = true;
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* nevadí */ });
    });
  }
})();
