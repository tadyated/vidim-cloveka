# -*- coding: utf-8 -*-
"""Sestaví data/prochazka.json z trasy GPX a z rozvrhu zón.

Trasa se zjednoduší (zahodí se zdvojené body) a délky nahrávek se načtou
z převedených souborů, aby se nemusely psát ručně.
"""
import json, os, re, subprocess

GPX = os.path.expanduser("~/mnt/tat-prochazka/export.gpx")
REPO = os.path.expanduser("~/mnt/dev/audiochuze")

body = [(float(a), float(b)) for a, b in re.findall(
    r'<trkpt lat="([\d.]+)" lon="([\d.]+)"', open(GPX, encoding="utf-8").read())]
trasa = []
for p in body:
    if not trasa or trasa[-1] != [round(p[0], 6), round(p[1], 6)]:
        trasa.append([round(p[0], 6), round(p[1], 6)])

ZASTAVENI = [
    {"nazev": "Start – Radbuzská náplavka (Podšálek)", "lat": 49.744350, "lon": 13.380379},
    {"nazev": "1. zastavení – Bohemka", "lat": 49.745639, "lon": 13.382544},
    {"nazev": "2. zastavení – most U Jána", "lat": 49.746109, "lon": 13.384754},
    {"nazev": "3. zastavení – bývalé Městské lázně", "lat": 49.745337, "lon": 13.383469},
    {"nazev": "4. zastavení – pod mostem Milénia", "lat": 49.741215, "lon": 13.381708},
    {"nazev": "5. zastavení – jez, vzpomínka na Kloboučníka", "lat": 49.742644, "lon": 13.380047},
    {"nazev": "6. zastavení – okraj Šafaříkových sadů / Špekpark", "lat": 49.744617, "lon": 13.380110},
]

ZONY = [
    ("Bohemka", 49.744350, 13.380379, 30,
     "Spustí se na startu u náplavky, cestou k Bohemce."),
    ("U Bohemky + Jahody", 49.745639, 13.382544, 30,
     "Spustí se při odchodu od Bohemky, cestou k mostu U Jána."),
    ("U lázní + Škvíra", 49.746109, 13.384754, 30,
     "Spustí se u mostu U Jána, cestou k bývalým Městským lázním."),
    ("Čas + Cestování + Přežít", 49.745337, 13.383469, 30,
     "Spustí se u bývalých Městských lázní, cestou pod most Milénia."),
    ("Plevel + Ulice se změnily + Žebrání", 49.741215, 13.381708, 35,
     "Spustí se pod mostem Milénia, cestou přes lávku zpět k jezu."),
    ("Kloboučník", 49.742644, 13.380047, 30,
     "Zaznívá přímo u jezu, jako vzpomínka na Kloboučníka."),
    ("Štěstí + Ulice", 49.743381, 13.379850, 30,
     "Spustí se kousek za jezem, cestou k Šafaříkovým sadům."),
]

def stopaz(cesta):
    try:
        return round(float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", cesta],
            capture_output=True, text=True, check=True).stdout.strip()))
    except Exception:
        return None

zony = []
for i, (nazev, lat, lon, r, kde) in enumerate(ZONY, start=1):
    audio = "audio/zona-%d.mp3" % i
    zony.append({
        "nazev": "Zóna %d – %s" % (i, nazev),
        "spusti_se": kde,
        "lat": lat, "lon": lon,
        "polomer": r,
        "audio": audio,
        "stopaz_s": stopaz(os.path.join(REPO, audio)),
        "prepis": "",
    })

data = {
    "prochazka": {
        "nadtitulek": "Audioprocházka",
        "nazev": "Vidím člověka",
        "perex": "Procházka po místech, která v Plzni znají lidé bez domova. "
                 "Sedm nahrávek se spustí samo cestou mezi zastaveními; "
                 "stačí sluchátka a chůze.",
        "delka_trasy": "1,9 km",
        "paticka": "Tady a teď, o. p. s.",
        "dlazdice": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "dlazdice_uvedeni": "&copy; přispěvatelé <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
    },
    "nastaveni": {
        "polomer": 30, "hystereze": 1.6, "presnost_limit": 60,
        "skok": 15, "sekvencne": True,
    },
    "zastaveni": ZASTAVENI,
    "zony": zony,
    "trasa": trasa,
}

os.makedirs(os.path.join(REPO, "data"), exist_ok=True)
cil = os.path.join(REPO, "data", "prochazka.json")
with open(cil, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("zapsáno:", cil)
print("bodů trasy:", len(trasa))
for z in zony:
    print("  %-42s %4ss  %s" % (z["nazev"], z["stopaz_s"], z["audio"]))
