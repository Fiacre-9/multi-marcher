'use strict';
/* BoutiquePro – serveur Node.js (Express, stockage JSON, sans dépendance native) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildXlsx } = require('./xlsx');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UP = path.join(DATA, 'uploads');
fs.mkdirSync(UP, { recursive: true });
const DBF = path.join(DATA, 'db.json');

/* ---------- secret de session ---------- */
const SECRET = process.env.SESSION_SECRET || (() => {
  const f = path.join(DATA, '.secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
})();

/* ---------- base de données JSON ---------- */
let db = { settings: { rate: 2800 }, users: [], shops: [], products: [], stock: {}, sales: [], purchases: [], comments: [], tasks: [], taskDone: {}, deals: [], agentProducts: [], costs: {}, moves: [], tickets: [] };
if (fs.existsSync(DBF)) db = Object.assign(db, JSON.parse(fs.readFileSync(DBF, 'utf8')));
let timer = null;
const save = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, 50);
};
const flush = () => {
  const t = DBF + '.tmp';
  fs.writeFileSync(t, JSON.stringify(db));
  fs.renameSync(t, DBF);
};
process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });

/* ---------- utilitaires ---------- */
const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const num = (x) => Math.max(0, Number.isFinite(+x) ? +x : 0);
const str = (x, n = 120) => String(x ?? '').trim().slice(0, n);
const day = (ts = Date.now()) => new Date(ts + 3600e3).toISOString().slice(0, 10); // Kinshasa UTC+1
const bad = (m, c = 400) => { const e = new Error(m); e.http = c; throw e; };
const round = (x, d = 4) => +(+x).toFixed(d);

const hashPw = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
};
const checkPw = (pw, h) => {
  const [salt, key] = String(h).split(':');
  const k = crypto.scryptSync(pw, salt, 64);
  const a = Buffer.from(key, 'hex');
  return a.length === k.length && crypto.timingSafeEqual(a, k);
};
const sign = (p) => {
  const b = Buffer.from(JSON.stringify(p)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
};
const verify = (t) => {
  try {
    const [b, s] = String(t).split('.');
    const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
    if (!s || s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
};

/* ---------- migration des anciennes données (produits à prix fixe → unités de vente) ---------- */
function migrate() {
  let ch = false;
  for (const p of db.products) {
    if (p.v === 2) continue;
    const d = p.detail && p.detail.parts > 0 ? p.detail : null;
    const units = [{ n: 'Unité', q: 1, p: p.priceUSD || 0.01, w: p.wholeUSD || 0, wm: 0 }];
    if (d) units.push({ n: d.unit || 'Part', q: round(1 / d.parts, 6), p: d.priceUSD || 0.01, w: 0, wm: 0 });
    Object.assign(p, { v: 2, kind: 'custom', base: 'unité', dec: !!d, cur: 'USD', cost: p.costUSD || 0, units, free: false, quick: [] });
    delete p.costUSD; delete p.wholeUSD; delete p.priceUSD; delete p.detail;
    ch = true;
  }
  if (ch) flush();
}
migrate();

/* ---------- premier super admin ---------- */
if (!db.users.some((u) => u.role === 'superadmin')) {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    pw = crypto.randomBytes(6).toString('base64url');
    fs.writeFileSync(path.join(DATA, 'premier-admin.txt'), `Identifiant : ${username}\nMot de passe : ${pw}\n(Changez-le puis supprimez ce fichier.)\n`, { mode: 0o600 });
    console.log(`[BoutiquePro] Super admin créé : ${username} / ${pw}  (aussi dans ${path.join(DATA, 'premier-admin.txt')})`);
  }
  db.users.push({ id: uid(), name: 'Super admin', username, hash: hashPw(pw), role: 'superadmin', shopIds: [], active: true, ts: Date.now() });
  flush();
}

/* ---------- données de démonstration (optionnel : SEED_DEMO=1) ---------- */
if (process.env.SEED_DEMO === '1' && !db.users.some((u) => u.role === 'patron')) {
  const patron = { id: uid(), name: 'Patron Démo', username: 'patron', hash: hashPw('demo1234'), role: 'patron', shopIds: [], active: true, ts: Date.now() };
  db.users.push(patron);
  const sh = { id: uid(), patronId: patron.id, name: 'Boutique Centrale', addr: 'Av. du Commerce 12', zone: 'Gombe', ts: Date.now() };
  db.shops.push(sh);
  db.users.push({ id: uid(), name: 'Gérant Démo', username: 'gerant', hash: hashPw('demo1234'), role: 'gerant', patronId: patron.id, shopIds: [sh.id], active: true, ts: Date.now() });
  db.users.push({ id: uid(), name: 'Vendeur Démo', username: 'vendeur', hash: hashPw('demo1234'), role: 'vendeur', patronId: patron.id, shopIds: [sh.id], active: true, ts: Date.now() });
  const add = (name, o, qtyBase) => {
    const p = { id: uid(), patronId: patron.id, name, image: '', kind: 'custom', base: 'pièce', dec: false, cur: 'CDF', cost: 0, units: [], alertQty: 3, free: false, quick: [], shopIds: null, addedBy: patron.id, ts: Date.now(), v: 2, ...o };
    db.products.push(p);
    db.stock[sh.id + '|' + p.id] = qtyBase;
    if (p.cost) db.costs[sh.id + '|' + p.id] = p.cost;
  };
  const credit = (n) => add('Crédit ' + n, { kind: 'credit', base: '$', dec: true, cur: 'USD', cost: 0.95, units: [{ n: 'Crédit', q: 1, p: 1, w: 0, wm: 0 }], quick: [0.1, 0.2, 0.5, 1, 2, 5, 10], alertQty: 5 }, 50);
  ['Vodacom', 'Orange', 'Airtel', 'Africell'].forEach(credit);
  add('Eau minérale 50 cl', { kind: 'paquet', base: 'bouteille', cost: round(4000 / 12, 6), units: [{ n: 'Bouteille', q: 1, p: 500, w: 0, wm: 0 }, { n: 'Paquet', q: 12, p: 5000, w: 0, wm: 0 }], alertQty: 12 }, 132);
  add('Jus Splash 1 L', { kind: 'paquet', base: 'bouteille', cost: 1000, units: [{ n: 'Bouteille', q: 1, p: 1500, w: 0, wm: 0 }, { n: 'Carton', q: 6, p: 8400, w: 0, wm: 0 }], alertQty: 6 }, 24);
  add('Riz sac 25 kg', { kind: 'sac', base: 'kg', dec: true, cost: 2920, units: [{ n: 'Sac', q: 25, p: 76000, w: 73000, wm: 10 }, { n: 'Kg', q: 1, p: 3100, w: 0, wm: 0 }, { n: 'Verre', q: 0.25, p: 700, w: 0, wm: 0 }, { n: 'Sambi', q: 0.5, p: 1500, w: 0, wm: 0 }], alertQty: 25 }, 250);
  add('Savon de ménage', { kind: 'simple', base: 'pièce', cost: 600, units: [{ n: 'Pièce', q: 1, p: 1000, w: 0, wm: 0 }], alertQty: 5 }, 3);
  add('Câble électrique 2,5 mm', { kind: 'metre', base: 'mètre', dec: true, cost: 1000, units: [{ n: 'Mètre', q: 1, p: 1500, w: 0, wm: 0 }, { n: 'Rouleau', q: 100, p: 130000, w: 0, wm: 0 }], alertQty: 20, free: true }, 200);
  flush();
  console.log('[BoutiquePro] Données de démonstration créées (patron / gerant / vendeur, mot de passe demo1234).');
}

/* ---------- application ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
app.use((q, s, n) => {
  s.setHeader('X-Content-Type-Options', 'nosniff');
  s.setHeader('X-Frame-Options', 'DENY');
  s.setHeader('Referrer-Policy', 'same-origin');
  n();
});
/* --- PWA / Google Play --- */
/* Dossier des fichiers web : « public/ » si présent, sinon structure à plat (fichiers à la racine du dépôt). */
const HAS_PUBLIC = fs.existsSync(path.join(__dirname, 'public', 'index.html'));
const FLAT_OK = new Set(['index.html', 'app.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'play-store-512.png']);
const webFile = (name) => {
  if (HAS_PUBLIC) return path.join(__dirname, 'public', name);
  const flat = name.replace(/^icons\//, '');
  return FLAT_OK.has(flat) ? path.join(__dirname, flat) : null;
};
app.get('/sw.js', (q, s) => { s.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/', 'Content-Type': 'text/javascript; charset=utf-8' }); s.sendFile(webFile('sw.js')); });
app.get('/manifest.webmanifest', (q, s) => { s.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json; charset=utf-8' }); s.sendFile(webFile('manifest.webmanifest')); });
const legal = require('./legal')(process.env.CONTACT_EMAIL || '');
app.get('/confidentialite', (q, s) => s.type('html').send(legal.privacy));
app.get('/suppression-compte', (q, s) => s.type('html').send(legal.del));
/* Digital Asset Links : lie le site à l'application Android (Trusted Web Activity).
   ANDROID_PACKAGE = identifiant du paquet ; ANDROID_SHA256 = empreintes SHA-256 de signature, séparées par des virgules. */
app.get('/.well-known/assetlinks.json', (q, s) => {
  const fp = (process.env.ANDROID_SHA256 || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));
  s.set('Cache-Control', 'no-cache');
  s.json(fp.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'online.mireb.boutiques', sha256_cert_fingerprints: fp } }] : []);
});
app.use('/uploads', express.static(UP, { maxAge: '7d', index: false }));
if (HAS_PUBLIC) app.use(express.static(path.join(__dirname, 'public')));
else {
  app.get(['/', '/index.html', '/app.js', '/style.css', '/icons/:f', '/:f(icon-192.png|icon-512.png|maskable-512.png|apple-touch-icon.png|favicon-32.png)'], (q, s, n) => {
    const name = q.params.f ? (q.path.startsWith('/icons/') ? 'icons/' + q.params.f : q.params.f) : (q.path === '/' ? 'index.html' : q.path.slice(1));
    const f = webFile(name);
    f && fs.existsSync(f) ? s.sendFile(f) : n();
  });
}

/* limiteur de tentatives de connexion */
const tries = new Map();
const limited = (ip) => {
  const now = Date.now();
  const a = (tries.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  tries.set(ip, a);
  return a.length >= 10;
};

const auth = (q, s, n) => {
  const h = q.headers.authorization || '';
  const p = h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
  const u = p && db.users.find((x) => x.id === p.id && x.active);
  if (!u) return s.status(401).json({ error: 'Session expirée' });
  q.u = u;
  n();
};
function route(m, p, roles, fn) {
  app[m](p, auth, (q, s) => {
    try {
      if (roles && !roles.includes(q.u.role)) bad('Accès refusé', 403);
      const r = fn(q, s);
      if (r !== undefined) s.json(r);
    } catch (e) {
      if (e.http) return s.status(e.http).json({ error: e.message });
      console.error(e);
      s.status(500).json({ error: 'Erreur serveur' });
    }
  });
}

/* ---------- périmètres d'accès ---------- */
const shopsOf = (u) =>
  u.role === 'superadmin' ? db.shops
    : u.role === 'patron' ? db.shops.filter((s) => s.patronId === u.id)
      : db.shops.filter((s) => (u.shopIds || []).includes(s.id));
const shopOk = (u, id) => shopsOf(u).find((s) => s.id === id) || bad('Boutique introuvable', 404);
const prodOk = (u, p) =>
  u.role === 'superadmin' || (u.role === 'patron' && p.patronId === u.id) ||
  ((u.role === 'gerant' || u.role === 'vendeur') && p.patronId === u.patronId) ||
  (u.role === 'agent' && shopsOf(u).some((s) => s.patronId === p.patronId));
const manages = (u, t) =>
  t.role !== 'superadmin' && t.id !== u.id && (
    u.role === 'superadmin' ||
    (u.role === 'patron' && t.patronId === u.id && ['gerant', 'vendeur'].includes(t.role)) ||
    (u.role === 'gerant' && t.role === 'vendeur' && (t.shopIds || []).some((s) => (u.shopIds || []).includes(s))));
const pub = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, patronId: u.patronId || null, shopIds: u.shopIds || [], active: u.active });

const commission = (a) => {
  const d = db.deals.filter((x) => x.agentId === a.id);
  const dv = d.reduce((s, x) => s + x.valueUSD, 0);
  const n = db.agentProducts.filter((x) => x.agentId === a.id).length;
  return { deals: d.length, dealsValueUSD: round(dv), dealsCommissionUSD: round(dv * 0.2), products: n, productsCommissionUSD: round(n * 0.1), totalUSD: round(dv * 0.2 + n * 0.1) };
};

/* ---------- authentification ---------- */
app.post('/api/login', (q, s) => {
  const ip = q.ip;
  if (limited(ip)) return s.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  const u = db.users.find((x) => x.username === str(q.body.username, 40).toLowerCase() && x.active);
  if (!u || !checkPw(String(q.body.password || ''), u.hash)) {
    tries.get(ip).push(Date.now());
    return s.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }
  s.json({ token: sign({ id: u.id, exp: Date.now() + 14 * 864e5 }) });
});
route('post', '/api/me/password', null, (q) => {
  if (!checkPw(String(q.body.old || ''), q.u.hash)) bad('Ancien mot de passe incorrect');
  if (String(q.body.password || '').length < 6) bad('Mot de passe : 6 caractères minimum');
  q.u.hash = hashPw(q.body.password);
  save();
  return { ok: true };
});

/* ---------- données du tableau de bord ---------- */
route('get', '/api/data', null, (q) => {
  const u = q.u;
  const shops = shopsOf(u);
  const ids = new Set(shops.map((s) => s.id));
  const vend = u.role === 'vendeur';
  const products = db.products.filter((p) => prodOk(u, p)).map((p) => (vend ? { ...p, cost: undefined } : p));
  const stock = {};
  for (const k in db.stock) if (ids.has(k.split('|')[0])) stock[k] = db.stock[k];
  let users = [];
  if (u.role === 'superadmin') users = db.users.filter((x) => x.id !== u.id);
  else if (u.role === 'patron') users = db.users.filter((x) => x.patronId === u.id);
  else if (u.role === 'gerant') users = db.users.filter((x) => x.role === 'vendeur' && (x.shopIds || []).some((s) => ids.has(s)));
  let sales = db.sales.filter((x) => ids.has(x.shopId));
  if (vend) sales = sales.filter((x) => x.date === day());
  const money = !vend && u.role !== 'agent';
  const pid = u.role === 'patron' ? u.id : u.patronId;
  const costs = {};
  if (money) for (const k in db.costs) if (ids.has(k.split('|')[0])) costs[k] = db.costs[k];
  const tickets = (u.role === 'agent' ? [] : db.tickets.filter((x) => ids.has(x.shopId) && (!vend || x.date === day()))).slice(vend ? -40 : -300);
  const out = {
    costs, tickets,
    me: pub(u), rate: db.settings.rate, today: day(), shops, products, stock, users: users.map(pub),
    sales: money ? sales.slice(-800) : vend ? sales.slice(-60).map(({ costUSD, costCDF, ...r }) => r) : [],
    purchases: money ? db.purchases.filter((x) => ids.has(x.shopId)).slice(-300) : [],
    comments: u.role === 'agent' ? [] : db.comments.filter((x) => ids.has(x.shopId)).slice(-200),
    tasks: db.tasks.filter((t) => (u.role === 'superadmin' ? true : t.patronId === pid)),
    done: Object.keys(db.taskDone).filter((k) => k.startsWith(u.id + '|' + day())).map((k) => k.split('|')[2]),
    patrons: u.role === 'superadmin' ? db.users.filter((x) => x.role === 'patron').map(pub) : [],
    deals: u.role === 'superadmin' ? db.deals : u.role === 'agent' ? db.deals.filter((d) => d.agentId === u.id) : [],
    commissions: {},
  };
  if (u.role === 'superadmin') db.users.filter((x) => x.role === 'agent').forEach((a) => (out.commissions[a.id] = commission(a)));
  if (u.role === 'agent') out.commissions[u.id] = commission(u);
  return out;
});

/* ---------- taux de change ---------- */
route('put', '/api/rate', ['superadmin', 'patron'], (q) => {
  const r = num(q.body.rate);
  if (r < 100 || r > 100000) bad('Taux invalide (CDF pour 1 USD)');
  db.settings.rate = r;
  save();
  return { ok: true };
});

/* ---------- utilisateurs ---------- */
function mkUser(creator, b, shopIds, patronId) {
  const role = str(b.role, 10);
  const allowed = { superadmin: ['patron', 'gerant', 'vendeur', 'agent'], patron: ['gerant', 'vendeur'], gerant: ['vendeur'] }[creator.role] || [];
  if (!allowed.includes(role)) bad('Rôle non autorisé', 403);
  const username = str(b.username, 30).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) bad('Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)');
  if (db.users.some((x) => x.username === username)) bad('Cet identifiant existe déjà');
  if (String(b.password || '').length < 6) bad('Mot de passe : 6 caractères minimum');
  if (!str(b.name)) bad('Nom requis');
  return { id: uid(), name: str(b.name), username, hash: hashPw(String(b.password)), role, patronId: role === 'patron' || role === 'agent' ? undefined : patronId, shopIds, active: true, ts: Date.now() };
}
route('post', '/api/users', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body, u = q.u;
  const mine = shopsOf(u).map((s) => s.id);
  const shopIds = (Array.isArray(b.shopIds) ? b.shopIds : []).filter((x) => mine.includes(x));
  let patronId = u.role === 'patron' ? u.id : u.role === 'gerant' ? u.patronId : str(b.patronId, 20);
  if (b.role === 'vendeur' && !shopIds.length) bad('Choisissez une boutique pour le vendeur');
  if (['gerant', 'vendeur'].includes(b.role) && u.role === 'superadmin') {
    const sh = db.shops.find((s) => s.id === shopIds[0]);
    patronId = sh ? sh.patronId : patronId;
    if (!db.users.some((x) => x.id === patronId && x.role === 'patron')) bad('Choisissez un patron ou une boutique');
  }
  if (b.role === 'vendeur' && u.role === 'gerant' && shopIds.length > 1) shopIds.length = 1;
  const nu = mkUser(u, b, shopIds, patronId);
  db.users.push(nu);
  save();
  return pub(nu);
});
route('put', '/api/users/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const t = db.users.find((x) => x.id === q.params.id) || bad('Introuvable', 404);
  if (!manages(q.u, t)) bad('Accès refusé', 403);
  const b = q.body;
  if (b.name !== undefined) t.name = str(b.name) || t.name;
  if (b.active !== undefined) t.active = !!b.active;
  if (Array.isArray(b.shopIds)) {
    const mine = shopsOf(q.u).map((s) => s.id);
    t.shopIds = b.shopIds.filter((x) => mine.includes(x));
  }
  if (b.password) {
    if (String(b.password).length < 6) bad('Mot de passe : 6 caractères minimum');
    t.hash = hashPw(String(b.password));
  }
  save();
  return pub(t);
});
route('delete', '/api/users/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const t = db.users.find((x) => x.id === q.params.id) || bad('Introuvable', 404);
  if (!manages(q.u, t)) bad('Accès refusé', 403);
  db.users = db.users.filter((x) => x.id !== t.id);
  if (t.role === 'patron') {
    const sids = db.shops.filter((s) => s.patronId === t.id).map((s) => s.id);
    db.users = db.users.filter((x) => x.patronId !== t.id);
    db.shops = db.shops.filter((s) => s.patronId !== t.id);
    db.products = db.products.filter((p) => p.patronId !== t.id);
    db.sales = db.sales.filter((x) => !sids.includes(x.shopId));
    db.purchases = db.purchases.filter((x) => !sids.includes(x.shopId));
    db.comments = db.comments.filter((x) => !sids.includes(x.shopId));
    db.tasks = db.tasks.filter((x) => x.patronId !== t.id);
    db.tickets = db.tickets.filter((x) => !sids.includes(x.shopId));
    db.moves = db.moves.filter((x) => !sids.includes(x.shopId));
    for (const k in db.stock) if (sids.includes(k.split('|')[0])) delete db.stock[k];
    for (const k in db.costs) if (sids.includes(k.split('|')[0])) delete db.costs[k];
  }
  save();
  return { ok: true };
});

/* ---------- boutiques ---------- */
route('post', '/api/shops', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body, u = q.u;
  const patronId = u.role === 'patron' ? u.id : u.role === 'gerant' ? u.patronId : str(b.patronId, 20);
  if (!db.users.some((x) => x.id === patronId && x.role === 'patron')) bad('Patron introuvable');
  if (!str(b.name)) bad('Nom de la boutique requis');
  const sh = { id: uid(), patronId, name: str(b.name), addr: str(b.addr, 200), zone: str(b.zone, 80), ts: Date.now() };
  let seller = null;
  if (b.seller && (b.seller.username || b.seller.name)) {
    seller = mkUser({ role: 'superadmin' }, { ...b.seller, role: 'vendeur' }, [sh.id], patronId);
  }
  db.shops.push(sh);
  if (seller) db.users.push(seller);
  if (u.role === 'gerant') u.shopIds = [...(u.shopIds || []), sh.id];
  save();
  return sh;
});
route('put', '/api/shops/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const sh = shopOk(q.u, q.params.id);
  ['name', 'addr', 'zone'].forEach((k) => { if (q.body[k] !== undefined) sh[k] = str(q.body[k], k === 'addr' ? 200 : 80) || sh[k]; });
  save();
  return sh;
});
route('delete', '/api/shops/:id', ['superadmin', 'patron'], (q) => {
  const sh = shopOk(q.u, q.params.id);
  db.shops = db.shops.filter((s) => s.id !== sh.id);
  db.users.forEach((x) => { if (x.shopIds) x.shopIds = x.shopIds.filter((i) => i !== sh.id); });
  for (const k in db.stock) if (k.startsWith(sh.id + '|')) delete db.stock[k];
  for (const k in db.costs) if (k.startsWith(sh.id + '|')) delete db.costs[k];
  db.moves = db.moves.filter((x) => x.shopId !== sh.id);
  save();
  return { ok: true };
});

/* ---------- images produits ---------- */
route('post', '/api/upload', ['superadmin', 'patron', 'gerant', 'agent'], (q) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(q.body.data || ''));
  if (!m) bad('Image invalide');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2.5 * 1024 * 1024) bad('Image trop lourde (2,5 Mo max)');
  const ok = (m[1] === 'jpeg' && buf[0] === 0xff && buf[1] === 0xd8) || (m[1] === 'png' && buf.slice(1, 4).toString() === 'PNG') || (m[1] === 'webp' && buf.slice(0, 4).toString() === 'RIFF');
  if (!ok) bad('Fichier image invalide');
  const name = uid() + crypto.randomBytes(3).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UP, name), buf);
  return { url: '/uploads/' + name };
});

/* ---------- monnaie, unités et formats ---------- */
const CURS = ['USD', 'CDF'];
const RATE = () => db.settings.rate;
const cvt = (v, from, to) => (from === to ? v : from === 'USD' ? v * RATE() : v / RATE());
const mny = (amount, cur) => (cur === 'CDF' ? { usd: round(amount / RATE(), 4), cdf: round(amount, 2) } : { usd: round(amount, 4), cdf: round(amount * RATE(), 2) });
const costOf = (k, p) => (db.costs[k] !== undefined ? db.costs[k] : p.cost || 0);
const fnum = (x) => (+x).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const plural = (n, w) => { const l = String(w).toLowerCase(); return n > 1 && /^[a-zéèêàùçô]{3,}$/.test(l) && !/[sxz]$/.test(l) ? l + 's' : l; };
/* 55 bouteilles → « 4 paquets + 7 bouteilles » */
function fmtBase(p, base) {
  let rest = round(base, 4);
  const parts = [];
  for (const u of p.units.filter((x) => x.q > 1).sort((a, b) => b.q - a.q).slice(0, 2)) {
    const n = Math.floor(rest / u.q + 1e-9);
    if (n > 0) { parts.push(fnum(n) + ' ' + plural(n, u.n)); rest = round(rest - n * u.q, 4); }
  }
  if (rest > 1e-9 || !parts.length) parts.push(fnum(rest) + ' ' + plural(rest, p.base));
  return parts.join(' + ');
}
const refUnit = (p) => p.units.slice().sort((a, b) => b.q - a.q)[0];
const logMove = (shopId, productId, type, d, after, by, note, ref) => {
  db.moves.push({ id: uid(), shopId, productId, type, d: round(d, 4), after: round(after, 4), by, note: str(note, 200), ref, ts: Date.now() });
  if (db.moves.length > 30000) db.moves = db.moves.slice(-20000);
};

/* ---------- produits ---------- */
/* Un produit a une unité de base (le stock est compté en bouteilles, kg, $…) et plusieurs façons de vendre :
   units = [{ n:nom, q:nombre d'unités de base contenues, p:prix détail, w:prix de gros (option), wm:gros à partir de (option) }] */
function prodFields(b) {
  const cur = CURS.includes(b.cur) ? b.cur : 'USD';
  const seen = new Set();
  const units = (Array.isArray(b.units) ? b.units : []).slice(0, 8).map((u) => ({
    n: str(u && u.n, 30), q: round(num(u && u.q), 6), p: round(num(u && u.p), 6), w: round(num(u && u.w), 6), wm: num(u && u.wm),
  })).filter((u) => u.n && u.q > 0);
  if (!units.length) bad('Ajoutez au moins une façon de vendre (nom, quantité et prix)');
  for (const u of units) {
    if (!(u.p > 0)) bad('Prix de vente manquant pour « ' + u.n + ' »');
    if (u.w > u.p) bad('Le prix de gros de « ' + u.n + ' » dépasse son prix détail');
    if (seen.has(u.n.toLowerCase())) bad('Deux façons de vendre portent le même nom : ' + u.n);
    seen.add(u.n.toLowerCase());
  }
  const img = String(b.image || '');
  const aq = b.alertQty === undefined || b.alertQty === '' || b.alertQty === null ? 3 : num(b.alertQty);
  return {
    v: 2, name: str(b.name), image: /^\/uploads\/[\w.]+$/.test(img) ? img : '', kind: str(b.kind, 20) || 'custom',
    base: str(b.base, 20) || 'unité', dec: !!b.dec, cur, cost: round(num(b.cost), 6), units, alertQty: aq, free: !!b.free,
    quick: (Array.isArray(b.quick) ? b.quick : []).map(num).filter((x) => x > 0).slice(0, 10),
  };
}
route('post', '/api/products', ['superadmin', 'patron', 'gerant', 'agent'], (q) => {
  const b = q.body, u = q.u;
  if (!str(b.name)) bad('Nom du produit requis');
  let patronId, shopIds = null, sh = null;
  if (b.shopId) sh = shopOk(u, b.shopId);
  if (u.role === 'patron') patronId = u.id;
  else if (u.role === 'gerant') patronId = u.patronId;
  else { if (!sh) bad('Choisissez la boutique'); patronId = sh.patronId; }
  if (u.role === 'agent' || (u.role === 'superadmin' && sh)) shopIds = [sh.id];
  const p = { id: uid(), patronId, ...prodFields(b), shopIds, addedBy: u.id, ts: Date.now() };
  db.products.push(p);
  if (u.role === 'agent') db.agentProducts.push({ agentId: u.id, productId: p.id, ts: Date.now() });
  const qty = num(b.qty);
  if (sh && qty > 0 && u.role !== 'agent') {
    const k = sh.id + '|' + p.id;
    db.stock[k] = round(qty, 4);
    if (p.cost) db.costs[k] = p.cost;
    logMove(sh.id, p.id, 'in', qty, qty, u.name, 'Stock initial');
  }
  save();
  return p;
});
route('put', '/api/products/:id', ['superadmin', 'patron', 'gerant', 'agent'], (q) => {
  const p = db.products.find((x) => x.id === q.params.id);
  if (!p || !prodOk(q.u, p)) bad('Produit introuvable', 404);
  if (q.u.role === 'agent' && p.addedBy !== q.u.id) bad('Accès refusé', 403);
  const f = prodFields({ ...p, ...q.body });
  const mine = Object.keys(db.costs).filter((k) => k.endsWith('|' + p.id));
  if (f.cur !== p.cur) {
    mine.forEach((k) => { db.costs[k] = round(cvt(db.costs[k], p.cur, f.cur), 6); });
    if (q.body.cost === undefined) f.cost = round(cvt(p.cost, p.cur, f.cur), 6);
  }
  /* modifier le coût d'achat remplace le coût moyen dans toutes les boutiques */
  if (q.body.cost !== undefined && f.cost !== p.cost) mine.forEach((k) => { db.costs[k] = f.cost; });
  Object.assign(p, f);
  save();
  return p;
});
route('delete', '/api/products/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const p = db.products.find((x) => x.id === q.params.id);
  if (!p || !prodOk(q.u, p)) bad('Produit introuvable', 404);
  db.products = db.products.filter((x) => x.id !== p.id);
  for (const k in db.stock) if (k.endsWith('|' + p.id)) delete db.stock[k];
  for (const k in db.costs) if (k.endsWith('|' + p.id)) delete db.costs[k];
  db.moves = db.moves.filter((m) => m.productId !== p.id);
  save();
  return { ok: true };
});

/* ---------- stock : ravitaillement, retrait, inventaire ---------- */
route('post', '/api/stock', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body;
  const sh = shopOk(q.u, b.shopId);
  const p = db.products.find((x) => x.id === b.productId);
  if (!p || p.patronId !== sh.patronId) bad('Produit introuvable', 404);
  const u = p.units[parseInt(b.unit, 10) || 0] || p.units[0];
  const mode = ['in', 'out', 'set'].includes(b.mode) ? b.mode : 'in';
  const qty = +b.qty;
  if (!Number.isFinite(qty) || qty < 0 || (mode !== 'set' && qty === 0)) bad('Quantité invalide');
  const k = sh.id + '|' + p.id, have = db.stock[k] || 0;
  let delta, next, note = str(b.note, 200);
  if (mode === 'in') {
    const bonus = num(b.bonus);
    delta = round((qty + bonus) * u.q, 6);
    next = round(have + delta, 4);
    const paid = num(b.total);
    if (paid > 0) {
      const pc = CURS.includes(b.tcur) ? b.tcur : p.cur;
      /* coût par unité de base = montant payé ÷ tout ce qui est reçu (bonus compris) ; coût moyen pondéré avec l'ancien stock */
      const unitCost = round(cvt(paid, pc, p.cur) / delta, 6), oldC = costOf(k, p);
      db.costs[k] = have > 0 && oldC > 0 ? round((have * oldC + delta * unitCost) / next, 6) : unitCost;
      if (!p.cost) p.cost = unitCost;
      const m = mny(paid, pc);
      db.purchases.push({
        id: uid(), shopId: sh.id, supplier: str(b.supplier) || '—', note, cur: pc, amount: round(paid, 4), amountUSD: m.usd, amountCDF: m.cdf,
        productId: p.id, unitName: u.n, qty: round(qty, 4), bonus: round(bonus, 4),
        date: /^\d{4}-\d\d-\d\d$/.test(b.date || '') ? b.date : day(), by: q.u.name, ts: Date.now(),
      });
    }
  } else if (mode === 'out') {
    delta = -round(qty * u.q, 6);
    next = round(have + delta, 4);
    if (next < -1e-9) bad('Le stock ne peut pas être négatif (il reste ' + fmtBase(p, have) + ')');
    next = Math.max(0, next);
  } else {
    next = round(qty * u.q, 4);
    delta = round(next - have, 4);
  }
  db.stock[k] = next;
  logMove(sh.id, p.id, mode === 'set' ? 'adj' : mode, delta, next, q.u.name, note);
  save();
  return { qty: next, text: fmtBase(p, next), delta, cost: costOf(k, p) };
});
route('get', '/api/moves', ['superadmin', 'patron', 'gerant'], (q) => {
  const sh = shopOk(q.u, str(q.query.shopId, 20));
  const pid = str(q.query.productId, 20);
  return db.moves.filter((m) => m.shopId === sh.id && m.productId === pid).slice(-80).reverse();
});

/* ---------- ventes (panier : plusieurs lignes, un seul encaissement) ---------- */
route('post', '/api/sales', ['vendeur', 'gerant'], (q) => {
  const b = q.body, u = q.u;
  const sh = shopOk(u, b.shopId || (u.shopIds || [])[0]);
  const items = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  if (!items.length) bad('Le panier est vide');
  const pay = b.currency === 'CDF' ? 'CDF' : 'USD';
  const lines = [], need = {};
  for (const it of items) {
    const p = db.products.find((x) => x.id === (it && it.productId));
    if (!p || p.patronId !== sh.patronId || (p.shopIds && !p.shopIds.includes(sh.id))) bad('Produit introuvable', 404);
    const un = p.units[parseInt(it.unit, 10)];
    if (!un) bad('Unité de vente invalide pour ' + p.name);
    const qty = round(+it.qty, 3);
    if (!(qty > 0)) bad('Quantité invalide pour ' + p.name);
    if (!p.dec && !Number.isInteger(qty)) bad('Quantité entière requise pour ' + p.name);
    const tier = it.tier === 'g' && un.w > 0 ? 'g' : 'd';
    let price = tier === 'g' ? un.w : un.p, amount = round(qty * price, 4);
    if (p.free && it.total !== undefined && it.total !== '' && it.total !== null && Number.isFinite(+it.total) && +it.total >= 0) {
      amount = round(+it.total, 4);
      price = round(amount / qty, 4);
    }
    const base = round(qty * un.q, 6), k = sh.id + '|' + p.id;
    need[k] = round((need[k] || 0) + base, 6);
    lines.push({ p, un, qty, tier, price, amount, base, k });
  }
  for (const k in need) {
    const have = db.stock[k] || 0;
    if (need[k] > have + 1e-9) {
      const p = db.products.find((x) => x.id === k.split('|')[1]);
      bad(have <= 0 ? 'Rupture de stock : ' + p.name : 'Stock insuffisant pour ' + p.name + ' (il reste ' + fmtBase(p, have) + ')');
    }
  }
  const sum = lines.reduce((a, l) => { const m = mny(l.amount, l.p.cur); return a + (pay === 'CDF' ? m.cdf : m.usd); }, 0);
  const total = pay === 'CDF' ? Math.round(sum) : round(sum, 2);
  const received = b.received === undefined || b.received === '' || b.received === null ? total : num(b.received);
  if (received + (pay === 'CDF' ? 0.5 : 0.005) < total) bad('Montant reçu insuffisant');
  const change = round(received - total, pay === 'CDF' ? 0 : 2);
  const ticket = uid(), ts = Date.now(), date = day(), out = [], left = {};
  for (const l of lines) {
    const m = mny(l.amount, l.p.cur), c = mny(round(l.base * costOf(l.k, l.p), 6), l.p.cur);
    const sale = {
      id: uid(), ticket, shopId: sh.id, productId: l.p.id, sellerId: u.id, unit: l.un.n, uq: l.un.q, tier: l.tier, qty: l.qty, price: l.price,
      base: l.base, cur: l.p.cur, amount: l.amount, totalUSD: m.usd, totalCDF: m.cdf, costUSD: c.usd, costCDF: c.cdf, rate: RATE(), date, ts,
    };
    db.sales.push(sale);
    out.push(sale);
    db.stock[l.k] = Math.max(0, round((db.stock[l.k] || 0) - l.base, 4));
    left[l.p.id] = db.stock[l.k];
    logMove(sh.id, l.p.id, 'sale', -l.base, db.stock[l.k], u.name, '', ticket);
  }
  db.tickets.push({ id: ticket, shopId: sh.id, sellerId: u.id, cur: pay, total, received, change, n: lines.length, date, ts });
  for (const pid in left) {
    const p = db.products.find((x) => x.id === pid);
    if (left[pid] <= p.alertQty) {
      const text = (left[pid] <= 0 ? '⚠️ RUPTURE : ' : '⚠️ Stock bas (' + fmtBase(p, left[pid]) + ') : ') + p.name;
      const last = db.comments.filter((c) => c.shopId === sh.id && c.auto).pop();
      if (!last || last.text !== text) db.comments.push({ id: uid(), shopId: sh.id, from: 'Système', role: 'system', auto: true, text, ts: Date.now() });
    }
  }
  save();
  const strip = u.role === 'vendeur' ? out.map(({ costUSD, costCDF, ...r }) => r) : out;
  return { ticket, cur: pay, total, received, change, sales: strip, left };
});

/* ---------- achats (dépenses fournisseurs sans entrée de stock) ---------- */
route('post', '/api/purchases', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body;
  const sh = shopOk(q.u, b.shopId);
  const cur = CURS.includes(b.cur) ? b.cur : 'USD';
  const amt = round(num(b.amount), 4);
  if (!amt) bad('Montant requis');
  if (!str(b.supplier)) bad('Fournisseur requis');
  const m = mny(amt, cur);
  const r = {
    id: uid(), shopId: sh.id, supplier: str(b.supplier), note: str(b.note, 300), cur, amount: amt, amountUSD: m.usd, amountCDF: m.cdf,
    date: /^\d{4}-\d\d-\d\d$/.test(b.date || '') ? b.date : day(), by: q.u.name, ts: Date.now(),
  };
  db.purchases.push(r);
  save();
  return r;
});

/* ---------- commentaires ---------- */
route('post', '/api/comments', ['superadmin', 'patron', 'gerant', 'vendeur'], (q) => {
  const sh = shopOk(q.u, q.body.shopId);
  const text = str(q.body.text, 500);
  if (!text) bad('Message vide');
  db.comments.push({ id: uid(), shopId: sh.id, from: q.u.name, role: q.u.role, text, ts: Date.now() });
  if (db.comments.length > 5000) db.comments = db.comments.slice(-3000);
  save();
  return { ok: true };
});

/* ---------- tâches journalières ---------- */
route('post', '/api/tasks', ['superadmin', 'patron', 'gerant'], (q) => {
  const patronId = q.u.role === 'patron' ? q.u.id : q.u.role === 'gerant' ? q.u.patronId : str(q.body.patronId, 20);
  if (!patronId) bad('Patron requis');
  if (!str(q.body.text)) bad('Texte requis');
  db.tasks.push({ id: uid(), patronId, text: str(q.body.text, 200) });
  save();
  return { ok: true };
});
route('delete', '/api/tasks/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const t = db.tasks.find((x) => x.id === q.params.id);
  if (!t || (q.u.role !== 'superadmin' && t.patronId !== (q.u.role === 'patron' ? q.u.id : q.u.patronId))) bad('Introuvable', 404);
  db.tasks = db.tasks.filter((x) => x !== t);
  save();
  return { ok: true };
});
route('post', '/api/tasks/:id/toggle', ['vendeur', 'gerant'], (q) => {
  const t = db.tasks.find((x) => x.id === q.params.id && x.patronId === q.u.patronId) || bad('Introuvable', 404);
  const k = q.u.id + '|' + day() + '|' + t.id;
  if (db.taskDone[k]) delete db.taskDone[k]; else db.taskDone[k] = 1;
  save();
  return { ok: true };
});

/* ---------- marchés (commissions agents) ---------- */
route('post', '/api/deals', ['superadmin'], (q) => {
  const a = db.users.find((x) => x.id === q.body.agentId && x.role === 'agent') || bad('Agent introuvable', 404);
  const v = round(num(q.body.valueUSD));
  if (!v) bad('Valeur du marché requise');
  db.deals.push({ id: uid(), agentId: a.id, label: str(q.body.label, 120) || 'Marché boutique', valueUSD: v, date: day(), ts: Date.now() });
  save();
  return { ok: true };
});
route('delete', '/api/deals/:id', ['superadmin'], (q) => {
  db.deals = db.deals.filter((d) => d.id !== q.params.id);
  save();
  return { ok: true };
});

/* ---------- rapports ---------- */
const MZ = () => ({ usd: 0, cdf: 0 });
const madd = (a, b) => { a.usd += b.usd; a.cdf += b.cdf; return a; };
const msub = (a, b) => ({ usd: a.usd - b.usd, cdf: a.cdf - b.cdf });
const mr = (m) => ({ usd: round(m.usd, 4), cdf: round(m.cdf, 2) });
const sm = (x) => ({
  ca: { usd: x.totalUSD, cdf: x.totalCDF !== undefined ? x.totalCDF : round(x.totalUSD * RATE(), 2) },
  cost: { usd: x.costUSD || 0, cdf: x.costCDF !== undefined ? x.costCDF : round((x.costUSD || 0) * RATE(), 2) },
});
const pm = (x) => ({
  usd: x.amountUSD, cdf: x.amountCDF !== undefined ? x.amountCDF : round(x.amountUSD * RATE(), 2),
});
const hhmm = (ts) => new Date(ts + 3600e3).toISOString().slice(11, 16);

function buildReport(u, qr) {
  const from = /^\d{4}-\d\d-\d\d$/.test(qr.from || '') ? qr.from : day();
  const to = /^\d{4}-\d\d-\d\d$/.test(qr.to || '') ? qr.to : from;
  let shops = shopsOf(u);
  if (qr.shopId) shops = shops.filter((s) => s.id === qr.shopId);
  if (qr.gerantId) {
    const g = db.users.find((x) => x.id === qr.gerantId && x.role === 'gerant');
    shops = g ? shops.filter((s) => (g.shopIds || []).includes(s.id)) : [];
  }
  const ids = new Set(shops.map((s) => s.id));
  const sellerF = str(qr.sellerId, 20);
  const sales = db.sales.filter((x) => ids.has(x.shopId) && x.date >= from && x.date <= to && (!sellerF || x.sellerId === sellerF));
  const purchases = db.purchases.filter((x) => ids.has(x.shopId) && x.date >= from && x.date <= to);
  const shopName = (id) => (db.shops.find((s) => s.id === id) || {}).name || '?';
  const userName = (id) => (db.users.find((x) => x.id === id) || {}).name || '(supprimé)';
  const prodOf = (id) => db.products.find((p) => p.id === id);

  const grp = (key) => {
    const m = new Map();
    for (const x of sales) {
      const k = key(x);
      let g = m.get(k);
      if (!g) m.set(k, (g = { key: k, n: 0, ca: MZ(), cost: MZ(), base: 0, tickets: new Set() }));
      const s = sm(x);
      madd(g.ca, s.ca); madd(g.cost, s.cost);
      g.n++;
      g.base += x.base !== undefined ? x.base : x.qty;
      g.tickets.add(x.ticket || x.id);
    }
    return [...m.values()].map((g) => ({
      key: g.key, n: g.n, tickets: g.tickets.size, base: round(g.base, 4), ca: mr(g.ca), cost: mr(g.cost), profit: mr(msub(g.ca, g.cost)),
      margin: g.ca.usd > 0 ? round((g.ca.usd - g.cost.usd) / g.ca.usd, 4) : 0,
    }));
  };

  /* stock restant (valorisé au coût moyen) */
  const stock = [];
  for (const s of shops) {
    for (const p of db.products) {
      if (p.patronId !== s.patronId || (p.shopIds && !p.shopIds.includes(s.id))) continue;
      const k = s.id + '|' + p.id, base = db.stock[k] || 0, cost = costOf(k, p), ru = refUnit(p);
      const perBase = ru.p / ru.q;
      stock.push({
        shopId: s.id, shop: s.name, productId: p.id, product: p.name, base: round(base, 4), text: fmtBase(p, base), baseUnit: p.base,
        cost: round(cost, 6), cur: p.cur, value: mr(mny(base * cost, p.cur)), potential: mr(mny(base * (perBase - cost), p.cur)),
      });
    }
  }
  const perProduct = grp((x) => x.productId).map((g) => {
    const p = prodOf(g.key), ru = p ? refUnit(p) : null, st = stock.filter((x) => x.productId === g.key);
    const sv = st.reduce((a, x) => madd(a, x.value), MZ()), sp = st.reduce((a, x) => madd(a, x.potential), MZ());
    const per = ru && g.base > 0 ? g.base / ru.q : 0;
    return {
      ...g, id: g.key, name: p ? p.name : '(supprimé)', qtyText: p ? fmtBase(p, g.base) : String(g.base), refUnit: ru ? ru.n : '',
      profitPerRef: per > 0 ? mr({ usd: g.profit.usd / per, cdf: g.profit.cdf / per }) : null,
      stockBase: round(st.reduce((a, x) => a + x.base, 0), 4), stockText: p ? fmtBase(p, st.reduce((a, x) => a + x.base, 0)) : '', stockValue: mr(sv), potential: mr(sp),
    };
  }).sort((a, b) => b.ca.usd - a.ca.usd);

  const tot = { ca: MZ(), cost: MZ(), purchases: MZ(), stockValue: MZ(), potential: MZ() };
  const tk = new Set();
  sales.forEach((x) => { const s = sm(x); madd(tot.ca, s.ca); madd(tot.cost, s.cost); tk.add(x.ticket || x.id); });
  purchases.forEach((x) => madd(tot.purchases, pm(x)));
  stock.forEach((x) => { madd(tot.stockValue, x.value); madd(tot.potential, x.potential); });
  const totals = {
    ca: mr(tot.ca), cost: mr(tot.cost), profit: mr(msub(tot.ca, tot.cost)), purchases: mr(tot.purchases), stockValue: mr(tot.stockValue), potential: mr(tot.potential),
    margin: tot.ca.usd > 0 ? round((tot.ca.usd - tot.cost.usd) / tot.ca.usd, 4) : 0, count: sales.length, tickets: tk.size,
  };

  return {
    from, to, rate: RATE(), shops: shops.map((s) => ({ id: s.id, name: s.name })), totals,
    perShop: grp((x) => x.shopId).map((g) => ({ ...g, id: g.key, name: shopName(g.key), gerants: db.users.filter((x) => x.role === 'gerant' && (x.shopIds || []).includes(g.key)).map((x) => x.name) })),
    perProduct,
    perDay: grp((x) => x.date).sort((a, b) => a.key.localeCompare(b.key)),
    perSeller: grp((x) => x.sellerId).map((g) => ({ ...g, id: g.key, name: userName(g.key) })).sort((a, b) => b.ca.usd - a.ca.usd),
    journal: sales.slice().sort((a, b) => b.ts - a.ts).slice(0, 3000).map((x) => {
      const s = sm(x), p = prodOf(x.productId);
      return {
        date: x.date, time: hhmm(x.ts), shop: shopName(x.shopId), seller: userName(x.sellerId), product: p ? p.name : '(supprimé)', unit: x.unit || '', qty: x.qty,
        price: x.price !== undefined ? x.price : null, cur: x.cur || 'USD', ca: mr(s.ca), cost: mr(s.cost), profit: mr(msub(s.ca, s.cost)), ticket: x.ticket || x.id,
      };
    }),
    purchases: purchases.slice().sort((a, b) => b.ts - a.ts).map((x) => {
      const p = x.productId ? prodOf(x.productId) : null;
      return { date: x.date, shop: shopName(x.shopId), supplier: x.supplier, product: p ? p.name : '', unit: x.unitName || '', qty: x.qty || 0, bonus: x.bonus || 0, amount: mr(pm(x)), cur: x.cur || 'USD', native: x.amount !== undefined ? x.amount : x.amountUSD, note: x.note || '', by: x.by || '' };
    }),
    stock,
  };
}
route('get', '/api/report', ['superadmin', 'patron', 'gerant'], (q) => buildReport(q.u, q.query));

/* export Excel : un type de rapport au choix, ou le classeur général (toutes les feuilles) */
function reportSheets(r, type, cur) {
  const C = cur === 'CDF' ? 'cdf' : 'usd', T = cur === 'CDF' ? 'i' : 'd', U = cur === 'CDF' ? 'FC' : 'USD';
  const sub = `Période : ${r.from} → ${r.to}  ·  Devise : ${U}  ·  1 USD = ${fnum(r.rate)} CDF  ·  Édité le ${new Date(Date.now() + 3600e3).toISOString().replace('T', ' ').slice(0, 16)}`;
  const V = (m) => m[C];
  const L = {
    resume: () => ({
      name: 'Résumé', title: 'Rapport général', sub,
      cols: [{ h: 'Indicateur', w: 36 }, { h: 'Montant (' + U + ')', t: T, w: 20 }, { h: 'Nombre', t: 'i', w: 12 }, { h: 'Taux', t: 'p', w: 12 }],
      rows: [
        ['Chiffre d\'affaires', V(r.totals.ca), r.totals.count, null],
        ['Coût des produits vendus', V(r.totals.cost), null, null],
        [r.totals.profit.usd >= 0 ? 'Bénéfice' : 'Perte', V(r.totals.profit), null, r.totals.margin],
        ['Achats et ravitaillements de la période', V(r.totals.purchases), r.purchases.length, null],
        ['Valeur du stock restant (au coût)', V(r.totals.stockValue), null, null],
        ['Bénéfice potentiel du stock restant', V(r.totals.potential), null, null],
        ['Encaissements (tickets)', null, r.totals.tickets, null],
      ],
    }),
    boutiques: () => ({
      name: 'Par boutique', title: 'Rapport par boutique', sub,
      cols: [{ h: 'Boutique', w: 26 }, { h: 'Gérant(s)', w: 24 }, { h: 'Nb ventes', t: 'i' }, { h: 'Chiffre d\'affaires (' + U + ')', t: T, w: 20 }, { h: 'Coût (' + U + ')', t: T, w: 16 }, { h: 'Bénéfice (' + U + ')', t: T, w: 16 }, { h: 'Marge', t: 'p' }],
      rows: r.perShop.map((x) => [x.name, x.gerants.join(', '), x.n, V(x.ca), V(x.cost), V(x.profit), x.margin]), total: { sum: [2, 3, 4, 5] },
    }),
    produits: () => ({
      name: 'Par produit', title: 'Rapport par produit', sub,
      cols: [{ h: 'Produit', w: 28 }, { h: 'Quantité vendue', w: 22 }, { h: 'Nb ventes', t: 'i' }, { h: 'Chiffre d\'affaires (' + U + ')', t: T, w: 20 }, { h: 'Coût (' + U + ')', t: T, w: 16 }, { h: 'Bénéfice (' + U + ')', t: T, w: 16 }, { h: 'Marge', t: 'p' }, { h: 'Grande unité', w: 14 }, { h: 'Bénéfice par grande unité (' + U + ')', t: T, w: 22 }, { h: 'Stock restant', w: 22 }, { h: 'Valeur du stock (' + U + ')', t: T, w: 18 }, { h: 'Bénéfice potentiel du stock (' + U + ')', t: T, w: 22 }],
      rows: r.perProduct.map((x) => [x.name, x.qtyText, x.n, V(x.ca), V(x.cost), V(x.profit), x.margin, x.refUnit, x.profitPerRef ? V(x.profitPerRef) : null, x.stockText, V(x.stockValue), V(x.potential)]), total: { sum: [2, 3, 4, 5, 10, 11] },
    }),
    jours: () => ({
      name: 'Par jour', title: 'Rapport par jour', sub,
      cols: [{ h: 'Date', w: 14 }, { h: 'Nb ventes', t: 'i' }, { h: 'Tickets', t: 'i' }, { h: 'Chiffre d\'affaires (' + U + ')', t: T, w: 20 }, { h: 'Coût (' + U + ')', t: T, w: 16 }, { h: 'Bénéfice (' + U + ')', t: T, w: 16 }, { h: 'Marge', t: 'p' }],
      rows: r.perDay.map((x) => [x.key, x.n, x.tickets, V(x.ca), V(x.cost), V(x.profit), x.margin]), total: { sum: [1, 2, 3, 4, 5] },
    }),
    vendeurs: () => ({
      name: 'Par vendeur', title: 'Rapport par vendeur', sub,
      cols: [{ h: 'Vendeur', w: 26 }, { h: 'Nb ventes', t: 'i' }, { h: 'Tickets', t: 'i' }, { h: 'Chiffre d\'affaires (' + U + ')', t: T, w: 20 }, { h: 'Coût (' + U + ')', t: T, w: 16 }, { h: 'Bénéfice (' + U + ')', t: T, w: 16 }, { h: 'Marge', t: 'p' }],
      rows: r.perSeller.map((x) => [x.name, x.n, x.tickets, V(x.ca), V(x.cost), V(x.profit), x.margin]), total: { sum: [1, 2, 3, 4, 5] },
    }),
    ventes: () => ({
      name: 'Ventes détaillées', title: 'Journal des ventes', sub,
      cols: [{ h: 'Date', w: 12 }, { h: 'Heure', w: 8 }, { h: 'Boutique', w: 20 }, { h: 'Vendeur', w: 20 }, { h: 'Produit', w: 28 }, { h: 'Unité', w: 12 }, { h: 'Quantité', t: 'd', w: 10 }, { h: 'Prix unitaire', t: 'd', w: 14 }, { h: 'Devise du prix', w: 10 }, { h: 'Total (' + U + ')', t: T, w: 16 }, { h: 'Coût (' + U + ')', t: T, w: 16 }, { h: 'Bénéfice (' + U + ')', t: T, w: 16 }, { h: 'N° ticket', w: 12 }],
      rows: r.journal.map((x) => [x.date, x.time, x.shop, x.seller, x.product, x.unit, x.qty, x.price, x.cur === 'CDF' ? 'FC' : 'USD', V(x.ca), V(x.cost), V(x.profit), x.ticket]), total: { sum: [9, 10, 11] },
    }),
    achats: () => ({
      name: 'Achats', title: 'Achats et ravitaillements', sub,
      cols: [{ h: 'Date', w: 12 }, { h: 'Boutique', w: 20 }, { h: 'Fournisseur', w: 22 }, { h: 'Produit', w: 26 }, { h: 'Unité', w: 12 }, { h: 'Quantité', t: 'd', w: 10 }, { h: 'Bonus', t: 'd', w: 10 }, { h: 'Montant (' + U + ')', t: T, w: 16 }, { h: 'Note', w: 30 }, { h: 'Saisi par', w: 18 }],
      rows: r.purchases.map((x) => [x.date, x.shop, x.supplier, x.product, x.unit, x.qty || null, x.bonus || null, V(x.amount), x.note, x.by]), total: { sum: [7] },
    }),
    stock: () => ({
      name: 'Stock', title: 'État du stock', sub,
      cols: [{ h: 'Boutique', w: 20 }, { h: 'Produit', w: 28 }, { h: 'Stock', w: 24 }, { h: 'Quantité (unité de base)', t: 'd', w: 18 }, { h: 'Unité de base', w: 14 }, { h: 'Coût par unité de base', t: 'd', w: 18 }, { h: 'Devise du coût', w: 10 }, { h: 'Valeur au coût (' + U + ')', t: T, w: 18 }, { h: 'Bénéfice potentiel (' + U + ')', t: T, w: 20 }],
      rows: r.stock.map((x) => [x.shop, x.product, x.text, x.base, x.baseUnit, x.cost, x.cur === 'CDF' ? 'FC' : 'USD', V(x.value), V(x.potential)]), total: { sum: [7, 8] },
    }),
  };
  const sets = { general: ['resume', 'boutiques', 'produits', 'jours', 'vendeurs', 'ventes', 'achats', 'stock'], produits: ['produits', 'stock'] };
  return (sets[type] || [type in L ? type : 'resume']).map((k) => L[k]());
}
route('get', '/api/report.xlsx', ['superadmin', 'patron', 'gerant'], (q, s) => {
  const r = buildReport(q.u, q.query);
  const type = str(q.query.type, 12) || 'general';
  const buf = buildXlsx(reportSheets(r, type, q.query.cur === 'CDF' ? 'CDF' : 'USD'));
  s.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="rapport-${type.replace(/[^a-z]/g, '')}-${r.from}_${r.to}.xlsx"`,
    'Cache-Control': 'no-store',
  });
  s.send(buf);
});

app.get('/api/health', (q, s) => s.json({ ok: true }));
app.use('/api', (q, s) => s.status(404).json({ error: 'Introuvable' }));
app.use((q, s) => s.sendFile(webFile('index.html')));

app.listen(PORT, () => console.log(`[BoutiquePro] http://localhost:${PORT}  (données : ${DATA})`));
