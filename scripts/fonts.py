#!/usr/bin/env python3
"""Build the site's web fonts from upstream sources.

Usage:
    python3 scripts/fonts.py /path/to/google-fonts-checkout

Needs fontTools and brotli (`pip install fonttools brotli`). The source is a
checkout of https://github.com/google/fonts; last built from commit
23e54b51ddffbc7713c583748e3bd86f62b1fa4a (2026-09-24).

Outputs (committed, so CI never needs Python):
    src/assets/fonts/*.woff2          subset, renamed fonts
    src/assets/fonts/LICENSES/*.txt   the upstream OFL texts
    src/styles/fonts.css              @font-face rules + metric-matched fallbacks

Renaming: Marcellus ("Marcellus") and IBM Plex ("Plex") reserve their names
under the SIL OFL, and the OFL FAQ counts subsetting as modification. The
subsets are therefore renamed Taz Display / Taz Read / Taz Mono; copyright and
licence records are kept.
"""

import os
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "assets", "fonts")
CSS = os.path.join(ROOT, "src", "styles", "fonts.css")

TEXT = (
    "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,"
    "U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FFFD"
)
# Taz Display only sets the masthead and area names: ASCII plus a little punctuation.
DISPLAY = "U+0020-007E,U+00A0,U+00B7,U+2013-2014,U+2018-2019,U+201C-201D,U+2026"
# Code and meta lines: Latin plus arrows. Box drawing falls back to the system mono.
MONO = TEXT
FEATURES = {"Taz Read": ["tnum", "lnum"], "Taz Display": [], "Taz Mono": ["zero"]}

# Fallback metrics from @capsizecss/metrics 4.3.0.
FALLBACKS = {
    "Georgia": {"unitsPerEm": 2048, "xWidthAvg": 913},
    "Courier New": {"unitsPerEm": 2048, "xWidthAvg": 1229},
}

# English letter frequencies (percent), used to weight average glyph width.
FREQ = dict(zip(
    "abcdefghijklmnopqrstuvwxyz",
    [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4,
     6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15, 2.0, 0.074],
))

# (output file, source file, axis limits for variable sources, family, style label, weight, italic, keep hinting)
FACES = [
    ("taz-read-400.woff2", "newsreader/Newsreader[opsz,wght].ttf", {"wght": 400, "opsz": 16}, "Taz Read", "Regular", 400, False, False),
    ("taz-read-600.woff2", "newsreader/Newsreader[opsz,wght].ttf", {"wght": 600, "opsz": 16}, "Taz Read", "SemiBold", 600, False, False),
    ("taz-read-400-italic.woff2", "newsreader/Newsreader-Italic[opsz,wght].ttf", {"wght": 400, "opsz": 16}, "Taz Read", "Italic", 400, True, False),
    ("taz-display-400.woff2", "marcellus/Marcellus-Regular.ttf", None, "Taz Display", "Regular", 400, False, False),
    ("taz-mono-400.woff2", "ibmplexmono/IBMPlexMono-Regular.ttf", None, "Taz Mono", "Regular", 400, False, True),
]

LICENSES = {
    "Newsreader-OFL.txt": "newsreader/OFL.txt",
    "Marcellus-OFL.txt": "marcellus/OFL.txt",
    "IBMPlexMono-OFL.txt": "ibmplexmono/OFL.txt",
}

ORIGIN = {
    "Taz Read": "Newsreader by Production Type",
    "Taz Display": "Marcellus by Astigmatic",
    "Taz Mono": "IBM Plex Mono by IBM",
}


def rename(font, family, style):
    """Replace every family/full/PostScript name; keep copyright, licence and trademark records."""
    name = font["name"]
    ps = (family + "-" + style).replace(" ", "")
    wanted = {1: family, 2: style, 3: ps, 4: f"{family} {style}", 6: ps, 16: family, 17: style,
              10: f"Subset of {ORIGIN[family]}, renamed per the SIL OFL Reserved Font Name clause."}
    name.names = [r for r in name.names if r.nameID not in wanted and r.nameID not in (18, 21, 22, 25)]
    for nid, value in wanted.items():
        name.setName(value, nid, 3, 1, 0x409)


def build_face(src_root, out_name, src_rel, limits, family, style, weight, italic, hinted):
    font = TTFont(os.path.join(src_root, src_rel))
    if limits:
        font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = list(subset.Options().layout_features) + FEATURES[family]
    opts.name_IDs = ["*"]
    opts.name_languages = [0x409]
    opts.notdef_outline = True
    # IBM hints Plex for small sizes on Windows; the other sources carry no hinting worth keeping.
    opts.hinting = hinted
    sub = subset.Subsetter(options=opts)
    ranges = {"Taz Read": TEXT, "Taz Display": DISPLAY, "Taz Mono": MONO}[family]
    unicodes = subset.parse_unicodes(ranges)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    rename(font, family, style)
    font.flavor = "woff2"
    path = os.path.join(OUT, out_name)
    font.save(path)
    return path


def metrics(path):
    font = TTFont(path)
    upm = font["head"].unitsPerEm
    hhea = font["hhea"]
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    total = weight = 0.0
    for ch, f in FREQ.items():
        glyph = cmap.get(ord(ch))
        if glyph:
            total += hmtx[glyph][0] * f
            weight += f
    return {"upm": upm, "ascent": hhea.ascent, "descent": hhea.descent, "lineGap": hhea.lineGap,
            "xWidthAvg": total / weight}


def pct(x):
    return f"{x * 100:.2f}%"


def fallback_css(family, m, local_names, fb):
    ref = FALLBACKS[fb]
    size_adjust = (m["xWidthAvg"] / m["upm"]) / (ref["xWidthAvg"] / ref["unitsPerEm"])
    scale = m["upm"] * size_adjust
    blocks = []
    for weight, style, locals_ in local_names:
        src = ", ".join(f'local("{n}")' for n in locals_)
        blocks.append(
            "@font-face {\n"
            f'  font-family: "{family} Fallback";\n'
            f"  src: {src};\n"
            f"  font-weight: {weight};\n"
            f"  font-style: {style};\n"
            f"  size-adjust: {pct(size_adjust)};\n"
            f"  ascent-override: {pct(m['ascent'] / scale)};\n"
            f"  descent-override: {pct(abs(m['descent']) / scale)};\n"
            f"  line-gap-override: {pct(m['lineGap'] / scale)};\n"
            "}\n"
        )
    return blocks


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src_root = os.path.join(sys.argv[1], "ofl")
    os.makedirs(os.path.join(OUT, "LICENSES"), exist_ok=True)
    os.makedirs(os.path.dirname(CSS), exist_ok=True)

    css = [
        "/* Generated by scripts/fonts.py. Do not edit by hand. */\n",
        "/* Taz Read = Newsreader, Taz Display = Marcellus, Taz Mono = IBM Plex Mono (all SIL OFL 1.1). */\n\n",
    ]
    built = {}
    for out_name, src_rel, limits, family, style, weight, italic, hinted in FACES:
        path = build_face(src_root, out_name, src_rel, limits, family, style, weight, italic, hinted)
        built.setdefault(family, path)
        css.append(
            "@font-face {\n"
            f'  font-family: "{family}";\n'
            f'  src: url("../assets/fonts/{out_name}") format("woff2");\n'
            f"  font-weight: {weight};\n"
            f"  font-style: {'italic' if italic else 'normal'};\n"
            "  font-display: swap;\n"
            "}\n"
        )
        print(f"{out_name:28s} {os.path.getsize(path):6d} B")

    css.append("\n/* Metric-matched local fallbacks keep layout still while the web fonts load. */\n")
    css += fallback_css("Taz Read", metrics(built["Taz Read"]), [
        (400, "normal", ["Georgia"]),
        (600, "normal", ["Georgia Bold", "Georgia-Bold"]),
        (400, "italic", ["Georgia Italic", "Georgia-Italic"]),
    ], "Georgia")
    css += fallback_css("Taz Display", metrics(built["Taz Display"]), [(400, "normal", ["Georgia"])], "Georgia")
    css += fallback_css("Taz Mono", metrics(built["Taz Mono"]), [(400, "normal", ["Courier New", "CourierNewPSMT"])], "Courier New")

    with open(CSS, "w") as fh:
        fh.write("".join(css))

    for dst, src in LICENSES.items():
        shutil.copyfile(os.path.join(src_root, src), os.path.join(OUT, "LICENSES", dst))
    print(f"wrote {os.path.relpath(CSS, ROOT)}")


if __name__ == "__main__":
    main()
