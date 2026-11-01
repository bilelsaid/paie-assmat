# Paie Assmat

Appli Android de calcul de la paie mensuelle d'une assistante maternelle (Pajemploi).

Appli WebView : calcul de la paie d'une assistante maternelle (jours ouvrés, CPO, salaire, entretien),
historique des mois enregistrés dans une base locale (IndexedDB) sur le téléphone, partage via la feuille de partage Android.

## Obtenir l'APK sans rien installer (GitHub)
1. Crée un dépôt GitHub privé, puis envoie tout le contenu de ce dossier (y compris le dossier `.github`).
2. Onglet **Actions** → workflow **Build APK** (il démarre tout seul à l'envoi, ou bouton « Run workflow »).
3. Quand il est vert, ouvre l'exécution → **Artifacts** → télécharge `paie-assmat-apk` (zip contenant `app-debug.apk`).

## Ou avec Android Studio
Ouvre ce dossier, laisse Gradle se synchroniser, puis **Build → Build APK(s)**. Le fichier est dans `app/build/outputs/apk/debug/`.

## Installer sur le S23 Ultra
Copie `app-debug.apk` sur le téléphone, ouvre-le, autorise « Installer des applications inconnues » pour l'application qui l'a ouvert (Mes fichiers ou Chrome), puis installe.

## Données
Stockées dans les données de l'appli (IndexedDB). Elles restent sur le téléphone, survivent à la fermeture de l'appli,
mais sont supprimées si tu désinstalles l'appli ou si tu effaces ses données.

Documentation et spécifications : voir [`docs/`](docs/README.md).

## Version 1.5.0 — F10 récapitulatif PDF et image
Boutons **Récapitulatif PDF** / **Récapitulatif image** sur l'écran Mois, **Récapitulatif annuel PDF / image** sur l'écran Année. PDF A4 d'une page (générateur maison, Helvetica intégrée) et PNG 1240 × 1754 issus de la même mise en page (`recap.js`). Aucune adresse, naissance ni coordonnée ; prénom de l'enfant seulement si l'option de partage est cochée ; nom de l'assistante maternelle saisi dans Réglages (facultatif). Fichier : web = téléchargement, Android = création de document (`Android.exportBinary`), iOS = feuille de partage. Format de sauvegarde inchangé (`schemaVersion` 2). **Non vérifié ici** : pont Android sur appareil, partage iOS sur appareil.

## Version 1.4.0 — F6 vue annuelle
Nouvel onglet **Année** : 12 mois de l'année civile, totaux (jours, heures, salaire, entretien, dû), versé, écart à verser, mois non enregistrés, CPO pris. Toucher un mois ouvre l'écran Mois. Aucun changement du format de sauvegarde (`schemaVersion` 2). Spécification : [`docs/specs/03-F6-F10-F12.md`](docs/specs/03-F6-F10-F12.md).

## Version 1.3.0 — multiplateforme, phases 2 (AppGallery) et 3 (iOS)

**AppGallery (Huawei)** — APK release signé par notre propre clé, sans service Google ni permission réseau.
- Signature lue dans l'environnement (`ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) ; aucune clé dans le dépôt.
- CI : secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` → artefact `paie-assmat-apk-appgallery`. Sans secret, une clé jetable prouve que la chaîne de signature fonctionne (`apksigner verify`), sans publier l'APK.
- Fiche et politique de confidentialité en anglais, icône 216 × 216 : `store/appgallery/`. **Garder la clé de signature en lieu sûr : elle sert à chaque mise à jour.**

**iOS (Capacitor)** — `platform-ios.js` : SQLite natif (table `kv(store, key, json)`), Preferences (date de dernière sauvegarde), Filesystem + feuille de partage (export), sélecteur de fichiers iOS (import).
- `node scripts/build-www.js` prépare `www/` ; `scripts/ios-ci.sh` génère le projet, fixe iOS 15 et compile sur simulateur.
- Workflow `Build iOS (simulateur)` : manuel (`workflow_dispatch`, runner macOS).

**Commun** — CSP `default-src 'self'` (NFR-8) ; la date de dernière sauvegarde déclenche l'alerte de restauration sur toutes les cibles (FR-12).

**Non vérifié ici** : plugin SQLite réel (testé avec un faux), build Xcode, TestFlight, essai sur téléphone Huawei, conservation des données iOS après 8 jours.

## Version 1.2.0 — multiplateforme, phase 1 (web PC / PWA)

- Interface `Platform` (`platform.js`) : stockage, préférences, import/export, partage, persistance ; seule couche dépendant de la cible.
- Version web installable et hors ligne (`manifest.webmanifest`, `sw.js`, cache versionné ; actif uniquement hors WebView Android).
- Mise en page deux colonnes ≥ 1024 px, impression du mois, navigation clavier, écran de restauration si les données locales ont disparu après une sauvegarde, page Confidentialité, indicateur de stockage persistant.
- Format de sauvegarde inchangé (`schemaVersion` 2) : un export Android 1.1.0 s'importe tel quel.
- Tests : `node --test tests/*.test.js` ; e2e : `node tests/e2e/regression.e2e.js`, `node tests/e2e/phase1.e2e.js` (Playwright).
- Phases 2 (AppGallery) et 3 (iOS/Capacitor) : en attente des comptes Huawei/Apple (voir la spécification).

## Version 1.1.0 (branche `feature/f0-f4-profil-conges-paiements`)
- **F0** Profil parent / enfant / contrat (52 semaines uniquement), saisi à la première ouverture, modifiable dans Réglages.
- **F1** Droits à congés : acquis (prorata ou périodes de 4 semaines, réglable), pris, posés, solde, alertes à 80 % et en cas de dépassement, correction manuelle.
- **F2** Écran « À saisir dans Pajemploi » : 5 valeurs avec copie, case « recopié », statut déclaré.
- **F3** Paiements : dû / versé / écart, versements et régularisations (« Saisir le complément »).
- **F4** Export / import JSON (fusion ou remplacement), rappel de sauvegarde après 30 jours, suppression totale confirmée.
- Migration automatique de la base v1 (les anciens congés et mois enregistrés sont conservés).

Tests : `node --test tests/*.test.js` (moteur de calcul, validations, export). Le workflow CI les exécute avant le build.
Calculs indicatifs, pas un avis juridique.
