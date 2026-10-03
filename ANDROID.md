# BoutiquePro : installer comme application (PWA) et publier sur Google Play

## 1. PWA : déjà prête
L'application s'installe depuis le navigateur, sans passer par un store :
- **Android (Chrome)** : bouton « 📲 Installer » dans l'application, ou menu ⋮ → « Installer l'application ».
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil » (iOS n'a pas de bouton d'installation automatique).
- Une fois installée, elle s'ouvre en plein écran avec son icône. Hors connexion, l'écran s'ouvre et un bandeau prévient ; **les ventes et les stocks exigent internet** (rien n'est enregistré hors ligne).

## 2. Google Play : la méthode simple (sans installer Android Studio)
Google Play accepte une PWA emballée en « Trusted Web Activity » (TWA) : une coquille Android qui affiche votre site en plein écran.

1. **Compte développeur Google Play** : https://play.google.com/console (frais d'inscription uniques, vérification d'identité). Les nouveaux comptes personnels peuvent devoir passer par une phase de test fermé avant la production : vérifiez les règles en vigueur au moment de l'inscription.
2. **Générer le paquet** sur https://www.pwabuilder.com :
   - saisissez `https://boutiques.mireb.online` → « Package for stores » → **Android** ;
   - identifiant du paquet : `online.mireb.boutiques` (ou le vôtre, mais gardez-le identique partout) ;
   - laissez PWABuilder créer une nouvelle clé de signature, puis téléchargez le zip.
   - **Conservez précieusement le fichier de clé (`.keystore`) et ses mots de passe** : sans eux, impossible de publier des mises à jour.
   - Le zip contient le fichier `.aab` à envoyer à Google.
3. **Créer l'application** dans la Play Console, puis envoyer le `.aab` (Production ou Test fermé).
4. **Lier le site à l'application (obligatoire, sinon une barre d'adresse s'affiche en haut)** :
   - Play Console → Configuration → Intégrité de l'application → **Signature de l'application** : copiez l'empreinte **SHA-256** du certificat de signature (et celle de la clé d'importation si elle est affichée).
   - Sur Hostinger, ajoutez ces variables d'environnement du site Node.js, puis redéployez/redémarrez :
     - `ANDROID_PACKAGE` = `online.mireb.boutiques`
     - `ANDROID_SHA256` = `AA:BB:…` (plusieurs empreintes séparées par des virgules)
   - Vérifiez que `https://boutiques.mireb.online/.well-known/assetlinks.json` affiche bien votre paquet et vos empreintes.

## 3. Fiche Google Play : tout est prêt dans le dossier `store/`
| Élément demandé | Où le trouver |
|---|---|
| Icône 512×512 | `store/icone-play-store-512.png` |
| Image de présentation 1024×500 | `store/feature-graphic-1024x500.png` |
| Captures d'écran téléphone (1080×1920) | `store/screenshots/` (7 images ; Play en demande au moins 2) |
| URL de la politique de confidentialité | `https://boutiques.mireb.online/confidentialite` |
| URL de suppression de compte | `https://boutiques.mireb.online/suppression-compte` |

À remplir vous-même dans la Play Console :
- **Description courte (80 caractères max)** : par exemple « Ventes, stocks et rapports de vos boutiques, en USD et en CDF. »
- **Catégorie** : Entreprise. **Public cible** : adultes.
- **Accès à l'application** : Google doit pouvoir se connecter. Créez dans l'application un patron, un gérant et un vendeur de démonstration et donnez leurs identifiants dans cette section.
- **Sécurité des données** (suggestion à vérifier avec vos pratiques réelles) : données collectées = nom et identifiant (compte), photos de produits envoyées par l'utilisateur, activité (ventes, stocks) ; aucune donnée partagée avec des tiers ; données chiffrées en transit (HTTPS) ; possibilité de demander la suppression.
- **Adresse e-mail de contact** : ajoutez la variable `CONTACT_EMAIL` sur Hostinger pour qu'elle apparaisse sur la page de confidentialité.

## 4. Méthode avancée (optionnelle) : Bubblewrap en ligne de commande
Nécessite Node.js, un JDK 17 et le SDK Android.
```bash
npm i -g @bubblewrap/cli
cd android
bubblewrap init --manifest=https://boutiques.mireb.online/manifest.webmanifest   # reprend android/twa-manifest.json
bubblewrap build                                                                  # produit app-release-bundle.aab
```

## 5. Mises à jour
Le contenu de l'application (écrans, fonctions) se met à jour **côté site** : aucune nouvelle publication Play n'est nécessaire. Il faut une nouvelle version Play seulement pour changer l'icône, le nom ou les réglages Android.
