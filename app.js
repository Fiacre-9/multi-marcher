'use strict';
/* BoutiquePro – interface web (JavaScript pur, aucune dépendance) */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('bp_tok') || '', cur: localStorage.getItem('bp_cur') || 'USD', tab: '', data: null, raw: '', shop: '', rep: null, repData: null, sale: null, cart: [], pay: null, dirty: false, stockSel: null };
const ROLE = { superadmin: 'Super admin', patron: 'Patron', gerant: 'Gérant', vendeur: 'Vendeur', agent: 'Agent éditeur' };
const TABS = {
  vendeur: ['Vente', 'Tâches', 'Messages'],
  gerant: ['Tableau', 'Produits', 'Stock', 'Boutiques', 'Achats', 'Rapport', 'Tâches', 'Messages'],
  patron: ['Tableau', 'Gérants', 'Boutiques', 'Rapport', 'Tâches', 'Messages'],
  superadmin: ['Tableau', 'Utilisateurs', 'Agents', 'Produits', 'Boutiques'],
  agent: ['Mon espace', 'Produits'],
};

/* ---------- devises et montants ---------- */
const D = () => S.data;
const rate = () => (S.data ? S.data.rate : 2800);
const nf = (v, d = 0) => (+v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fc = (v) => nf(Math.round(v)) + ' FC';
const dl = (v) => { const a = Math.abs(v), d = a > 0 && a < 0.1 ? 3 : 2; return (v < 0 ? '-' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fN = (v, cur) => (cur === 'CDF' ? fc(v) : dl(v));                                  // montant dans sa devise d'origine
const fm = (usd, cur = S.cur) => (cur === 'CDF' ? fc(usd * rate()) : dl(usd));            // à partir de dollars (commissions)
const cv = (v, from, to) => (from === to ? v : from === 'USD' ? v * rate() : v / rate());
const cvr = (v, from, to) => { const x = cv(v, from, to); return to === 'CDF' ? Math.round(x * 100) / 100 : Math.round(x * 1e4) / 1e4; };
const mS = (x, k) => ({ u: x[k + 'USD'] || 0, c: x[k + 'CDF'] !== undefined ? x[k + 'CDF'] : (x[k + 'USD'] || 0) * rate() });
const sumS = (arr, k) => arr.reduce((a, x) => { const m = mS(x, k); return { u: a.u + m.u, c: a.c + m.c }; }, { u: 0, c: 0 });
const fS = (m) => (S.cur === 'CDF' ? fc(m.c) : dl(m.u));                                  // {u,c} issus des ventes
const fR = (m) => (S.cur === 'CDF' ? fc(m.cdf) : dl(m.usd));                              // {usd,cdf} issus des rapports
const toUSD = (v, cur = S.cur) => (cur === 'CDF' ? (+v || 0) / rate() : +v || 0);
const fromUSD = (u, cur = S.cur) => (cur === 'CDF' ? Math.round(u * rate()) : +(+u || 0).toFixed(2));
const step = () => (S.cur === 'CDF' ? 1 : 0.01);
const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

/* ---------- unités : 55 bouteilles → « 4 paquets + 7 bouteilles » ---------- */
const plural = (n, w) => { const l = String(w).toLowerCase(); return n > 1 && /^[a-zéèêàùçô]{3,}$/.test(l) && !/[sxz]$/.test(l) ? l + 's' : l; };
const fnum = (x) => nf(x, Math.abs(x - Math.round(x)) < 1e-9 ? 0 : 3).replace(/,?0+$/, (m) => (m.startsWith(',') ? '' : m));
function fmtBase(p, base) {
  let rest = Math.round(base * 1e4) / 1e4;
  const parts = [];
  for (const u of p.units.filter((x) => x.q > 1).sort((a, b) => b.q - a.q).slice(0, 2)) {
    const n = Math.floor(rest / u.q + 1e-9);
    if (n > 0) { parts.push(fnum(n) + ' ' + plural(n, u.n)); rest = Math.round((rest - n * u.q) * 1e4) / 1e4; }
  }
  if (rest > 1e-9 || !parts.length) parts.push(fnum(rest) + ' ' + plural(rest, p.base));
  return parts.join(' + ');
}
const refU = (p) => p.units.slice().sort((a, b) => b.q - a.q)[0];

/* ---------- aides d'affichage ---------- */
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const ph = (n) => `<div class="ph" style="background:hsl(${hue(n)} 55% 50%)">${esc((n || '?').trim().slice(0, 2).toUpperCase())}</div>`;
const pimg = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : ph(p.name));
const stk = (sid, pid) => D().stock[sid + '|' + pid] || 0;
const costOf = (sid, p) => { const c = (D().costs || {})[sid + '|' + p.id]; return c !== undefined ? c : p.cost || 0; };
const prod = (id) => D().products.find((p) => p.id === id);
const shopN = (id) => (D().shops.find((s) => s.id === id) || {}).name || '?';
const userN = (id) => (D().users.find((u) => u.id === id) || (D().me.id === id ? D().me : {})).name || '—';
const hm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
const badge = (q, p) => (q <= 0 ? '<span class="badge out">Rupture</span>' : q <= p.alertQty ? `<span class="badge low">Bas : ${esc(fmtBase(p, q))}</span>` : `<span class="badge">${esc(fmtBase(p, q))}</span>`);
const kpi = (l, v, c = '') => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b></div>`;
const empty = (t) => `<div class="empty">${t}</div>`;
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const cur$ = () => `<span class="mut">(${S.cur === 'CDF' ? 'FC' : '$'})</span>`;
const okFor = (p, s) => p.patronId === s.patronId && (!p.shopIds || p.shopIds.includes(s.id));
const sgn = (m) => (m < 0 ? 'neg' : '');
const myShop = () => {
  const sh = D().shops;
  if (!sh.find((s) => s.id === S.shop)) S.shop = (sh[0] || {}).id || '';
  return S.shop;
};
const shopPicker = () => D().shops.length > 1
  ? `<select class="noprint" data-pick="shop" style="max-width:260px;margin-bottom:12px">${opts(D().shops.map((s) => [s.id, s.name]), myShop())}</select>` : '';
const unitsLine = (p, n = 9) => p.units.slice(0, n).map((u) => `${esc(u.n)} ${fN(u.p, p.cur)}`).join(' · ');

function toast(m, err) {
  const d = document.createElement('div');
  d.textContent = m;
  if (err) d.className = 'err';
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3600);
}

/* ---------- API ---------- */
async function api(p, m, b) {
  try { return await api0(p, m, b); }
  catch (e) { throw e instanceof TypeError ? new Error('Pas de connexion internet') : e; }
}
async function api0(p, m = 'GET', b) {
  const r = await fetch('/api' + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && p !== '/login') { logout(); throw new Error(j.error || 'Session expirée, reconnectez-vous'); }
  if (!r.ok) throw new Error(j.error || 'Erreur');
  return j;
}
function logout() {
  if (S.token) pushOff(S.token);
  localStorage.removeItem('bp_tok');
  Object.assign(S, { token: '', data: null, raw: '', tab: '', repData: null, cart: [], sale: null, pay: null, dirty: false });
  render();
}
async function load(force) {
  const d = await api('/data');
  const raw = JSON.stringify(d);
  if (raw === S.raw && !force) return;
  S.raw = raw;
  if (!S.data && sndOn() && 'Notification' in window && Notification.permission === 'granted') pushOn();
  S.data = d;
  try { notifyNew(d); } catch { /* son non critique */ }
  render();
}

/* ---------- sonneries & notifications ---------- */
let AC = null;
const sndOn = () => localStorage.getItem('bp_snd') !== '0';
function unlockAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { /* */ } }
['click', 'keydown', 'touchstart'].forEach((e) => document.addEventListener(e, unlockAudio, { passive: true }));
function tone(f, t0, d, vol, type) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, AC.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.25, AC.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + t0 + d);
  o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + t0); o.stop(AC.currentTime + t0 + d + 0.05);
}
function ring(kind) {
  if (!sndOn()) return;
  unlockAudio();
  if (!AC || AC.state !== 'running') return;
  if (kind === 'sale') { tone(1318, 0, 0.18, 0.3, 'triangle'); tone(1760, 0.14, 0.18, 0.3, 'triangle'); tone(2093, 0.28, 0.45, 0.3, 'triangle'); }      // « ka-ching »
  else if (kind === 'alert') { tone(660, 0, 0.2, 0.3, 'square'); tone(520, 0.24, 0.3, 0.3, 'square'); }
  else { tone(880, 0, 0.18, 0.28); tone(1174, 0.2, 0.35, 0.28); }                                                                                     // notification
  if (navigator.vibrate) navigator.vibrate(kind === 'sale' ? [80, 40, 80] : 120);
}
/* push : abonnement de cet appareil (fonctionne application fermée) */
const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((x) => x.charCodeAt(0))); };
async function pushOn() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !S.token) return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return false;
    const { key } = await api('/push/key');
    if (!key) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
    await api('/push/sub', 'POST', { subscription: sub.toJSON() });
    return true;
  } catch { return false; }
}
async function pushOff(tok) {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await fetch('/api/push/off', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tok || S.token) }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
  } catch { /* */ }
}
function sysNotify(title, body) {
  try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icons/icon-192.png' }); } catch { /* */ }
}
function notifyNew(d) {
  const me = d.me, ids = { s: new Set(d.sales.map((x) => x.ticket || x.id)), c: new Set(d.comments.map((x) => x.id)), t: new Set(d.tasks.map((x) => x.id)) };
  const seen = S.seen;
  S.seen = ids;
  if (!seen || seen.uid !== me.id) { S.seen.uid = me.id; return; }
  S.seen.uid = me.id;
  let msgs = [];
  if (['gerant', 'patron'].includes(me.role)) {
    const n = [...ids.s].filter((x) => !seen.s.has(x)).length;
    if (n) { msgs.push(['sale', '💰 ' + (n > 1 ? n + ' nouvelles ventes' : 'Nouvelle vente')]); }
  }
  const nc = d.comments.filter((x) => !seen.c.has(x.id) && x.from !== me.name);
  if (nc.length) msgs.push([nc.some((x) => x.auto) ? 'alert' : 'msg', nc[nc.length - 1].auto ? '⚠️ ' + nc[nc.length - 1].text : '💬 ' + nc[nc.length - 1].from + ' : ' + nc[nc.length - 1].text]);
  if (me.role !== 'patron' && [...ids.t].some((x) => !seen.t.has(x))) msgs.push(['msg', '📋 Nouvelle tâche']);
  if (!msgs.length) return;
  const top = msgs.find((m) => m[0] === 'sale') || msgs.find((m) => m[0] === 'alert') || msgs[0];
  ring(top[0]);
  toast(top[1]);
  sysNotify('BoutiquePro', top[1]);
}

/* ---------- rendu ---------- */
const root = $('#root');
function render() {
  const y = window.scrollY;
  if (!S.token || !S.data) { root.innerHTML = loginView(); return; }
  const me = D().me, tabs = TABS[me.role];
  if (!tabs.includes(S.tab)) S.tab = tabs[0];
  root.innerHTML = `
  <header>
    <div class="brand"><div class="logo">🏪</div><span>BoutiquePro</span></div><div class="sp"></div>
    ${S.install ? '<button class="btn s noprint" data-a="install">📲 Installer</button>' : ''}
    <button class="bell noprint" data-a="snd" title="Sonnerie" aria-label="Sonnerie">${sndOn() ? '🔔' : '🔕'}</button>
    <div class="seg noprint"><button data-a="cur" data-v="USD" class="${S.cur === 'USD' ? 'on' : ''}">USD</button><button data-a="cur" data-v="CDF" class="${S.cur === 'CDF' ? 'on' : ''}">CDF</button></div>
    <div class="who noprint"><b>${esc(me.name)}</b><span>${ROLE[me.role]} · <a href="#" data-a="pw">Mot de passe</a> · <a href="#" data-a="logout">Quitter</a></span></div>
  </header>
  <nav class="tabs">${tabs.map((t) => `<button data-a="tab" data-v="${t}" class="${t === S.tab ? 'on' : ''}">${t}</button>`).join('')}</nav>
  <main>${(VIEWS[me.role + '|' + S.tab] || (() => ''))()}</main>${me.role === 'vendeur' && S.tab === 'Vente' ? cartBar() : ''}`;
  window.scrollTo(0, y);
  afterRender();
}
function afterRender() {
  document.querySelectorAll('form[data-f=product]').forEach(prodPrev);
  document.querySelectorAll('form[data-f=stock]').forEach((f) => stockInit(f, false));
}
function loginView() {
  return `<div class="login"><form class="card" data-f="login"><div class="logo">🏪</div><h1>BoutiquePro</h1><p class="mut">Gestion de boutiques · Connexion</p>
  <label>Identifiant</label><input name="username" autocomplete="username" autocapitalize="none" required>
  <label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" required>
  <button class="btn big">Se connecter</button>${S.install ? '<button type="button" class="btn o big" data-a="install">📲 Installer l\'application</button>' : ''}<div class="err" id="lerr"></div></form></div>`;
}

/* ---------- formulaire produit : modèles de commerce ---------- */
const PRESETS = {
  simple: { label: 'Produit simple, à la pièce', base: 'pièce', units: [['Pièce', 1]], hint: 'Un produit vendu à la pièce : savon, cahier, ampoule, clou…' },
  paquet: { label: 'Boisson en paquets (eau, jus, bière)', base: 'bouteille', units: [['Bouteille', 1], ['Paquet', 12]], hint: 'Le stock est compté en bouteilles. Un paquet en contient 12 : quand vous vendez un paquet, 12 bouteilles sortent du stock. Changez le nombre si votre paquet est différent.' },
  carton: { label: 'Carton ou lot de pièces', base: 'pièce', units: [['Pièce', 1], ['Carton', 24]], hint: 'Le stock est compté en pièces. Un carton en contient 24 : vendre un carton retire 24 pièces.' },
  sac: { label: 'Sac ou vente au poids (riz, sucre, farine)', base: 'kg', dec: true, alert: 25, units: [['Sac', 25], ['Kg', 1], ['Verre', 0.25], ['Sambi', 0.5]], hint: 'Le stock est compté en kg. Un sac pèse 25 kg. Donnez le poids du verre, du sambi… (les lignes sans prix sont ignorées). Prix de gros : prix du sac quand le client en prend beaucoup.' },
  credit: { label: 'Crédit téléphonique (Vodacom, Orange, Airtel, Africell)', base: '$', dec: true, cur: 'USD', alert: 5, quick: '0.1, 0.2, 0.5, 1, 2, 5, 10', units: [['Crédit', 1]], hint: 'Le stock est compté en dollars de crédit. Coût = ce que vous payez pour 1 $ de crédit (ex : 0,95 si vous payez 95 $ pour 100 $). Prix = ce que le client paie pour 1 $ (ex : 1). Le vendeur choisit le montant : 0,10 · 0,20 · 0,50…' },
  liquide: { label: 'Liquide au litre (huile, lait)', base: 'litre', dec: true, units: [['Litre', 1], ['Bidon', 5]], hint: 'Le stock est compté en litres. Un bidon contient 5 litres.' },
  metre: { label: 'Au mètre (câble, tissu, tuyau)', base: 'mètre', dec: true, alert: 10, units: [['Mètre', 1], ['Rouleau', 50]], hint: 'Le stock est compté en mètres. Un rouleau contient 50 mètres. Cochez « prix négociable » si le vendeur peut modifier le prix.' },
  custom: { label: 'Autre (je règle moi-même)', base: 'pièce', units: [['', 1]], hint: 'Choisissez l\'unité de stock puis ajoutez chaque façon de vendre avec ce qu\'elle contient.' },
};
function unitRow(u, base) {
  u = u || {};
  const v = (x) => (x ? esc(x) : '');
  return `<div class="ur"><div class="ur1"><div><label>Façon de vendre</label><input name="un" value="${esc(u.n || '')}" placeholder="Ex : Paquet" maxlength="30"></div>
  <div><label>Contient (<span class="bl">${esc(base)}</span>)</label><input name="uq" type="number" min="0" step="any" inputmode="decimal" value="${v(u.q)}" placeholder="1"></div></div>
  <div class="ur2"><div><label>Prix détail</label><input name="up" type="number" min="0" step="any" inputmode="decimal" value="${v(u.p)}"></div>
  <div><label>Prix gros <span class="mut">(option)</span></label><input name="uw" type="number" min="0" step="any" inputmode="decimal" value="${v(u.w)}"></div>
  <div><label>Gros dès <span class="mut">(qté)</span></label><input name="uwm" type="number" min="0" step="any" inputmode="decimal" value="${v(u.wm)}"></div></div>
  <button type="button" class="btn d s" data-a="rmunit">✕ Retirer cette ligne</button></div>`;
}
function prodForm(p) {
  const me = D().me, e = !!p;
  const needShop = me.role === 'agent' || me.role === 'superadmin';
  const kind = p && PRESETS[p.kind] ? p.kind : e ? 'custom' : 'simple';
  const pr = e ? null : PRESETS.simple;
  const base = e ? p.base : pr.base, cur = e ? p.cur : S.cur === 'CDF' ? 'CDF' : 'USD';
  const units = e ? p.units : pr.units.map(([n, q]) => ({ n, q }));
  const shopsList = D().shops.map((s) => [s.id, s.name]);
  return `<form data-f="product" ${e ? `data-id="${p.id}"` : ''}>
  <label>Nom du produit</label><input name="name" value="${esc(p ? p.name : '')}" required maxlength="120" placeholder="Ex : Eau minérale 50 cl" list="pnames">
  <datalist id="pnames"><option value="Crédit Vodacom"><option value="Crédit Orange"><option value="Crédit Airtel"><option value="Crédit Africell"></datalist>
  <label>Photo du produit <span class="mut">(recadrée automatiquement en carré)</span></label>
  <div class="photo"><div class="pv">${p && p.image ? `<img src="${esc(p.image)}">` : '📷'}</div>
    <div class="bt"><label class="btn s">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" onchange="pick(this)"></label>
    <label class="btn o s">🖼️ Choisir dans la galerie<input type="file" accept="image/*" onchange="pick(this)"></label></div>
    <input type="hidden" name="image" value="${esc(p ? p.image : '')}"></div>

  <label>Comment ce produit se vend-il ?</label>
  <select name="kind" data-preset="1">${opts(Object.entries(PRESETS).map(([k, v]) => [k, v.label]), kind)}</select>
  <div class="hint" id="phint">${esc((PRESETS[kind] || PRESETS.custom).hint)}</div>
  <div class="row"><div><label>Devise des prix</label><select name="cur"><option value="CDF" ${cur === 'CDF' ? 'selected' : ''}>Francs congolais (FC)</option><option value="USD" ${cur === 'USD' ? 'selected' : ''}>Dollars ($)</option></select></div>
  <div><label>Le stock est compté en</label><input name="base" value="${esc(base)}" maxlength="20" placeholder="bouteille, kg, pièce, $…"></div></div>
  <label class="chk"><input type="checkbox" name="dec" ${p ? (p.dec ? 'checked' : '') : ''}> Quantités avec virgule autorisées (kg, litres, mètres, crédit…)</label>

  <h3 style="margin-top:14px">Façons de vendre</h3>
  <div id="units">${units.map((u) => unitRow(u, base)).join('')}</div>
  <button type="button" class="btn o s" data-a="addunit">＋ Ajouter une façon de vendre</button>

  <label class="costl">Coût d'achat de 1 <b class="bl">${esc(base)}</b> <span class="mut">(dans la devise du produit)</span></label>
  <input name="cost" type="number" min="0" step="any" inputmode="decimal" value="${p && p.cost ? p.cost : ''}" placeholder="Ce que vous payez au fournisseur">
  ${e ? '<div class="mut" style="margin-top:4px">Le coût est recalculé automatiquement (moyenne) à chaque ravitaillement avec un montant payé. Le modifier ici remplace le coût dans toutes les boutiques.</div>' : ''}
  <div id="pprev" class="prev"></div>

  <div class="row"><div><label>Alerte « stock bas » à <span class="bl">${esc(base)}</span></label><input name="alertQty" type="number" min="0" step="any" value="${p ? p.alertQty : 3}"></div>
  <div><label>Montants rapides <span class="mut">(option)</span></label><input name="quick" placeholder="0.1, 0.2, 0.5, 1" value="${p && p.quick ? esc(p.quick.join(', ')) : ''}"></div></div>
  <label class="chk"><input type="checkbox" name="free" ${p && p.free ? 'checked' : ''}> Prix négociable (le vendeur peut fixer le prix de la vente)</label>
  ${e ? '' : `<div class="row"><div><label>Boutique ${needShop ? '' : '(pour le stock de départ)'}</label><select name="shopId" ${needShop ? 'required' : ''}>${needShop ? '<option value="">— choisir —</option>' : '<option value="">Toutes mes boutiques</option>'}${opts(shopsList, '')}</select></div>
  ${me.role === 'agent' ? '' : `<div><label>Stock de départ (en <span class="bl">${esc(base)}</span>)</label><input name="qty" type="number" min="0" step="any" placeholder="0"></div>`}</div>`}
  <button class="btn big">${e ? 'Enregistrer' : 'Ajouter le produit'}</button></form>`;
}
function readUnits(f) {
  const fd = new FormData(f), g = (k) => fd.getAll(k);
  const un = g('un'), uq = g('uq'), up = g('up'), uw = g('uw'), uwm = g('uwm'), all = [];
  un.forEach((n, i) => all.push({ n: String(n).trim(), q: num(uq[i]), p: num(up[i]), w: num(uw[i]), wm: num(uwm[i]) }));
  return all;
}
/* aperçu du bénéfice en direct : prix de vente − coût d'achat */
function prodPrev(f) {
  const box = f.querySelector('#pprev');
  if (!box) return;
  const cur = f.cur.value, base = f.base.value.trim() || 'unité', cost = num(f.cost.value);
  f.querySelectorAll('.bl').forEach((e) => (e.textContent = base));
  const rows = readUnits(f).filter((u) => u.n && u.q > 0 && u.p > 0);
  if (!rows.length) { box.innerHTML = ''; return; }
  const ru = rows.slice().sort((a, b) => b.q - a.q)[0];
  const line = (u, price, tag) => {
    const c = cost * u.q, g = price - c;
    return `<tr><td>${esc(u.n)}${tag}</td><td class="num">${fN(price, cur)}</td><td class="num">${cost ? fN(c, cur) : '—'}</td><td class="num ${g < 0 ? 'neg' : 'pos'}">${cost ? (g >= 0 ? '+' : '') + fN(g, cur) + ' (' + nf(price ? (g / price) * 100 : 0, 0) + ' %)' : '—'}</td></tr>`;
  };
  let h = `<h3>Bénéfice par vente</h3><div class="tw"><table><tr><th>Vente</th><th class="num">Prix</th><th class="num">Coût</th><th class="num">Bénéfice</th></tr>${rows.map((u) => line(u, u.p, '') + (u.w > 0 && u.w <= u.p ? line(u, u.w, ' <span class="mut">(gros)</span>') : '')).join('')}</table></div>`;
  if (cost) {
    const loss = rows.filter((u) => u.p < cost * u.q);
    if (loss.length) h += `<div class="warn">⚠️ Vous vendez à perte : ${loss.map((u) => esc(u.n)).join(', ')}. Vérifiez le prix ou le coût.</div>`;
    const sm = rows.filter((u) => u.q < ru.q);
    sm.forEach((u) => {
      const rec = u.p * (ru.q / u.q), gain = rec - cost * ru.q;
      h += `<div class="mut" style="margin-top:6px">Un ${esc(ru.n)} vendu entièrement en « ${esc(u.n)} » rapporte <b>${fN(rec, cur)}</b> → bénéfice <b class="${gain < 0 ? 'neg' : 'pos'}">${gain >= 0 ? '+' : ''}${fN(gain, cur)}</b></div>`;
    });
  } else h += '<div class="mut">Indiquez le coût d\'achat pour voir le bénéfice de chaque vente.</div>';
  box.innerHTML = h;
}
function applyPreset(f, key) {
  const p = PRESETS[key];
  if (!p) return;
  f.base.value = p.base;
  f.dec.checked = !!p.dec;
  if (p.cur) f.cur.value = p.cur;
  f.alertQty.value = p.alert || 3;
  f.quick.value = p.quick || '';
  f.querySelector('#units').innerHTML = p.units.map(([n, q]) => unitRow({ n, q }, p.base)).join('');
  f.querySelector('#phint').textContent = p.hint;
  prodPrev(f);
}
function prodRows(list, o = {}) {
  if (!list.length) return empty('Aucun produit.');
  const vend = D().me.role === 'vendeur';
  return list.map((p) => {
    const tot = D().shops.reduce((a, s) => a + (okFor(p, s) ? stk(s.id, p.id) : 0), 0);
    return `<div class="pl"><div class="th">${pimg(p)}</div><div class="t"><b>${esc(p.name)}</b><span class="mut">${unitsLine(p)}${vend || !p.cost ? '' : '<br>Coût : ' + fN(p.cost, p.cur) + ' / ' + esc(p.base)}</span></div>
    ${o.stock === false ? '' : badge(tot, p)}
    ${o.resupply ? `<button class="btn s" data-a="resupply" data-id="${p.id}">Ravitailler</button>` : ''}
    ${o.edit ? `<button class="btn o s" data-a="editprod" data-id="${p.id}">Modifier</button>` : ''}${o.del ? `<button class="btn d s" data-a="delprod" data-id="${p.id}">✕</button>` : ''}</div>`;
  }).join('');
}

/* ---------- vues ---------- */
const VIEWS = {};
const todaySales = () => D().sales.filter((x) => x.date === D().today);

/* vendeur : produits, panier, encaissement */
VIEWS['vendeur|Vente'] = () => {
  const sid = D().me.shopIds[0], sh = D().shops.find((s) => s.id === sid);
  if (!sh) return empty('Aucune boutique ne vous est affectée. Contactez votre gérant.');
  const list = D().products.filter((p) => !p.shopIds || p.shopIds.includes(sid));
  const ts = todaySales(), ca = sumS(ts, 'total');
  const tk = D().tickets.filter((t) => t.date === D().today);
  const kp = `<div class="kpis">${kpi('Boutique', esc(sh.name))}${kpi('Encaissements du jour', tk.length, 'o')}${kpi('Ventes du jour', fS(ca), 'g')}</div>`;
  return `<div class="card"><h2>Produits</h2><div class="search"><input placeholder="Rechercher un produit…" oninput="filt(this.value)"></div>
  ${list.length ? `<div class="grid">${list.map((p) => { const q = stk(sid, p.id); return `<div class="pt ${q <= 0 ? 'out' : ''}" data-a="sell" data-id="${p.id}" data-n="${esc(p.name.toLowerCase())}"><div class="im">${pimg(p)}${q <= 0 ? '<span class="badge out badge-abs">Rupture</span>' : q <= p.alertQty ? '<span class="badge low badge-abs">Stock bas</span>' : ''}</div><div class="bd"><b>${esc(p.name)}</b><div class="pr">${unitsLine(p, 2)}</div><div class="mut stk">${q <= 0 ? 'Rupture' : esc(fmtBase(p, q))}</div></div></div>`; }).join('')}</div>` : empty('Aucun produit pour le moment.')}</div>
  ${tk.length ? `<div class="card"><h2>Mes dernières ventes</h2>${tk.slice(-6).reverse().map((t) => { const names = D().sales.filter((x) => x.ticket === t.id).map((x) => `${(prod(x.productId) || {}).name || '?'} × ${fnum(x.qty)}${x.unit ? ' ' + x.unit.toLowerCase() : ''}`).join(', '); return `<div class="pl"><div class="t"><b>${esc(names || t.n + ' article(s)')}</b><span class="mut">${hm(t.ts)}</span></div><b>${fN(t.total, t.cur)}</b></div>`; }).join('')}</div>` : ''}${kp}`;
};
function filt(v) {
  v = v.toLowerCase();
  document.querySelectorAll('.pt').forEach((e) => e.classList.toggle('hide', !e.dataset.n.includes(v)));
}

function tasksView() {
  const me = D().me, mg = ['patron', 'gerant', 'superadmin'].includes(me.role);
  return `<div class="card"><h2>✅ Tâches journalières</h2>
  ${D().tasks.length ? D().tasks.map((t) => { const dn = D().done.includes(t.id); return `<div class="task ${dn ? 'done' : ''}">${mg ? '' : `<input type="checkbox" ${dn ? 'checked' : ''} data-a="toggle" data-id="${t.id}">`}<span>${esc(t.text)}</span>${mg ? `<button class="btn d s" data-a="deltask" data-id="${t.id}">✕</button>` : ''}</div>`; }).join('') : empty(mg ? 'Aucune tâche. Ajoutez-en ci-dessous.' : 'Aucune tâche pour aujourd\'hui.')}
  ${mg ? `<form data-f="task" class="acts"><input name="text" placeholder="Nouvelle tâche (ex : compter la caisse)" required style="flex:1;min-width:200px"><button class="btn">Ajouter</button></form>` : ''}</div>`;
}
VIEWS['vendeur|Tâches'] = tasksView; VIEWS['gerant|Tâches'] = tasksView; VIEWS['patron|Tâches'] = tasksView;

function msgView() {
  const sid = D().me.role === 'vendeur' ? D().me.shopIds[0] : myShop();
  const list = D().comments.filter((c) => c.shopId === sid).slice(-30).reverse();
  return `<div class="card"><h2>💬 Messages & commentaires</h2>${D().me.role === 'vendeur' ? '' : shopPicker()}
  <form data-f="comment"><input type="hidden" name="shopId" value="${sid}"><textarea name="text" rows="2" placeholder="Un détail, un problème, une demande…" required></textarea><button class="btn" style="margin-top:8px">Envoyer</button></form>
  ${list.length ? list.map((c) => `<div class="msg ${c.auto ? 'sys' : ''}"><small><b>${esc(c.from)}</b> · ${new Date(c.ts).toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small><br>${esc(c.text)}</div>`).join('') : empty('Aucun message.')}</div>`;
}
VIEWS['vendeur|Messages'] = msgView; VIEWS['gerant|Messages'] = msgView; VIEWS['patron|Messages'] = msgView;

function rateCard() {
  const me = D().me;
  if (!['patron', 'superadmin'].includes(me.role)) return `<div class="mut" style="margin-bottom:10px">Taux : 1 USD = ${rate().toLocaleString('fr-FR')} CDF</div>`;
  return `<form class="card acts" data-f="rate" style="align-items:end"><div><label>Taux de change : 1 USD =</label><input name="rate" type="number" min="100" step="any" value="${rate()}" style="width:150px"></div><div style="padding-bottom:10px">CDF</div><button class="btn">Mettre à jour</button></form>`;
}
function dashboard() {
  const ts = todaySales(), ca = sumS(ts, 'total'), cost = sumS(ts, 'cost'), pf = { u: ca.u - cost.u, c: ca.c - cost.c };
  const alerts = [];
  D().shops.forEach((s) => D().products.forEach((p) => { if (okFor(p, s)) { const q = stk(s.id, p.id); if (q <= p.alertQty) alerts.push({ s, p, q }); } }));
  const loss = (S.cur === 'CDF' ? pf.c : pf.u) < 0;
  return `${rateCard()}<div class="kpis">${kpi('Ventes aujourd\'hui', fS(ca), 'g')}${kpi(loss ? 'Perte du jour' : 'Bénéfice du jour', fS({ u: Math.abs(pf.u), c: Math.abs(pf.c) }), loss ? 'r' : '')}${kpi('Lignes de vente', ts.length, 'o')}${kpi('Alertes stock', alerts.length, alerts.length ? 'r' : '')}</div>
  <div class="cols"><div class="card"><h2>Par boutique (aujourd'hui)</h2>${D().shops.length ? `<div class="tw"><table><tr><th>Boutique</th><th class="num">Ventes</th><th class="num">Bénéfice</th></tr>${D().shops.map((s) => { const l = ts.filter((x) => x.shopId === s.id), a = sumS(l, 'total'), c = sumS(l, 'cost'); return `<tr><td>${esc(s.name)}</td><td class="num">${fS(a)}</td><td class="num">${fS({ u: a.u - c.u, c: a.c - c.c })}</td></tr>`; }).join('')}</table></div>` : empty('Aucune boutique.')}</div>
  <div class="card"><h2>⚠️ Ruptures & ravitaillement</h2>${alerts.length ? alerts.slice(0, 12).map((a) => `<div class="pl"><div class="th">${pimg(a.p)}</div><div class="t"><b>${esc(a.p.name)}</b><span class="mut">${esc(a.s.name)}</span></div>${badge(a.q, a.p)}</div>`).join('') : empty('Tout est en stock 👍')}</div></div>
  <div class="card"><h2>Ventes en temps réel</h2>${D().sales.length ? D().sales.slice(-10).reverse().map((x) => `<div class="pl"><div class="t"><b>${esc((prod(x.productId) || {}).name || '?')} × ${fnum(x.qty)}${x.unit ? ' ' + esc(x.unit.toLowerCase()) : ''}</b><span class="mut">${esc(shopN(x.shopId))} · ${esc(userN(x.sellerId))} · ${hm(x.ts)}</span></div><b>${fS(mS(x, 'total'))}</b></div>`).join('') : empty('Aucune vente pour le moment.')}</div>`;
}
['gerant', 'patron'].forEach((r) => (VIEWS[r + '|Tableau'] = dashboard));
VIEWS['superadmin|Tableau'] = () => {
  const U = D().users, pa = U.filter((u) => u.role === 'patron'), cnt = (r, p) => U.filter((u) => u.role === r && (!p || u.patronId === p)).length;
  const rows = pa.map((p) => {
    const sh = D().shops.filter((s) => s.patronId === p.id).length;
    return `<tr class="${p.active === false ? 'off' : ''}"><td><b>${esc(p.name)}</b><br><span class="mut">@${esc(p.username)}</span> ${p.active === false ? '<span class="tag out">Suspendu</span>' : ''}</td><td class="num">${sh}</td><td class="num">${cnt('gerant', p.id)}</td><td class="num">${cnt('vendeur', p.id)}</td><td><button class="btn s ${p.active === false ? '' : 'o'}" data-a="suspend" data-id="${p.id}">${p.active === false ? '▶ Réactiver' : '⏸ Suspendre'}</button></td></tr>`;
  }).join('');
  return `${rateCard()}<div class="kpis">${kpi('Patrons', pa.length)}${kpi('Suspendus', pa.filter((p) => p.active === false).length, pa.some((p) => p.active === false) ? 'o' : 'g')}${kpi('Boutiques', D().shops.length, 'g')}${kpi('Gérants', cnt('gerant'))}${kpi('Vendeurs', cnt('vendeur'))}${kpi('Agents', cnt('agent'), 'o')}</div>
  <div class="card"><h2>Patrons</h2>${pa.length ? `<div class="tw"><table><tr><th>Patron</th><th class="num">Boutiques</th><th class="num">Gérants</th><th class="num">Vendeurs</th><th></th></tr>${rows}</table></div><p class="mut">Suspendre un patron bloque aussi ses gérants et ses vendeurs. Réactivez-le pour tout rétablir.</p>` : empty('Aucun patron. Créez-en un dans « Utilisateurs ».')}</div>`;
};

/* produits */
VIEWS['gerant|Produits'] = () => `<div class="cols"><div class="card"><h2>Nouveau produit</h2>${prodForm()}</div><div class="card"><h2>Catalogue (${D().products.length})</h2>${prodRows(D().products, { edit: 1, del: 1, resupply: D().me.role === 'gerant' })}</div></div>`;
VIEWS['superadmin|Produits'] = VIEWS['gerant|Produits'];
VIEWS['agent|Produits'] = () => `<div class="cols"><div class="card"><h2>Ajouter un produit</h2><p class="mut">+0,10 $ de commission par produit ajouté. Il apparaît directement dans l'espace du vendeur de la boutique choisie.</p>${prodForm()}</div><div class="card"><h2>Mes produits ajoutés</h2>${prodRows(D().products.filter((p) => p.addedBy === D().me.id), { edit: 1, stock: false })}</div></div>`;

/* stock : ravitaillement, retrait, inventaire */
VIEWS['gerant|Stock'] = () => {
  const sh = D().shops;
  if (!sh.length) return empty('Créez d\'abord une boutique.');
  if (!D().products.length) return empty('Créez d\'abord un produit (onglet Produits).');
  const sel = S.stockSel || {};
  let val = { u: 0, c: 0 };
  sh.forEach((s) => D().products.forEach((p) => { if (okFor(p, s)) { const v = stk(s.id, p.id) * costOf(s.id, p); val.u += cv(v, p.cur, 'USD'); val.c += cv(v, p.cur, 'CDF'); } }));
  return `<div class="kpis">${kpi('Valeur du stock (au coût)', fS(val), 'g')}${kpi('Produits en alerte', D().products.filter((p) => sh.some((s) => okFor(p, s) && stk(s.id, p.id) <= p.alertQty)).length, 'o')}</div>
  <div class="card"><h2>📦 Ravitaillement et mouvements de stock</h2><form data-f="stock">
  <div class="row"><div><label>Boutique</label><select name="shopId" data-st="1">${opts(sh.map((s) => [s.id, s.name]), sel.shopId || myShop())}</select></div>
  <div><label>Produit</label><select name="productId" data-st="1" data-prodsel="1">${opts(D().products.map((p) => [p.id, p.name]), sel.productId)}</select></div></div>
  <label>Opération</label><select name="mode" data-st="1"><option value="in" ${sel.mode === 'in' || !sel.mode ? 'selected' : ''}>➕ Ravitaillement (marchandise reçue)</option><option value="out">➖ Retrait (casse, perte, don)</option><option value="set">📋 Inventaire (corriger avec le stock compté)</option></select>
  <div class="row"><div><label>Unité</label><select name="unit" data-st="1"></select></div>
  <div><label data-lq>Quantité reçue</label><input name="qty" type="number" min="0" step="any" inputmode="decimal" required></div>
  <div class="only-in"><label>Bonus du fournisseur <span class="mut">(gratuit)</span></label><input name="bonus" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></div></div>
  <div class="only-in"><div class="row"><div><label>Montant total payé <span class="mut">(option)</span></label><input name="total" type="number" min="0" step="any" inputmode="decimal" placeholder="Pour calculer le coût"></div>
  <div><label>Devise payée</label><select name="tcur" data-st="1"><option value="CDF">FC</option><option value="USD">$</option></select></div>
  <div><label>Fournisseur</label><input name="supplier" placeholder="Nom du fournisseur"></div></div></div>
  <div class="row"><div><label>Note <span class="mut">(option)</span></label><input name="note" maxlength="200"></div><div class="only-in"><label>Date</label><input name="date" type="date" value="${D().today}"></div></div>
  <div id="sprev" class="prev"></div>
  <button class="btn big">Enregistrer</button></form></div>
  <div class="card"><h2>Stock par boutique</h2><div class="tw"><table><tr><th>Produit</th>${sh.map((s) => `<th>${esc(s.name)}</th>`).join('')}<th></th></tr>${D().products.map((p) => `<tr><td><div style="display:flex;align-items:center;gap:8px"><div class="th" style="width:30px;height:30px;border-radius:8px">${pimg(p)}</div>${esc(p.name)}</div></td>${sh.map((s) => { const ok = okFor(p, s); return `<td>${ok ? badge(stk(s.id, p.id), p) : '—'}</td>`; }).join('')}<td><button class="btn s" data-a="resupply" data-id="${p.id}">Ravitailler</button> <button class="btn o s" data-a="hist" data-id="${p.id}">Historique</button></td></tr>`).join('')}</table></div></div>`;
};
VIEWS['patron|Stock'] = VIEWS['gerant|Stock'];
/* prépare le formulaire de stock : unités du produit choisi et aperçu */
function stockInit(f, changed) {
  const p = prod(f.productId.value);
  if (!p) return;
  if (changed === 'product' || !f.unit.options.length) {
    const ru = refU(p), idx = p.units.indexOf(ru);
    f.unit.innerHTML = p.units.map((u, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(u.n)}${u.q !== 1 ? ' (' + fnum(u.q) + ' ' + esc(p.base) + ')' : ''}</option>`).join('');
    f.tcur.value = p.cur;
  }
  const m = f.mode.value;
  f.querySelectorAll('.only-in').forEach((e) => e.classList.toggle('hide', m !== 'in'));
  f.querySelector('[data-lq]').textContent = m === 'in' ? 'Quantité reçue' : m === 'out' ? 'Quantité retirée' : 'Quantité comptée en rayon';
  stockPrev(f);
}
function stockPrev(f) {
  const box = f.querySelector('#sprev'), p = prod(f.productId.value);
  if (!box || !p) return;
  const u = p.units[+f.unit.value] || p.units[0], qty = num(f.qty.value), bonus = num(f.bonus.value), m = f.mode.value;
  const sid = f.shopId.value, have = stk(sid, p.id);
  let h = `<div>Stock actuel : <b>${esc(fmtBase(p, have))}</b></div>`;
  if (!qty && m !== 'set') { box.innerHTML = h; return; }
  if (m === 'in') {
    const add = (qty + bonus) * u.q, paid = num(f.total.value), tc = f.tcur.value;
    h += `<div>Vous recevez : <b>${esc(fmtBase(p, add))}</b>${bonus ? ` <span class="mut">(dont ${fnum(bonus)} ${esc(plural(bonus, u.n))} de bonus)</span>` : ''}</div><div>Stock après : <b>${esc(fmtBase(p, have + add))}</b></div>`;
    if (paid > 0 && add > 0) {
      const uc = cv(paid, tc, p.cur) / add, oldC = costOf(sid, p), avg = have > 0 && oldC > 0 ? (have * oldC + add * uc) / (have + add) : uc;
      h += `<div>Coût réel : <b>${fN(uc, p.cur)}</b> par ${esc(p.base)}${u.q !== 1 ? ' · <b>' + fN(uc * u.q, p.cur) + '</b> par ' + esc(u.n.toLowerCase()) : ''}</div>`;
      if (have > 0 && oldC > 0) h += `<div>Coût moyen du stock après : <b>${fN(avg, p.cur)}</b> par ${esc(p.base)}</div>`;
      const bad = p.units.filter((x) => x.p < uc * x.q);
      bad.forEach((x) => { h += `<div class="warn">⚠️ « ${esc(x.n)} » est vendu ${fN(x.p, p.cur)} alors qu'il vous coûte ${fN(uc * x.q, p.cur)} : perte de ${fN(uc * x.q - x.p, p.cur)} par vente. Vérifiez le montant payé ou le prix.</div>`; });
      if (!bad.length) p.units.forEach((x) => { const g = x.p - uc * x.q; h += `<div class="mut">Bénéfice par « ${esc(x.n)} » : <b class="pos">+${fN(g, p.cur)}</b></div>`; });
    }
  } else if (m === 'out') {
    const nx = have - qty * u.q;
    h += nx < 0 ? `<div class="warn">Le stock ne peut pas être négatif.</div>` : `<div>Stock après : <b>${esc(fmtBase(p, nx))}</b></div>`;
  } else {
    const nx = qty * u.q, d = nx - have;
    h += `<div>Nouveau stock : <b>${esc(fmtBase(p, nx))}</b> · écart <b class="${d < 0 ? 'neg' : 'pos'}">${d >= 0 ? '+' : '−'}${esc(fmtBase(p, Math.abs(d)))}</b></div>`;
  }
  box.innerHTML = h;
}
async function histModal(pid) {
  const p = prod(pid), sid = myShop();
  const mv = await api(`/moves?shopId=${sid}&productId=${pid}`);
  const T = { in: 'Entrée', out: 'Retrait', adj: 'Inventaire', sale: 'Vente' };
  modal(`<h2>Historique : ${esc(p.name)}</h2><div class="mut" style="margin-bottom:8px">${esc(shopN(sid))}</div>${mv.length ? mv.map((m) => `<div class="pl"><div class="t"><b>${T[m.type] || m.type} : ${m.d >= 0 ? '+' : '−'}${esc(fmtBase(p, Math.abs(m.d)))}</b><span class="mut">${new Date(m.ts).toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(m.by || '')}${m.note ? ' · ' + esc(m.note) : ''}</span></div><span class="tag">${esc(fmtBase(p, m.after))}</span></div>`).join('') : empty('Aucun mouvement.')}<button class="btn o big" data-a="mclose">Fermer</button>`);
}

/* boutiques */
function shopsView() {
  const me = D().me, sup = me.role === 'superadmin', canDel = sup || me.role === 'patron';
  const sellers = (sid) => D().users.filter((u) => u.role === 'vendeur' && u.shopIds.includes(sid)).map((u) => u.name).join(', ') || '—';
  const gerants = (sid) => D().users.filter((u) => u.role === 'gerant' && u.shopIds.includes(sid)).map((u) => u.name).join(', ') || '—';
  return `<div class="cols"><div class="card"><h2>Nouvelle boutique</h2><form data-f="shop">
  ${sup ? `<label>Patron</label><select name="patronId" required><option value="">— choisir —</option>${opts(D().patrons.map((p) => [p.id, p.name]))}</select>` : ''}
  <label>Nom de la boutique</label><input name="name" required><div class="row"><div><label>Adresse</label><input name="addr"></div><div><label>Zone</label><input name="zone"></div></div>
  <h3 style="margin-top:14px">Profil du vendeur (optionnel)</h3><div class="row"><input name="sname" placeholder="Nom complet"><input name="susername" placeholder="Identifiant" autocapitalize="none"><input name="spassword" type="text" placeholder="Mot de passe (6+)"></div>
  <button class="btn big">Créer la boutique</button></form></div>
  <div class="card"><h2>Boutiques (${D().shops.length})</h2>${D().shops.length ? D().shops.map((s) => `<div class="pl"><div class="t"><b>${esc(s.name)}</b><span class="mut">${esc(s.addr || '')} ${s.zone ? '· ' + esc(s.zone) : ''}<br>Vendeur : ${esc(sellers(s.id))} · Gérant : ${esc(gerants(s.id))}</span></div>${canDel ? `<button class="btn d s" data-a="delshop" data-id="${s.id}">✕</button>` : ''}</div>`).join('') : empty('Aucune boutique.')}</div></div>`;
}
['gerant', 'patron', 'superadmin'].forEach((r) => (VIEWS[r + '|Boutiques'] = shopsView));

/* achats */
VIEWS['gerant|Achats'] = () => `<div class="cols"><div class="card"><h2>Enregistrer un achat</h2><p class="mut">Pour une marchandise reçue en rayon, utilisez plutôt l'onglet Stock : le stock et le coût sont mis à jour en même temps. Ici : dépenses d'achat sans entrée de stock.</p>${D().shops.length ? `<form data-f="purchase"><label>Boutique</label><select name="shopId">${opts(D().shops.map((s) => [s.id, s.name]), myShop())}</select><label>Fournisseur</label><input name="supplier" required><div class="row"><div><label>Montant</label><input name="amount" type="number" min="0" step="any" required></div><div><label>Devise</label><select name="cur"><option value="CDF" ${S.cur === 'CDF' ? 'selected' : ''}>FC</option><option value="USD" ${S.cur === 'USD' ? 'selected' : ''}>$</option></select></div></div><label>Détail (produits achetés)</label><input name="note"><label>Date</label><input name="date" type="date" value="${D().today}"><button class="btn big">Enregistrer</button></form>` : empty('Créez d\'abord une boutique.')}</div>
<div class="card"><h2>Historique des achats</h2>${D().purchases.length ? `<div class="tw"><table><tr><th>Date</th><th>Boutique</th><th>Fournisseur</th><th class="num">Montant</th></tr>${D().purchases.slice().reverse().map((x) => { const p = x.productId ? prod(x.productId) : null; return `<tr><td>${x.date}</td><td>${esc(shopN(x.shopId))}</td><td>${esc(x.supplier)}<br><span class="mut">${p ? esc(p.name) + ' · ' + fnum(x.qty) + (x.bonus ? ' + ' + fnum(x.bonus) + ' bonus' : '') + ' ' + esc(plural(x.qty, x.unitName || '')) : ''} ${esc(x.note || '')}</span></td><td class="num">${fS(mS({ amountUSD: x.amountUSD, amountCDF: x.amountCDF }, 'amount'))}</td></tr>`; }).join('')}</table></div>` : empty('Aucun achat enregistré.')}</div></div>`;

/* ---------- rapports ---------- */
const RTYPES = [['general', 'Rapport général (tout)'], ['produits', 'Par produit (avec stock)'], ['boutiques', 'Par boutique'], ['vendeurs', 'Par vendeur'], ['jours', 'Par jour'], ['ventes', 'Ventes détaillées'], ['achats', 'Achats et ravitaillements'], ['stock', 'État du stock']];
const newRep = () => ({ from: D().today, to: D().today, shopId: '', gerantId: '', sellerId: '', type: S.rep ? S.rep.type : 'general' });
async function loadRep() {
  if (!S.rep) S.rep = newRep();
  const q = new URLSearchParams(S.rep).toString();
  try { S.repData = await api('/report?' + q); } catch (e) { toast(e.message, 1); }
  if (S.tab === 'Rapport') render();
}
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
function repView() {
  if (!S.rep) S.rep = newRep();
  const r = S.repData, f = S.rep, gers = D().users.filter((u) => u.role === 'gerant'), sell = D().users.filter((u) => u.role === 'vendeur');
  const T = (h, rows, al) => `<div class="tw"><table><tr>${h.map((x, i) => `<th class="${(al ? al[i] : i) === 'n' || (!al && i) ? 'num' : ''}">${x}</th>`).join('')}</tr>${rows.join('')}</table></div>`;
  const P = (m) => `<span class="${m.usd < 0 ? 'neg' : ''}">${fR(m)}</span>`;
  const pc = (x) => nf(x * 100, 0) + ' %';
  const sec = (k) => f.type === 'general' || f.type === k;
  let body = '';
  if (r) {
    const t = r.totals, lossT = t.profit.usd < 0;
    body += `<div class="print-h"><h1>Rapport BoutiquePro</h1><p>Période : ${r.from} → ${r.to} · Édité le ${new Date().toLocaleString('fr-FR')} · Devise : ${S.cur} (1 USD = ${rate()} CDF)</p></div>
    <div class="kpis">${kpi('Chiffre d\'affaires', fR(t.ca), 'g')}${kpi('Coût des ventes', fR(t.cost))}${kpi(lossT ? 'Perte' : 'Bénéfice', fR({ usd: Math.abs(t.profit.usd), cdf: Math.abs(t.profit.cdf) }), lossT ? 'r' : 'g')}${kpi('Marge', pc(t.margin))}${kpi('Achats (période)', fR(t.purchases), 'o')}${kpi('Valeur du stock', fR(t.stockValue))}${kpi('Encaissements', t.tickets)}</div>`;
    if (sec('boutiques')) body += `<div class="card"><h2>Par boutique</h2>${r.perShop.length ? T(['Boutique', 'Gérant', 'Ventes', 'CA', 'Bénéfice', 'Marge'], r.perShop.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${esc(x.gerants.join(', ') || '—')}</td><td class="num">${x.n}</td><td class="num">${fR(x.ca)}</td><td class="num">${P(x.profit)}</td><td class="num">${pc(x.margin)}</td></tr>`)) : empty('Aucune vente sur la période.')}</div>`;
    if (sec('produits')) body += `<div class="card"><h2>Par produit</h2>${r.perProduct.length ? T(['Produit', 'Vendu', 'CA', 'Coût', 'Bénéfice', 'Marge', 'Bénéfice / grande unité', 'Stock restant', 'Valeur du stock', 'Bénéfice potentiel'], r.perProduct.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td class="num">${esc(x.qtyText)}</td><td class="num">${fR(x.ca)}</td><td class="num">${fR(x.cost)}</td><td class="num">${P(x.profit)}</td><td class="num">${pc(x.margin)}</td><td class="num">${x.profitPerRef ? P(x.profitPerRef) + ' <span class="mut">/ ' + esc(x.refUnit.toLowerCase()) + '</span>' : '—'}</td><td class="num">${esc(x.stockText)}</td><td class="num">${fR(x.stockValue)}</td><td class="num">${P(x.potential)}</td></tr>`)) : empty('Aucune vente sur la période.')}<p class="mut" style="margin-top:8px">« Bénéfice / grande unité » : bénéfice moyen pour chaque sac, paquet ou carton écoulé. « Bénéfice potentiel » : ce que rapportera le stock restant s'il est vendu au prix détail de la grande unité.</p></div>`;
    if (sec('jours')) body += `<div class="card"><h2>Par jour</h2>${r.perDay.length ? T(['Date', 'Ventes', 'CA', 'Bénéfice', 'Marge'], r.perDay.map((x) => `<tr><td>${x.key}</td><td class="num">${x.n}</td><td class="num">${fR(x.ca)}</td><td class="num">${P(x.profit)}</td><td class="num">${pc(x.margin)}</td></tr>`)) : empty('—')}</div>`;
    if (sec('vendeurs')) body += `<div class="card"><h2>Par vendeur</h2>${r.perSeller.length ? T(['Vendeur', 'Ventes', 'CA', 'Bénéfice', 'Marge'], r.perSeller.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.n}</td><td class="num">${fR(x.ca)}</td><td class="num">${P(x.profit)}</td><td class="num">${pc(x.margin)}</td></tr>`)) : empty('—')}</div>`;
    if (f.type === 'ventes') body += `<div class="card"><h2>Ventes détaillées</h2>${r.journal.length ? T(['Date · heure', 'Produit', 'Quantité', 'Boutique · vendeur', 'Total', 'Bénéfice'], r.journal.slice(0, 500).map((x) => `<tr><td>${x.date} ${x.time}</td><td>${esc(x.product)}</td><td class="num">${fnum(x.qty)} ${esc((x.unit || '').toLowerCase())}</td><td class="num">${esc(x.shop)} · ${esc(x.seller)}</td><td class="num">${fR(x.ca)}</td><td class="num">${P(x.profit)}</td></tr>`)) + (r.journal.length > 500 ? '<p class="mut">500 premières lignes affichées : le fichier Excel contient tout.</p>' : '') : empty('Aucune vente sur la période.')}</div>`;
    if (sec('achats')) body += `<div class="card"><h2>Achats et ravitaillements</h2>${r.purchases.length ? T(['Date', 'Boutique · fournisseur', 'Produit', 'Montant'], r.purchases.map((x) => `<tr><td>${x.date}</td><td class="num">${esc(x.shop)} · ${esc(x.supplier)}</td><td class="num">${x.product ? esc(x.product) + ' · ' + fnum(x.qty) + (x.bonus ? ' + ' + fnum(x.bonus) + ' bonus' : '') : esc(x.note)}</td><td class="num">${fR(x.amount)}</td></tr>`)) : empty('Aucun achat sur la période.')}</div>`;
    if (f.type === 'stock' || f.type === 'produits') body += `<div class="card"><h2>État du stock</h2>${r.stock.length ? T(['Boutique', 'Produit', 'Stock', 'Coût unitaire', 'Valeur', 'Bénéfice potentiel'], r.stock.map((x) => `<tr><td>${esc(x.shop)}</td><td>${esc(x.product)}</td><td class="num">${esc(x.text)}</td><td class="num">${fN(x.cost, x.cur)} / ${esc(x.baseUnit)}</td><td class="num">${fR(x.value)}</td><td class="num">${P(x.potential)}</td></tr>`)) : empty('Aucun produit.')}</div>`;
  } else body = empty('Chargement…');
  return `<div class="card noprint"><h2>📅 Rapports</h2><form data-f="rep" data-live="1">
  <label>Type de rapport</label><select name="type">${opts(RTYPES, f.type)}</select>
  <div class="acts" style="margin:8px 0"><button type="button" class="btn o s" data-a="period" data-v="0">Aujourd'hui</button><button type="button" class="btn o s" data-a="period" data-v="6">7 jours</button><button type="button" class="btn o s" data-a="period" data-v="29">30 jours</button><button type="button" class="btn o s" data-a="period" data-v="m">Ce mois</button></div>
  <div class="row"><div><label>Du</label><input type="date" name="from" value="${f.from}"></div><div><label>Au</label><input type="date" name="to" value="${f.to}"></div>
  <div><label>Boutique</label><select name="shopId"><option value="">Toutes</option>${opts(D().shops.map((s) => [s.id, s.name]), f.shopId)}</select></div>
  ${gers.length && D().me.role !== 'gerant' ? `<div><label>Gérant</label><select name="gerantId"><option value="">Tous</option>${opts(gers.map((g) => [g.id, g.name]), f.gerantId)}</select></div>` : ''}
  ${sell.length ? `<div><label>Vendeur</label><select name="sellerId"><option value="">Tous</option>${opts(sell.map((g) => [g.id, g.name]), f.sellerId)}</select></div>` : ''}</div>
  <div class="acts"><button type="button" class="btn" data-a="dlrep">📥 Télécharger en Excel</button><button type="button" class="btn o" data-a="print">🖨️ Imprimer / PDF</button></div>
  <div class="mut" style="margin-top:6px">L'Excel suit le type choisi ci-dessus et la devise affichée (${S.cur === 'CDF' ? 'FC' : 'USD'}). « Rapport général » = un classeur avec toutes les feuilles.</div></form></div>${body}`;
}
['gerant', 'patron', 'superadmin'].forEach((r) => (VIEWS[r + '|Rapport'] = repView));
async function dlRep() {
  const f = S.rep, qs = new URLSearchParams({ ...f, cur: S.cur });
  let r;
  try { r = await fetch('/api/report.xlsx?' + qs, { headers: { Authorization: 'Bearer ' + S.token } }); }
  catch { throw new Error('Pas de connexion internet'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Téléchargement impossible');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = `rapport-${f.type}-${f.from}_${f.to}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Fichier Excel téléchargé ✔');
}

/* utilisateurs */
function userRows(list) {
  if (!list.length) return empty('Aucun compte.');
  const st = (u) => (u.active === false ? '<span class="tag out">Suspendu</span>' : u.blocked ? '<span class="tag low">Bloqué (patron suspendu)</span>' : '');
  return `<div class="tw"><table><tr><th>Nom</th><th>Rôle</th><th>Boutiques</th><th></th></tr>${list.map((u) => `<tr class="${u.active === false || u.blocked ? 'off' : ''}"><td><b>${esc(u.name)}</b><br><span class="mut">@${esc(u.username)}</span> ${st(u)}</td><td><span class="tag">${ROLE[u.role]}</span></td><td>${esc(u.shopIds.map(shopN).join(', ') || '—')}</td><td><button class="btn o s" data-a="edituser" data-id="${u.id}">Modifier</button> <button class="btn s ${u.active === false ? '' : 'o'}" data-a="suspend" data-id="${u.id}">${u.active === false ? '▶ Réactiver' : '⏸ Suspendre'}</button> <button class="btn d s" data-a="deluser" data-id="${u.id}">✕</button></td></tr>`).join('')}</table></div>`;
}
function userForm(roles) {
  const sup = D().me.role === 'superadmin';
  const pn = (id) => (D().patrons.find((p) => p.id === id) || {}).name;
  return `<form data-f="user"><label>Rôle</label><select name="role">${opts(roles.map((r) => [r, ROLE[r]]))}</select>
  <label>Nom complet</label><input name="name" required><div class="row"><div><label>Identifiant</label><input name="username" required autocapitalize="none"></div><div><label>Mot de passe</label><input name="password" type="text" minlength="6" required></div></div>
  ${sup ? `<label>Patron (pour gérant / vendeur)</label><select name="patronId"><option value="">—</option>${opts(D().patrons.map((p) => [p.id, p.name]))}</select>` : ''}
  <label>Boutique(s) affectée(s) — Ctrl/⌘ pour plusieurs</label><select name="shopIds" multiple size="4">${D().shops.map((s) => `<option value="${s.id}">${esc(s.name)}${sup ? ' (' + esc(pn(s.patronId) || '') + ')' : ''}</option>`).join('')}</select>
  <button class="btn big">Créer le compte</button></form>`;
}
VIEWS['superadmin|Utilisateurs'] = () => `<div class="cols"><div class="card"><h2>Créer un compte</h2>${userForm(['patron', 'gerant', 'vendeur', 'agent'])}</div><div class="card"><h2>Comptes (${D().users.length})</h2>${userRows(D().users)}</div></div>`;
VIEWS['patron|Gérants'] = () => `<div class="cols"><div class="card"><h2>Nouveau gérant</h2>${userForm(['gerant'])}</div><div class="card"><h2>Gérants & vendeurs</h2>${userRows(D().users)}</div></div>`;

/* agents */
VIEWS['superadmin|Agents'] = () => {
  const ag = D().users.filter((u) => u.role === 'agent'), C = D().commissions;
  return `<div class="kpis">${kpi('Agents', ag.length)}${kpi('Commissions totales', fm(ag.reduce((a, u) => a + (C[u.id] ? C[u.id].totalUSD : 0), 0)), 'g')}</div>
  <div class="card"><h2>Agents éditeurs & commissions</h2>${ag.length ? `<div class="tw"><table><tr><th>Agent</th><th>Boutiques</th><th class="num">Produits</th><th class="num">Marchés</th><th class="num">Commission</th><th></th></tr>${ag.map((u) => { const c = C[u.id] || {}; return `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.shopIds.map(shopN).join(', ') || '—')}</td><td class="num">${c.products} (${fm(c.productsCommissionUSD)})</td><td class="num">${c.deals} (${fm(c.dealsCommissionUSD)})</td><td class="num"><b>${fm(c.totalUSD)}</b></td><td><button class="btn o s" data-a="edituser" data-id="${u.id}">Affecter</button></td></tr>`; }).join('')}</table></div>` : empty('Créez des agents dans « Utilisateurs ».')}
  <p class="mut">Règles : 20 % de la valeur d'un marché boutique gagné · 0,10 $ par produit ajouté.</p></div>
  <div class="cols"><div class="card"><h2>Enregistrer un marché gagné</h2>${ag.length ? `<form data-f="deal"><label>Agent</label><select name="agentId">${opts(ag.map((u) => [u.id, u.name]))}</select><label>Description</label><input name="label" placeholder="Ex : Boutique Marché central"><label>Valeur du marché ${cur$()}</label><input name="value" type="number" min="0" step="${step()}" required><button class="btn big">Enregistrer (20 %)</button></form>` : empty('Aucun agent.')}</div>
  <div class="card"><h2>Marchés enregistrés</h2>${D().deals.length ? D().deals.slice().reverse().map((d) => `<div class="pl"><div class="t"><b>${esc(d.label)}</b><span class="mut">${esc(userN(d.agentId))} · ${d.date}</span></div><div><b>${fm(d.valueUSD)}</b><br><span class="mut">Com. ${fm(d.valueUSD * 0.2)}</span></div><button class="btn d s" data-a="deldeal" data-id="${d.id}">✕</button></div>`).join('') : empty('Aucun marché.')}</div></div>`;
};
VIEWS['agent|Mon espace'] = () => {
  const c = D().commissions[D().me.id] || {};
  return `<div class="kpis">${kpi('Commission totale', fm(c.totalUSD || 0), 'g')}${kpi('Produits ajoutés', c.products || 0)}${kpi('Marchés gagnés', c.deals || 0, 'o')}</div>
  <div class="cols"><div class="card"><h2>Mes boutiques</h2>${D().shops.length ? D().shops.map((s) => `<div class="pl"><div class="t"><b>${esc(s.name)}</b><span class="mut">${esc(s.addr || '')} ${esc(s.zone || '')}</span></div></div>`).join('') : empty('Aucune boutique affectée pour le moment.')}</div>
  <div class="card"><h2>Mes marchés</h2>${D().deals.length ? D().deals.map((d) => `<div class="pl"><div class="t"><b>${esc(d.label)}</b><span class="mut">${d.date}</span></div><b>${fm(d.valueUSD * 0.2)}</b></div>`).join('') : empty('Aucun marché pour le moment.')}</div></div>
  <p class="mut">Commission : 20 % par marché boutique gagné · 0,10 $ par produit ajouté.</p>`;
};

/* ---------- modales ---------- */
function modal(html) {
  $('#modal').innerHTML = html ? `<div class="mo" data-a="mbg"><div>${html}</div></div>` : '';
  if (!html) S.dirty = false;
  else document.querySelectorAll('#modal form[data-f=product]').forEach(prodPrev);
}

/* ---- vente : choix de l'unité, quantité, prix ---- */
const cartBase = (pid) => S.cart.filter((l) => l.pid === pid).reduce((a, l) => a + l.qty * prod(pid).units[l.ui].q, 0);
function saleLine() {
  const s = S.sale, p = prod(s.pid), u = p.units[s.ui], qty = s.qty || 0;
  const price = s.tier === 'g' && u.w > 0 ? u.w : u.p;
  let amount = Math.round(qty * price * 1e4) / 1e4;
  const custom = p.free && s.total !== '' && s.total !== undefined && num(s.total) >= 0 && String(s.total).trim() !== '';
  if (custom) amount = num(s.total);
  const stock = stk(s.sid, p.id) - cartBase(p.id), need = qty * u.q;
  return { p, u, qty, price, amount, custom, stock, need, over: need > stock + 1e-9 };
}
function autoTier() {
  const s = S.sale, u = prod(s.pid).units[s.ui];
  if (u.w > 0 && u.wm > 0) s.tier = s.qty >= u.wm ? 'g' : 'd';
  if (!(u.w > 0)) s.tier = 'd';
}
function sellModal(pid) {
  const sid = D().me.shopIds[0] || myShop(), p = prod(pid);
  if (stk(sid, pid) - cartBase(pid) <= 0) return toast('Rupture de stock : ' + p.name, 1);
  S.sale = { pid, sid, ui: 0, tier: 'd', qty: 1, total: '' };
  showSale();
}
function saleBody() {
  const s = S.sale, p = prod(s.pid), L = saleLine(), u = L.u, st = p.dec ? (p.quick && p.quick.length ? Math.min(...p.quick) : 1) : 1;
  return `<div class="pl" style="border:0"><div class="th" style="width:60px;height:60px">${pimg(p)}</div><div class="t"><b style="font-size:17px">${esc(p.name)}</b><span class="mut">En stock : ${esc(fmtBase(p, Math.max(0, L.stock)))}</span></div></div>
  <label>Vendre par</label><div class="ubs">${p.units.map((x, i) => `<button type="button" class="ub ${i === s.ui ? 'on' : ''}" data-a="su" data-i="${i}"><b>${esc(x.n)}</b><span>${fN(x.p, p.cur)}</span>${x.w > 0 ? `<small>gros ${fN(x.w, p.cur)}</small>` : ''}</button>`).join('')}</div>
  ${u.w > 0 ? `<div class="seg" style="margin-top:10px"><button type="button" data-a="st" data-v="d" class="${s.tier === 'd' ? 'on' : ''}">Détail ${fN(u.p, p.cur)}</button><button type="button" data-a="st" data-v="g" class="${s.tier === 'g' ? 'on' : ''}">Gros ${fN(u.w, p.cur)}${u.wm > 0 ? ' (dès ' + fnum(u.wm) + ')' : ''}</button></div>` : ''}
  <label>Quantité (${esc(u.n.toLowerCase())})</label>
  <div class="qty"><button type="button" class="btn o" data-a="qm" data-st="${st}">−</button><input data-sq="1" type="number" min="0" step="any" inputmode="decimal" value="${s.qty || ''}" aria-label="Quantité"><button type="button" class="btn o" data-a="qp" data-st="${st}">＋</button></div>
  ${p.quick && p.quick.length ? `<div class="chips">${p.quick.map((v) => `<button type="button" class="chip ${s.qty === v ? 'on' : ''}" data-a="qq" data-v="${v}">${fnum(v)}</button>`).join('')}</div>` : ''}
  ${p.free ? `<label>Prix convenu pour cette vente <span class="mut">(option, en ${p.cur === 'CDF' ? 'FC' : '$'})</span></label><input data-sf="1" type="number" min="0" step="any" inputmode="decimal" value="${esc(s.total)}" placeholder="${nf(L.qty * L.price, p.cur === 'CDF' ? 0 : 2)}">` : ''}
  <div style="margin-top:12px"><span class="mut">Total</span><div class="big-total" id="ltot">${fN(L.amount, p.cur)}</div></div>
  <div class="warn ${L.over ? '' : 'hide'}" id="lwarn">${L.over ? 'Stock insuffisant : il reste ' + esc(fmtBase(p, Math.max(0, L.stock))) : ''}</div>
  <button type="button" class="btn big" id="ladd" data-a="addcart" ${L.over || !(L.qty > 0) ? 'disabled' : ''}>🛒 Ajouter au panier</button><button type="button" class="btn o big" data-a="mclose">Annuler</button>`;
}
function showSale() { modal(saleBody()); }
function saleUpd() {
  const L = saleLine();
  $('#ltot').textContent = fN(L.amount, L.p.cur);
  const w = $('#lwarn');
  w.classList.toggle('hide', !L.over);
  w.textContent = L.over ? 'Stock insuffisant : il reste ' + fmtBase(L.p, Math.max(0, L.stock)) : '';
  $('#ladd').disabled = L.over || !(L.qty > 0);
}
function addCart() {
  const L = saleLine(), s = S.sale;
  if (!(L.qty > 0) || L.over) return;
  const same = !L.custom && S.cart.find((l) => l.pid === s.pid && l.ui === s.ui && l.tier === s.tier && !l.custom);
  if (same) { same.qty = Math.round((same.qty + L.qty) * 1e3) / 1e3; same.amount = Math.round(same.qty * L.price * 1e4) / 1e4; }
  else S.cart.push({ pid: s.pid, ui: s.ui, qty: L.qty, tier: s.tier, total: L.custom ? s.total : '', custom: L.custom, amount: L.amount, price: L.price });
  modal('');
  render();
  toast('Ajouté au panier');
}
/* ---- panier et encaissement ---- */
const cartTotal = (cur) => S.cart.reduce((a, l) => a + cvr(l.amount, prod(l.pid).cur, cur), 0);
function cartBar() {
  if (!S.cart.length) return '';
  const t = cartTotal(S.cur);
  return `<div class="cartbar noprint"><div><b>🛒 ${S.cart.length} article${S.cart.length > 1 ? 's' : ''}</b><span>${S.cur === 'CDF' ? fc(t) : dl(t)}</span></div><button class="btn" data-a="checkout">Encaisser</button></div>`;
}
function payTotal() { const c = S.pay.cur, t = cartTotal(c); return c === 'CDF' ? Math.round(t) : r2(t); }
function payModal() {
  if (!S.cart.length) return modal('');
  if (!S.pay) S.pay = { cur: S.cur };
  const c = S.pay.cur;
  modal(`<h2>Encaisser</h2>
  ${S.cart.map((l, i) => { const p = prod(l.pid), u = p.units[l.ui]; return `<div class="pl"><div class="th">${pimg(p)}</div><div class="t"><b>${esc(p.name)}</b><span class="mut">${fnum(l.qty)} ${esc(u.n.toLowerCase())}${l.tier === 'g' ? ' · gros' : ''}</span></div><b>${fN(l.amount, p.cur)}</b><button class="btn d s" data-a="cartrm" data-i="${i}">✕</button></div>`; }).join('')}
  <label>Le client paie en</label><div class="seg"><button type="button" data-a="paycur" data-v="CDF" class="${c === 'CDF' ? 'on' : ''}">Francs (FC)</button><button type="button" data-a="paycur" data-v="USD" class="${c === 'USD' ? 'on' : ''}">Dollars ($)</button></div>
  <div style="margin-top:12px"><span class="mut">Total à payer</span><div class="big-total" id="ptot">${c === 'CDF' ? fc(payTotal()) : dl(payTotal())}</div></div>
  <label>Montant donné par le client <span class="mut">(facultatif)</span></label>
  <input data-pr="1" type="number" min="0" step="any" inputmode="decimal" placeholder="Laissez vide s'il paie le montant exact">
  <div class="change" id="chg">Paiement exact</div>
  <button type="button" class="btn big" id="pbtn" data-a="dopay">✔ Encaisser</button>
  <button type="button" class="btn o big" data-a="mclose">Continuer la vente</button>
  <button type="button" class="btn o s" style="margin-top:8px" data-a="cartclear">Vider le panier</button>`);
}
function payUpd() {
  const f = $('[data-pr]'), c = S.pay.cur, tot = payTotal(), rec = f && f.value !== '' ? num(f.value) : null, el = $('#chg');
  const U = c === 'CDF' ? ' FC' : ' $', fmt = (v) => (c === 'CDF' ? nf(Math.round(v)) : nf(v, 2));
  const short = rec !== null && rec + (c === 'CDF' ? 0.5 : 0.005) < tot;
  el.className = 'change' + (short ? ' bad' : '');
  el.textContent = rec === null ? 'Paiement exact' : short ? 'Il manque ' + fmt(tot - rec) + U : rec - tot > 1e-9 ? 'Monnaie à rendre : ' + fmt(rec - tot) + U : 'Paiement exact';
  $('#pbtn').disabled = short;
}
async function doPay() {
  const f = $('[data-pr]'), rec = f && f.value !== '' ? num(f.value) : undefined;
  const btn = $('#pbtn');
  btn.disabled = true;
  try {
    const items = S.cart.map((l) => ({ productId: l.pid, unit: l.ui, qty: l.qty, tier: l.tier, total: l.custom ? num(l.total) : undefined }));
    const r = await api('/sales', 'POST', { shopId: D().me.shopIds[0], items, currency: S.pay.cur, received: rec });
    const low = Object.keys(r.left).map((pid) => prod(pid)).filter((p) => p && r.left[p.id] <= p.alertQty).map((p) => (r.left[p.id] <= 0 ? '⚠️ Rupture : ' : '⚠️ Stock bas : ') + p.name + ' (' + fmtBase(p, r.left[p.id]) + ')');
    S.cart = [];
    S.pay = null;
    ring('sale');
    modal(`<div class="done"><div class="ok">✔</div><h2>Vente enregistrée</h2><div class="mut">Total encaissé</div><div class="big-total">${fN(r.total, r.cur)}</div>
    ${r.change > 0 ? `<div class="change" style="font-size:20px">Monnaie à rendre : <b>${fN(r.change, r.cur)}</b></div>` : '<div class="change">Paiement exact</div>'}
    ${low.map((t) => `<div class="warn">${esc(t)}</div>`).join('')}
    <button type="button" class="btn big" data-a="mclose">Nouvelle vente</button></div>`);
    await load(true);
  } catch (er) { toast(er.message, 1); btn.disabled = false; }
}

function editUserModal(id) {
  const u = D().users.find((x) => x.id === id);
  modal(`<h2>${esc(u.name)} <span class="tag">${ROLE[u.role]}</span></h2><form data-f="useredit" data-id="${u.id}"><label>Nom</label><input name="name" value="${esc(u.name)}" required>
  <label>Nouveau mot de passe (laisser vide pour ne pas changer)</label><input name="password" type="text" minlength="6">
  <label>Boutiques affectées</label><select name="shopIds" multiple size="5">${D().shops.map((s) => `<option value="${s.id}" ${u.shopIds.includes(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  <button class="btn big">Enregistrer</button><button type="button" class="btn o big" data-a="mclose">Fermer</button></form>`);
}

/* ---------- photo : prise ou galerie, recadrée en carré et réduite avant envoi ---------- */
function shrink(file, size = 480) {
  return new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onerror = () => ko(new Error('Lecture impossible'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => ko(new Error('Image illisible'));
      im.onload = () => {
        const s = Math.min(im.width, im.height), out = Math.min(size, s), c = document.createElement('canvas');
        c.width = c.height = out;
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, out, out);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function pick(input) {
  const file = input.files[0];
  if (!file) return;
  const form = input.closest('form'), pv = form.querySelector('.pv');
  try {
    pv.textContent = '⏳';
    const data = await shrink(file);
    pv.innerHTML = `<img src="${data}">`;
    const r = await api('/upload', 'POST', { data });
    form.image.value = r.url;
    toast('Photo prête ✔');
  } catch (e) { pv.textContent = '📷'; toast(e.message, 1); }
  input.value = '';
}

/* ---------- actions (clics) ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a, id = t.dataset.id;
  if (a === 'mbg') { if (e.target === t) modal(''); return; }
  e.preventDefault();
  try {
    if (a === 'tab') { S.tab = t.dataset.v; S.dirty = false; render(); if (S.tab === 'Rapport') loadRep(); }
    else if (a === 'cur') { S.cur = t.dataset.v; localStorage.setItem('bp_cur', S.cur); render(); }
    else if (a === 'logout') logout();
    else if (a === 'install') { const ev = S.install; S.install = null; ev.prompt(); await ev.userChoice; render(); }
    else if (a === 'print') window.print();
    else if (a === 'mclose') modal('');
    /* vente */
    else if (a === 'sell') sellModal(id);
    else if (a === 'su') { S.sale.ui = +t.dataset.i; S.sale.tier = 'd'; S.sale.total = ''; autoTier(); showSale(); }
    else if (a === 'st') { S.sale.tier = t.dataset.v; showSale(); }
    else if (a === 'qm' || a === 'qp') { const st = +t.dataset.st || 1, d = a === 'qp' ? st : -st; S.sale.qty = Math.max(0, Math.round(((S.sale.qty || 0) + d) * 1e3) / 1e3); autoTier(); showSale(); }
    else if (a === 'qq') { S.sale.qty = +t.dataset.v; autoTier(); showSale(); }
    else if (a === 'addcart') addCart();
    else if (a === 'checkout') { S.pay = { cur: S.cur }; payModal(); }
    else if (a === 'paycur') { S.pay.cur = t.dataset.v; payModal(); }
    else if (a === 'cartrm') { S.cart.splice(+t.dataset.i, 1); S.cart.length ? payModal() : (modal(''), render()); }
    else if (a === 'cartclear') { S.cart = []; modal(''); render(); }
    else if (a === 'dopay') await doPay();
    /* produits */
    else if (a === 'editprod') { modal(`<h2>Modifier le produit</h2>${prodForm(prod(id))}<button class="btn o big" data-a="mclose">Fermer</button>`); }
    else if (a === 'addunit') { const f = t.closest('form'); f.querySelector('#units').insertAdjacentHTML('beforeend', unitRow({}, f.base.value || 'unité')); }
    else if (a === 'rmunit') { const f = t.closest('form'); if (f.querySelectorAll('.ur').length > 1) { t.closest('.ur').remove(); prodPrev(f); } else toast('Gardez au moins une façon de vendre', 1); }
    /* stock */
    else if (a === 'resupply') { S.stockSel = { productId: id, mode: 'in', shopId: myShop() }; S.tab = 'Stock'; S.dirty = false; render(); window.scrollTo(0, 0); }
    else if (a === 'hist') await histModal(id);
    /* rapports */
    else if (a === 'period') {
      const v = t.dataset.v, to = D().today;
      S.rep.to = to;
      S.rep.from = v === 'm' ? to.slice(0, 8) + '01' : addDays(to, -(+v));
      loadRep();
    }
    else if (a === 'dlrep') await dlRep();
    else if (a === 'edituser') editUserModal(id);
    else if (a === 'pw') modal(`<h2>Changer mon mot de passe</h2><form data-f="pw"><label>Ancien mot de passe</label><input type="password" name="old" required><label>Nouveau (6+ caractères)</label><input type="password" name="password" minlength="6" required><button class="btn big">Enregistrer</button><button type="button" class="btn o big" data-a="mclose">Annuler</button></form>`);
    else if (a === 'snd') {
      localStorage.setItem('bp_snd', sndOn() ? '0' : '1');
      if (sndOn()) { unlockAudio(); ring('msg'); const ok = await pushOn(); toast(ok ? '🔔 Alertes activées, même application fermée' : '🔔 Sonnerie activée (autorisez les notifications pour être alerté application fermée)'); }
      else await pushOff();
      render();
    }
    else if (a === 'suspend') {
      const u = D().users.find((x) => x.id === id), stop = u.active !== false;
      if (stop && !confirm(u.role === 'patron' ? 'Suspendre ce patron ? Ses gérants et vendeurs seront bloqués aussi.' : 'Suspendre ce compte ?')) return;
      await api('/users/' + id, 'PUT', { active: !stop }); toast(stop ? 'Compte suspendu' : 'Compte réactivé'); await load(true);
    }
    else if (a === 'toggle') { await api('/tasks/' + id + '/toggle', 'POST'); await load(true); }
    else if (a === 'delprod' && confirm('Supprimer ce produit et son stock ?')) { await api('/products/' + id, 'DELETE'); await load(true); }
    else if (a === 'delshop' && confirm('Supprimer cette boutique et son stock ?')) { await api('/shops/' + id, 'DELETE'); await load(true); }
    else if (a === 'deluser' && confirm('Supprimer ce compte ?')) { await api('/users/' + id, 'DELETE'); await load(true); }
    else if (a === 'deltask') { await api('/tasks/' + id, 'DELETE'); await load(true); }
    else if (a === 'deldeal' && confirm('Supprimer ce marché ?')) { await api('/deals/' + id, 'DELETE'); await load(true); }
  } catch (err) { toast(err.message, 1); }
});

/* ---------- formulaires ---------- */
document.addEventListener('submit', async (e) => {
  const f = e.target, n = f.dataset.f;
  if (!n) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f)), shopIds = [...(f.shopIds ? f.shopIds.selectedOptions || [] : [])].map((o) => o.value);
  const btn = f.querySelector('button.btn:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    if (n === 'login') {
      try { const r = await api('/login', 'POST', v); S.token = r.token; localStorage.setItem('bp_tok', r.token); await load(true); }
      catch (er) { $('#lerr').textContent = er.message; }
    } else if (n === 'product') {
      const all = readUnits(f), units = all.filter((u) => u.n && u.q > 0 && u.p > 0), ign = all.filter((u) => u.n && !(u.p > 0)).map((u) => u.n);
      if (!units.length) throw new Error('Ajoutez au moins une façon de vendre avec son prix');
      const body = {
        name: v.name, image: v.image, kind: v.kind, cur: v.cur, base: v.base, dec: !!v.dec, cost: num(v.cost), units, alertQty: v.alertQty, free: !!v.free,
        quick: String(v.quick || '').split(/[;,\s]+/).map(num).filter((x) => x > 0), shopId: v.shopId || undefined, qty: v.qty || undefined,
      };
      if (f.dataset.id) await api('/products/' + f.dataset.id, 'PUT', body); else await api('/products', 'POST', body);
      modal(''); S.dirty = false;
      toast('Produit enregistré ✔' + (ign.length ? ' · ignoré (sans prix) : ' + ign.join(', ') : ''));
      await load(true);
    } else if (n === 'stock') {
      const r = await api('/stock', 'POST', { shopId: v.shopId, productId: v.productId, mode: v.mode, unit: +v.unit, qty: num(v.qty), bonus: num(v.bonus), total: num(v.total), tcur: v.tcur, supplier: v.supplier, note: v.note, date: v.date });
      S.stockSel = { productId: v.productId, shopId: v.shopId, mode: v.mode };
      S.dirty = false;
      toast('Stock mis à jour : ' + r.text);
      await load(true);
    } else if (n === 'shop') {
      const body = { name: v.name, addr: v.addr, zone: v.zone, patronId: v.patronId };
      if (v.sname || v.susername) body.seller = { name: v.sname, username: v.susername, password: v.spassword };
      await api('/shops', 'POST', body); S.dirty = false; toast('Boutique créée ✔'); await load(true);
    } else if (n === 'user') { await api('/users', 'POST', { ...v, shopIds }); S.dirty = false; toast('Compte créé ✔'); await load(true); }
    else if (n === 'useredit') { await api('/users/' + f.dataset.id, 'PUT', { name: v.name, password: v.password || undefined, shopIds }); modal(''); toast('Compte mis à jour ✔'); await load(true); }
    else if (n === 'purchase') { await api('/purchases', 'POST', { shopId: v.shopId, supplier: v.supplier, note: v.note, date: v.date, amount: num(v.amount), cur: v.cur }); S.dirty = false; toast('Achat enregistré ✔'); await load(true); }
    else if (n === 'comment') { await api('/comments', 'POST', v); S.dirty = false; await load(true); }
    else if (n === 'task') { await api('/tasks', 'POST', v); S.dirty = false; await load(true); }
    else if (n === 'deal') { await api('/deals', 'POST', { agentId: v.agentId, label: v.label, valueUSD: toUSD(v.value) }); S.dirty = false; toast('Marché enregistré ✔'); await load(true); }
    else if (n === 'rate') { await api('/rate', 'PUT', v); S.dirty = false; toast('Taux mis à jour ✔'); await load(true); }
    else if (n === 'pw') { await api('/me/password', 'POST', v); modal(''); toast('Mot de passe modifié ✔'); }
  } catch (er) { toast(er.message, 1); }
  if (btn) btn.disabled = false;
});

/* calculs en direct, sélecteurs et filtres du rapport */
document.addEventListener('input', (e) => {
  const t = e.target, f = t.closest('form');
  if (f && !f.dataset.live && f.dataset.f !== 'login') S.dirty = true;     // formulaire en cours : pas d'actualisation automatique
  if (t.dataset.sq !== undefined) { S.sale.qty = num(t.value); saleUpd(); }
  else if (t.dataset.sf !== undefined) { S.sale.total = t.value; saleUpd(); }
  else if (t.dataset.pr !== undefined) payUpd();
  else if (f && f.dataset.f === 'product') prodPrev(f);
  else if (f && f.dataset.f === 'stock') stockPrev(f);
});
document.addEventListener('change', (e) => {
  const t = e.target, f = t.closest('form');
  if (t.dataset.sq !== undefined) { autoTier(); showSale(); return; }
  if (t.dataset.pick === 'shop') { S.shop = t.value; render(); return; }
  if (t.dataset.preset) { applyPreset(f, t.value); return; }
  if (f && f.dataset.f === 'stock' && t.dataset.st) { stockInit(f, t.dataset.prodsel ? 'product' : t.name === 'shopId' ? '' : ''); return; }
  if (f && f.dataset.live && f.dataset.f === 'rep') {
    const keep = S.rep.type;
    S.rep = Object.fromEntries(new FormData(f));
    if (!S.rep.type) S.rep.type = keep;
    if (S.rep.from > S.rep.to) S.rep.to = S.rep.from;
    loadRep();
  }
});

/* temps réel : actualisation douce toutes les 8 s (jamais pendant la saisie) */
setInterval(async () => {
  if (!S.token || document.hidden || S.dirty || $('#modal').firstChild) return;
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  try { await load(); if (S.tab === 'Rapport' && S.rep) { const r = await api('/report?' + new URLSearchParams(S.rep)); if (JSON.stringify(r) !== JSON.stringify(S.repData)) { S.repData = r; render(); } } } catch { /* silencieux */ }
}, 8000);

/* PWA : service worker, installation, état hors ligne */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  S.install = e;
  const a = document.activeElement;
  if (!(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && !$('#modal').firstChild && !S.dirty) render();
});
window.addEventListener('appinstalled', () => { S.install = null; toast('Application installée ✔'); render(); });
const netState = () => $('#offline').classList.toggle('hide', navigator.onLine);
window.addEventListener('online', () => { netState(); toast('Connexion rétablie'); if (S.token) load().catch(() => {}); });
window.addEventListener('offline', netState);
netState();

/* démarrage */
(async () => {
  if (S.token) { try { await load(true); if (S.tab === 'Rapport') loadRep(); return; } catch { logout(); return; } }
  render();
})();
