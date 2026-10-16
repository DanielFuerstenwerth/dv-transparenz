"""Erzeugt die Schriftdateien (Inter, WOFF) und das Vorschaubild src/og.png neu.

Aufruf: python3 scripts/assets.py
Voraussetzungen: fontTools; für das Vorschaubild Playwright mit Chromium.
Inter wird aus /usr/share/fonts/opentype/inter gelesen. Fehlt es dort,
die OTF-Dateien von https://github.com/rsms/inter (Release) nach scripts/inter/ legen.
"""
import asyncio
import os
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "src" / "fonts"
QUELLEN = [pathlib.Path("/usr/share/fonts/opentype/inter"), ROOT / "scripts" / "inter"]
GEWICHTE = {"Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700}
ZEICHEN = ("U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-203A,U+20AC,U+2116,U+2122,"
           "U+2190-2193,U+2212,U+2248,U+2260,U+2264,U+2265,U+00B7,U+2009,U+202F")


def schriften():
    from fontTools import subset
    from fontTools.ttLib import TTFont
    quelle = next((q for q in QUELLEN if (q / "Inter-Regular.otf").exists()), None)
    if not quelle:
        raise SystemExit("Inter-OTF-Dateien nicht gefunden, siehe Hinweis oben.")
    FONTS.mkdir(parents=True, exist_ok=True)
    for name, w in GEWICHTE.items():
        opt = subset.Options()
        opt.flavor = "woff"
        opt.layout_features = ["kern", "liga", "calt", "tnum", "case", "ss01", "cv11", "zero", "frac", "sups"]
        opt.name_IDs = ["*"]
        opt.notdef_outline = True
        font = TTFont(quelle / f"Inter-{name}.otf")
        s = subset.Subsetter(opt)
        s.populate(unicodes=subset.parse_unicodes(ZEICHEN))
        s.subset(font)
        font.flavor = "woff"
        font.save(FONTS / f"inter-{w}.woff")
        print("geschrieben:", FONTS / f"inter-{w}.woff")


OG_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(FONTS/inter-400.woff)}
@font-face{font-family:Inter;font-weight:500;src:url(FONTS/inter-500.woff)}
@font-face{font-family:Inter;font-weight:700;src:url(FONTS/inter-700.woff)}
body{margin:0;width:1200px;height:627px;font-family:Inter;color:#102A4C;
background:radial-gradient(900px 340px at 88% -5%,rgba(169,201,239,.75),transparent 70%),linear-gradient(180deg,#FAFCFF 0%,#E8F1FD 100%);
display:flex;flex-direction:column;justify-content:space-between;padding:72px 84px;box-sizing:border-box}
.w{font-weight:700;font-size:44px;letter-spacing:-.035em}
h1{font-weight:500;font-size:68px;letter-spacing:-.025em;line-height:1.08;margin:0 0 22px;max-width:16ch}
p{font-size:28px;color:#1D3049;margin:0}
.f{display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:#526780;border-top:1px solid #D6E0EC;padding-top:22px}
</style></head><body>
<div class="w">1000GW</div>
<div><h1>PORTAL</h1><p>Angebote für PV-Anlagen bis 100 kWp. Jede Angabe mit Quelle und Datum.</p></div>
<div class="f"><span>DOMAIN</span><span>Ein Angebot der BETREIBER</span></div>
</body></html>"""


async def vorschaubild():
    import json
    from playwright.async_api import async_playwright
    cfg = json.loads((ROOT / "site.config.json").read_text())
    html = (OG_HTML.replace("FONTS", FONTS.as_uri())
            .replace("PORTAL", cfg["portalName"])
            .replace("DOMAIN", cfg["siteUrl"].replace("https://", ""))
            .replace("BETREIBER", cfg["betreiber"]["name"]))
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 627})
        await pg.goto(pathlib.Path(f.name).as_uri())
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=str(ROOT / "src" / "og.png"))
        await b.close()
    os.unlink(f.name)
    print("geschrieben:", ROOT / "src" / "og.png")


if __name__ == "__main__":
    schriften()
    asyncio.run(vorschaubild())
