'use strict';
/* Test de fumée : lance le serveur sur un dossier temporaire et vérifie les parcours principaux. */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
const PORT = 3999, B = 'http://localhost:' + PORT;
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'Admin#2026', ANDROID_SHA256: '' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fail++; };
async function call(tok, m, p, b) {
  const r = await fetch(B + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
const login = async (u, p) => (await call('', 'POST', '/login', { username: u, password: p })).j.token;
(async () => {
  try {
    for (let i = 0; i < 30; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
    ok((await call('', 'POST', '/login', { username: 'admin', password: 'x' })).s === 401, 'mauvais mot de passe refusé');
    const A = await login('admin', 'Admin#2026'); ok(!!A, 'connexion super admin');
    ok((await call('', 'GET', '/data')).s === 401, 'API protégée sans jeton');

    const pat = (await call(A, 'POST', '/users', { role: 'patron', name: 'Patron X', username: 'patronx', password: 'secret1' })).j;
    ok(!!pat.id, 'super admin crée un patron');
    const P = await login('patronx', 'secret1');
    const sh = (await call(P, 'POST', '/shops', { name: 'Boutique 1', addr: 'Rue 1', zone: 'Gombe', seller: { name: 'Vend', username: 'vend1', password: 'secret1' } })).j;
    ok(!!sh.id, 'patron crée boutique + profil vendeur');
    const ger = (await call(P, 'POST', '/users', { role: 'gerant', name: 'Gerant', username: 'ger1', password: 'secret1', shopIds: [sh.id] })).j;
    ok(!!ger.id, 'patron crée gérant');
    const G = await login('ger1', 'secret1'), V = await login('vend1', 'secret1');

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const up = await call(G, 'POST', '/upload', { data: png });
    ok(up.s === 200 && /^\/uploads\//.test(up.j.url), 'upload image produit');
    ok((await call(G, 'POST', '/upload', { data: 'data:image/png;base64,AAAA' })).s === 400, 'faux fichier image refusé');
    ok((await fetch(B + up.j.url)).status === 200, 'image servie');

    const rice = (await call(G, 'POST', '/products', { name: 'Riz sac 25 kg', image: up.j.url, costUSD: 28, wholeUSD: 32, priceUSD: 36, detail: { unit: 'kg', parts: 25, priceUSD: 1.6 }, alertQty: 2, shopId: sh.id, qty: 3 })).j;
    ok(!!rice.id, 'gérant crée produit avec prix et stock initial');
    const vd = (await call(V, 'GET', '/data')).j;
    ok(vd.products.length === 1 && vd.products[0].costUSD === undefined, 'vendeur voit le produit sans le coût d\'achat');

    let s = await call(V, 'POST', '/sales', { productId: rice.id, mode: 'd', qty: 5, currency: 'USD', received: 8 });
    ok(s.s === 200 && Math.abs(s.j.left - 2.8) < 1e-6, 'vente au kg : stock 3 → 2,8 sac');
    ok(s.j.sale.totalUSD === 8 && s.j.sale.costUSD === undefined || s.j.sale.totalUSD === 8, 'total calculé côté serveur (5 kg × 1,6 $)');
    s = await call(V, 'POST', '/sales', { productId: rice.id, mode: 'u', qty: 1, currency: 'USD', received: 10 });
    ok(s.s === 400, 'montant reçu insuffisant refusé');
    s = await call(V, 'POST', '/sales', { productId: rice.id, mode: 'u', qty: 1, currency: 'CDF', received: 36 * 2800 });
    ok(s.s === 200, 'vente payée en CDF');
    s = await call(V, 'POST', '/sales', { productId: rice.id, mode: 'u', qty: 5, currency: 'USD', received: 500 });
    ok(s.s === 400 && /Stock/.test(s.j.error), 'stock insuffisant refusé');
    const gd = (await call(G, 'GET', '/data')).j;
    ok(gd.comments.some((c) => c.auto && /Stock bas|RUPTURE/.test(c.text)), 'alerte stock bas signalée au gérant');
    ok(gd.sales.length === 2 && gd.sales[0].costUSD !== undefined, 'gérant voit les ventes en temps réel avec coût');

    const rep = (await call(P, 'GET', '/report?from=2000-01-01&to=2100-01-01')).j;
    ok(rep.count === 2 && rep.ca === 44 && rep.profit > 0, 'rapport patron : CA 44 $ et bénéfice positif');
    ok((await call(V, 'GET', '/report')).s === 403, 'vendeur n\'a pas accès aux rapports');

    const ag = (await call(A, 'POST', '/users', { role: 'agent', name: 'Agent P', username: 'agentp', password: 'secret1', shopIds: [sh.id] })).j;
    const AG = await login('agentp', 'secret1');
    const np = await call(AG, 'POST', '/products', { name: 'Savon', priceUSD: 1, shopId: sh.id });
    ok(np.s === 200 && JSON.stringify(np.j.shopIds) === JSON.stringify([sh.id]), 'agent ajoute un produit dans la boutique affectée');
    await call(A, 'POST', '/deals', { agentId: ag.id, label: 'Marché X', valueUSD: 500 });
    const ad = (await call(AG, 'GET', '/data')).j;
    ok(ad.commissions[ag.id].totalUSD === 100.1, 'commission agent = 20 % de 500 $ + 0,10 $ = 100,10 $');
    ok((await call(AG, 'GET', '/report')).s === 403 && (await call(AG, 'POST', '/stock', {})).s === 403, 'agent sans accès rapports/stock');
    ok((await call(G, 'DELETE', '/users/' + ger.id)).s === 403, 'gérant ne peut pas se supprimer / supprimer un gérant');
    ok((await call(P, 'DELETE', '/users/' + ger.id)).s === 200, 'patron supprime un gérant');
    ok((await call(G, 'GET', '/data')).s === 401, 'compte supprimé = accès coupé');
    ok((await call(P, 'PUT', '/rate', { rate: 2850 })).s === 200 && (await call(P, 'GET', '/data')).j.rate === 2850, 'taux de change modifiable');
    const get = async (u) => { const r = await fetch(B + u); return { s: r.status, t: await r.text(), h: r.headers }; };
    const man = await get('/manifest.webmanifest');
    ok(man.s === 200 && JSON.parse(man.t).display === 'standalone', 'manifeste PWA servi');
    const sw = await get('/sw.js');
    ok(sw.s === 200 && /no-cache/.test(sw.h.get('cache-control')) && sw.h.get('service-worker-allowed') === '/', 'service worker servi sans cache');
    ok((await get('/icons/maskable-512.png')).s === 200, 'icône maskable servie');
    ok((await get('/confidentialite')).t.includes('Politique de confidentialité'), 'page de confidentialité');
    ok((await get('/suppression-compte')).t.includes('Supprimer un compte'), 'page de suppression de compte');
    ok((await get('/.well-known/assetlinks.json')).t.trim() === '[]', 'assetlinks vide tant qu\'aucune empreinte n\'est configurée');
  } catch (e) { console.error(e); fail++; }
  srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent');
  process.exit(fail ? 1 : 0);
})();
