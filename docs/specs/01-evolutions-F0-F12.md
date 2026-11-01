<!-- Export du 2026-11-01 du document « Paie Assmat : spécification des évolutions ». Source initiale : https://claude.ai/artifact/33iecX4qsQANApXeymvjNV -->
<!-- Les schémas interactifs du document d'origine ne sont pas exportés. -->

# Paie Assmat : spécification des évolutions

2026-10-31 · Bilel SAID

## Contexte et objectifs

La v1.0 calcule la paie d'un seul mois ; la v2 doit couvrir l'année entière, le suivi des droits à congés et la déclaration Pajemploi, sans tableur ni calcul à la main.

Le besoin vient de septembre 2026 : un jour de congé payé n'avait pas été compté dans la déclaration (49,50 € à régulariser), et à fin octobre 10 jours ouvrables étaient pris pour 3 à 5 acquis. Il faut donc un outil qui montre l'écart avant qu'il se produise.

Objectifs mesurables :

- Zéro erreur de saisie dans Pajemploi : un écran « à saisir » donne, champ par champ, la valeur à entrer.
- Solde de congés exact à tout moment : acquis, pris, restant et dépassement, en jours ouvrables.
- Historique complet des mois sur le téléphone, sauvegardable en un geste.
- Calcul vérifiable : chaque montant affiche sa formule et ses hypothèses.

Hors périmètre : bulletin de paie officiel, calcul des cotisations, estimation du CMG (F12, écartée, voir [03](03-F6-F10-F12.md)), contrats de 46 semaines ou moins, accueil occasionnel, comptes en ligne et synchronisation entre plusieurs utilisateurs.

## État actuel (v1.0)

La v1.0 est une appli Android (WebView) hors ligne, compilée par GitHub Actions, qui calcule un mois à la fois et garde ses données dans IndexedDB.

| Domaine | Ce que fait la v1.0 | Limite |
|---|---|---|
| Calendrier | Jours du mois, week-ends, fériés (Pâques, Ascension, Pentecôte calculés) | Un seul mois affiché à la fois |
| Congés | Marquage des CP au toucher, ajout par période, CPO calculés (samedi après un vendredi en CP) | Aucun solde acquis ni alerte de dépassement |
| Paie | Jours mensualisés, heures, salaire net, indemnité d'entretien, total | Taux unique pour toute l'année, pas de prorata de début ou fin de contrat |
| Absences | Jours non rémunérés saisis en nombre, enfant absent | Retenue approximative (9 h × taux par jour), pas la formule officielle |
| Données | Mois enregistrés, ouvrir et supprimer | Pas de sauvegarde ni d'export, perte à la désinstallation |
| Partage | Feuille de partage Android, WhatsApp, Telegram, e-mail, copie | Texte seul, pas de PDF ni d'image |

Contrat de référence : 52 semaines, 5,50 €/h net, 9 h par jour plus 2 h par mois, entretien 7 € par jour d'accueil, début le 07/09/2026.

## Besoins et cas d'usage

L'utilisateur principal est le parent-employeur qui déclare chaque mois sur Pajemploi ; l'assistante maternelle ne consulte que les résultats partagés.

| Cas d'usage | Acteur | Fréquence | Résultat attendu |
|---|---|---|---|
| Préparer la déclaration du mois | Parent-employeur | Chaque mois | Valeurs exactes à saisir dans Pajemploi |
| Poser des congés et vérifier le solde | Parent-employeur | Plusieurs fois par an | Alerte avant un dépassement des droits |
| Régulariser un écart de paie | Parent-employeur | Ponctuel | Montant à verser en complément, écart payé contre dû |
| Montrer le calcul à l'assistante | Parent et assistante | Chaque mois | Récapitulatif partageable, formules visibles |
| Faire le bilan de l'année | Parent-employeur | Chaque année | Totaux annuels, cumuls de congés, export |
| Changer de contrat ou ajouter un enfant | Parent-employeur | Rare | Contrats séparés, chacun avec ses tarifs |

## Évolutions fonctionnelles

Cinq évolutions sont indispensables pour la v1.1 (F0 à F4), toutes pour le seul contrat de 52 semaines ; les autres améliorent le confort ou élargissent l'usage. Effort : S = moins de 2 jours, M = 2 à 5 jours, L = plus de 5 jours.

| Id | Évolution | Priorité | Effort | Statut au 2026-11-01 |
|---|---|---|---|---|
| F0 | Profil du parent et de l'enfant, contrat de 52 semaines | Indispensable | S | **Done** (v1.1.0) |
| F1 | Droits à congés : acquis, pris, solde, alertes | Indispensable | M | **Done** (v1.1.0) |
| F2 | Écran « À saisir dans Pajemploi » | Indispensable | S | **Done** (v1.1.0) |
| F3 | Registre des paiements et régularisations | Indispensable | M | **Done** (v1.1.0) |
| F4 | Sauvegarde et restauration par fichier | Indispensable | S | **Done** (v1.1.0) |
| F5 | Types d'absence et minoration officielle | Important | M | **Not done** |
| F6 | Vue annuelle et cumuls | Important | M | **Done** v1.4.0 (spécifiée : [03](03-F6-F10-F12.md)) |
| F7 | Tarifs datés (avenants) et mois partiels | Important | M | **Not done** (partiel : un mois enregistré garde son tarif) |
| F8 | Plusieurs contrats ou enfants | Souhaitable | L | **Not done** |
| F9 | Rappels par notification locale | Souhaitable | S | **Not done** (le bandeau de rappel après 30 jours de F4 existe) |
| F10 | Récapitulatif en PDF ou image | Souhaitable | M | **Not done** (spécifiée : [03](03-F6-F10-F12.md), PDF et image livrés ensemble) |
| F11 | Verrouillage par empreinte ou code | Souhaitable | S | **Not done** |
| F12 | Estimation du reste à charge (CMG) | Écartée (2026-11-01) | L | **Not done**, mise de côté : la formule exige les ressources du foyer (contenu conservé dans [03](03-F6-F10-F12.md)) |

**Lecture des statuts.** *Done* = présent dans `main`, couvert par des tests et vérifié en CI. F0 à F4 sont livrés dans le code partagé par les trois cibles ; leur fonctionnement sur iPhone et sur téléphone Huawei n'est pas encore vérifié sur appareil (voir [02-multiplateforme.md](02-multiplateforme.md)). *Not done* = absent de `main`. L'impression d'un mois depuis le navigateur (version web) n'est pas F10 : elle ne produit pas de fichier partageable sur mobile.

### Critères d'acceptation des évolutions indispensables

**F0, profil du parent et de l'enfant**

- Au premier lancement, un assistant en 3 étapes saisit le parent, l'enfant puis le contrat ; tout se remplit à la main et reste sur le téléphone, sans compte en ligne.
- Parent employeur : nom, prénom, date de naissance, adresse complète, e-mail, téléphone, lien avec l'enfant (père ou mère) et réponse à la question « les deux parents vivent-ils avec l'enfant ? » (oui ou non).
- Enfant : nom, prénom, date de naissance.
- Contrat : le type est fixé à « 52 semaines » ; le choix 46 semaines ou moins n'apparaît pas avant une version ultérieure.
- Validation : champs obligatoires signalés, date de naissance dans le passé, e-mail et téléphone au bon format, code postal à 5 chiffres.
- Le profil se consulte et se corrige dans Réglages. Les messages partagés n'affichent ni l'adresse ni la date de naissance ; le prénom de l'enfant n'y figure que si l'option est activée (désactivée par défaut).
- Rien n'est envoyé à Pajemploi : le profil sert de mémo pour recopier les champs de la déclaration.

**F1, droits à congés**

- Les droits sont de 2,5 jours ouvrables par mois de travail effectif sur la période du 1er juin au 31 mai, plus 2 jours par enfant à charge de moins de 15 ans, ajoutés le 31 mai (contrat, art. 48-1-3-1-1).
- Un réglage choisit le mode d'acquisition en début de contrat : au prorata des jours, ou par période de 4 semaines complète. Le résultat est arrondi à l'entier supérieur.
- L'appli affiche acquis, pris, solde, et passe en alerte à 80 % de consommation puis en dépassement.
- Cas de référence : contrat du 07/09/2026, 10 jours ouvrables pris à fin octobre, dépassement affiché selon le mode choisi.

**F2, écran « À saisir dans Pajemploi »**

- Pour chaque mois, la liste ordonnée des champs du formulaire : congés payés versés (Non pour un contrat de 52 semaines), jours d'activité, heures normales, salaire net, indemnité d'entretien.
- Chaque valeur se copie d'un toucher ; les champs déjà recopiés se cochent.
- Septembre 2026 affiche 18 jours, 164 h, 902,00 €, 119,00 €.

**F3, registre des paiements**

- Chaque mois porte un montant dû, un montant versé (saisi, avec date) et l'écart.
- Un écart positif propose une régularisation « complément à verser », et passe en « réglé » quand le virement est saisi.
- Septembre 2026 : dû 1 021,00 €, versé 971,50 €, complément 49,50 €.

**F4, sauvegarde**

- Export de toutes les données en un fichier JSON versionné, écrit dans le dossier choisi via le sélecteur de fichiers Android.
- Import avec choix entre fusionner et remplacer, et refus clair d'un fichier d'une version inconnue.
- Un rappel de sauvegarde apparaît après 30 jours sans export.

## Règles de calcul

Les formules de la v1.0 restent la référence pour le salaire et l'entretien ; la v2 y ajoute l'acquisition des congés, la minoration officielle des absences et le prorata d'un mois partiel.

**Définitions**

- Jour ouvré : lundi au vendredi, hors jour férié, à partir du début du contrat.
- Jour ouvrable : lundi au samedi, hors jour férié.
- CPO : jour ouvrable de congé ; le samedi compte quand le vendredi précédent est en congé payé, même si l'enfant n'est jamais gardé le samedi.

**Paie mensualisée (contrat de 52 semaines)**

```latex
\mathrm{Salaire\ net} = \bigl(J_{mens} \times H_{jour} + H_{sup}\bigr) \times T_{h}
```

```latex
\mathrm{Entretien} = J_{accueil} \times I_{jour}
```

J_mens = jours ouvrés moins jours non rémunérés. J_accueil = jours ouvrés qui ne sont ni en congé ni en absence de l'enfant. Total à verser = salaire net + entretien. Les montants sont arrondis au centime.

**Congés payés**

Sur un contrat de 52 semaines, le salaire est versé pendant les congés acquis (CCN art. 102-1-2) et aucune ligne de congés n'est à déclarer dans Pajemploi. L'employeur compare le maintien du salaire et le dixième de la rémunération totale hors indemnités, et verse le plus favorable.

```latex
\mathrm{Acquis} = \lceil 2{,}5 \times M \rceil + 2 \times E
```

M = mois de travail effectif (ou périodes de 4 semaines selon le réglage), E = enfants à charge de moins de 15 ans. La fiche DREETS plafonne les 2,5 jours par mois à 30 jours ouvrables ; l'ordre entre ce plafond et les 2 jours supplémentaires est à confirmer.

**Absences non rémunérées (minoration)**

Salaire mensualisé moins (salaire mensualisé × heures d'absence ÷ heures qui auraient dû être effectuées dans le mois). La v1.0 retient seulement 9 h × taux par jour ; F5 la remplace par cette formule.

**Hypothèses à valider avant développement**

- Acquisition en début de contrat : au prorata des jours ou par période de 4 semaines complète (le résultat d'octobre 2026 passe de 3 à 5 jours).
- Les 2 heures mensuelles sont-elles proratisées sur un mois partiel ?
- Date limite de déclaration et de paiement : à confirmer sur Pajemploi.

Ces règles viennent des pages Urssaf et DREETS consultées et du contrat UFNAFAAM fourni. L'appli n'est pas un conseil juridique : elle affiche ses hypothèses et renvoie vers la PMI ou la DREETS en cas de doute.

## Modèle de données et base locale

La base passe de 2 stores (état global et mois) à 9 stores centrés sur le profil et le contrat, ce qui permet plusieurs contrats, des tarifs datés et un registre des paiements. IndexedDB suffit : le volume reste sous 10 000 lignes sur dix ans (environ 365 jours par an et par contrat).

| Store | Clé | Champs principaux | Remplace dans la v1 |
|---|---|---|---|
| profile | clé fixe | nom, prénom, date de naissance, adresse, e-mail, téléphone, lien avec l'enfant (père ou mère), les deux parents vivent avec l'enfant (oui ou non) | nouveau |
| children | id | nom, prénom, date de naissance | nouveau |
| contracts | id | nom, assistante, enfant, début, fin, type de mensualisation (fixé à 52 semaines pour l'instant), heures par jour, heures en plus par mois, enfants à charge de l'assistante | state.start, hpd, hsup |
| rates | id | contrat, date d'effet, taux horaire, indemnité par jour | state.rate, indem |
| days | contrat + date | type (congé payé, absence de l'enfant, absence non rémunérée, maladie), note | state.cp, state.abs |
| months | contrat + mois | résultat figé (jours, heures, salaire, entretien, total), statut brouillon ou déclaré, date de déclaration | months |
| payments | id | contrat, mois, date, montant, libellé (salaire, entretien, complément) | nouveau |
| leave_years | contrat + année de référence | acquis calculé, correction manuelle, jours supplémentaires | nouveau |
| settings | clé | mode d'acquisition, rappels, verrouillage, dernier export | nouveau |

**Migration de la v1 vers la v2**

- La version de la base passe de 1 à 2 dans `onupgradeneeded`, sans perte : l'ancien store `state` est lu une fois, puis ses valeurs alimentent un contrat par défaut, un tarif et les jours marqués.
- Les mois enregistrés sont conservés tels quels et rattachés au contrat par défaut.
- Un export JSON automatique est écrit avant la migration, pour pouvoir revenir en arrière.
- Le fichier export porte un champ `schemaVersion` ; l'import refuse une version plus récente que l'appli.

## Écrans et expérience utilisateur

La v2 passe d'une page unique à six écrans reliés par une barre de navigation en bas ; le mois en cours s'ouvre par défaut.

| Écran | Contenu | Actions principales |
|---|---|---|
| Mois | Calendrier, récapitulatif, calcul de la paie (l'écran actuel) | Marquer congés et absences, enregistrer, partager |
| À saisir | Champs Pajemploi dans l'ordre du formulaire, case « recopié » | Copier une valeur, marquer le mois « déclaré » |
| Congés | Acquis, pris, solde sur la période du 1er juin au 31 mai, liste des congés, alerte | Ajouter une période, corriger l'acquis |
| Paiements | Dû, versé et écart par mois, régularisations en attente | Saisir un virement, voir le complément |
| Année | Totaux annuels, cumul des CPO, total versé par mois | Exporter, changer de contrat |
| Réglages | Profil du parent et de l'enfant, contrat, tarifs datés, mode d'acquisition, rappels, sauvegarde, verrouillage | Exporter, importer, supprimer les données |

**Principes**

- Poser une période de congés prend au plus 3 touches depuis l'écran Congés.
- Chaque montant ouvre sa formule et les jours pris en compte d'un appui long.
- Cibles tactiles d'au moins 44 px, taille de texte du système respectée, thèmes clair et sombre selon le système.
- Formats français : dates jj/mm/aaaa, euros avec virgule, semaine commençant le lundi.
- Une suppression s'annule pendant 5 secondes au lieu de demander confirmation.
- Les états vides disent quoi faire (« Aucun paiement saisi pour ce mois »).
- Au-delà de 700 px (tablette, appareil pliable), le calendrier et le résultat se placent côte à côte.
- Accessibilité : libellé vocal sur chaque jour pour TalkBack, contraste de niveau AA.

Au premier lancement, un assistant en 3 étapes (parent, enfant, contrat) remplace l'écran vide ; le profil se modifie ensuite dans Réglages.

## Architecture et plan technique

Garder la WebView actuelle, avec un pont Java élargi pour les fichiers et les notifications, est le choix le moins coûteux pour les versions 1.1 à 1.3 ; une réécriture native ne se justifie que si l'appli est diffusée à d'autres familles.

| Option | Principe | Avantages | Limites | Verdict |
|---|---|---|---|---|
| A. WebView + IndexedDB + pont Java | Statu quo, enrichi | Déjà compilé en CI, un seul code, hors ligne | Pas de SQL, chaque fonction native demande du Java | Recommandée pour v1.1 à v1.3 |
| B. Capacitor | WebView avec plugins officiels (fichiers, notifications, biométrie, SQLite) | Fonctions natives sans Java maison | Dépendance npm, projet à regénérer | À envisager si plus de 3 fonctions natives |
| C. Kotlin, Compose et Room | Appli native avec SQLite | Meilleures performances et intégration Android | Réécriture complète, plus de 3 semaines | Seulement pour une diffusion large |
| D. PWA hébergée | Page installable depuis le navigateur | Aucune installation d'APK, utilisable sur iPhone | Stockage purgeable par le navigateur, sauvegarde fichier limitée | Solution de secours |

**Plan technique**

1. Découper `index.html` en `engine.js` (calcul pur, sans DOM), `db.js` (IndexedDB) et `ui.js`.
1. Tester `engine.js` avec le lanceur de tests de Node dans la CI, avant la compilation de l'APK ; les cas de référence de la section Qualité deviennent des tests.
1. Étendre le pont `Android` : exporter un fichier, importer un fichier, programmer un rappel, partager (déjà en place), verrouiller par biométrie.
1. Signer l'APK de publication avec une clé gardée dans les secrets GitHub, numéro de version automatique, APK joint à une Release GitHub pour l'installer ou le mettre à jour.
1. Tenir un journal des modifications et un numéro de version sémantique affiché dans les Réglages.

## Sécurité, confidentialité et sauvegarde

Les données ne quittent jamais le téléphone, et le risque principal est leur perte, pas leur fuite : l'effacement des données de l'appli ou sa désinstallation supprime tout.

Les données concernent le parent (identité, adresse, e-mail, téléphone), l'enfant (nom, prénom, date de naissance) et l'assistante (nom, tarifs, présence de l'enfant) ; elles restent dans un usage domestique et ne servent qu'aux calculs et à la mémoire du parent.

| Risque | Mesure |
|---|---|
| Perte de téléphone ou désinstallation | Export JSON manuel (F4), rappel après 30 jours, copie automatique facultative dans un dossier choisi |
| Accès par une autre personne | Verrouillage biométrique ou par code à l'ouverture (F11), facultatif |
| Fichier d'export lu par un tiers | Chiffrement facultatif par mot de passe (AES-GCM, API WebCrypto) |
| Fuite réseau | L'appli n'a pas la permission Internet : le manifeste ne la déclare pas ; les liens externes s'ouvrent dans l'appli concernée |
| Code exécuté dans la WebView | Seul le contenu local de l'origine `app.local` se charge ; le pont n'expose que des méthodes précises |
| Sauvegarde automatique Android | `allowBackup` est actif : à décider entre le garder (restauration sur un nouveau téléphone) et le couper, après test de ce que la sauvegarde contient |
| Exposition de l'identité du parent et de l'enfant | Adresse et date de naissance exclues des messages partagés, prénom de l'enfant en option, suppression du profil en un geste dans Réglages |

Aucun traceur, aucune statistique d'usage, aucun compte. La clé de signature de l'APK de publication reste hors du dépôt.

## Qualité et tests

Quatre cas chiffrés, déjà vérifiés sur le tableur et dans l'appli, servent de tests d'acceptation à chaque version.

| Cas | Entrées | Résultat attendu |
|---|---|---|
| Septembre 2026 | Contrat du 07/09, 1 jour de congé le 30/09, 5,50 €/h, 9 h par jour, 2 h en plus, 7 € par jour d'accueil | 18 jours mensualisés, 164 h, 902,00 € + 119,00 € = 1 021,00 €, dont 17 jours d'accueil |
| Octobre 2026 | Congés les 01 et 02/10 et du 23 au 29/10 | 22 jours ouvrés, 15 travaillés, 7 CP ouvrés, 9 CPO, cumul de 10 CPO ; 200 h, 1 100,00 € + 105,00 € = 1 205,00 € |
| Novembre 2026 | Aucun congé, férié le 11/11 (le 01/11 tombe un dimanche) | 20 jours ouvrés, 182 h, 1 001,00 € + 140,00 € = 1 141,00 € |
| Fériés mobiles 2026 et 2027 | Année en réglage | 2026 : lundi de Pâques 06/04, Ascension 14/05, lundi de Pentecôte 25/05 ; 2027 : 29/03, 06/05, 17/05 |

**Types de tests**

- Moteur de calcul, sous Node dans la CI : jours ouvrés et ouvrables, samedi en CPO, fériés mobiles sur plusieurs années, arrondis au centime, mois partiel.
- Migration : une base v1 réelle (état et mois enregistrés) migre en v2 sans perte ; un export suivi d'un import redonne des données identiques.
- Interface : parcours de la page à 412 px de large dans Chromium, thèmes clair et sombre, sans erreur de console.
- Appareil : installation de l'APK sur le Galaxy S23 Ultra, rotation, retour arrière, reprise après fermeture, lecteur d'écran TalkBack.
- Recoupement : l'écran « À saisir » comparé à la déclaration Pajemploi réelle de chaque mois.

Une version est terminée quand les tests passent en CI, que les cas chiffrés sont identiques au centime et que septembre et octobre 2026 ne régressent pas.

## Feuille de route

Trois versions livrent les douze premières évolutions pour 22 à 50 jours d'effort au total (d'après les tailles S, M et L du tableau des évolutions) ; la v1.1 passe avant tout le reste, car elle protège les données et la déclaration.

> [Schéma interactif non exporté : voir le document source.]

Chaque version se termine par des critères de sortie tirés de la section Qualité ; les efforts viennent des tailles S, M et L.

## Risques et questions ouvertes

Le risque le plus coûteux est une règle de congés mal interprétée ; il se traite en affichant les hypothèses et en les faisant confirmer par la PMI ou la DREETS avant la v1.1.

| Risque | Parade |
|---|---|
| Règle d'acquisition ou de calcul mal interprétée | Hypothèses visibles dans l'appli, réglage du mode d'acquisition, confirmation par la PMI ou la DREETS |
| Perte des données du téléphone | Export par fichier (F4), rappel après 30 jours |
| Le formulaire Pajemploi change | L'écran « À saisir » reste une liste de champs, mise à jour par une nouvelle version |
| Clé de signature perdue | Clé de publication sauvegardée hors du dépôt ; sans elle, une mise à jour ne s'installe plus par-dessus |
| Données personnelles du parent et de l'enfant | Champs facultatifs sauf nom, aucune donnée dans les messages partagés par défaut |

**Questions ouvertes**

1. L'acquisition des congés en début de contrat se fait-elle au prorata des jours ou par période de 4 semaines complète ?
1. Les 2 heures mensuelles sont-elles proratisées sur un mois partiel ?
1. Quels champs d'identité la déclaration Pajemploi demande-t-elle, pour que le profil les reprenne tous ?
1. Faut-il une connexion automatique au compte Pajemploi ? La v1.1 n'en prévoit aucune : le profil est saisi à la main et reste local.
1. Faut-il garder la sauvegarde automatique d'Android ou la couper ?
1. L'appli reste-t-elle personnelle ou sera-t-elle diffusée à d'autres familles ? Une diffusion justifierait l'option C (appli native).
