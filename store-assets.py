"""Teste l'interface dans un vrai navigateur (Chromium) et produit les visuels de la fiche Google Play.
Usage : python3 tools/store-assets.py   (nécessite playwright + Pillow)"""
import os, sys, json, time, base64, subprocess, tempfile, shutil, io, urllib.request
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'store'); SHOTS = os.path.join(OUT, 'screenshots')
os.makedirs(SHOTS, exist_ok=True)
PORT = 3998; B = f'http://localhost:{PORT}'
data = tempfile.mkdtemp(prefix='bp-shots-')
srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': data, 'ADMIN_PASSWORD': 'Admin#2026', 'SEED_DEMO': '1'})
problems = []
def check(ok, msg):
    print(('  ✔ ' if ok else '  ✘ ') + msg)
    if not ok: problems.append(msg)

def api(path, method='GET', body=None, tok=None):
    r = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + tok} if tok else {})})
    return json.loads(urllib.request.urlopen(r).read() or b'{}')
login = lambda u, p='demo1234': api('/login', 'POST', {'username': u, 'password': p})['token']

def product_image(kind):
    S = 600; bg = {'eau': (219, 234, 254), 'jus': (255, 237, 213), 'savon': (252, 231, 243), 'riz': (254, 243, 199), 'sucre': (224, 242, 254)}[kind]
    im = Image.new('RGB', (S, S), bg); d = ImageDraw.Draw(im)
    if kind == 'eau':
        d.rounded_rectangle([225, 150, 375, 520], 40, fill=(147, 197, 253), outline=(59, 130, 246), width=6)
        d.rectangle([265, 90, 335, 150], fill=(37, 99, 235)); d.rounded_rectangle([240, 290, 360, 400], 14, fill=(255, 255, 255))
    elif kind == 'jus':
        d.rectangle([185, 170, 415, 520], fill=(249, 115, 22)); d.polygon([(185, 170), (300, 100), (415, 170)], fill=(234, 88, 12))
        d.ellipse([245, 290, 355, 400], fill=(253, 224, 71)); d.line([(330, 140), (380, 50)], fill=(220, 38, 38), width=10)
    elif kind == 'savon':
        d.rounded_rectangle([130, 220, 470, 400], 60, fill=(244, 114, 182), outline=(219, 39, 119), width=6)
        d.ellipse([200, 255, 280, 335], fill=(251, 207, 232))
    else:
        c = (217, 119, 6) if kind == 'riz' else (255, 255, 255); e = (146, 64, 14) if kind == 'riz' else (100, 116, 139)
        d.polygon([(170, 520), (430, 520), (455, 190), (145, 190)], fill=c, outline=e, width=6)
        d.polygon([(145, 190), (455, 190), (400, 120), (200, 120)], fill=c, outline=e, width=6)
        d.rounded_rectangle([215, 300, 385, 430], 16, fill=(255, 255, 255), outline=e, width=4)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=85)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

try:
    for _ in range(40):
        try: urllib.request.urlopen(B + '/api/health'); break
        except Exception: time.sleep(0.2)
    # photos de démonstration
    g = login('gerant'); kinds = {'Eau minérale 50cl': 'eau', 'Jus 1L': 'jus', 'Savon': 'savon', 'Riz sac 25 kg': 'riz', 'Sucre sac 25 kg': 'sucre'}
    for p in api('/data', tok=g)['products']:
        url = api('/upload', 'POST', {'data': product_image(kinds[p['name']])}, g)['url']
        api('/products/' + p['id'], 'PUT', {'image': url}, g)
    # quelques ventes pour animer le tableau de bord
    v = login('vendeur'); prods = {p['name']: p for p in api('/data', tok=v)['products']}
    for name, mode, qty, cur, rec in [('Eau minérale 50cl', 'u', 6, 'USD', 5), ('Jus 1L', 'd', 4, 'USD', 2), ('Riz sac 25 kg', 'd', 10, 'CDF', 45000), ('Savon', 'u', 3, 'USD', 3)]:
        api('/sales', 'POST', {'productId': prods[name]['id'], 'mode': mode, 'qty': qty, 'currency': cur, 'received': rec}, v)
    api('/purchases', 'POST', {'shopId': api('/data', tok=g)['shops'][0]['id'], 'supplier': 'Grossiste Kin', 'amountUSD': 120, 'note': 'Riz, sucre'}, g)

    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='fr-FR', timezone_id='Africa/Kinshasa')
        page = ctx.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        shot = lambda n: page.screenshot(path=os.path.join(SHOTS, n))

        def signin(u, p='demo1234'):
            page.goto(B); page.wait_for_selector('form[data-f=login]')
            page.fill('input[name=username]', u); page.fill('input[name=password]', p); page.click('form[data-f=login] button.btn')
            page.wait_for_selector('header')

        page.goto(B); page.wait_for_selector('form[data-f=login]'); page.wait_for_timeout(400)
        shot('01-connexion.png')
        # PWA : manifeste, service worker, icônes
        m = page.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())")
        check(m['display'] == 'standalone' and any(i['purpose'] == 'maskable' for i in m['icons']), 'manifeste valide (standalone + icône maskable)')
        page.wait_for_function("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))", timeout=10000)
        check(True, 'service worker actif')
        check(page.evaluate("fetch('/icons/icon-512.png').then(r=>r.ok)"), 'icône 512 servie')

        signin('vendeur'); page.wait_for_selector('.pt img'); page.wait_for_timeout(500)
        check(page.locator('.pt img').count() == 5, 'les 5 produits affichent leur photo (plus d\'icônes)')
        shot('02-vente-produits.png')
        page.click('.pt[data-n^="eau"]'); page.wait_for_selector('form[data-f=sale]')
        page.fill('input[name=qty]', '2'); page.fill('input[name=received]', '2'); page.wait_for_timeout(200)
        check('Monnaie' in page.inner_text('#chg'), 'calcul de la monnaie à rendre')
        shot('03-encaissement.png')
        page.click('form[data-f=sale] button.btn.big'); page.wait_for_selector('#toast div'); page.wait_for_timeout(600)
        check('Vente enregistrée' in page.inner_text('#toast'), 'vente validée depuis l\'interface')
        page.click('[data-a=cur][data-v=CDF]'); page.wait_for_timeout(300); shot('04-vente-cdf.png')
        check('FC' in page.inner_text('.kpis'), 'affichage en francs congolais (CDF)')
        # hors ligne : la coquille s'ouvre depuis le cache
        ctx.set_offline(True); page.reload(); page.wait_for_selector('#root *', timeout=8000)
        check(not page.locator('#offline').evaluate("e=>e.classList.contains('hide')"), 'bandeau « hors ligne » affiché')
        check(page.locator('#root').inner_html() != '', 'application ouverte hors ligne (cache du service worker)')
        ctx.set_offline(False); page.goto(B)

        page.evaluate("localStorage.clear()"); signin('patron'); page.wait_for_selector('.kpis'); page.wait_for_timeout(500); shot('05-tableau-patron.png')
        page.click('[data-a=tab][data-v=Rapport]'); page.wait_for_selector('.kpis .kpi b'); page.wait_for_timeout(600); shot('06-rapport.png')
        page.evaluate("localStorage.clear()"); signin('gerant'); page.click('[data-a=tab][data-v=Produits]'); page.wait_for_selector('.pl .th img'); page.wait_for_timeout(400); shot('07-produits-gerant.png')
        # formulaire produit : boutons photo
        page.click('[data-a=editprod]'); page.wait_for_selector('.photo'); check(page.locator('#modal input[capture]').count() == 1, 'bouton « Prendre une photo » (caméra) présent'); page.click('[data-a=mclose]')
        check(not [e for e in errors if 'favicon' not in e and 'ERR_INTERNET_DISCONNECTED' not in e], 'aucune erreur JavaScript dans la console' + (' : ' + '; '.join(errors[:3]) if errors else ''))
        ctx.close(); br.close()

    # visuel de présentation 1024×500
    W, H = 1024, 500; fg = Image.new('RGB', (W, H)); px = fg.load()
    for y in range(H):
        for x in range(W):
            t = (x / W * .7 + y / H * .3); px[x, y] = (int(13 + 7 * t), int(148 + 36 * t), int(136 + 30 * t))
    ic = Image.open(os.path.join(ROOT, 'public/icons/icon-512.png')).resize((300, 300)); fg.paste(ic, (90, 100), ic)
    d = ImageDraw.Draw(fg); f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 66); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 29)
    d.text((430, 150), 'BoutiquePro', font=f1, fill='white'); d.text((432, 245), 'Ventes, stocks et rapports', font=f2, fill=(204, 251, 241)); d.text((432, 285), 'de vos boutiques · USD et CDF', font=f2, fill=(204, 251, 241))
    fg.save(os.path.join(OUT, 'feature-graphic-1024x500.png')); shutil.copy(os.path.join(ROOT, 'public/icons/play-store-512.png'), os.path.join(OUT, 'icone-play-store-512.png'))
finally:
    srv.terminate(); shutil.rmtree(data, ignore_errors=True)
print('\n' + (f'{len(problems)} problème(s)' if problems else 'Tout est OK'))
sys.exit(1 if problems else 0)
