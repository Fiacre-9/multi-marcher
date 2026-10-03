'use strict';
/* BoutiquePro – serveur Node.js (Express, stockage JSON, sans dépendance native) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
let db = { settings: { rate: 2800 }, users: [], shops: [], products: [], stock: {}, sales: [], purchases: [], comments: [], tasks: [], taskDone: {}, deals: [], agentProducts: [] };
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
  [['Eau minérale 50cl', 0.4, 0.55, 0.8, null, 40], ['Jus 1L', 1, 1.4, 2, { unit: 'verre', parts: 5, priceUSD: 0.5 }, 12], ['Savon', 0.5, 0.7, 1, null, 3], ['Riz sac 25 kg', 28, 32, 36, { unit: 'kg', parts: 25, priceUSD: 1.6 }, 4], ['Sucre sac 25 kg', 30, 34, 38, { unit: 'kg', parts: 25, priceUSD: 1.7 }, 2]].forEach(([name, c, w, p, d, q]) => {
    const pr = { id: uid(), patronId: patron.id, name, image: '', costUSD: c, wholeUSD: w, priceUSD: p, detail: d, alertQty: 3, shopIds: null, addedBy: patron.id, ts: Date.now() };
    db.products.push(pr);
    db.stock[sh.id + '|' + pr.id] = q;
  });
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
app.get('/sw.js', (q, s) => { s.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/', 'Content-Type': 'text/javascript; charset=utf-8' }); s.sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.get('/manifest.webmanifest', (q, s) => { s.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json; charset=utf-8' }); s.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest')); });
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
app.use(express.static(path.join(__dirname, 'public')));

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
  const products = db.products.filter((p) => prodOk(u, p)).map((p) => (vend ? { ...p, costUSD: undefined } : p));
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
  const out = {
    me: pub(u), rate: db.settings.rate, today: day(), shops, products, stock, users: users.map(pub),
    sales: money ? sales.slice(-800) : vend ? sales.slice(-60).map(({ costUSD, ...r }) => r) : [],
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
    for (const k in db.stock) if (sids.includes(k.split('|')[0])) delete db.stock[k];
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

/* ---------- produits ---------- */
function prodFields(b) {
  const d = b.detail && b.detail.unit && num(b.detail.parts) > 0 ? { unit: str(b.detail.unit, 20), parts: num(b.detail.parts), priceUSD: round(num(b.detail.priceUSD)) } : null;
  const img = String(b.image || '');
  return { name: str(b.name), image: /^\/uploads\/[\w.]+$/.test(img) ? img : '', costUSD: round(num(b.costUSD)), wholeUSD: round(num(b.wholeUSD)), priceUSD: round(num(b.priceUSD)), detail: d, alertQty: num(b.alertQty) || 3 };
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
  if (sh && num(b.qty) > 0 && u.role !== 'agent') db.stock[sh.id + '|' + p.id] = round(num(b.qty), 3);
  save();
  return p;
});
route('put', '/api/products/:id', ['superadmin', 'patron', 'gerant', 'agent'], (q) => {
  const p = db.products.find((x) => x.id === q.params.id);
  if (!p || !prodOk(q.u, p)) bad('Produit introuvable', 404);
  if (q.u.role === 'agent' && p.addedBy !== q.u.id) bad('Accès refusé', 403);
  Object.assign(p, prodFields({ ...p, ...q.body }));
  save();
  return p;
});
route('delete', '/api/products/:id', ['superadmin', 'patron', 'gerant'], (q) => {
  const p = db.products.find((x) => x.id === q.params.id);
  if (!p || !prodOk(q.u, p)) bad('Produit introuvable', 404);
  db.products = db.products.filter((x) => x.id !== p.id);
  for (const k in db.stock) if (k.endsWith('|' + p.id)) delete db.stock[k];
  save();
  return { ok: true };
});

/* ---------- stock ---------- */
route('post', '/api/stock', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body;
  const sh = shopOk(q.u, b.shopId);
  const p = db.products.find((x) => x.id === b.productId);
  if (!p || p.patronId !== sh.patronId) bad('Produit introuvable', 404);
  const qty = +b.qty;
  if (!Number.isFinite(qty) || qty === 0) bad('Quantité invalide');
  const k = sh.id + '|' + p.id;
  const next = round((db.stock[k] || 0) + qty, 3);
  if (next < 0) bad('Le stock ne peut pas être négatif');
  db.stock[k] = next;
  if (b.costUSD !== undefined && b.costUSD !== '' && num(b.costUSD) > 0) p.costUSD = round(num(b.costUSD));
  save();
  return { qty: next };
});

/* ---------- ventes ---------- */
route('post', '/api/sales', ['vendeur', 'gerant'], (q) => {
  const b = q.body, u = q.u;
  const sh = shopOk(u, b.shopId || (u.shopIds || [])[0]);
  const p = db.products.find((x) => x.id === b.productId);
  if (!p || p.patronId !== sh.patronId || (p.shopIds && !p.shopIds.includes(sh.id))) bad('Produit introuvable', 404);
  const mode = b.mode === 'd' && p.detail ? 'd' : b.mode === 'g' && p.wholeUSD > 0 ? 'g' : 'u';
  const qty = round(+b.qty, 3);
  if (!(qty > 0)) bad('Quantité invalide');
  if (mode !== 'd' && !Number.isInteger(qty)) bad('Quantité entière requise');
  const unit = mode === 'd' ? p.detail.priceUSD : mode === 'g' ? p.wholeUSD : p.priceUSD;
  const base = mode === 'd' ? qty / p.detail.parts : qty;
  const total = round(qty * unit);
  const k = sh.id + '|' + p.id;
  const have = db.stock[k] || 0;
  if (base > have + 1e-9) bad(have <= 0 ? 'Rupture de stock' : 'Stock insuffisant (reste ' + round(have, 2) + ')');
  const cur = b.currency === 'CDF' ? 'CDF' : 'USD';
  const received = num(b.received);
  const recUSD = cur === 'CDF' ? received / db.settings.rate : received;
  if (recUSD < total - (cur === 'CDF' ? 1 / db.settings.rate : 0.005)) bad('Montant reçu insuffisant');
  const left = round(have - base, 3);
  db.stock[k] = left < 0 ? 0 : left;
  const sale = { id: uid(), shopId: sh.id, productId: p.id, sellerId: u.id, mode, qty, totalUSD: total, costUSD: round(base * (p.costUSD || 0)), currency: cur, received, changeUSD: round(recUSD - total), date: day(), ts: Date.now() };
  db.sales.push(sale);
  if (left <= p.alertQty) {
    const text = (left <= 0 ? '⚠️ RUPTURE : ' : '⚠️ Stock bas (' + round(left, 2) + ') : ') + p.name;
    const last = db.comments.filter((c) => c.shopId === sh.id && c.auto).pop();
    if (!last || last.text !== text) db.comments.push({ id: uid(), shopId: sh.id, from: 'Système', role: 'system', auto: true, text, ts: Date.now() });
  }
  save();
  return { sale, left: db.stock[k] };
});

/* ---------- achats / ravitaillement ---------- */
route('post', '/api/purchases', ['superadmin', 'patron', 'gerant'], (q) => {
  const b = q.body;
  const sh = shopOk(q.u, b.shopId);
  const amt = round(num(b.amountUSD));
  if (!amt) bad('Montant requis');
  if (!str(b.supplier)) bad('Fournisseur requis');
  const r = { id: uid(), shopId: sh.id, supplier: str(b.supplier), note: str(b.note, 300), amountUSD: amt, date: /^\d{4}-\d\d-\d\d$/.test(b.date || '') ? b.date : day(), by: q.u.name, ts: Date.now() };
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
route('get', '/api/report', ['superadmin', 'patron', 'gerant'], (q) => {
  const from = /^\d{4}-\d\d-\d\d$/.test(q.query.from || '') ? q.query.from : day();
  const to = /^\d{4}-\d\d-\d\d$/.test(q.query.to || '') ? q.query.to : from;
  let shops = shopsOf(q.u);
  if (q.query.shopId) shops = shops.filter((s) => s.id === q.query.shopId);
  if (q.query.gerantId) {
    const g = db.users.find((x) => x.id === q.query.gerantId && x.role === 'gerant');
    shops = g ? shops.filter((s) => (g.shopIds || []).includes(s.id)) : [];
  }
  const ids = new Set(shops.map((s) => s.id));
  const sales = db.sales.filter((x) => ids.has(x.shopId) && x.date >= from && x.date <= to);
  const purchases = db.purchases.filter((x) => ids.has(x.shopId) && x.date >= from && x.date <= to);
  const sum = (a, f) => round(a.reduce((s, x) => s + f(x), 0), 2);
  const group = (arr, key) => {
    const m = {};
    arr.forEach((x) => { const g = (m[key(x)] ||= { ca: 0, cost: 0, n: 0 }); g.ca += x.totalUSD; g.cost += x.costUSD; g.n++; });
    return Object.entries(m).map(([k, v]) => ({ key: k, ca: round(v.ca, 2), cost: round(v.cost, 2), profit: round(v.ca - v.cost, 2), n: v.n }));
  };
  const ca = sum(sales, (x) => x.totalUSD), cost = sum(sales, (x) => x.costUSD);
  return {
    from, to, ca, cost, profit: round(ca - cost, 2), count: sales.length, purchasesTotal: sum(purchases, (x) => x.amountUSD),
    perShop: group(sales, (x) => x.shopId).map((g) => ({ ...g, name: (db.shops.find((s) => s.id === g.key) || {}).name || '?', gerants: db.users.filter((x) => x.role === 'gerant' && (x.shopIds || []).includes(g.key)).map((x) => x.name) })),
    perProduct: group(sales, (x) => x.productId).map((g) => ({ ...g, name: (db.products.find((p) => p.id === g.key) || {}).name || '(supprimé)' })).sort((a, b) => b.ca - a.ca),
    perDay: group(sales, (x) => x.date).sort((a, b) => a.key.localeCompare(b.key)),
    purchases: purchases.map((x) => ({ ...x, shop: (db.shops.find((s) => s.id === x.shopId) || {}).name })),
  };
});

app.get('/api/health', (q, s) => s.json({ ok: true }));
app.use('/api', (q, s) => s.status(404).json({ error: 'Introuvable' }));
app.use((q, s) => s.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`[BoutiquePro] http://localhost:${PORT}  (données : ${DATA})`));
