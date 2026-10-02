#!/usr/bin/env python3
"""Draw the site's share image (Open Graph / Twitter card), 1200 x 630.

Usage:
    python3 scripts/og.py /path/to/google-fonts-checkout

Needs Pillow (`pip install pillow`). Uses the upstream TTFs from google/fonts,
the same sources as scripts/fonts.py; colours come from src/styles/tokens.css.
Writes public/og.png (committed, so CI never needs Python).
"""

import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og.png")
W, H = 1200, 630

tokens = open(os.path.join(ROOT, "src", "styles", "tokens.css")).read()
root_block = tokens[tokens.index(":root") : tokens.index("}", tokens.index(":root"))]


def colour(name):
    return "#" + re.search(rf"--{name}:\s*#([0-9a-f]{{6}})", root_block).group(1)


def site_one_liner():
    site = open(os.path.join(ROOT, "src", "data", "site.ts")).read()
    return re.search(r'oneLiner:\s*"([^"]+)"', site).group(1)


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ofl = os.path.join(sys.argv[1], "ofl")
    display = ImageFont.truetype(os.path.join(ofl, "marcellus", "Marcellus-Regular.ttf"), 40)
    read = ImageFont.truetype(os.path.join(ofl, "newsreader", "Newsreader[opsz,wght].ttf"), 58)
    # The site's Taz Read instance: weight 400 at optical size 16. Set by name, since
    # the file's axis order (wght, opsz) differs from the order in its file name.
    wanted = {b"Weight": 400, b"Optical Size": 16}
    read.set_variation_by_axes([wanted[axis["name"]] for axis in read.get_variation_axes()])
    mono = ImageFont.truetype(os.path.join(ofl, "ibmplexmono", "IBMPlexMono-Regular.ttf"), 24)

    image = Image.new("RGB", (W, H), colour("void"))
    draw = ImageDraw.Draw(image)

    # The ribbon: Hornet's cloak as a bookmark, notched at the bottom.
    x, w, h = 96, 30, 300
    draw.polygon([(x, 0), (x + w, 0), (x + w, h), (x + w / 2, h - 18), (x, h)], fill=colour("cloak-deep"))

    left = 186
    draw.text((left, 84), "T A Z", font=display, fill=colour("soul"))
    draw.text((left, 136), "Moetez Zouari", font=mono, fill=colour("ash"))

    y = 250
    for line in wrap(draw, site_one_liner(), read, W - left - 110):
        draw.text((left, y), line, font=read, fill=colour("soul"))
        y += 74

    draw.line([(left, H - 104), (W - 96, H - 104)], fill=colour("line"), width=2)
    draw.text((left, H - 84), "taz.tn", font=mono, fill=colour("ash"))
    label = "Journal · Projects · About"
    draw.text((W - 96 - draw.textlength(label, font=mono), H - 84), label, font=mono, fill=colour("dust"))

    image.save(OUT, optimize=True)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
