'use strict';
/* Pages légales exigées par Google Play : politique de confidentialité et suppression de compte. */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = (title, body) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – BoutiquePro</title><link rel="icon" href="/icons/favicon-32.png">
<style>body{margin:0;background:#f3f6f8;color:#0f172a;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 18px 60px}.c{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 24px;box-shadow:0 4px 16px #0f172a0f}
h1{margin:0 0 4px;font-size:26px}h2{font-size:18px;margin:26px 0 6px;color:#0f766e}a{color:#0d9488}p,li{margin:6px 0}.m{color:#64748b;font-size:14px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:16px}.top img{width:40px;height:40px;border-radius:11px}.top b{font-size:18px}</style></head>
<body><main><div class="top"><img src="/icons/icon-192.png" alt=""><b>BoutiquePro</b></div><div class="c">${body}</div>
<p class="m"><a href="/">← Retour à l'application</a> · <a href="/confidentialite">Confidentialité</a> · <a href="/suppression-compte">Suppression de compte</a></p></main></body></html>`;

module.exports = (contact) => {
  const who = contact ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a>` : "l'administrateur de votre entreprise (le patron ou le super admin BoutiquePro)";
  const privacy = page('Politique de confidentialité', `
<h1>Politique de confidentialité</h1><p class="m">Dernière mise à jour : octobre 2026</p>
<p>BoutiquePro est une application de gestion de boutiques (ventes, stocks, achats, rapports). Cette page explique quelles données sont traitées et pourquoi.</p>
<h2>Données traitées</h2><ul>
<li><b>Compte</b> : nom, identifiant et mot de passe (conservé uniquement sous forme chiffrée irréversible).</li>
<li><b>Activité de la boutique</b> : produits, prix, stocks, ventes, achats et fournisseurs, tâches, commentaires et messages entre vendeurs, gérants et patron.</li>
<li><b>Photos de produits</b> que vous choisissez d'envoyer. L'application demande l'accès à la caméra ou à la galerie uniquement quand vous touchez « Prendre une photo » ou « Choisir dans la galerie ».</li></ul>
<h2>Ce que nous ne faisons pas</h2><ul><li>Aucune publicité, aucun outil de suivi ou d'analyse tiers, aucune revente de données.</li>
<li>Aucune localisation, aucun accès aux contacts, aux SMS ou au microphone.</li></ul>
<h2>Qui voit quoi</h2><p>Chaque rôle ne voit que les données de son périmètre : le vendeur voit sa boutique, le gérant ses boutiques, le patron son entreprise. Le super admin de la plateforme peut accéder aux comptes pour l'assistance technique.</p>
<h2>Hébergement et sécurité</h2><p>Les données sont stockées sur un serveur d'hébergement web professionnel (Hostinger) et transmises via une connexion chiffrée (HTTPS). L'accès est protégé par identifiant et mot de passe, avec limitation des tentatives de connexion.</p>
<h2>Conservation</h2><p>Les données sont conservées tant que le compte de l'entreprise est actif. À la suppression d'une entreprise, ses boutiques, produits, stocks, ventes, achats et messages sont effacés.</p>
<h2>Vos droits et contact</h2><p>Vous pouvez demander l'accès, la correction ou la suppression de vos données auprès de ${who}. Voir aussi <a href="/suppression-compte">comment supprimer un compte</a>.</p>`);
  const del = page('Suppression de compte', `
<h1>Supprimer un compte BoutiquePro</h1><p class="m">Les comptes sont créés par l'administrateur de l'entreprise ; la suppression se fait donc par lui ou sur demande.</p>
<h2>Comment demander la suppression</h2><ol>
<li><b>Vendeur ou gérant</b> : demandez à votre patron (ou gérant) de supprimer votre compte depuis l'application (onglet « Gérants » ou « Utilisateurs »). Le compte est supprimé immédiatement.</li>
<li><b>Patron</b> : écrivez à ${who} en indiquant votre identifiant. La suppression du compte patron efface aussi toute l'entreprise : boutiques, produits, stocks, ventes, achats, messages et tâches.</li></ol>
<h2>Ce qui est supprimé</h2><ul><li>Le profil (nom, identifiant, mot de passe chiffré) et l'accès à l'application, immédiatement.</li>
<li>Pour un compte vendeur ou gérant : les ventes enregistrées restent dans les registres de la boutique, car elles font partie de la comptabilité de l'entreprise ; elles ne permettent plus de se connecter.</li></ul>
<h2>Délai</h2><p>Les demandes envoyées par message sont traitées sous 30 jours.</p>`);
  return { privacy, del };
};
