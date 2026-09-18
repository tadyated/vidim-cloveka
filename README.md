# Audioprocházka

Statická webová aplikace pro geolokovanou audioprocházku o sedmi zastávkách.
Posluchač otevře adresu nebo QR kód v mobilním prohlížeči, bez registrace,
bez instalace aplikace a bez poplatků. Po přiblížení k zastávce se příslušná
nahrávka spustí sama; kterákoli nahrávka jde vždy přehrát i ručně.

Provoz je navržen pro **GitHub Pages**, ale aplikace je čistě statická –
funguje na libovolném hostingu, který umí servírovat soubory přes HTTPS.

## Stav

Repozitář obsahuje **plně funkční aplikaci se zástupnými daty**: sedm bodů
v centru Plzně a sedm testovacích tónů (v první nahrávce jedno pípnutí,
ve druhé dvě atd., aby bylo při zkoušce v terénu slyšet, co se spustilo).
Doplněním skutečných nahrávek, souřadnic a textů vznikne hotová procházka;
do kódu není třeba zasahovat.

## Struktura

```
index.html                  úvodní obrazovka + aplikace
css/styl.css                vzhled
js/app.js                   logika (geolokace, přehrávání, mapa)
data/zastavky.json          veškerý obsah procházky – jediný soubor k editaci
audio/zastavka-1..7.mp3     nahrávky
ikony/                      ikony pro přidání na plochu telefonu
sw.js                       offline režim (service worker)
manifest.webmanifest        metadata progresivní webové aplikace
scripts/                    pomocné skripty (zástupné audio, QR kód)
.nojekyll                   vypíná zpracování Jekyllem na GitHub Pages
```

## Naplnění obsahem

### 1. Nahrávky

Do složky `audio/` uložte sedm souborů `zastavka-1.mp3` až `zastavka-7.mp3`.

Doporučené parametry: **MP3, mono, 96–128 kb/s, −16 LUFS**. Mono proto, že
posluchač často jde s jedním sluchátkem v uchu; hlasitost normalizovaná proto,
že se procházka poslouchá v hluku ulice. Převod z libovolného vstupu:

```bash
ffmpeg -i vstup.wav -ac 1 -b:a 128k -af loudnorm=I=-16:TP=-1.5:LRA=11 audio/zastavka-1.mp3
```

Rozpočet na velikost: **při 128 kb/s zabere jedna minuta necelý 1 MB.**
Sedm nahrávek po čtyřech minutách vyjde asi na 28 MB. GitHub doporučuje
udržet repozitář pod 1 GB a jednotlivý soubor pod 50 MB, takže je prostor
dostatečný; přesto se vyplatí nahrávky před nasazením zkomprimovat, protože
je posluchači stahují přes mobilní data.

### 2. Souřadnice a texty

Vše je v `data/zastavky.json`. U každé zastávky:

| Pole | Význam |
| --- | --- |
| `nazev` | název zastávky v seznamu a v přehrávači |
| `misto` | orientační popis místa (adresa, název parku) |
| `lat`, `lon` | souřadnice ve stupních, desetinná tečka |
| `polomer` | poloměr spouštěcí zóny v metrech (nepovinné, výchozí 30) |
| `audio` | cesta k nahrávce |
| `prepis` | textový přepis nahrávky |
| `stopaz_min` | délka nahrávky v minutách (nepovinné, jen pro úvodní obrazovku) |

Souřadnice nejsnáze získáte na [openstreetmap.org](https://www.openstreetmap.org/):
pravým tlačítkem na místo → *Ukázat adresu* → v URL jsou hodnoty `mlat` a `mlon`.

Bloky `prochazka` a `nastaveni` na začátku souboru drží název, perex a chování
spouštění (poloměr, hystereze, limit přesnosti, délka skoku tlačítek).

**Přepisy nevynechávejte.** Bez nich je procházka nepřístupná lidem se
sluchovým postižením a nepoužitelná pro každého, kdo je zrovna bez sluchátek.

### 3. Vyzkoušení lokálně

```bash
python3 -m http.server 8000
```

a otevřít `http://localhost:8000/`. Geolokace v prohlížeči na `localhost`
funguje; v nástrojích pro vývojáře (Chrome → *Sensors* → *Location*) lze polohu
podvrhnout a otestovat spouštění bez chození do terénu.

## Nasazení na GitHub Pages

```bash
git init
git add .
git commit -m "pridat: audioprochazka"
git branch -M main
git remote add origin git@github.com:UCET/NAZEV-REPOZITARE.git
git push -u origin main
```

Poté v repozitáři **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / `(root)`** a uložit. Za minutu až dvě je procházka na adrese

```
https://UCET.github.io/NAZEV-REPOZITARE/
```

Tři poznámky k nasazení:

- **Repozitář musí být veřejný**, jinak GitHub Pages na bezplatném tarifu
  stránku nezveřejní. Veřejný repozitář znamená, že nahrávky jsou volně
  stažitelné – s autory a mluvčími je tedy třeba mít vyjasněno, že jde
  o veřejnou publikaci, nikoli o omezené sdílení.
- **Cesty v aplikaci jsou relativní**, takže funguje pod libovolným názvem
  repozitáře i na kořenové doméně `UCET.github.io`. Název repozitáře je
  součástí veřejné adresy – volte jej tedy jako čitelný slug.
- **Vlastní doména** se nastaví tamtéž (*Custom domain*) a souborem `CNAME`.

### Aktualizace obsahu

Po nahrání nových nahrávek nebo úpravě `data/zastavky.json` zvyšte číslo
verze v `sw.js` (`var VERZE = 'audiochuze-v2';`). Bez toho dostanou posluchači,
kteří si procházku už jednou otevřeli, starou verzi z mezipaměti.

## QR kód

```bash
pip install "qrcode[pil]"
python3 scripts/qr_kod.py https://UCET.github.io/NAZEV-REPOZITARE/
```

Vznikne `qr-kod.png` a `qr-kod.svg`. Pro tisk na ceduli použijte SVG; na
plakátu formátu A3 by měl mít QR kód stranu aspoň 8 cm, aby jej telefon
přečetl ze vzdálenosti, ze které se čte doprovodný text. Vedle kódu vždy
uveďte i adresu textem – ne každý telefon má funkční čtečku a ne každý
uživatel jí důvěřuje.

## Jak funguje spouštění

Prohlížeče nedovolí přehrát zvuk bez předchozího gesta uživatele; jde
o ochranu proti reklamám a technicky ji nelze obejít. Aplikace to řeší tím,
že úvodní tlačítko *Začít procházku* přehraje krátké ticho a tím zvuk pro
zbytek relace odemkne. Od té chvíle se nahrávky spouštějí samy.

Poloha se sleduje přes `navigator.geolocation.watchPosition` a vzdálenost se
počítá haversinovou formulí. Zastávka se spustí, když je posluchač blíž než
její poloměr a zároveň je odečet polohy přesnější než `presnost_limit`
(výchozí 60 m) – jinak by v zástavbě docházelo k falešným spuštěním.
Aby se nahrávka při kolísání signálu nespouštěla opakovaně, je zóna
opuštěna až za `hystereze` násobkem poloměru (výchozí 1,6×) a každá zastávka
se automaticky spustí jen jednou; tlačítko v patičce toto omezení resetuje.

Poloha zůstává v telefonu a nikam se neodesílá. Aplikace nemá backend,
nepoužívá cookies ani analytiku a neukládá o posluchači nic.

### Omezení, se kterými je nutné počítat

- **Přesnost GPS v husté zástavbě** bývá 10–40 m, mezi vysokými domy i horší.
  Poloměr 30 m je kompromis; u zastávek v úzkých ulicích jej zvyšte na 40–50 m
  a naopak u zastávek blízko sebe snižte, aby se nepřekrývaly.
- **Uspání telefonu.** Aplikace si vyžádá zámek obrazovky (*Wake Lock*), ale
  ne všechny prohlížeče jej podporují. Po zhasnutí displeje může sledování
  polohy v mobilním Safari ustat; po probuzení se obnoví.
- **Zastávky blíž než dva poloměry od sebe** se budou překrývat. Buď je od
  sebe posuňte, nebo jim nastavte menší `polomer`.

## Použité knihovny a licence

- [Leaflet](https://leafletjs.com/) 1.9.4 (BSD-2-Clause) – mapová komponenta,
  načítaná z CDN unpkg a ukládaná do offline mezipaměti.
- Mapové podklady © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright),
  licence ODbL. Dlaždice ze serverů OSM podléhají
  [podmínkám užití](https://operations.osmfoundation.org/policies/tiles/);
  pro procházku s desítkami návštěvníků jsou v pořádku. Při vyšší návštěvnosti
  přepněte v `data/zastavky.json` pole `dlazdice` na vlastní nebo placený zdroj.

Vlastní kód aplikace použijte a upravte podle potřeby; doplňte prosím licenci,
kterou pro repozitář zvolíte.
