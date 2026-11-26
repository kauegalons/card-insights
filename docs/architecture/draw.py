#!/usr/bin/env python3
"""Draws the architecture images as SVG and renders each to PNG at 2x with headless Chrome or Edge.

    python docs/architecture/draw.py            # SVG + PNG
    python docs/architecture/draw.py --svg-only

Outputs: docs/assets/hld-light.{svg,png} (high-level design), docs/architecture/v1.{svg,png}
(module map) and docs/architecture/flows/deploy.{svg,png} (CI and deploy).

Style and approach derived from YudiG12/second-brain-mcp (MIT): white background, pastel tiles
with one line icon, bold label under each tile, dashed provider containers, slate elbow arrows.
Line icons are Lucide (ISC, https://lucide.dev); brand marks in brands.json are Simple Icons
(CC0, https://simpleicons.org). Python 3 standard library only; set CHROME to a browser binary
if Chrome or Edge is not found in the usual places.
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BRANDS = json.loads((HERE / "brands.json").read_text(encoding="utf-8"))
LUCIDE = {
    "file": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
    "layout": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "workflow": '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    "database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "plug": '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    "copycheck": '<path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "tag": '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    "harddrive": '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
    "piechart": '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
    "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    "pr": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>',
    "merge": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "rocket": '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    "eye": '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
}

INK, MUTED, SUBTLE, ARROW, LINE2 = "#1B2632", "#4A5D72", "#677A8E", "#677A8E", "#CBD3DB"
BEZEL, SCREEN, BAR, BASE = "#1B2632", "#E8EEF4", "#CBD3DB", "#C3CBD3"
ORANGE, GREEN, PURPLE, BLUE, TEAL, SAND, RED, SLATE = "#F38020", "#2F8A5B", "#673AB8", "#4F86D6", "#3FA796", "#B08A5A", "#D1495B", "#4A5866"
FONT = "Onest, Inter, 'Segoe UI', system-ui, sans-serif"


def tint(color, pct):
    """color mixed with white: pct of color, the rest white."""
    rgb = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(c * pct + 255 * (1 - pct)):02X}" for c in rgb)


def icon(name, x, y, size, color):
    k = size / 24
    if name in BRANDS:
        return f'<path transform="translate({x},{y}) scale({k})" d="{BRANDS[name]}" fill="{color}"/>'
    return (f'<g transform="translate({x},{y}) scale({k})" fill="none" stroke="{color}" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round">{LUCIDE[name]}</g>')


def text(x, y, s, size=15, weight=400, color=INK, anchor="middle", extra=""):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}"{extra}>{html.escape(s)}</text>')


def tile(cx, cy, name, ic, color, sub=None, s=104, dashed=False):
    """A pastel square with one icon, a bold name under it and an optional muted line."""
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    t = (f'<rect x="{cx - s / 2}" y="{cy - s / 2}" width="{s}" height="{s}" rx="4" fill="{tint(color, .12)}" '
         f'stroke="{LINE2}" stroke-width="1"{dash}/>')
    z = s * .48
    t += icon(ic, cx - z / 2, cy - z / 2, z, color)
    t += text(cx, cy + s / 2 + 26, name, 17, 700)
    if sub:
        t += text(cx, cy + s / 2 + 46, sub, 13.5, 400, MUTED)
    return t


def container(x, y, w, h, label, ic=None, ic_color=SUBTLE, fill="none", stroke=LINE2, label_color=SUBTLE):
    """A dashed rounded area with an uppercase eyebrow (and a small mark) at its top left."""
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.2" stroke-dasharray="5 4"/>'
    tx = x + 18
    if ic:
        t += icon(ic, x + 18, y + 14, 18, ic_color)
        tx += 26
    t += text(tx, y + 28, label.upper(), 13, 700, label_color, "start", ' letter-spacing="1.3"')
    return t


def arrow(points, label=None, at=None, both=False):
    """An orthogonal polyline with a filled head; label in muted text at `at` (x, y)."""
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    t = (f'<path d="{d}" fill="none" stroke="{ARROW}" stroke-width="1.8" marker-end="url(#a)"'
         f'{" marker-start=\"url(#a)\"" if both else ""}/>')
    if label:
        lx, ly = at
        t += text(lx, ly, label, 13.5, 500, MUTED)
    return t


def laptop(x, y, accent):
    return f'''<g transform="translate({x},{y})"><rect x="22" y="4" width="126" height="84" rx="6" fill="{BEZEL}"/><rect x="28" y="10" width="114" height="72" rx="2" fill="{SCREEN}"/>
<rect x="36" y="18" width="46" height="5" rx="1" fill="{BAR}"/><rect x="36" y="28" width="70" height="4" rx="1" fill="{BAR}"/><rect x="36" y="36" width="60" height="4" rx="1" fill="{BAR}"/>
<rect x="36" y="48" width="14" height="26" rx="1.5" fill="{accent}" opacity=".85"/><rect x="54" y="58" width="14" height="16" rx="1.5" fill="{accent}" opacity=".6"/><rect x="72" y="52" width="14" height="22" rx="1.5" fill="{accent}" opacity=".85"/><rect x="90" y="64" width="14" height="10" rx="1.5" fill="{accent}" opacity=".6"/>
<path d="M4 92 H166 L160 104 Q158 107 154 107 H16 Q12 107 10 104 Z" fill="{BASE}"/><rect x="72" y="92" width="26" height="4" rx="2" fill="{BEZEL}" opacity=".4"/></g>'''


def phone(x, y, accent):
    return f'''<g transform="translate({x},{y})"><rect x="2" y="2" width="66" height="120" rx="12" fill="{BEZEL}"/><rect x="7" y="7" width="56" height="110" rx="8" fill="{SCREEN}"/>
<rect x="26" y="11" width="18" height="5" rx="2.5" fill="{BEZEL}"/><rect x="14" y="26" width="34" height="5" rx="1" fill="{BAR}"/><rect x="14" y="36" width="42" height="4" rx="1" fill="{BAR}"/>
<circle cx="35" cy="66" r="15" fill="none" stroke="{accent}" stroke-width="7" opacity=".85"/><rect x="14" y="92" width="30" height="5" rx="1" fill="{BAR}"/><rect x="26" y="108" width="18" height="3" rx="1.5" fill="{BAR}"/></g>'''


def svg(w, h, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{ARROW}"/></marker></defs>
<rect width="100%" height="100%" fill="#FFFFFF"/>
{body}
</svg>
'''


# ---------- high-level design ----------
def hld():
    b = []
    b.append(laptop(44, 116, GREEN) + text(129, 256, "Laptop", 17, 700))
    b.append(phone(94, 338, PURPLE) + text(129, 490, "Phone", 17, 700))
    # the browser, on the device: everything the app does happens in here
    b.append(container(300, 60, 640, 500, "Browser · on your device", "lock", GREEN, fill=tint(GREEN, .035), stroke=tint(GREEN, .45), label_color=GREEN))
    b.append(tile(440, 300, "React UI", "layout", PURPLE, "pages and charts"))
    b.append(tile(700, 185, "Import + rules", "workflow", BLUE, "pure TypeScript core"))
    b.append(tile(700, 405, "IndexedDB", "database", GREEN, "transactions, rules"))
    b.append(icon("lock", 330, 524, 16, GREEN) + text(354, 537, "Your data stays here: no server, no API, no analytics.", 14, 600, GREEN, "start"))
    # Cloudflare only serves the static files
    b.append(container(1040, 150, 300, 310, "Cloudflare", "cloudflare", ORANGE))
    b.append(tile(1190, 300, "Workers Static Assets", "workers", ORANGE, "HTML, JS, CSS"))
    # the statement file comes from the device, into the app
    b.append(tile(440, 148, "", "file", SAND, None, s=60) + text(480, 145, "Statement CSV", 15, 700, INK, "start")
             + text(480, 165, "from your bank app", 13, 400, MUTED, "start"))
    # arrows
    b.append(arrow([(214, 168), (260, 168), (260, 282), (388, 282)]))        # laptop -> UI
    b.append(arrow([(168, 400), (260, 400), (260, 318), (388, 318)]))        # phone -> UI
    b.append(arrow([(440, 178), (440, 248)]))                                 # CSV -> UI
    b.append(arrow([(492, 285), (580, 285), (580, 185), (648, 185)]))        # UI -> import
    b.append(arrow([(752, 185), (830, 185), (830, 405), (752, 405)], "save", (858, 300)))  # import -> IDB
    b.append(arrow([(648, 405), (580, 405), (580, 315), (492, 315)], "read", (552, 372)))  # IDB -> UI
    b.append(arrow([(1138, 300), (944, 300)], "static files", (990, 288)))   # host -> browser, one way
    return svg(1370, 590, "".join(b))


# ---------- v1 module map ----------
def v1():
    b, S = [], 88
    b.append(container(30, 330, 180, 230, "Cloudflare", "cloudflare", ORANGE))
    b.append(tile(120, 430, "Static Assets", "workers", ORANGE, "static files only", S))
    b.append(tile(120, 165, "Statement CSV", "file", SAND, None, 64))
    b.append(container(240, 40, 1220, 610, "Browser · everything runs here", "lock", GREEN, fill=tint(GREEN, .03), stroke=tint(GREEN, .45), label_color=GREEN))
    b.append(container(450, 80, 760, 540, "Pure TypeScript · no DOM", None, fill="#FFFFFF"))
    b.append(tile(340, 430, "ui/", "layout", PURPLE, "React pages", S))
    b.append(tile(560, 180, "import/adapters", "plug", BLUE, "nubank-card-csv", S))
    b.append(tile(790, 180, "import/dedupe", "copycheck", BLUE, "fingerprint", S))
    b.append(tile(1060, 180, "categorize/", "tag", TEAL, "rules, tree", S))
    b.append(tile(1060, 430, "analysis/", "piechart", RED, "totals, 50/30/20", S))
    b.append(tile(1335, 180, "storage/", "harddrive", SLATE, "repositories", S))
    b.append(tile(1335, 430, "IndexedDB", "database", GREEN, "in the browser", S))
    # domain: the shared layer under every pure module
    b.append(f'<rect x="480" y="556" width="700" height="44" rx="4" fill="{tint(SAND, .12)}" stroke="{LINE2}"/>'
             + icon("box", 496, 566, 24, SAND) + text(532, 584, "domain/", 15, 700, INK, "start")
             + text(602, 584, "money in integer cents, Transaction, Category · used by every pure module", 13.5, 400, MUTED, "start"))
    b.append(arrow([(152, 165), (516, 165)], "file", (200, 155)))                          # CSV -> adapters
    b.append(arrow([(340, 386), (340, 195), (516, 195)]))                                  # ui -> adapters
    b.append(arrow([(604, 180), (746, 180)]))                                              # adapters -> dedupe
    b.append(arrow([(834, 180), (1016, 180)]))                                             # dedupe -> categorize
    b.append(arrow([(1104, 180), (1291, 180)]))                                            # categorize -> storage
    b.append(arrow([(1335, 274), (1335, 386)], "read · write", (1395, 340), both=True))    # storage <-> IDB
    b.append(arrow([(1291, 205), (1240, 205), (1240, 410), (1104, 410)]))                  # storage -> analysis
    b.append(arrow([(1016, 430), (384, 430)], "insights", (700, 420)))                    # analysis -> ui
    b.append(arrow([(164, 455), (296, 455)]))      # host -> browser
    return svg(1490, 680, "".join(b))


# ---------- CI and deploy ----------
def deploy():
    b = []
    b.append(tile(110, 160, "Pull request", "pr", PURPLE))
    b.append(tile(110, 400, "Merge to main", "merge", GREEN))
    b.append(container(250, 60, 560, 470, "GitHub Actions", "github", INK))
    b.append(tile(400, 280, "test · privacy guard", "shield", BLUE, "typecheck, tests, build"))
    b.append(tile(660, 400, "deploy", "rocket", SLATE, "only on main, after both"))
    b.append(container(880, 60, 300, 470, "Cloudflare", "cloudflare", ORANGE))
    b.append(tile(1030, 160, "Preview", "eye", ORANGE, "pr-<N> app + test report"))
    b.append(tile(1030, 400, "Workers Static Assets", "workers", ORANGE, "the live app"))
    b.append(arrow([(162, 160), (290, 160), (290, 262), (348, 262)]))
    b.append(arrow([(162, 400), (290, 400), (290, 298), (348, 298)]))
    b.append(arrow([(452, 262), (540, 262), (540, 160), (978, 160)], "on a PR: upload preview", (760, 148)))
    b.append(arrow([(452, 298), (540, 298), (540, 400), (608, 400)], "on main", (574, 390)))
    b.append(arrow([(712, 400), (978, 400)]))
    return svg(1210, 560, "".join(b))


def find_browser():
    env = os.environ.get("CHROME")
    if env:
        return env
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        if shutil.which(name):
            return shutil.which(name)
    for p in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        if os.path.exists(p):
            return p
    sys.exit("No Chrome/Edge found: set CHROME=/path/to/browser, or use --svg-only")


def render(svg_path, w, h):
    """Screenshot the SVG at 2x into a PNG next to it."""
    png = svg_path.with_suffix(".png")
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([find_browser(), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        f"--user-data-dir={profile}", "--force-device-scale-factor=2",
                        f"--window-size={w},{h}", f"--screenshot={png}", svg_path.as_uri()],
                       check=True, capture_output=True)
    return png


if __name__ == "__main__":
    for path, build in ((ROOT / "docs/assets/hld-light.svg", hld),
                        (HERE / "v1.svg", v1),
                        (HERE / "flows/deploy.svg", deploy)):
        doc = build()
        w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', doc).groups())
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(doc, encoding="utf-8", newline="\n")
        print(path.relative_to(ROOT).as_posix(), end="")
        if "--svg-only" not in sys.argv:
            print(" +", render(path, w, h).relative_to(ROOT).as_posix(), end="")
        print()
