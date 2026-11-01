<!-- Export du 2026-11-01 du document « Spécification — Paie Assmat multi-plateforme (iOS, AppGallery, Web PC) ». Source initiale : https://claude.ai/artifact/Eq872DYR17o5yV86Avvq8b -->
<!-- Les schémas interactifs du document d'origine ne sont pas exportés. -->

# Spécification — Paie Assmat multi-plateforme (iOS, AppGallery, Web PC)

2026-10-31 · Bilel SAID

## Résumé

Livrer Paie Assmat sur trois cibles à partir d'un seul cœur de code : une PWA pour navigateur PC, un APK Android signé pour AppGallery, et une app iOS empaquetée avec Capacitor.

- **Pourquoi :** le moteur de calcul et l'interface web existent déjà et sont testés (10 tests moteur, 28 contrôles UI). Les réécrire en natif multiplierait les risques d'écart sur des montants de paie.
- **Approche :** un moteur unique, trois coquilles fines, des adaptateurs pour le stockage, les fichiers et le partage. Les données passent d'un appareil à l'autre par la sauvegarde JSON v2 déjà en place, sans serveur.
- **Effort :** environ 15 à 20 jours-homme (hypothèse, voir la feuille de route), dont la moitié pour iOS.
- **Risque principal :** sur iOS, un refus de l'App Store pour une app trop proche d'un simple site web, et une perte possible des données stockées dans la WebView. Mitigation : fonctions natives réelles et stockage SQLite.

## Contexte, objectifs, non-objectifs

**Hypothèse de périmètre :** le projet est Paie Assmat (paie mensualisée d'une assistante maternelle, déclaration Pajemploi), version 1.1.0 déjà en production sur Android via GitHub Actions. Si le projet visé est un autre, ce document est à reprendre.

**Situation actuelle :** appli Android WebView (HTML/JS), données en IndexedDB, aucune permission réseau, sauvegarde JSON v2, CI qui teste puis compile l'APK.

**Objectifs**

1. Les trois livrables donnent les mêmes résultats au centime et les mêmes fonctions (profil, droits à congés, écran Pajemploi, paiements, sauvegarde).
1. Les données restent sur l'appareil de l'utilisateur, sans compte ni serveur.
1. Chaque livrable est publiable : App Store (iOS), AppGallery (Android sans services Google), hébergement web HTTPS (PC).
1. Un seul code métier à maintenir.

**Personas**

| Persona | Besoin |
|---|---|
| Parent employeur (Bilel) | Calculer et déclarer chaque mois, sur téléphone ou sur PC |
| Autre parent employeur, iPhone ou Huawei | Installer l'appli depuis son store habituel |
| Conjoint | Consulter les mêmes données via une sauvegarde partagée |

**Non-objectifs (cette version) :** synchronisation cloud, comptes utilisateurs, paiement ou abonnement intégré, contrats autres que mensualisé sur 52 semaines, HarmonyOS NEXT natif, Mac et Windows natifs, Google Play.

## Besoins classés

| ID | Besoin | Priorité | Indicateur de réussite |
|---|---|---|---|
| N1 | Mêmes fonctions et mêmes montants sur iOS, AppGallery et web PC | P0 | 100 % des cas de référence identiques sur les 3 cibles (Sept. 1 021,00 €, Oct. 1 205,00 €, Nov. 1 141,00 €) |
| N2 | Données privées et durables, sans compte ni serveur | P0 | 0 requête réseau à l'exécution ; 0 perte de données après mise à jour ou redémarrage |
| N3 | Changer d'appareil ou de plateforme sans ressaisie | P0 | Une sauvegarde faite sur une cible se restaure sur les deux autres, 100 % des cas de test |
| N4 | Être publiable dans chaque store | P0 | App acceptée en revue sur App Store et AppGallery ; site web servi en HTTPS |
| N5 | Un seul code métier à maintenir | P0 | Un seul `engine.js`, copié tel quel dans les 3 builds ; 0 règle de calcul dupliquée |
| N6 | Confort sur grand écran (PC) : deux colonnes, clavier, impression | P1 | Parcours complet au clavier ; impression propre d'un mois sur une page A4 |
| N7 | Détecter une perte de données avant qu'elle ne passe inaperçue | P1 | Alerte affichée quand la base est vide alors qu'une sauvegarde a déjà été faite |
| N8 | Synchronisation chiffrée entre appareils | P2 | Hors périmètre ; à évaluer après retour utilisateurs |

## Exigences fonctionnelles

| ID | Besoin | Exigence | Critère d'acceptation |
|---|---|---|---|
| FR-1 | N1 | Les fonctions F0 à F4 (profil, congés, à saisir Pajemploi, paiements, sauvegarde) existent sur les 3 cibles. | **Given** une cible installée, **When** je parcours les 5 écrans, **Then** chaque fonction F0–F4 est utilisable. |
| FR-2 | N1, N5 | Le calcul vient d'un seul `engine.js` identique sur les 3 cibles. | **Given** les cas de référence, **When** je les exécute sur chaque cible, **Then** les montants sont identiques au centime. |
| FR-3 | N2, N4 | Web : l'appli est installable (PWA) et fonctionne hors ligne après le premier chargement. | **Given** un premier chargement réussi, **When** je coupe le réseau et recharge, **Then** l'appli s'ouvre et calcule. |
| FR-4 | N2 | Web : le stockage persistant est demandé au navigateur et son état est affiché dans Réglages. | **Given** le web, **When** j'ouvre Réglages, **Then** je vois « stockage persistant : oui/non ». |
| FR-5 | N3 | Web : export et import JSON par téléchargement et choix de fichier. | **Given** une sauvegarde valide, **When** je l'importe, **Then** les données sont restaurées (fusion ou remplacement). |
| FR-6 | N2 | iOS : les données sont stockées en SQLite natif, pas en IndexedDB. | **Given** l'appli rouverte après 8 jours sans usage, **When** je l'ouvre, **Then** toutes les données sont là. |
| FR-7 | N3 | iOS : export et import passent par la feuille de partage et l'app Fichiers. | **Given** l'export, **When** j'envoie le JSON à Fichiers, **Then** je peux le réimporter. |
| FR-8 | N4 | AppGallery : APK signé avec notre propre clé, sans dépendance à Google Play Services. | **Given** un téléphone Huawei sans services Google, **When** j'installe l'APK, **Then** aucune fonction ne dépend de Google. |
| FR-9 | N3 | Une sauvegarde faite sur une cible se restaure sur les deux autres. | **Given** une sauvegarde Android, **When** je l'importe sur iOS et sur le web, **Then** les montants des mois enregistrés sont identiques. |
| FR-10 | N4 | Une page Confidentialité et mentions légales est intégrée à l'appli, hors ligne. | **Given** l'appli sans réseau, **When** j'ouvre Réglages > Confidentialité, **Then** le texte s'affiche. |
| FR-11 | N6 | Web : mise en page à deux colonnes dès 1 024 px, parcours complet au clavier, impression d'un mois sur une page A4. | **Given** un écran de 1 280 px, **When** j'imprime le mois, **Then** récap et paie tiennent sur une page. |
| FR-12 | N7 | Au démarrage, si la base est vide et qu'une date de dernière sauvegarde existe, une alerte propose la restauration. | **Given** une base effacée, **When** j'ouvre l'appli, **Then** l'alerte apparaît avant l'assistant de démarrage. |
| FR-13 | N4 | Le numéro de version est visible dans Réglages et identique sur les 3 cibles pour une même version. | **Given** la version 1.2.0, **When** j'ouvre Réglages, **Then** « 1.2.0 » s'affiche partout. |

Pour FR-12 : la date de dernière sauvegarde doit être conservée hors de la base métier (Preferences sur iOS, `localStorage` sur le web), sinon elle disparaît avec elle.

## Exigences non fonctionnelles

Les cibles chiffrées sont des objectifs à valider par mesure, pas des constats.

| ID | Catégorie | Cible |
|---|---|---|
| NFR-1 | Poids | Page web < 150 Ko transférés au premier chargement (les assets actuels pèsent 68 Ko non compressés) |
| NFR-2 | Démarrage | Appli interactive en moins de 2 s à froid sur un téléphone milieu de gamme ; moins de 1 s sur PC |
| NFR-3 | Hors ligne | 0 requête réseau à l'exécution, hors téléchargement initial du site web |
| NFR-4 | Compatibilité | iOS 15 et plus (choix du projet) ; Android 7.0 et plus (minSdk 24 actuel) ; deux dernières versions de Chrome, Edge, Firefox et Safari bureau |
| NFR-5 | Exactitude | 100 % des cas de référence du moteur passent sur chaque cible, en CI |
| NFR-6 | Durabilité | 0 perte de données sur mise à jour v1.1 vers v1.2 ; aller-retour export/import identique octet pour octet sur les données métier |
| NFR-7 | Accessibilité | WCAG 2.2 AA : contraste 4,5:1, cibles tactiles 44 px, étiquettes de formulaire, navigation clavier sur le web |
| NFR-8 | Sécurité | Aucun traceur ni SDK d'analyse ; politique CSP `default-src 'self'` sur le web ; HTTPS uniquement ; données dans le bac à sable de l'OS |
| NFR-9 | Livraison | Un push sur `main` produit les 3 artefacts (site, APK, build iOS) en moins de 15 min |
| NFR-10 | Maintenabilité | Un seul dépôt ; `engine.js`, `db.js` et `app.js` communs ; code spécifique à une plateforme < 300 lignes par cible |

## Modèle de données et interfaces

**Le format échangé ne change pas :** le JSON `schemaVersion 2` actuel reste le contrat entre les trois cibles. Ses 9 magasins (profile, children, contracts, rates, days, months, payments, leave_years, settings) sont conservés tels quels. Toute modification de ce format est une décision à sens unique : elle exige un `schemaVersion 3` et une migration testée.

**Une interface ****`Platform`**** unique**, appelée par `app.js` et implémentée une fois par cible :

| Adaptateur | Web (PWA) | Android / AppGallery | iOS (Capacitor) |
|---|---|---|---|
| `storage` (magasins métier) | IndexedDB | IndexedDB dans la WebView (existant) | SQLite natif, table unique `kv(store, key, json)` |
| `prefs` (petites valeurs durables, dont la date de dernière sauvegarde) | `localStorage` | `localStorage` | API Preferences de Capacitor |
| `files.export / import` | Téléchargement, sélecteur de fichier | Pont Android existant (création et ouverture de document) | Filesystem + feuille de partage |
| `share.text` | Presse-papiers, liens WhatsApp / Telegram / e-mail | Intent Android (existant) | Feuille de partage iOS |
| `persistence` | `navigator.storage.persist()` et son résultat | Toujours persistant | Toujours persistant |

**Pourquoi SQLite sur iOS :** le guide Capacitor indique que le stockage web des WebViews est considéré comme transitoire sur iOS, l'OS pouvant le récupérer quand l'espace manque, et recommande SQLite pour des données durables. Une table clé/JSON suffit : le volume est de l'ordre de quelques centaines de lignes.

**Pas de serveur, pas d'API.** L'unique interface réseau est le téléchargement initial du site web statique.

## Architecture et décisions techniques

Un cœur web commun (moteur, interface, base) et trois coquilles minces qui fournissent l'interface `Platform`. Le choix privilégie le délai : on réutilise 100 % du code existant et on ne décide avec soin que ce qui est coûteux à défaire.

> [Schéma interactif non exporté : voir le document source.]

La bordure marquée signale la coquille à construire ; les deux autres existent ou se déduisent de l'existant.

| # | Décision | Options | Recommandation | Compromis | À revoir si |
|---|---|---|---|---|---|
| D1 | Coquille mobile | A. Capacitor pour iOS + WebView Android existant ; B. Capacitor partout ; C. réécriture native Swift et Kotlin ; D. React Native ou Flutter | **A** | Deux ponts à maintenir (Capacitor et Android) contre aucune réécriture ; C et D refont l'interface et dupliquent le calcul | Le pont Android demande plus d'une journée de maintenance par trimestre : passer à B |
| D2 | Stockage iOS | SQLite natif ou IndexedDB + sauvegardes | **SQLite** (plugin Capacitor communautaire) | Un plugin de plus à suivre, mais pas de perte silencieuse | WebKit documente un stockage persistant fiable pour les WebView natives |
| D3 | Hébergement web | GitHub Pages ; Netlify ; Cloudflare Pages | **GitHub Pages** déployée par Actions | Gratuit, HTTPS, déjà en place ; en-têtes HTTP personnalisés probablement impossibles, d'où la CSP par balise `<meta>` (à vérifier) | Un nom de domaine propre ou des en-têtes de sécurité sont exigés |
| D4 | Hors ligne web | Service worker avec pré-cache versionné ; pas de hors ligne | **Service worker** | Il faut gérer la mise à jour du cache et afficher « nouvelle version disponible » | — |
| D5 | Livraison Android pour AppGallery | APK signé par nous ; AAB signé par le service AppGallery | **APK, clé propre** | Il faut garder la clé de signature en lieu sûr et la réutiliser à chaque mise à jour | Huawei impose l'AAB |
| D6 | Build iOS | Mac local ; runner macOS GitHub Actions | **Runner macOS** avec Xcode 26 | Minutes de CI plus chères, mais pas de Mac à posséder | Les minutes macOS dépassent le quota gratuit |
| D7 | Passage d'un appareil à l'autre | Export JSON manuel ; synchronisation cloud chiffrée | **Export JSON manuel** | Une action manuelle, mais aucun serveur, compte ni RGPD à gérer | Plus de 3 testeurs sur 10 réclament la synchronisation |

## Sécurité, vie privée et conformité des stores

**Données sensibles :** l'appli stocke le nom, le prénom et la date de naissance d'un enfant, plus le profil du parent. Elles ne quittent jamais l'appareil, et c'est la protection principale. Le RGPD reste applicable aux données de ces personnes ; la politique de confidentialité doit dire que rien n'est collecté ni transmis.

**Menaces principales (STRIDE résumé)**

| Menace | Risque concret | Mesure |
|---|---|---|
| Divulgation | Appareil perdu ; fichier JSON exporté en clair | Verrouillage de l'OS ; avertissement à l'export ; chiffrement par mot de passe de l'export en P2 |
| Altération | Import d'un fichier JSON malformé ou hostile | Validation `parseExport` existante, refus des versions de schéma inconnues, limite de taille à 20 Mo |
| Élévation de privilèges | Code externe appelant le pont JavaScript | Aucun contenu externe dans la WebView ; navigation limitée à l'origine de l'appli ; liens externes ouverts hors appli |
| Déni de service | Base corrompue | Sauvegarde JSON, alerte de base vide (FR-12), tests de migration |

**Conformité des stores**

| Cible | Exigences connues | Source |
|---|---|---|
| App Store | Build avec Xcode 26 ou plus depuis le 28 avril 2026 ; les apps qui ne sont qu'un site web emballé risquent le refus (règle de fonctionnalité minimale) ; compte Apple Developer Program payant nécessaire pour distribuer | Pages Apple et analyse de la règle, voir Sources |
| AppGallery | Compte HUAWEI Developers vérifié (1 à 2 jours ouvrés), type particulier ou entreprise non convertible ; aucune fonction dépendante de Google ; fiche en anglais ; politique de confidentialité accessible depuis l'appli ; icône 216 × 216, 3 à 8 captures ; pas de mention d'autres stores ; nom de paquet figé après le premier envoi | Article Capgo, voir Sources |
| Web | HTTPS obligatoire ; CSP restrictive ; mentions légales et politique de confidentialité accessibles | — |

**Avertissement métier :** l'appli calcule des montants indicatifs selon la convention collective et n'est pas un avis juridique. Cette mention figure dans l'appli, la fiche de chaque store et le site.

## Stratégie de test et d'acceptation

Chaque exigence est couverte par au moins un test ; ce qui ne peut pas être automatisé est marqué manuel.

| Niveau | Outil | Exigences couvertes | Où |
|---|---|---|---|
| Unitaire moteur | `node --test` (10 tests existants + cas de référence) | FR-2, NFR-5 | CI, chaque push |
| Contrat de données | Sauvegarde JSON de référence importée par chaque cible, montants comparés | FR-9, NFR-6 | CI + manuel sur appareil |
| UI web | Playwright sur Chromium, Firefox et WebKit | FR-1, FR-3, FR-5, FR-11, FR-12 | CI |
| Hors ligne et réseau | Playwright : service worker actif, aucune requête externe | FR-3, NFR-3 | CI |
| Accessibilité | axe-core dans Playwright | NFR-7 | CI |
| Performance | Lighthouse CI | NFR-1, NFR-2 | CI |
| Android / AppGallery | Build et installation sur émulateur ; essai sur un téléphone Huawei | FR-8, FR-10 | CI + manuel |
| iOS | Build sur simulateur en CI ; TestFlight sur un iPhone réel | FR-6, FR-7, FR-10 | CI + manuel |

**Cas manuel à ne pas oublier (FR-6) :** laisser l'appli iOS 8 jours sans l'ouvrir, puis vérifier que les données sont intactes. Aucun test automatique ne remplace cette vérification, et la doc consultée ne tranche pas sur la durée de conservation du stockage web dans une WebView native.

**Définition de fini par cible :** tous les tests du tableau passent, la matrice exigence → preuve est remplie, la version est publiée (store ou site), et la CI de `main` est verte.

## Feuille de route

> [Schéma interactif non exporté : voir le document source.]

Chaque phase est livrable seule. La phase 3 dépend de l'interface `Platform` livrée en phase 1 et du compte Apple. Total estimé : 15 à 20 jours-homme pour un développeur (hypothèse).

## Risques, hypothèses et questions ouvertes

| Risque | Probabilité × impact | Mesure |
|---|---|---|
| Refus de l'App Store : app jugée trop proche d'un site web emballé | Moyenne × élevé | Ajouter des fonctions natives réelles : feuille de partage, Fichiers, rappel de sauvegarde par notification locale ; préparer une note de revue expliquant l'usage |
| Perte des données de la WebView iOS | Moyenne × élevé | SQLite natif (D2) et alerte de base vide (FR-12) |
| Appareils Huawei en Chine sous HarmonyOS NEXT : l'APK n'y tourne pas | Certaine hors périmètre × faible | Cible limitée aux appareils Android hors Chine continentale ; le dire dans la fiche |
| Délai de vérification du compte Huawei ou Apple | Moyenne × moyen | Ouvrir les deux comptes dès la phase 1 |
| Écart de calcul entre cibles | Faible × très élevé | Un seul `engine.js`, tests de référence en CI sur chaque cible |
| Données d'un mineur : exigences RGPD et de fiche store | Faible × élevé | Tout reste local ; politique de confidentialité claire ; aucun traceur |
| Responsabilité sur les montants affichés | Faible × élevé | Avertissement « indicatif » partout ; correction manuelle des droits |

**Hypothèses**

- Le projet est Paie Assmat (voir le contexte).
- La distribution vise un petit cercle d'utilisateurs, pas un lancement grand public.
- Il n'y a pas de budget pour un backend.

**Questions ouvertes**

- Distribution publique dans les stores, ou TestFlight et APK en privé ? Cela change l'effort de fiche et de revue.
- Compte Apple et compte Huawei : particulier ou entreprise ? Le type de compte Huawei n'est pas modifiable ensuite.
- Gratuit ou payant ? L'achat intégré est hors périmètre ici.
- Nom de domaine propre pour le site, ou adresse GitHub Pages ?
- Langues : français seul, ou aussi anglais (exigé pour la fiche AppGallery internationale) ?

## Sources

Pages ouvertes le 31 octobre 2026.

- [Apple : exigences minimales de SDK](https://www.developer.apple.com/news/upcoming-requirements/) : Xcode 26 obligatoire pour les envois depuis le 28 avril 2026.
- [Capacitor : guide du stockage](https://capacitorjs.com/docs/next/guides/storage) : stockage web des WebViews transitoire sur iOS, SQLite recommandé.
- [Capgo : publier une app Capacitor sur Huawei AppGallery](https://capgo.app/blog/publish-capacitor-app-on-huawei-appgallery/) : compte, signature APK, exigences de fiche, limites HarmonyOS.
- [Forum Apple : IndexedDB dans une WebView](https://developer.apple.com/forums/thread/750682) : question ouverte, aucune réponse officielle sur la durée de conservation.
- [Analyse de la règle Apple « au-delà d'un site web »](https://conductatlas.com/platform/apple/apple-app-store-review-guidelines/apps-must-offer-meaningful-functionality-beyond-a-website/) : citation d'une version antérieure des guidelines, non revérifiée sur la version actuelle.
- [Apple : comparer les adhésions](https://developer.apple.com/support/compare-memberships) : l'adhésion au programme est nécessaire pour distribuer ; le montant annuel n'a pas pu être vérifié ici.

Non vérifié : montant de l'adhésion Apple, politique de confidentialité exigée par Apple, version majeure actuelle de Capacitor, absence d'en-têtes HTTP personnalisés sur GitHub Pages.
