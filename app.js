'use strict';
/* BoutiquePro – interface web (JavaScript pur, aucune dépendance) */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('bp_tok') || '', cur: localStorage.getItem('bp_cur') || 'USD', tab: '', data: null, raw: '', shop: '', rep: null, repData: null, sale: null };
const ROLE = { superadmin: 'Super admin', patron: 'Patron', gerant: 'Gérant', vendeur: 'Vendeur', agent: 'Agent éditeur' };
const TABS = {
  vendeur: ['Vente', 'Tâches', 'Messages'],
  gerant: ['Tableau', 'Produits', 'Stock', 'Boutiques', 'Achats', 'Rapport', 'Tâches', 'Messages'],
  patron: ['Tableau', 'Gérants', 'Boutiques', 'Rapport', 'Tâches', 'Messages'],
  superadmin: ['Tableau', 'Utilisateurs', 'Agents', 'Produits', 'Boutiques', 'Rapport'],
  agent: ['Mon espace', 'Produits'],
};

/* ---------- devises ---------- */
const D = () => S.data;
const rate = () => (S.data ? S.data.rate : 2800);
const fm = (usd, cur = S.cur) => cur === 'CDF'
  ? Math.round(usd * rate()).toLocaleString('fr-FR') + ' FC'
  : '$' + (+usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toUSD = (v, cur = S.cur) => (cur === 'CDF' ? (+v || 0) / rate() : +v || 0);
const fromUSD = (u, cur = S.cur) => (cur === 'CDF' ? Math.round(u * rate()) : +(+u || 0).toFixed(2));
const step = () => (S.cur === 'CDF' ? 1 : 0.01);
const r2 = (x) => Math.round(x * 100) / 100;

/* ---------- aides d'affichage ---------- */
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const ph = (n) => `<div class="ph" style="background:hsl(${hue(n)} 55% 50%)">${esc((n || '?').trim().slice(0, 2).toUpperCase())}</div>`;
const pimg = (p) => (p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : ph(p.name));
const stk = (sid, pid) => D().stock[sid + '|' + pid] || 0;
const prod = (id) => D().products.find((p) => p.id === id);
const shopN = (id) => (D().shops.find((s) => s.id === id) || {}).name || '?';
const userN = (id) => (D().users.find((u) => u.id === id) || (D().me.id === id ? D().me : {})).name || '—';
const hm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' });
const badge = (q, p) => (q <= 0 ? '<span class="badge out">Rupture</span>' : q <= p.alertQty ? `<span class="badge low">Bas : ${r2(q)}</span>` : `<span class="badge">Stock : ${r2(q)}</span>`);
const kpi = (l, v, c = '') => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b></div>`;
const empty = (t) => `<div class="empty">${t}</div>`;
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const cur$ = () => `<span class="mut">(${S.cur === 'CDF' ? 'FC' : '$'})</span>`;
const okFor = (p, s) => p.patronId === s.patronId && (!p.shopIds || p.shopIds.includes(s.id));
const myShop = () => {
  const sh = D().shops;
  if (!sh.find((s) => s.id === S.shop)) S.shop = (sh[0] || {}).id || '';
  return S.shop;
};
const shopPicker = () => D().shops.length > 1
  ? `<select class="noprint" data-pick="shop" style="max-width:260px;margin-bottom:12px">${opts(D().shops.map((s) => [s.id, s.name]), myShop())}</select>` : '';

function toast(m, err) {
  const d = document.createElement('div');
  d.textContent = m;
  if (err) d.className = 'err';
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

/* ---------- API ---------- */
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && p !== '/login') { logout(); throw new Error('Session expirée, reconnectez-vous'); }
  if (!r.ok) throw new Error(j.error || 'Erreur');
  return j;
}
function logout() {
  localStorage.removeItem('bp_tok');
  Object.assign(S, { token: '', data: null, raw: '', tab: '', repData: null });
  render();
}
async function load(force) {
  const d = await api('/data');
  const raw = JSON.stringify(d);
  if (raw === S.raw && !force) return;
  S.raw = raw;
  S.data = d;
  render();
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
    <div class="seg noprint"><button data-a="cur" data-v="USD" class="${S.cur === 'USD' ? 'on' : ''}">USD</button><button data-a="cur" data-v="CDF" class="${S.cur === 'CDF' ? 'on' : ''}">CDF</button></div>
    <div class="who noprint"><b>${esc(me.name)}</b><span>${ROLE[me.role]} · <a href="#" data-a="pw">Mot de passe</a> · <a href="#" data-a="logout">Quitter</a></span></div>
  </header>
  <nav class="tabs">${tabs.map((t) => `<button data-a="tab" data-v="${t}" class="${t === S.tab ? 'on' : ''}">${t}</button>`).join('')}</nav>
  <main>${(VIEWS[me.role + '|' + S.tab] || (() => ''))()}</main>`;
  window.scrollTo(0, y);
}
function loginView() {
  return `<div class="login"><form class="card" data-f="login"><div class="logo">🏪</div><h1>BoutiquePro</h1><p class="mut">Gestion de boutiques · Connexion</p>
  <label>Identifiant</label><input name="username" autocomplete="username" autocapitalize="none" required>
  <label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" required>
  <button class="btn big">Se connecter</button><div class="err" id="lerr"></div></form></div>`;
}

/* ---------- formulaires produit ---------- */
function prodForm(p) {
  const me = D().me, e = !!p;
  const needShop = me.role === 'agent' || me.role === 'superadmin';
  const d = (p && p.detail) || {};
  const shopsList = D().shops.map((s) => [s.id, s.name]);
  return `<form data-f="product" ${e ? `data-id="${p.id}"` : ''}>
  <label>Nom du produit</label><input name="name" value="${esc(p ? p.name : '')}" required maxlength="120" placeholder="Ex : Eau minérale 50 cl">
  <label>Photo du produit</label>
  <div class="photo"><div class="pv">${p && p.image ? `<img src="${esc(p.image)}">` : '📷'}</div>
    <div class="bt"><label class="btn s">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" onchange="pick(this)"></label>
    <label class="btn o s">🖼️ Choisir dans la galerie<input type="file" accept="image/*" onchange="pick(this)"></label></div>
    <input type="hidden" name="image" value="${esc(p ? p.image : '')}"></div>
  <div class="row"><div><label>Coût d'achat ${cur$()}</label><input name="costUSD" type="number" min="0" step="${step()}" value="${p ? fromUSD(p.costUSD) : ''}"></div>
  <div><label>Prix de gros ${cur$()}</label><input name="wholeUSD" type="number" min="0" step="${step()}" value="${p ? fromUSD(p.wholeUSD) : ''}"></div>
  <div><label>Prix détail ${cur$()}</label><input name="priceUSD" type="number" min="0" step="${step()}" value="${p ? fromUSD(p.priceUSD) : ''}" required></div></div>
  <label>Vente par parts (optionnel) — ex : sac 25 kg vendu au kg, jus au verre</label>
  <div class="row"><input name="dunit" placeholder="Unité (kg, verre…)" value="${esc(d.unit || '')}"><input name="dparts" type="number" min="0" step="any" placeholder="Parts par unité (25)" value="${d.parts || ''}"><input name="dprice" type="number" min="0" step="${step()}" placeholder="Prix par part ${S.cur}" value="${d.priceUSD ? fromUSD(d.priceUSD) : ''}"></div>
  <div class="row"><div><label>Alerte stock bas à</label><input name="alertQty" type="number" min="0" step="any" value="${p ? p.alertQty : 3}"></div>
  ${e ? '' : `<div><label>Boutique ${needShop ? '' : '(stock initial)'}</label><select name="shopId" ${needShop ? 'required' : ''}>${needShop ? '<option value="">— choisir —</option>' : '<option value="">Toutes mes boutiques</option>'}${opts(shopsList, '')}</select></div>`}
  ${e || me.role === 'agent' ? '' : '<div><label>Quantité initiale</label><input name="qty" type="number" min="0" step="any" placeholder="0"></div>'}</div>
  <button class="btn big">${e ? 'Enregistrer' : 'Ajouter le produit'}</button></form>`;
}
function prodRows(list, o = {}) {
  if (!list.length) return empty('Aucun produit.');
  const vend = D().me.role === 'vendeur';
  return list.map((p) => {
    const tot = D().shops.reduce((a, s) => a + (okFor(p, s) ? stk(s.id, p.id) : 0), 0);
    return `<div class="pl"><div class="th">${pimg(p)}</div><div class="t"><b>${esc(p.name)}</b><span class="mut">${vend ? '' : 'Coût ' + fm(p.costUSD) + ' · '}Gros ${fm(p.wholeUSD)} · Détail ${fm(p.priceUSD)}${p.detail ? ` · ${fm(p.detail.priceUSD)}/${esc(p.detail.unit)}` : ''}</span></div>
    ${o.stock === false ? '' : badge(tot, p)}
    ${o.edit ? `<button class="btn o s" data-a="editprod" data-id="${p.id}">Modifier</button>` : ''}${o.del ? `<button class="btn d s" data-a="delprod" data-id="${p.id}">✕</button>` : ''}</div>`;
  }).join('');
}

/* ---------- vues ---------- */
const VIEWS = {};
const todaySales = () => D().sales.filter((x) => x.date === D().today);

VIEWS['vendeur|Vente'] = () => {
  const sid = D().me.shopIds[0], sh = D().shops.find((s) => s.id === sid);
  if (!sh) return empty('Aucune boutique ne vous est affectée. Contactez votre gérant.');
  const list = D().products.filter((p) => !p.shopIds || p.shopIds.includes(sid));
  const ts = D().sales.filter((x) => x.date === D().today);
  const ca = ts.reduce((a, x) => a + x.totalUSD, 0);
  return `<div class="kpis">${kpi('Boutique', esc(sh.name))}${kpi('Ventes du jour', ts.length, 'o')}${kpi('Encaissé aujourd\'hui', fm(ca), 'g')}</div>
  <div class="card"><h2>Produits</h2><div class="search"><input placeholder="Rechercher un produit…" oninput="filt(this.value)"></div>
  ${list.length ? `<div class="grid">${list.map((p) => { const q = stk(sid, p.id); return `<div class="pt ${q <= 0 ? 'out' : ''}" data-a="sell" data-id="${p.id}" data-n="${esc(p.name.toLowerCase())}"><div class="im">${pimg(p)}<span class="badge-w">${badge(q, p).replace('class="badge', 'class="badge badge-abs')}</span></div><div class="bd"><b>${esc(p.name)}</b><div class="pr">${fm(p.priceUSD)}</div>${p.detail ? `<div class="mut">${fm(p.detail.priceUSD)} / ${esc(p.detail.unit)}</div>` : ''}</div></div>`; }).join('')}</div>` : empty('Aucun produit pour le moment.')}</div>
  ${ts.length ? `<div class="card"><h2>Mes dernières ventes</h2>${ts.slice(-6).reverse().map((x) => `<div class="pl"><div class="t"><b>${esc((prod(x.productId) || {}).name || '?')} × ${x.qty}</b><span class="mut">${hm(x.ts)}</span></div><b>${fm(x.totalUSD)}</b></div>`).join('')}</div>` : ''}`;
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
  const ts = todaySales(), ca = ts.reduce((a, x) => a + x.totalUSD, 0), pf = ts.reduce((a, x) => a + x.totalUSD - x.costUSD, 0);
  const alerts = [];
  D().shops.forEach((s) => D().products.forEach((p) => { if (okFor(p, s)) { const q = stk(s.id, p.id); if (q <= p.alertQty) alerts.push({ s, p, q }); } }));
  return `${rateCard()}<div class="kpis">${kpi('Ventes aujourd\'hui', fm(ca), 'g')}${kpi(pf >= 0 ? 'Bénéfice du jour' : 'Perte du jour', fm(Math.abs(pf)), pf >= 0 ? '' : 'r')}${kpi('Nombre de ventes', ts.length, 'o')}${kpi('Alertes stock', alerts.length, alerts.length ? 'r' : '')}</div>
  <div class="cols"><div class="card"><h2>Par boutique (aujourd'hui)</h2>${D().shops.length ? `<div class="tw"><table><tr><th>Boutique</th><th class="num">Ventes</th><th class="num">Bénéfice</th></tr>${D().shops.map((s) => { const l = ts.filter((x) => x.shopId === s.id); return `<tr><td>${esc(s.name)}</td><td class="num">${fm(l.reduce((a, x) => a + x.totalUSD, 0))}</td><td class="num">${fm(l.reduce((a, x) => a + x.totalUSD - x.costUSD, 0))}</td></tr>`; }).join('')}</table></div>` : empty('Aucune boutique.')}</div>
  <div class="card"><h2>⚠️ Ruptures & ravitaillement</h2>${alerts.length ? alerts.slice(0, 12).map((a) => `<div class="pl"><div class="th">${pimg(a.p)}</div><div class="t"><b>${esc(a.p.name)}</b><span class="mut">${esc(a.s.name)}</span></div>${badge(a.q, a.p)}</div>`).join('') : empty('Tout est en stock 👍')}</div></div>
  <div class="card"><h2>Ventes en temps réel</h2>${D().sales.length ? D().sales.slice(-10).reverse().map((x) => `<div class="pl"><div class="t"><b>${esc((prod(x.productId) || {}).name || '?')} × ${x.qty}</b><span class="mut">${esc(shopN(x.shopId))} · ${esc(userN(x.sellerId))} · ${hm(x.ts)}</span></div><b>${fm(x.totalUSD)}</b></div>`).join('') : empty('Aucune vente pour le moment.')}</div>`;
}
['gerant', 'patron', 'superadmin'].forEach((r) => (VIEWS[r + '|Tableau'] = dashboard));

/* produits */
VIEWS['gerant|Produits'] = () => `<div class="cols"><div class="card"><h2>Nouveau produit</h2>${prodForm()}</div><div class="card"><h2>Catalogue (${D().products.length})</h2>${prodRows(D().products, { edit: 1, del: 1 })}</div></div>`;
VIEWS['superadmin|Produits'] = VIEWS['gerant|Produits'];
VIEWS['agent|Produits'] = () => `<div class="cols"><div class="card"><h2>Ajouter un produit</h2><p class="mut">+0,10 $ de commission par produit ajouté. Il apparaît directement dans l'espace du vendeur de la boutique choisie.</p>${prodForm()}</div><div class="card"><h2>Mes produits ajoutés</h2>${prodRows(D().products.filter((p) => p.addedBy === D().me.id), { edit: 1, stock: false })}</div></div>`;

/* stock */
VIEWS['gerant|Stock'] = () => {
  const sh = D().shops;
  if (!sh.length) return empty('Créez d\'abord une boutique.');
  return `<div class="card"><h2>Entrée de stock / dispatch</h2><form data-f="stock"><div class="row">
  <div><label>Boutique</label><select name="shopId">${opts(sh.map((s) => [s.id, s.name]), myShop())}</select></div>
  <div><label>Produit</label><select name="productId">${opts(D().products.map((p) => [p.id, p.name]))}</select></div>
  <div><label>Quantité (− pour retirer)</label><input name="qty" type="number" step="any" required></div>
  <div><label>Coût d'achat ${cur$()} (optionnel)</label><input name="costUSD" type="number" min="0" step="${step()}"></div></div><button class="btn big">Enregistrer</button></form></div>
  <div class="card"><h2>Stock par boutique</h2><div class="tw"><table><tr><th>Produit</th>${sh.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr>${D().products.map((p) => `<tr><td><div style="display:flex;align-items:center;gap:8px"><div class="th" style="width:30px;height:30px;border-radius:8px">${pimg(p)}</div>${esc(p.name)}</div></td>${sh.map((s) => { const ok = okFor(p, s); return `<td class="num">${ok ? badge(stk(s.id, p.id), p) : '—'}</td>`; }).join('')}</tr>`).join('')}</table></div></div>`;
};
VIEWS['patron|Stock'] = VIEWS['gerant|Stock'];

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
VIEWS['gerant|Achats'] = () => `<div class="cols"><div class="card"><h2>Enregistrer un achat</h2>${D().shops.length ? `<form data-f="purchase"><label>Boutique</label><select name="shopId">${opts(D().shops.map((s) => [s.id, s.name]), myShop())}</select><label>Fournisseur</label><input name="supplier" required><label>Montant ${cur$()}</label><input name="amount" type="number" min="0" step="${step()}" required><label>Détail (produits achetés)</label><input name="note"><label>Date</label><input name="date" type="date" value="${D().today}"><button class="btn big">Enregistrer</button></form>` : empty('Créez d\'abord une boutique.')}</div>
<div class="card"><h2>Historique des achats</h2>${D().purchases.length ? `<div class="tw"><table><tr><th>Date</th><th>Boutique</th><th>Fournisseur</th><th class="num">Montant</th></tr>${D().purchases.slice().reverse().map((x) => `<tr><td>${x.date}</td><td>${esc(shopN(x.shopId))}</td><td>${esc(x.supplier)}<br><span class="mut">${esc(x.note || '')}</span></td><td class="num">${fm(x.amountUSD)}</td></tr>`).join('')}</table></div>` : empty('Aucun achat enregistré.')}</div></div>`;

/* rapport */
async function loadRep() {
  if (!S.rep) S.rep = { from: D().today, to: D().today, shopId: '', gerantId: '' };
  const q = new URLSearchParams(S.rep).toString();
  try { S.repData = await api('/report?' + q); } catch (e) { toast(e.message, 1); }
  if (S.tab === 'Rapport') render();
}
function repView() {
  if (!S.rep) S.rep = { from: D().today, to: D().today, shopId: '', gerantId: '' };
  const r = S.repData, f = S.rep, gers = D().users.filter((u) => u.role === 'gerant');
  const T = (h, rows) => `<div class="tw"><table><tr>${h.map((x, i) => `<th class="${i ? 'num' : ''}">${x}</th>`).join('')}</tr>${rows.join('')}</table></div>`;
  return `<div class="card noprint"><h2>📅 Rapport par date</h2><form data-f="rep" data-live="1"><div class="row">
  <div><label>Du</label><input type="date" name="from" value="${f.from}"></div><div><label>Au</label><input type="date" name="to" value="${f.to}"></div>
  <div><label>Boutique</label><select name="shopId"><option value="">Toutes</option>${opts(D().shops.map((s) => [s.id, s.name]), f.shopId)}</select></div>
  ${gers.length && D().me.role !== 'gerant' ? `<div><label>Gérant</label><select name="gerantId"><option value="">Tous</option>${opts(gers.map((g) => [g.id, g.name]), f.gerantId)}</select></div>` : ''}</div>
  <div class="acts"><button type="button" class="btn o" data-a="print">🖨️ Imprimer le rapport</button></div></form></div>
  ${!r ? empty('Chargement…') : `<div class="print-h"><h1>Rapport BoutiquePro</h1><p>Période : ${r.from} → ${r.to} · Édité le ${new Date().toLocaleString('fr-FR')} · Devise : ${S.cur} (1 USD = ${rate()} CDF)</p></div>
  <div class="kpis">${kpi('Chiffre d\'affaires', fm(r.ca), 'g')}${kpi('Coût des ventes', fm(r.cost))}${kpi(r.profit >= 0 ? 'Bénéfice' : 'Perte', fm(Math.abs(r.profit)), r.profit >= 0 ? 'g' : 'r')}${kpi('Achats (période)', fm(r.purchasesTotal), 'o')}${kpi('Ventes', r.count)}</div>
  <div class="card"><h2>Par boutique</h2>${r.perShop.length ? T(['Boutique', 'Gérant', 'CA', 'Bénéfice'], r.perShop.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${esc(x.gerants.join(', ') || '—')}</td><td class="num">${fm(x.ca)}</td><td class="num">${fm(x.profit)}</td></tr>`)) : empty('Aucune vente sur la période.')}</div>
  <div class="card"><h2>Par produit</h2>${r.perProduct.length ? T(['Produit', 'Ventes', 'CA', 'Bénéfice'], r.perProduct.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.n}</td><td class="num">${fm(x.ca)}</td><td class="num">${fm(x.profit)}</td></tr>`)) : empty('—')}</div>
  <div class="card"><h2>Par jour</h2>${r.perDay.length ? T(['Date', 'Ventes', 'CA', 'Bénéfice'], r.perDay.map((x) => `<tr><td>${x.key}</td><td class="num">${x.n}</td><td class="num">${fm(x.ca)}</td><td class="num">${fm(x.profit)}</td></tr>`)) : empty('—')}</div>
  ${r.purchases.length ? `<div class="card"><h2>Achats & ravitaillement</h2>${T(['Date', 'Boutique · fournisseur', 'Montant'], r.purchases.map((x) => `<tr><td>${x.date}</td><td class="num">${esc(x.shop)} · ${esc(x.supplier)}</td><td class="num">${fm(x.amountUSD)}</td></tr>`))}</div>` : ''}`}`;
}
['gerant', 'patron', 'superadmin'].forEach((r) => (VIEWS[r + '|Rapport'] = repView));

/* utilisateurs */
function userRows(list) {
  if (!list.length) return empty('Aucun compte.');
  return `<div class="tw"><table><tr><th>Nom</th><th>Rôle</th><th>Boutiques</th><th></th></tr>${list.map((u) => `<tr><td><b>${esc(u.name)}</b><br><span class="mut">@${esc(u.username)}</span></td><td><span class="tag">${ROLE[u.role]}</span></td><td>${esc(u.shopIds.map(shopN).join(', ') || '—')}</td><td><button class="btn o s" data-a="edituser" data-id="${u.id}">Modifier</button> <button class="btn d s" data-a="deluser" data-id="${u.id}">✕</button></td></tr>`).join('')}</table></div>`;
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
function modal(html) { $('#modal').innerHTML = html ? `<div class="mo" data-a="mbg"><div>${html}</div></div>` : ''; }
function sellModal(pid) {
  const sid = D().me.shopIds[0] || myShop(), p = prod(pid), q = stk(sid, pid);
  if (q <= 0) return toast('Rupture de stock : ' + p.name, 1);
  S.sale = { pid, sid };
  modal(`<div class="pl" style="border:0"><div class="th" style="width:60px;height:60px">${pimg(p)}</div><div class="t"><b style="font-size:17px">${esc(p.name)}</b><span class="mut">En stock : ${r2(q)}</span></div></div>
  <form data-f="sale"><label>Type de vente</label><select name="mode" data-calc="1">
  <option value="u">Prix détail — ${fm(p.priceUSD)}</option>${p.wholeUSD > 0 ? `<option value="g">Prix de gros — ${fm(p.wholeUSD)}</option>` : ''}${p.detail ? `<option value="d">Par ${esc(p.detail.unit)} — ${fm(p.detail.priceUSD)}</option>` : ''}</select>
  <div class="row"><div><label>Quantité</label><input name="qty" type="number" min="0.001" step="any" value="1" data-calc="1" required></div>
  <div><label>Payé en</label><select name="currency" data-calc="1"><option ${S.cur === 'USD' ? 'selected' : ''}>USD</option><option ${S.cur === 'CDF' ? 'selected' : ''}>CDF</option></select></div></div>
  <div style="margin-top:12px"><span class="mut">Total à payer</span><div class="big-total" id="tot">…</div></div>
  <label>Montant reçu du client</label><input name="received" type="number" min="0" step="any" data-calc="1" inputmode="decimal" required>
  <div class="acts"><button type="button" class="btn o s" data-a="exact">Montant exact</button></div><div class="change" id="chg">Monnaie : —</div>
  <button class="btn big">✔ Valider la vente</button><button type="button" class="btn o big" data-a="mclose">Annuler</button></form>`);
  calcSale();
}
function saleCalc() {
  const f = $('form[data-f=sale]');
  if (!f || !S.sale) return null;
  const p = prod(S.sale.pid), m = f.mode.value, qty = +f.qty.value || 0, cur = f.currency.value;
  const unit = m === 'd' ? p.detail.priceUSD : m === 'g' ? p.wholeUSD : p.priceUSD;
  const tot = qty * unit, totC = cur === 'CDF' ? Math.round(tot * rate()) : r2(tot);
  return { f, tot, totC, cur, rec: +f.received.value || 0 };
}
function calcSale() {
  const c = saleCalc();
  if (!c) return;
  $('#tot').textContent = c.cur === 'CDF' ? c.totC.toLocaleString('fr-FR') + ' FC' : '$' + c.totC.toFixed(2);
  const el = $('#chg'), diff = c.rec - c.totC;
  const u = c.cur === 'CDF' ? ' FC' : ' $';
  el.className = 'change' + (c.rec && diff < 0 ? ' bad' : '');
  el.textContent = !c.rec ? 'Monnaie : —' : diff >= 0 ? 'Monnaie à rendre : ' + (c.cur === 'CDF' ? Math.round(diff).toLocaleString('fr-FR') : diff.toFixed(2)) + u : 'Il manque ' + (c.cur === 'CDF' ? Math.round(-diff).toLocaleString('fr-FR') : (-diff).toFixed(2)) + u;
}
function editUserModal(id) {
  const u = D().users.find((x) => x.id === id);
  modal(`<h2>${esc(u.name)} <span class="tag">${ROLE[u.role]}</span></h2><form data-f="useredit" data-id="${u.id}"><label>Nom</label><input name="name" value="${esc(u.name)}" required>
  <label>Nouveau mot de passe (laisser vide pour ne pas changer)</label><input name="password" type="text" minlength="6">
  <label>Boutiques affectées</label><select name="shopIds" multiple size="5">${D().shops.map((s) => `<option value="${s.id}" ${u.shopIds.includes(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  <button class="btn big">Enregistrer</button><button type="button" class="btn o big" data-a="mclose">Fermer</button></form>`);
}

/* ---------- photo : prise ou galerie, réduite avant envoi ---------- */
function shrink(file, max = 720) {
  return new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onerror = () => ko(new Error('Lecture impossible'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => ko(new Error('Image illisible'));
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.82));
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
    if (a === 'tab') { S.tab = t.dataset.v; render(); if (S.tab === 'Rapport') loadRep(); }
    else if (a === 'cur') { S.cur = t.dataset.v; localStorage.setItem('bp_cur', S.cur); render(); }
    else if (a === 'logout') logout();
    else if (a === 'print') window.print();
    else if (a === 'mclose') modal('');
    else if (a === 'sell') sellModal(id);
    else if (a === 'exact') { const c = saleCalc(); c.f.received.value = c.totC; calcSale(); }
    else if (a === 'editprod') { modal(`<h2>Modifier le produit</h2>${prodForm(prod(id))}<button class="btn o big" data-a="mclose">Fermer</button>`); }
    else if (a === 'edituser') editUserModal(id);
    else if (a === 'pw') modal(`<h2>Changer mon mot de passe</h2><form data-f="pw"><label>Ancien mot de passe</label><input type="password" name="old" required><label>Nouveau (6+ caractères)</label><input type="password" name="password" minlength="6" required><button class="btn big">Enregistrer</button><button type="button" class="btn o big" data-a="mclose">Annuler</button></form>`);
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
    } else if (n === 'sale') {
      const c = saleCalc();
      const r = await api('/sales', 'POST', { productId: S.sale.pid, shopId: S.sale.sid, mode: v.mode, qty: +v.qty, currency: v.currency, received: +v.received });
      modal('');
      const diff = c.rec - c.totC;
      toast('Vente enregistrée ✔' + (diff > 0 ? ' · Monnaie : ' + (c.cur === 'CDF' ? Math.round(diff).toLocaleString('fr-FR') + ' FC' : '$' + diff.toFixed(2)) : '') + (r.left <= 0 ? ' · RUPTURE signalée' : ''));
      await load(true);
    } else if (n === 'product') {
      const body = { name: v.name, image: v.image, costUSD: toUSD(v.costUSD), wholeUSD: toUSD(v.wholeUSD), priceUSD: toUSD(v.priceUSD), alertQty: v.alertQty, shopId: v.shopId || undefined, qty: v.qty || undefined, detail: v.dunit && +v.dparts > 0 ? { unit: v.dunit, parts: +v.dparts, priceUSD: toUSD(v.dprice) } : null };
      if (f.dataset.id) await api('/products/' + f.dataset.id, 'PUT', body); else await api('/products', 'POST', body);
      modal(''); toast('Produit enregistré ✔'); await load(true);
    } else if (n === 'stock') { const r = await api('/stock', 'POST', { ...v, qty: +v.qty, costUSD: v.costUSD ? toUSD(v.costUSD) : undefined }); toast('Stock mis à jour : ' + r.qty); await load(true); }
    else if (n === 'shop') {
      const body = { name: v.name, addr: v.addr, zone: v.zone, patronId: v.patronId };
      if (v.sname || v.susername) body.seller = { name: v.sname, username: v.susername, password: v.spassword };
      await api('/shops', 'POST', body); toast('Boutique créée ✔'); await load(true);
    } else if (n === 'user') { await api('/users', 'POST', { ...v, shopIds }); toast('Compte créé ✔'); await load(true); }
    else if (n === 'useredit') { await api('/users/' + f.dataset.id, 'PUT', { name: v.name, password: v.password || undefined, shopIds }); modal(''); toast('Compte mis à jour ✔'); await load(true); }
    else if (n === 'purchase') { await api('/purchases', 'POST', { shopId: v.shopId, supplier: v.supplier, note: v.note, date: v.date, amountUSD: toUSD(v.amount) }); toast('Achat enregistré ✔'); await load(true); }
    else if (n === 'comment') { await api('/comments', 'POST', v); await load(true); }
    else if (n === 'task') { await api('/tasks', 'POST', v); await load(true); }
    else if (n === 'deal') { await api('/deals', 'POST', { agentId: v.agentId, label: v.label, valueUSD: toUSD(v.value) }); toast('Marché enregistré ✔'); await load(true); }
    else if (n === 'rate') { await api('/rate', 'PUT', v); toast('Taux mis à jour ✔'); await load(true); }
    else if (n === 'pw') { await api('/me/password', 'POST', v); modal(''); toast('Mot de passe modifié ✔'); }
  } catch (er) { toast(er.message, 1); }
  if (btn) btn.disabled = false;
});

/* calculs en direct, sélecteurs et filtres du rapport */
document.addEventListener('input', (e) => { if (e.target.dataset.calc) calcSale(); });
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.calc) calcSale();
  if (t.dataset.pick === 'shop') { S.shop = t.value; render(); }
  const f = t.closest('form[data-live]');
  if (f && f.dataset.f === 'rep') { S.rep = Object.fromEntries(new FormData(f)); if (S.rep.from > S.rep.to) S.rep.to = S.rep.from; loadRep(); }
});

/* temps réel : actualisation douce toutes les 8 s */
setInterval(async () => {
  if (!S.token || document.hidden || $('#modal').firstChild) return;
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  try { await load(); if (S.tab === 'Rapport' && S.rep) { const r = await api('/report?' + new URLSearchParams(S.rep)); if (JSON.stringify(r) !== JSON.stringify(S.repData)) { S.repData = r; render(); } } } catch { /* silencieux */ }
}, 8000);

/* démarrage */
(async () => {
  if (S.token) { try { await load(true); if (S.tab === 'Rapport') loadRep(); return; } catch { logout(); return; } }
  render();
})();
