# BoutiquePro

Application web de gestion de boutiques physiques (Node.js + Express, sans base native).

**Rôles** : vendeur · gérant · patron · super admin · agent éditeur.
**Devises** : USD et CDF (taux modifiable par le patron / super admin).
**Photos produits** : prise directe avec la caméra ou choix dans la galerie.

## Lancer en local
```bash
npm install
ADMIN_PASSWORD=MonMotDePasse npm start    # http://localhost:3000
npm test                                  # test de fumée
```
Sans `ADMIN_PASSWORD`, un mot de passe aléatoire est créé et écrit dans `data/premier-admin.txt`.

## Variables d'environnement
Voir `.env.example`. Les plus importantes : `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATA_DIR`.
`DATA_DIR` doit pointer vers un dossier **hors du code** : il contient `db.json` et `uploads/` (photos).

## Déploiement Hostinger (Node.js)
- Fichier d'entrée : `server.js` · Commande de démarrage : `npm start` · Node 18+
- Définir les variables d'environnement, puis lancer le build/déploiement.

## Application installable (PWA) et Google Play
Manifeste, service worker, icônes, pages `/confidentialite` et `/suppression-compte`, et `/.well-known/assetlinks.json`
(variables `ANDROID_PACKAGE`, `ANDROID_SHA256`, `CONTACT_EMAIL`). Guide complet : [ANDROID.md](ANDROID.md).
Régénérer les icônes : `python3 tools/make-icons.py` · visuels du store : `python3 tools/store-assets.py`.

## Commissions agents
20 % de la valeur d'un marché boutique gagné + 0,10 $ par produit ajouté.
