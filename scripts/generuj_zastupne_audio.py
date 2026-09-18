#!/usr/bin/env python3
"""Vygeneruje zástupné (placeholder) nahrávky pro sedm zastávek.

Každá zastávka dostane vlastní tón a počet úvodních pípnutí odpovídající
jejímu pořadí, takže je při testování v terénu slyšet, která nahrávka se
spustila. Skript slouží jen k vývoji – po dodání skutečných nahrávek jej
není třeba spouštět.

Použití:  python3 scripts/generuj_zastupne_audio.py
Závislost: ffmpeg v PATH (open source).
"""

import math
import os
import struct
import subprocess
import sys
import tempfile
import wave

VZORKOVANI = 44100
DELKA_S = 20.0
TONY = [262.0, 294.0, 330.0, 392.0, 440.0, 523.0, 587.0]
CILOVA_SLOZKA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audio")


def obalka(t, delka, nabeh=0.02, dobeh=0.05):
    if t < nabeh:
        return t / nabeh
    if t > delka - dobeh:
        return max(0.0, (delka - t) / dobeh)
    return 1.0


def vzorky(index, frekvence):
    """Vrátí seznam vzorků: (index+1) pípnutí, pak tichý pad."""
    data = []
    pipnuti = index + 1
    for n in range(int(VZORKOVANI * DELKA_S)):
        t = n / VZORKOVANI
        hodnota = 0.0

        # Pípnutí v první části: 0,25 s tón, 0,25 s pauza.
        if t < pipnuti * 0.5:
            faze = t % 0.5
            if faze < 0.25:
                hodnota += 0.30 * math.sin(2 * math.pi * frekvence * t) * obalka(faze, 0.25)

        # Podkladový tón po celou zbývající stopáž, aby bylo slyšet,
        # že nahrávka běží.
        if t > pipnuti * 0.5:
            t2 = t - pipnuti * 0.5
            delka2 = DELKA_S - pipnuti * 0.5
            tremolo = 0.5 + 0.5 * math.sin(2 * math.pi * 0.25 * t2)
            hodnota += 0.10 * tremolo * math.sin(2 * math.pi * (frekvence / 2) * t) \
                * obalka(t2, delka2, 0.5, 1.5)

        data.append(max(-1.0, min(1.0, hodnota)))
    return data


def zapis_wav(cesta, data):
    with wave.open(cesta, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(VZORKOVANI)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) for v in data))


def main():
    os.makedirs(CILOVA_SLOZKA, exist_ok=True)
    for i, f in enumerate(TONY):
        cil = os.path.join(CILOVA_SLOZKA, "zastavka-%d.mp3" % (i + 1))
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            docasny = tmp.name
        try:
            zapis_wav(docasny, vzorky(i, f))
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", docasny,
                 "-codec:a", "libmp3lame", "-b:a", "48k", "-ac", "1", cil],
                check=True,
            )
            print("vytvořeno: %s" % cil)
        finally:
            os.unlink(docasny)


if __name__ == "__main__":
    sys.exit(main())
