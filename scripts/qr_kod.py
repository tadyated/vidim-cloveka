#!/usr/bin/env python3
"""Vygeneruje QR kód s adresou procházky do souboru qr-kod.png a qr-kod.svg.

Použití:
    pip install "qrcode[pil]"
    python3 scripts/qr_kod.py https://ucet.github.io/nazev-repozitare/

SVG je vhodnější pro tisk (vektor, libovolné zvětšení), PNG pro obrazovku.
Úroveň korekce chyb Q snese potisk logem nebo drobné poškození plakátu.
"""

import sys

import qrcode
import qrcode.image.svg


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    adresa = sys.argv[1]

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=12,
        border=4,
    )
    qr.add_data(adresa)
    qr.make(fit=True)

    qr.make_image(fill_color="black", back_color="white").save("qr-kod.png")
    qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save("qr-kod.svg")

    print("Vytvořeno: qr-kod.png, qr-kod.svg (%s)" % adresa)
    return 0


if __name__ == "__main__":
    sys.exit(main())
