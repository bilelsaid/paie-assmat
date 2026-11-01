/* Moteur de calcul pur (sans DOM) : jours ouvrés, CPO, paie mensualisée, droits à congés,
   validation du profil, format d'export. Testé sous Node (tests/engine.test.js). */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 2;
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dow(d) { return (d.getDay() + 6) % 7 + 1; } // 1 = lundi … 7 = dimanche
  function round2(v) { return Math.round(v * 100) / 100; }
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  }
  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parseISO(s);
    return iso(d) === s;
  }

  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31),
      da = (h + l - 7 * m + 114) % 31 + 1;
    return new Date(y, mo - 1, da);
  }

  var holCache = {};
  function holidays(y) {
    if (holCache[y]) return holCache[y];
    var E = easter(y), h = {};
    [[1, 1, "Jour de l'An"], [5, 1, 'Fête du Travail'], [5, 8, 'Victoire 1945'], [7, 14, 'Fête nationale'],
      [8, 15, 'Assomption'], [11, 1, 'Toussaint'], [11, 11, 'Armistice 1918'], [12, 25, 'Noël']]
      .forEach(function (x) { h[iso(new Date(y, x[0] - 1, x[1]))] = x[2]; });
    h[iso(addDays(E, 1))] = 'Lundi de Pâques';
    h[iso(addDays(E, 39))] = 'Ascension';
    h[iso(addDays(E, 50))] = 'Lundi de Pentecôte';
    holCache[y] = h;
    return h;
  }

  // s : { start:'YYYY-MM-DD', cp:Set, abs:Set }
  function flags(d, s) {
    var k = iso(d), w = dow(d), hol = holidays(d.getFullYear())[k] || '';
    var active = k >= s.start, ouvre = active && w <= 5 && !hol, ouvrable = active && w <= 6 && !hol;
    var cp = s.cp.has(k) && ouvre;
    var pd = addDays(d, -1);
    var prevCp = w === 6 && s.cp.has(iso(pd)) && holidays(pd.getFullYear())[iso(pd)] === undefined;
    var cpo = ouvrable && (cp || prevCp);
    var abs = s.abs.has(k) && ouvre && !cp;
    return { d: d, k: k, w: w, hol: hol, active: active, ouvre: ouvre, ouvrable: ouvrable, cp: cp, abs: abs, cpo: cpo,
      trav: ouvre && !cp, accueil: ouvre && !cp && !abs };
  }

  // s : { year, month(1-12), rate, indem, hpd, hsup, start, unpaid, cp:Set, abs:Set }
  function computeMonth(s) {
    var n = new Date(s.year, s.month, 0).getDate(), days = [], i;
    for (i = 1; i <= n; i++) days.push(flags(new Date(s.year, s.month - 1, i), s));
    function sum(f) { return days.reduce(function (a, x) { return a + (f(x) ? 1 : 0); }, 0); }
    var r = {
      days: days, feries: sum(function (x) { return !!x.hol; }), trav: sum(function (x) { return x.trav; }),
      ouvres: sum(function (x) { return x.ouvre; }), ouvrables: sum(function (x) { return x.ouvrable; }),
      cpOuvres: sum(function (x) { return x.cp; }), cpo: sum(function (x) { return x.cpo; }),
      accueil: sum(function (x) { return x.accueil; })
    };
    var cum = 0, end = new Date(s.year, s.month, 0), g = 0, d;
    for (d = parseISO(s.start); d <= end && g < 4000; d = addDays(d, 1), g++) if (flags(d, s).cpo) cum++;
    r.cumCpo = cum;
    r.mensu = Math.max(0, r.ouvres - (s.unpaid || 0));
    r.heures = r.mensu > 0 ? r.mensu * s.hpd + s.hsup : 0;
    r.salaire = round2(r.heures * s.rate);
    r.entretien = round2(r.accueil * s.indem);
    r.total = round2(r.salaire + r.entretien);
    return r;
  }

  // Période de référence des congés : du 1er juin au 31 mai.
  function refPeriod(d) {
    var y = d.getFullYear(), sy = d.getMonth() >= 5 ? y : y - 1;
    return { start: new Date(sy, 5, 1), end: new Date(sy + 1, 4, 31) };
  }

  /* Droits à congés (jours ouvrables) à la date asOf.
     mode 'prorata' : 2,5 j × mois écoulés (au prorata des jours) ; mode '4sem' : 2,5 j par période de 4 semaines complète.
     Résultat arrondi à l'entier supérieur, plafonné à 30 j ; + 2 j par enfant à charge de moins de 15 ans
     ajoutés à la fin de la période de référence (31 mai) ; + correction manuelle. */
  function leaveRights(s, asOf, opts) {
    opts = opts || {};
    var mode = opts.mode === '4sem' ? '4sem' : 'prorata';
    var rp = refPeriod(asOf), cs = parseISO(s.start), from = cs > rp.start ? cs : rp.start;
    var elapsed = 0, base = 0;
    if (asOf >= from) {
      elapsed = daysBetween(from, asOf) + 1;
      base = mode === '4sem' ? Math.ceil(2.5 * Math.floor(elapsed / 28) - 1e-9)
        : Math.ceil(2.5 * (elapsed / (365.25 / 12)) - 1e-9);
    }
    base = Math.min(30, Math.max(0, base));
    var extra = asOf >= rp.end ? 2 * (opts.enfants || 0) : 0;
    var correction = opts.correction || 0;
    var acquis = base + extra + correction;
    var cpoDays = [], pris = 0, poses = 0, d, f;
    for (d = rp.start; d <= rp.end; d = addDays(d, 1)) {
      f = flags(d, s);
      if (f.cpo) { cpoDays.push(f.k); if (d <= asOf) pris++; else poses++; }
    }
    var used = pris + poses, solde = acquis - used, status = 'ok';
    if (used > acquis) status = 'depassement';
    else if (acquis > 0 && used / acquis >= 0.8) status = 'alerte';
    return {
      refStart: iso(rp.start), refEnd: iso(rp.end), elapsed: elapsed, mode: mode, acquisBase: base, extra: extra,
      correction: correction, acquis: acquis, pris: pris, poses: poses, solde: solde,
      depassement: Math.max(0, -solde), status: status, cpoDays: cpoDays, periods: groupPeriods(cpoDays)
    };
  }

  // Regroupe des jours CPO consécutifs (le dimanche et les fériés n'interrompent pas une période).
  function groupPeriods(days) {
    var out = [], cur = null;
    days.forEach(function (k) {
      var d = parseISO(k);
      if (cur) {
        var last = parseISO(cur.to), gap = daysBetween(last, d);
        if (gap === 1 || (gap === 2 && dow(addDays(last, 1)) === 7)) { cur.to = k; cur.n++; return; }
      }
      cur = { from: k, to: k, n: 1 };
      out.push(cur);
    });
    return out;
  }

  function paymentStatus(due, paid) {
    var ecart = round2(due - paid);
    return { ecart: ecart, status: ecart > 0.004 ? 'a_verser' : (ecart < -0.004 ? 'trop_percu' : 'regle') };
  }

  /* ---------- Vue annuelle (F6) ----------
     months : enregistrements du store `months` ; payments : store `payments` ; start : début du contrat (ISO) ou ''.
     Ne lit que les mois enregistrés. Versé annuel = paiements datés de l'année ; versé d'une ligne = paiements du mois (monthKey). */
  function yearSummary(months, payments, year, start) {
    var rows = [], t = { mensu: 0, heures: 0, salaire: 0, entretien: 0, total: 0 };
    var byKey = {}, paidBy = {}, rec = 0, unrec = 0, before = 0, cpo = 0, m;
    (months || []).forEach(function (x) { if (x && x.year === year) byKey[x.month] = x; });
    (payments || []).forEach(function (p) { paidBy[p.monthKey] = (paidBy[p.monthKey] || 0) + p.amount; });
    var startYM = start ? start.slice(0, 7) : '';
    for (m = 1; m <= 12; m++) {
      var ym = year + '-' + pad(m), r = byKey[m], row = { month: m, ym: ym };
      if (r) {
        var paid = round2(paidBy[r.key] || 0);
        row.status = 'enregistre'; row.key = r.key; row.mensu = r.mensu; row.heures = r.heures; row.salaire = r.salaire;
        row.entretien = r.entretien; row.total = r.total; row.paid = paid; row.ecart = round2(r.total - paid);
        Object.keys(t).forEach(function (k) { t[k] += r[k]; });
        cpo += r.cpo || 0; rec++;
      } else if (startYM && ym < startYM) { row.status = 'avant_contrat'; before++; }
      else { row.status = 'non_enregistre'; unrec++; }
      rows.push(row);
    }
    Object.keys(t).forEach(function (k) { t[k] = round2(t[k]); });
    var paidYear = round2((payments || []).filter(function (p) { return typeof p.date === 'string' && p.date.slice(0, 4) === String(year); })
      .reduce(function (a, p) { return a + p.amount; }, 0));
    return { year: year, rows: rows, totals: t, recorded: rec, unrecorded: unrec, beforeContract: before, paid: paidYear,
      ecart: round2(t.total - paidYear), cpo: cpo };
  }

  /* ---------- Validation du profil (F0) ---------- */
  function pastDate(s, today) { return isISODate(s) && s < today; }

  function validateProfile(p, today) {
    var e = {};
    if (!p.nom || !p.nom.trim()) e.nom = 'Nom obligatoire';
    if (!p.prenom || !p.prenom.trim()) e.prenom = 'Prénom obligatoire';
    if (p.naissance && !pastDate(p.naissance, today)) e.naissance = 'Date de naissance dans le passé';
    if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) e.email = 'E-mail invalide';
    if (p.telephone) {
      var t = p.telephone.replace(/[\s.\-()]/g, '');
      if (!/^(?:\+33|0033|0)[1-9]\d{8}$/.test(t)) e.telephone = 'Téléphone invalide (ex. 06 12 34 56 78)';
    }
    if (p.codePostal && !/^\d{5}$/.test(p.codePostal.trim())) e.codePostal = 'Code postal à 5 chiffres';
    if (p.lien && p.lien !== 'pere' && p.lien !== 'mere') e.lien = 'Choisir père ou mère';
    if (p.vivents && p.vivents !== 'oui' && p.vivents !== 'non') e.vivents = 'Choisir oui ou non';
    return e;
  }

  function validateChild(c, today) {
    var e = {};
    if (!c.nom || !c.nom.trim()) e.nom = 'Nom obligatoire';
    if (!c.prenom || !c.prenom.trim()) e.prenom = 'Prénom obligatoire';
    if (!c.naissance) e.naissance = 'Date de naissance obligatoire';
    else if (!pastDate(c.naissance, today)) e.naissance = 'Date de naissance dans le passé';
    return e;
  }

  function validateContract(c) {
    var e = {};
    if (!isISODate(c.start)) e.start = 'Date de début obligatoire';
    if (!(c.taux > 0)) e.taux = 'Taux horaire supérieur à 0';
    if (!(c.indemnite >= 0)) e.indemnite = 'Indemnité positive ou nulle';
    if (!(c.hpd > 0 && c.hpd <= 24)) e.hpd = 'Heures par jour entre 0 et 24';
    if (!(c.hsup >= 0)) e.hsup = 'Heures positives ou nulles';
    if (!(Number.isInteger(c.enfantsCharge) && c.enfantsCharge >= 0)) e.enfantsCharge = 'Nombre entier, 0 ou plus';
    return e;
  }

  /* ---------- Export / import (F4) ---------- */
  var STORES = ['profile', 'children', 'contracts', 'rates', 'days', 'months', 'payments', 'leave_years', 'settings'];

  function buildExport(data, nowISO) {
    return { app: 'paie-assmat', schemaVersion: SCHEMA_VERSION, exportedAt: nowISO, data: data };
  }

  function parseExport(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, error: "Ce fichier n'est pas un JSON valide." }; }
    if (!o || o.app !== 'paie-assmat' || typeof o.schemaVersion !== 'number' || !o.data || typeof o.data !== 'object') {
      return { ok: false, error: "Ce fichier n'est pas une sauvegarde Paie Assmat." };
    }
    if (o.schemaVersion > SCHEMA_VERSION) {
      return { ok: false, error: 'Sauvegarde créée par une version plus récente de l\'appli (schéma ' + o.schemaVersion + '). Mets l\'appli à jour.' };
    }
    if (o.schemaVersion < 2) return { ok: false, error: 'Version de sauvegarde non prise en charge.' };
    var d = {}, i, k;
    for (i = 0; i < STORES.length; i++) {
      k = STORES[i];
      if (k === 'profile' || k === 'settings') d[k] = (o.data[k] && typeof o.data[k] === 'object') ? o.data[k] : null;
      else d[k] = Array.isArray(o.data[k]) ? o.data[k] : [];
    }
    return {
      ok: true, data: d, exportedAt: o.exportedAt || null,
      counts: { days: d.days.length, months: d.months.length, payments: d.payments.length }
    };
  }

  root.Engine = {
    SCHEMA_VERSION: SCHEMA_VERSION, STORES: STORES, MONTHS: MONTHS, pad: pad, iso: iso, parseISO: parseISO, addDays: addDays,
    dow: dow, round2: round2, daysBetween: daysBetween, isISODate: isISODate, easter: easter, holidays: holidays,
    flags: flags, computeMonth: computeMonth, refPeriod: refPeriod, leaveRights: leaveRights, groupPeriods: groupPeriods,
    paymentStatus: paymentStatus, yearSummary: yearSummary, validateProfile: validateProfile, validateChild: validateChild,
    validateContract: validateContract, buildExport: buildExport, parseExport: parseExport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
