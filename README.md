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

## Version 1.1.0 (branche `feature/f0-f4-profil-conges-paiements`)
- **F0** Profil parent / enfant / contrat (52 semaines uniquement), saisi à la première ouverture, modifiable dans Réglages.
- **F1** Droits à congés : acquis (prorata ou périodes de 4 semaines, réglable), pris, posés, solde, alertes à 80 % et en cas de dépassement, correction manuelle.
- **F2** Écran « À saisir dans Pajemploi » : 5 valeurs avec copie, case « recopié », statut déclaré.
- **F3** Paiements : dû / versé / écart, versements et régularisations (« Saisir le complément »).
- **F4** Export / import JSON (fusion ou remplacement), rappel de sauvegarde après 30 jours, suppression totale confirmée.
- Migration automatique de la base v1 (les anciens congés et mois enregistrés sont conservés).

Tests : `node --test tests/*.test.js` (moteur de calcul, validations, export). Le workflow CI les exécute avant le build.
Calculs indicatifs, pas un avis juridique.
