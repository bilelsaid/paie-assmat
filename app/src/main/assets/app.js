/* Interface : onboarding (F0), Mois, À saisir (F2), Congés (F1), Paiements (F3), Réglages + sauvegarde (F4). */
(function () {
  'use strict';
  var E = Engine, MONTHS = E.MONTHS, pad = E.pad, iso = E.iso;
  var $ = function (id) { return document.getElementById(id); };
  var fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  var eur = function (v) { return fmtEUR.format(v); };
  var fmtN = function (v, d) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cap = function (m) { return m[0].toUpperCase() + m.slice(1); };
  var fmtDate = function (s) { return s ? s.split('-').reverse().join('/') : ''; };
  var today = function () { return iso(new Date()); };

  var CID = 'c1', EID = 'e1';
  var P = null, CH = null, C = null, ST = { id: 'main' };
  var dbOK = false, legacy = null;
  var S = { year: 2026, month: 10, cp: new Set(), abs: new Set(), unp: {}, months: {}, payments: [], leave: {} };
  var tab = 'mois', mode = 'cp', msgEdited = false;

  var mk = function () { return CID + '|' + S.year + '-' + pad(S.month); };
  var view = function () {
    return { year: S.year, month: S.month, rate: C.taux, indem: C.indemnite, hpd: C.hpd, hsup: C.hsup, start: C.start,
      unpaid: S.unp[mk()] || 0, cp: S.cp, abs: S.abs };
  };

  /* ---------- chargement / persistance ---------- */
  async function loadAll() {
    P = await DB.get('profile', 'main') || null;
    CH = (await DB.all('children'))[0] || null;
    C = (await DB.all('contracts'))[0] || null;
    ST = await DB.get('settings', 'main') || { id: 'main' };
    S.cp = new Set(); S.abs = new Set(); S.unp = {}; S.months = {};
    (await DB.all('days')).forEach(function (d) { (d.type === 'abs' ? S.abs : S.cp).add(d.date); });
    (await DB.all('months')).forEach(function (m) { if (m.contractId) { S.months[m.key] = m; S.unp[m.key] = m.unpaid || 0; } });
    S.payments = await DB.all('payments');
    S.leave = {};
    (await DB.all('leave_years')).forEach(function (l) { S.leave[l.key] = l; });
  }
  function warnDB(e) { var n = $('dbnote'); if (n) n.textContent = "Impossible d'écrire dans la base du téléphone."; if (e) console.error(e); }
  function saveDays() {
    if (!dbOK) return;
    var r = [];
    S.cp.forEach(function (k) { r.push({ key: CID + '|' + k, contractId: CID, date: k, type: 'cp' }); });
    S.abs.forEach(function (k) { r.push({ key: CID + '|' + k, contractId: CID, date: k, type: 'abs' }); });
    DB.replaceDays(r).catch(warnDB);
  }
  function saveSettings(patch) { Object.assign(ST, patch, { id: 'main' }); return dbOK ? DB.put('settings', ST).catch(warnDB) : Promise.resolve(); }

  async function migrateLegacy() {
    if (ST.migrated) return;
    var st = null;
    try { st = await DB.get('state', 'main'); } catch (e) { /* aucune donnée v1 */ }
    if (st) {
      legacy = st;
      var recs = [];
      (st.cp || []).forEach(function (k) { recs.push({ key: CID + '|' + k, contractId: CID, date: k, type: 'cp' }); });
      (st.abs || []).forEach(function (k) { if ((st.cp || []).indexOf(k) < 0) recs.push({ key: CID + '|' + k, contractId: CID, date: k, type: 'abs' }); });
      if (recs.length) await DB.tx('days', 'readwrite', function (t) { recs.forEach(function (r) { t.objectStore('days').put(r); }); });
      var old = (await DB.all('months')).filter(function (m) { return !m.contractId; });
      if (old.length) {
        await DB.tx('months', 'readwrite', function (t) {
          var o = t.objectStore('months');
          old.forEach(function (m) {
            o.delete(m.key);
            o.put(Object.assign({}, m, { key: CID + '|' + m.key, contractId: CID, status: 'brouillon', copied: {} }));
          });
        });
      }
    }
    await saveSettings({ migrated: true });
  }

  /* ---------- formulaires ---------- */
  function fld(id, label, val, o) {
    o = o || {};
    return '<label for="' + id + '">' + esc(label) + (o.req ? ' *' : '') + '<input id="' + id + '" type="' + (o.type || 'text') + '" value="' + esc(val) + '" ' + (o.attrs || '') + '><span class="err" id="e-' + id + '"></span></label>';
  }
  function sel(id, label, val, opts) {
    return '<label for="' + id + '">' + esc(label) + '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (val || '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select><span class="err" id="e-' + id + '"></span></label>';
  }
  var val = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
  var numv = function (id) { var s = val(id).replace(',', '.'); return s === '' ? NaN : parseFloat(s); };

  function parentForm(p, withNanny) {
    p = p || {};
    return '<div class="grid">' + fld('p-nom', 'Nom', p.nom, { req: 1, attrs: 'autocomplete="family-name"' }) + fld('p-prenom', 'Prénom', p.prenom, { req: 1, attrs: 'autocomplete="given-name"' }) +
      fld('p-naissance', 'Date de naissance', p.naissance, { type: 'date' }) + fld('p-adresse', 'Adresse', p.adresse) +
      fld('p-cp', 'Code postal', p.codePostal, { attrs: 'inputmode="numeric" maxlength="5"' }) + fld('p-ville', 'Ville', p.ville) +
      fld('p-email', 'E-mail', p.email, { type: 'email' }) + fld('p-tel', 'Téléphone', p.telephone, { type: 'tel' }) +
      sel('p-lien', 'Lien avec l\'enfant', p.lien, [['', '—'], ['pere', 'Père'], ['mere', 'Mère']]) +
      sel('p-vivents', 'Les deux parents vivent avec l\'enfant', p.vivents, [['', '—'], ['oui', 'Oui'], ['non', 'Non']]) +
      (withNanny ? fld('p-nanny', "Nom de l'assistante maternelle (affiché sur les récapitulatifs)", p.nannyName, { attrs: 'maxlength="80" autocomplete="off"' }) : '') + '</div>';
  }
  function readParent() {
    return { id: 'main', nom: val('p-nom'), prenom: val('p-prenom'), naissance: val('p-naissance'), adresse: val('p-adresse'),
      codePostal: val('p-cp'), ville: val('p-ville'), email: val('p-email'), telephone: val('p-tel'), lien: val('p-lien'), vivents: val('p-vivents'), nannyName: $('p-nanny') ? val('p-nanny') : ((P && P.nannyName) || '') };
  }
  function childForm(c) {
    c = c || {};
    return '<div class="grid">' + fld('c-nom', 'Nom de l\'enfant', c.nom, { req: 1 }) + fld('c-prenom', 'Prénom de l\'enfant', c.prenom, { req: 1 }) +
      fld('c-naissance', 'Date de naissance', c.naissance, { type: 'date', req: 1 }) + '</div>';
  }
  function readChild() { return { id: EID, nom: val('c-nom'), prenom: val('c-prenom'), naissance: val('c-naissance') }; }
  function contractForm(k) {
    k = k || {};
    return '<p class="hint" style="margin-top:0">Contrat mensualisé sur 52 semaines (seul type géré pour le moment).</p><div class="grid">' +
      fld('k-start', 'Début du contrat', k.start, { type: 'date', req: 1 }) +
      fld('k-taux', 'Taux horaire net (€/h)', k.taux, { req: 1, attrs: 'inputmode="decimal"' }) +
      fld('k-indem', "Indemnité d'entretien (€/jour d'accueil)", k.indemnite, { req: 1, attrs: 'inputmode="decimal"' }) +
      fld('k-hpd', 'Heures par jour', k.hpd, { attrs: 'inputmode="decimal"' }) + fld('k-hsup', 'Heures en plus par mois', k.hsup, { attrs: 'inputmode="decimal"' }) +
      fld('k-enf', "Enfants de l'assistante de moins de 15 ans à charge", k.enfantsCharge, { attrs: 'inputmode="numeric"' }) + '</div>';
  }
  function readContract() {
    var enf = val('k-enf') === '' ? 0 : Number(val('k-enf'));
    return { id: CID, childId: EID, type: 'mensualise52', start: val('k-start'), taux: numv('k-taux'), indemnite: numv('k-indem'),
      hpd: val('k-hpd') === '' ? NaN : numv('k-hpd'), hsup: val('k-hsup') === '' ? NaN : numv('k-hsup'), enfantsCharge: enf };
  }
  function showErrors(map) {
    document.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; });
    var first = null;
    Object.keys(map).forEach(function (id) { var e = $('e-' + id); if (e) { e.textContent = map[id]; first = first || id; } });
    if (first && $(first)) $(first).focus();
    return !first;
  }
  var prefix = function (pre, errs) { var o = {}; Object.keys(errs).forEach(function (k) { o[pre + k] = errs[k]; }); return o; };
  function parentErrors(p) { var e = E.validateProfile(p, today()), o = {}; var m = { codePostal: 'p-cp', telephone: 'p-tel' }; Object.keys(e).forEach(function (k) { o[m[k] || 'p-' + k] = e[k]; }); return o; }
  function childErrors(c) { return prefix('c-', E.validateChild(c, today())); }
  function contractErrors(k) {
    var e = E.validateContract(k), m = { start: 'k-start', taux: 'k-taux', indemnite: 'k-indem', hpd: 'k-hpd', hsup: 'k-hsup', enfantsCharge: 'k-enf' }, o = {};
    Object.keys(e).forEach(function (x) { o[m[x]] = e[x]; });
    return o;
  }

  async function saveProfileData(p, c, k) {
    var prevTaux = C && C.taux, prevInd = C && C.indemnite;
    P = p; CH = c; C = k;
    if (!dbOK) return;
    await DB.put('profile', p); await DB.put('children', c); await DB.put('contracts', k);
    if (prevTaux !== k.taux || prevInd !== k.indemnite) {
      await DB.put('rates', { id: 'r' + Date.now(), contractId: CID, taux: k.taux, indemnite: k.indemnite, from: today() });
    }
  }

  /* ---------- onboarding (F0) ---------- */
  function onboarding() {
    var step = 0, dp = P || {}, dc = CH || {}, dk = C || {
      start: legacy && legacy.start || '', taux: legacy && legacy.rate || 5.5, indemnite: legacy && legacy.indem != null ? legacy.indem : 7,
      hpd: legacy && legacy.hpd || 9, hsup: legacy && legacy.hsup != null ? legacy.hsup : 2, enfantsCharge: 0 };
    var o = $('onb'); o.hidden = false;
    var titles = ['Ton profil (parent employeur)', "L'enfant gardé", 'Le contrat'];
    function draw() {
      o.innerHTML = '<div class="wrap"><h1>Bienvenue</h1><p class="sub">Renseigne ces informations une seule fois. Elles restent sur ce téléphone.</p>' +
        '<div class="steps">' + [0, 1, 2].map(function (i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<section class="panel"><h2>Étape ' + (step + 1) + ' sur 3 — ' + titles[step] + '</h2>' +
        (step === 0 ? parentForm(dp) : step === 1 ? childForm(dc) : contractForm(dk)) + '</section>' +
        '<div class="pager"><button type="button" id="o-prev"' + (step ? '' : ' hidden') + '>Retour</button><button type="button" class="primary" id="o-next">' + (step === 2 ? 'Terminer' : 'Suivant') + '</button></div></div>';
      $('o-prev').onclick = function () { keep(); step--; draw(); };
      $('o-next').onclick = next;
    }
    function keep() { if (step === 0) dp = readParent(); else if (step === 1) dc = readChild(); else dk = readContract(); }
    async function next() {
      keep();
      var errs = step === 0 ? parentErrors(dp) : step === 1 ? childErrors(dc) : contractErrors(dk);
      if (!showErrors(errs)) return;
      if (step < 2) { step++; draw(); return; }
      try {
        await saveProfileData(dp, Object.assign({}, dc, { id: EID }), Object.assign({}, dk, { id: CID }));
        await saveSettings({ createdAt: ST.createdAt || today(), onboardingDone: true });
      } catch (e) { warnDB(e); }
      o.hidden = true; go('mois');
    }
    draw();
  }

  /* ---------- navigation ---------- */
  function go(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.removeAttribute('aria-current'); if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); });
    ({ mois: sMois, saisir: sSaisir, conges: sConges, paiements: sPaiements, annee: sAnnee, reglages: sReglages })[t]();
    window.scrollTo(0, 0);
    renderBanner();
  }
  function renderBanner() {
    var b = $('banner'), ref = ST.lastBackupAt || ST.createdAt;
    if (!ref || !C) { b.hidden = true; return; }
    var age = E.daysBetween(E.parseISO(ref.slice(0, 10)), E.parseISO(today()));
    if (age >= 30) {
      b.hidden = false;
      b.innerHTML = '<span>Aucune sauvegarde depuis ' + age + ' jours.</span><button type="button" id="b-go">Sauvegarder</button>';
      $('b-go').onclick = function () { go('reglages'); };
    } else b.hidden = true;
  }
  function stepMonth(d) {
    var m = S.month + d, y = S.year;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    S.month = m; S.year = y; msgEdited = false;
  }

  /* ---------- résultat du mois (commun) ---------- */
  function row(l, v, cls) { return '<div class="tr' + (cls ? ' ' + cls : '') + '"><span>' + l + '</span><span>' + v + '</span></div>'; }
  function message(r, V) {
    var L = ['Paie assistante maternelle – ' + MONTHS[V.month - 1] + ' ' + V.year];
    if (ST.shareChild && CH) L.push('Enfant : ' + CH.prenom);
    L.push('', 'Jours mensualisés : ' + r.mensu, 'Heures normales : ' + fmtN(r.heures, 1) + ' h × ' + fmtN(V.rate, 2) + ' €/h', 'Salaire net : ' + eur(r.salaire),
      'Entretien : ' + r.accueil + ' j × ' + fmtN(V.indem, 2) + ' € = ' + eur(r.entretien), 'TOTAL À VERSER : ' + eur(r.total), '',
      'Congés payés : ' + r.cpOuvres + ' j ouvrés, ' + r.cpo + ' j ouvrables (CPO)');
    if (r.feries) L.push('Jours fériés : ' + r.feries);
    if (V.unpaid) L.push('Jours non rémunérés : ' + V.unpaid);
    return L.join('\n').replace(/[  ]/g, ' ');
  }
  async function saveMonth(opts) {
    opts = opts || {};
    var key = mk(), old = S.months[key], rec;
    if (!old || opts.refresh) {
      var V = view(), r = E.computeMonth(V), pre = S.year + '-' + pad(S.month) + '-';
      rec = Object.assign({}, old || {}, { key: key, contractId: CID, year: S.year, month: S.month, rate: C.taux, indem: C.indemnite, hpd: C.hpd, hsup: C.hsup,
        unpaid: V.unpaid, cp: [...S.cp].filter(function (k) { return k.indexOf(pre) === 0; }), abs: [...S.abs].filter(function (k) { return k.indexOf(pre) === 0; }),
        mensu: r.mensu, heures: r.heures, salaire: r.salaire, accueil: r.accueil, entretien: r.entretien, total: r.total, cpOuvres: r.cpOuvres, cpo: r.cpo,
        savedAt: new Date().toISOString(), status: (old && old.status) || 'brouillon', copied: (old && old.copied) || {} });
    } else rec = Object.assign({}, old);
    if (opts.status) { rec.status = opts.status; rec.declaredAt = opts.status === 'declare' ? new Date().toISOString() : null; }
    if (opts.copied) rec.copied = opts.copied;
    S.months[key] = rec; S.unp[key] = rec.unpaid || 0;
    if (dbOK) await DB.put('months', rec).catch(warnDB);
    return rec;
  }
  function copyText(t) {
    return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function () {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
    });
  }

  /* ---------- écran Mois ---------- */
  function sMois() {
    $('screen').innerHTML = '<div class="stack"><header><h1>Paie du mois</h1><p class="sub">Marque les congés payés : jours ouvrés, jours ouvrables (CPO) et montant à verser sont calculés. Les données restent sur ce téléphone.</p></header>' +
      '<section class="panel"><h2>Mois</h2><div class="grid"><label for="month">Mois<select id="month">' + MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + cap(m) + '</option>'; }).join('') + '</select></label>' +
      '<label for="year">Année<input id="year" type="number" min="2024" max="2100" step="1" inputmode="numeric"></label>' +
      '<label for="unpaid">Jours ouvrés non rémunérés (ce mois)<input id="unpaid" type="number" min="0" step="1" inputmode="numeric"></label></div>' +
      '<p class="hint" id="tarifs"></p></section>' +
      '<div class="mois-grid"><section class="panel"><h2>Calendrier du mois</h2><div class="cal-head"><div class="seg" role="group" aria-label="Ce que le clic marque"><button type="button" id="mode-cp" aria-pressed="true">Congé payé</button><button type="button" id="mode-abs" aria-pressed="false">Enfant absent</button></div><button type="button" id="clear">Effacer le mois</button></div>' +
      '<div class="cal" id="cal" role="group" aria-label="Jours du mois"></div>' +
      '<div class="legend"><span><i style="background:var(--cp)"></i>Congé payé</span><span><i style="background:var(--sat)"></i>Samedi</span><span><i style="background:var(--sun)"></i>Dimanche</span><span><i style="background:var(--hol)"></i>Jour férié</span><span><i style="background:var(--abs)"></i>Enfant absent</span><span><i style="background:var(--surface);box-shadow:inset 0 0 0 2px var(--ink)"></i>Compté en CPO</span></div>' +
      '<div class="row" style="margin-top:14px"><label for="leave-from">Ajouter des congés à partir du<input id="leave-from" type="date"></label><label for="leave-n">Nombre de jours ouvrés<input id="leave-n" type="number" min="1" max="60" step="1" value="1" inputmode="numeric"></label><button type="button" class="primary" id="leave-add">Ajouter</button></div></section>' +
      '<section id="result-sec"><h2 style="margin-bottom:8px">Résultat</h2><div class="cols"><div class="tbl" id="recap"></div><div class="tbl" id="pay"></div></div>' +
      '<div class="bar"><button type="button" class="primary" id="save-month">Enregistrer ce mois</button><span class="ok" id="saved" role="status" style="margin:0"></span>' + '<button type="button" id="pdf-month">Récapitulatif PDF</button><button type="button" id="png-month">Récapitulatif image</button>' + (Platform.canPrint ? '<button type="button" id="print-month">Imprimer</button>' : '') + '</div><p class="ok" id="recap-msg" role="status"></p></section></div>' +
      '<section class="panel"><h2>Mois enregistrés</h2><div class="hist" id="hist"></div><p class="hint" id="dbnote"></p></section>' +
      '<section class="panel" id="share-panel"><h2>Partager le résultat</h2><label for="msg">Message (modifiable avant l\'envoi)<textarea id="msg"></textarea></label><div class="share"><button type="button" class="primary" id="s-native" hidden>Partager…</button><a class="wa" id="s-wa" href="#">WhatsApp</a><a id="s-tg" href="#">Telegram</a><a id="s-mail" href="#">E-mail</a><button type="button" id="s-copy">Copier le message</button></div><p class="ok" id="copied" role="status"></p></section></div>';
    $('month').value = S.month; $('year').value = S.year; $('unpaid').value = S.unp[mk()] || 0; $('leave-from').value = S.year + '-' + pad(S.month) + '-01';
    $('tarifs').textContent = 'Tarifs du contrat : ' + fmtN(C.taux, 2) + ' €/h · ' + fmtN(C.indemnite, 2) + ' €/jour d\'entretien · ' + fmtN(C.hpd, 1) + ' h/jour + ' + fmtN(C.hsup, 1) + ' h/mois (modifiables dans Réglages).';
    if (!dbOK) $('dbnote').textContent = 'Base locale indisponible : les données ne seront pas conservées.';

    function params() {
      var m = parseInt($('month').value, 10); if (m) S.month = m;
      var y = parseInt($('year').value, 10); if (y >= 2000 && y <= 2200) S.year = y;
      var u = parseInt($('unpaid').value, 10); S.unp[mk()] = isFinite(u) && u >= 0 ? u : 0;
    }
    ['month', 'year', 'unpaid'].forEach(function (id) {
      $(id).addEventListener('input', function () { params(); msgEdited = false; updMois(); });
      $(id).addEventListener('change', function () { var before = mk(); params(); if (mk() !== before || id !== 'unpaid') { $('unpaid').value = S.unp[mk()] || 0; $('leave-from').value = S.year + '-' + pad(S.month) + '-01'; } msgEdited = false; updMois(); });
    });
    $('msg').addEventListener('input', function () { msgEdited = true; updShare(); });
    $('mode-cp').onclick = function () { mode = 'cp'; $('mode-cp').setAttribute('aria-pressed', 'true'); $('mode-abs').setAttribute('aria-pressed', 'false'); };
    $('mode-abs').onclick = function () { mode = 'abs'; $('mode-abs').setAttribute('aria-pressed', 'true'); $('mode-cp').setAttribute('aria-pressed', 'false'); };
    $('clear').onclick = function () {
      var pre = S.year + '-' + pad(S.month) + '-';
      [...S.cp].forEach(function (k) { if (k.indexOf(pre) === 0) S.cp.delete(k); }); [...S.abs].forEach(function (k) { if (k.indexOf(pre) === 0) S.abs.delete(k); });
      msgEdited = false; saveDays(); updMois();
    };
    $('leave-add').onclick = function () {
      var v = $('leave-from').value; if (!v) return;
      var n = Math.max(1, Math.min(60, parseInt($('leave-n').value, 10) || 1)), d = E.parseISO(v), V = view();
      for (var g = 0; n > 0 && g < 400; g++, d = E.addDays(d, 1)) { var f = E.flags(d, V); if (f.ouvre) { S.cp.add(f.k); S.abs.delete(f.k); n--; } }
      msgEdited = false; saveDays(); updMois();
    };
    $('save-month').onclick = async function () {
      try { await saveMonth({ refresh: true }); $('saved').textContent = 'Enregistré sur le téléphone.'; hist(); } catch (e) { $('saved').textContent = "Échec de l'enregistrement."; }
      setTimeout(function () { var s = $('saved'); if (s) s.textContent = ''; }, 3500);
    };
    $('s-copy').onclick = async function () {
      var t = $('msg').value, ok = function (m) { $('copied').textContent = m; setTimeout(function () { var c = $('copied'); if (c) c.textContent = ''; }, 3000); };
      try { await navigator.clipboard.writeText(t); ok('Message copié.'); } catch (e) { $('msg').focus(); $('msg').select(); ok('Message sélectionné : copie-le avec le menu de ton appareil.'); }
    };
    if (Platform.share.available()) { $('s-native').hidden = false; $('s-native').onclick = function () { Platform.share.text($('msg').value); }; }
    $('pdf-month').onclick = function () { exportRecap('pdf', 'month'); }; $('png-month').onclick = function () { exportRecap('png', 'month'); };
    if ($('print-month')) $('print-month').onclick = function () { window.print(); };
    updMois(); hist();
  }
  function updShare() {
    var t = $('msg').value, q = encodeURIComponent(t);
    $('s-wa').href = 'https://wa.me/?text=' + q;
    $('s-tg').href = 'https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + q;
    $('s-mail').href = 'mailto:?subject=' + encodeURIComponent('Paie assistante maternelle – ' + MONTHS[S.month - 1] + ' ' + S.year) + '&body=' + q;
  }
  function updMois() {
    var V = view(), r = E.computeMonth(V), cal = $('cal'); cal.innerHTML = '';
    ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'].forEach(function (x) { var e = document.createElement('div'); e.className = 'dow'; e.textContent = x; cal.appendChild(e); });
    for (var i = 1; i < r.days[0].w; i++) { var bl = document.createElement('div'); bl.className = 'blank'; cal.appendChild(bl); }
    r.days.forEach(function (f) {
      var b = document.createElement('button'); b.type = 'button'; var cls = [];
      if (f.hol) cls.push('hol'); else if (f.w === 7) cls.push('sun'); else if (f.w === 6) cls.push('sat');
      if (f.cp) cls.push('cp'); if (f.abs) cls.push('abs'); if (f.cpo) cls.push('cpo'); if (!f.active) cls.push('off');
      b.className = 'day ' + cls.join(' ');
      b.innerHTML = f.d.getDate() + (f.cp ? '<small>CP</small>' : f.hol ? '<small>férié</small>' : f.abs ? '<small>abs</small>' : f.cpo ? '<small>CPO</small>' : '');
      b.title = f.hol || ''; b.disabled = !f.ouvre;
      b.setAttribute('aria-label', f.d.getDate() + ' ' + MONTHS[S.month - 1] + (f.hol ? ', ' + f.hol : '') + (f.cp ? ', congé payé' : '') + (f.abs ? ', enfant absent' : '') + (f.cpo && !f.cp ? ', compté en CPO' : ''));
      if (f.ouvre) b.addEventListener('click', function () {
        var set = mode === 'cp' ? S.cp : S.abs;
        if (set.has(f.k)) set.delete(f.k); else { set.add(f.k); (mode === 'cp' ? S.abs : S.cp).delete(f.k); }
        msgEdited = false; saveDays(); updMois();
      });
      cal.appendChild(b);
    });
    $('recap').innerHTML = '<div class="th">Récapitulatif — ' + MONTHS[S.month - 1] + ' ' + S.year + '</div>' + row('Jours fériés', r.feries) + row('Jours travaillés', r.trav) + row('Jours ouvrés', r.ouvres) +
      row('Jours ouvrables', r.ouvrables) + row('CP en jours ouvrés', r.cpOuvres) + row('CP ouvrables (CPO)', r.cpo) + row('Cumul CPO depuis le début du contrat', '<b>' + r.cumCpo + '</b>');
    $('pay').innerHTML = '<div class="th">Calcul de la paie du mois</div>' + row('Taux horaire net', eur(V.rate)) + row('Heures par jour', fmtN(V.hpd, 1)) + row('Heures en plus par mois', fmtN(V.hsup, 1)) +
      row("Indemnité d'entretien (€/jour)", eur(V.indem)) + row('Jours ouvrés non rémunérés', V.unpaid) + row('Jours mensualisés (Pajemploi)', r.mensu) + row('Heures normales (Pajemploi)', fmtN(r.heures, 1)) +
      row('Salaire net', eur(r.salaire)) + row("Jours d'accueil réel (enfant présent)", r.accueil) + row("Indemnité d'entretien", eur(r.entretien)) + row('TOTAL À VERSER', eur(r.total), 'total');
    if (!msgEdited) $('msg').value = message(r, V);
    updShare();
  }
  async function hist() {
    var box = $('hist'); if (!box) return;
    var list = Object.keys(S.months).map(function (k) { return S.months[k]; }).sort(function (a, b) { return a.key < b.key ? 1 : -1; });
    if (!list.length) { box.innerHTML = '<p class="empty">Aucun mois enregistré pour le moment.</p>'; return; }
    box.innerHTML = '';
    list.forEach(function (m) {
      var d = document.createElement('div'); d.className = 'hrow';
      d.innerHTML = '<div class="meta"><span>' + MONTHS[m.month - 1] + ' ' + m.year + ' <span class="badge' + (m.status === 'declare' ? ' ok' : '') + '">' + (m.status === 'declare' ? 'déclaré' : 'brouillon') + '</span></span><small>' + m.mensu + ' j · ' + fmtN(m.heures, 1) + ' h · CPO ' + m.cpo + '</small></div><b>' + eur(m.total) + '</b><div class="btns"><button type="button">Ouvrir</button><button type="button">Supprimer</button></div>';
      var bs = d.querySelectorAll('button');
      bs[0].onclick = function () {
        S.year = m.year; S.month = m.month; S.unp[m.key] = m.unpaid || 0; msgEdited = false; sMois(); window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      bs[1].onclick = async function () { delete S.months[m.key]; try { await DB.del('months', m.key); } catch (e) { /* ignore */ } hist(); };
      box.appendChild(d);
    });
  }

  /* ---------- À saisir dans Pajemploi (F2) ---------- */
  function sSaisir() {
    var V = view(), r = E.computeMonth(V), key = mk(), rec = S.months[key];
    var copied = (rec && rec.copied) || {};
    var f2 = function (v) { return fmtN(v, 2); };
    var fields = [
      ['jours', "Jours d'activité", String(r.mensu), String(r.mensu)],
      ['heures', "Nombre d'heures normales", fmtN(r.heures, r.heures % 1 ? 2 : 0), String(r.heures).replace('.', ',')],
      ['salaire', 'Salaire net (€)', f2(r.salaire), f2(r.salaire).replace(/[  \s]/g, '')],
      ['entretien', "Indemnités d'entretien (€)", f2(r.entretien), f2(r.entretien).replace(/[  \s]/g, '')],
      ['cp', 'Congés payés versés', 'Non', 'Non']
    ];
    var st = rec && rec.status === 'declare';
    var changed = rec && st && Math.abs(rec.total - r.total) > 0.004;
    $('screen').innerHTML = '<div class="stack"><header><h1>À saisir dans Pajemploi</h1><p class="sub">Déclaration de ' + MONTHS[S.month - 1] + ' ' + S.year + ' — contrat mensualisé 52 semaines : congés payés inclus dans le salaire.</p></header>' +
      '<div class="cal-head"><button type="button" id="pm">‹ Mois précédent</button><b>' + cap(MONTHS[S.month - 1]) + ' ' + S.year + '</b><button type="button" id="nm">Mois suivant ›</button></div>' +
      (changed ? '<div class="alert warn" role="alert">Les montants ont changé depuis la déclaration (' + eur(rec.total) + ' déclaré, ' + eur(r.total) + ' maintenant). Déclare une modification dans Pajemploi puis re-marque le mois.</div>' : '') +
      '<div class="tbl">' + fields.map(function (f) {
        return '<div class="pj"><div><div class="l">' + f[1] + '</div><div class="v">' + esc(f[2]) + '</div></div><button type="button" data-copy="' + f[0] + '">Copier</button>' +
          '<div class="acts"><label class="chk"><input type="checkbox" data-chk="' + f[0] + '"' + (copied[f[0]] ? ' checked' : '') + '> Recopié dans Pajemploi</label></div></div>';
      }).join('') + '<div class="tr total"><span>Total à verser (salaire + entretien)</span><span>' + eur(r.total) + '</span></div></div>' +
      '<div class="bar"><span class="badge ' + (st ? 'ok' : 'warn') + '" id="st">' + (st ? 'Déclaré le ' + fmtDate((rec.declaredAt || '').slice(0, 10)) : 'À déclarer') + '</span>' +
      '<button type="button" class="primary" id="decl">' + (st ? 'Mettre à jour la déclaration' : 'Marquer comme déclaré') + '</button>' + (st ? '<button type="button" id="undecl">Repasser en brouillon</button>' : '') + '</div>' +
      '<p class="hint">Heures = jours mensualisés × ' + fmtN(C.hpd, 1) + ' h + ' + fmtN(C.hsup, 1) + ' h ; salaire = heures × ' + fmtN(C.taux, 2) + ' € ; entretien = ' + r.accueil + ' jour(s) d\'accueil réel × ' + fmtN(C.indemnite, 2) + ' €.</p></div>';
    $('pm').onclick = function () { stepMonth(-1); sSaisir(); }; $('nm').onclick = function () { stepMonth(1); sSaisir(); };
    var vals = {}; fields.forEach(function (f) { vals[f[0]] = f[3]; });
    document.querySelectorAll('[data-copy]').forEach(function (b) {
      b.onclick = async function () { await copyText(vals[b.dataset.copy]); b.textContent = 'Copié ✓'; setTimeout(function () { b.textContent = 'Copier'; }, 1500); };
    });
    document.querySelectorAll('[data-chk]').forEach(function (c) {
      c.onchange = async function () { var cp = Object.assign({}, (S.months[mk()] || {}).copied); cp[c.dataset.chk] = c.checked; await saveMonth({ copied: cp }); };
    });
    $('decl').onclick = async function () { await saveMonth({ refresh: true, status: 'declare' }); sSaisir(); };
    if ($('undecl')) $('undecl').onclick = async function () { await saveMonth({ status: 'brouillon' }); sSaisir(); };
  }

  /* ---------- Congés (F1) ---------- */
  function sConges() {
    var V = view(), asOf = new Date(), lyKey = CID + '|' + E.refPeriod(asOf).start.getFullYear();
    var corr = (S.leave[lyKey] && S.leave[lyKey].correction) || 0, modeAcq = ST.acqMode === '4sem' ? '4sem' : 'prorata';
    var L = E.leaveRights(V, new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()), { mode: modeAcq, enfants: C.enfantsCharge, correction: corr });
    var pct = L.acquis > 0 ? Math.min(100, Math.round((L.pris + L.poses) / L.acquis * 100)) : (L.pris + L.poses ? 100 : 0);
    var alertHtml = L.status === 'depassement' ? '<div class="alert bad" role="alert">Dépassement : ' + L.depassement + ' jour(s) pris en plus des droits acquis — congés par anticipation, à valider avec l\'accord de l\'assistante maternelle et du contrat.</div>'
      : L.status === 'alerte' ? '<div class="alert warn" role="alert">Attention : plus de 80 % des droits acquis sont utilisés (solde : ' + L.solde + ' j).</div>' : '<div class="alert good">Droits suffisants (solde : ' + L.solde + ' j).</div>';
    $('screen').innerHTML = '<div class="stack"><header><h1>Droits à congés</h1><p class="sub">Période de référence : ' + fmtDate(L.refStart) + ' → ' + fmtDate(L.refEnd) + ' (jours ouvrables).</p></header>' + alertHtml +
      '<div class="tbl"><div class="th">Décompte au ' + fmtDate(iso(asOf)) + '</div>' +
      row('Acquis (' + (modeAcq === '4sem' ? 'périodes de 4 semaines' : 'au prorata') + ')', L.acquisBase + ' j') +
      (L.extra ? row('Jours supplémentaires (enfants à charge)', '+' + L.extra + ' j') : '') + (L.correction ? row('Correction manuelle', (L.correction > 0 ? '+' : '') + L.correction + ' j') : '') +
      row('Total acquis', '<b>' + L.acquis + ' j</b>') + row('Pris', L.pris + ' j') + row('Posés à venir', L.poses + ' j') + row('Solde', '<b>' + L.solde + ' j</b>', 'total') + '</div>' +
      '<div class="meter" aria-label="Droits utilisés"><i class="' + (L.status === 'depassement' ? 'bad' : L.status === 'alerte' ? 'warn' : '') + '" style="width:' + pct + '%"></i></div>' +
      '<section class="panel"><h2>Périodes de congés</h2>' + (L.periods.length ? '<div class="hist">' + L.periods.map(function (p) {
        return '<div class="hrow"><span>' + fmtDate(p.from) + (p.to !== p.from ? ' → ' + fmtDate(p.to) : '') + '</span><b>' + p.n + ' j ouvrables</b></div>';
      }).join('') + '</div>' : '<p class="empty">Aucun congé sur cette période.</p>') +
      '<div class="row" style="margin-top:14px"><label for="lv-from">Ajouter à partir du<input id="lv-from" type="date"></label><label for="lv-n">Jours ouvrés<input id="lv-n" type="number" min="1" max="60" value="1" inputmode="numeric"></label><button type="button" class="primary" id="lv-add">Ajouter</button></div></section>' +
      '<section class="panel"><h2>Correction manuelle</h2><div class="row"><label for="lv-corr">Ajustement des droits (jours, + ou −)<input id="lv-corr" type="number" step="1" value="' + corr + '" inputmode="numeric"></label><button type="button" id="lv-save">Enregistrer</button></div>' +
      '<p class="hint">Sert à caler le décompte sur le relevé officiel (arrondis, accord particulier). Le mode de calcul se règle dans Réglages. Information indicative : ce n\'est pas un avis juridique.</p></section></div>';
    $('lv-add').onclick = function () {
      var v = $('lv-from').value; if (!v) return;
      var n = Math.max(1, Math.min(60, parseInt($('lv-n').value, 10) || 1)), d = E.parseISO(v);
      for (var g = 0; n > 0 && g < 400; g++, d = E.addDays(d, 1)) { var f = E.flags(d, V); if (f.ouvre) { S.cp.add(f.k); S.abs.delete(f.k); n--; } }
      saveDays(); sConges();
    };
    $('lv-save').onclick = async function () {
      var c = parseInt($('lv-corr').value, 10) || 0, rec = { key: lyKey, contractId: CID, correction: c };
      S.leave[lyKey] = rec; if (dbOK) await DB.put('leave_years', rec).catch(warnDB); sConges();
    };
  }

  /* ---------- Paiements (F3) ---------- */
  var BADGE = { a_verser: ['warn', 'À verser'], regle: ['ok', 'Réglé'], trop_percu: ['bad', 'Trop-perçu'] };
  function paidFor(key) { return S.payments.filter(function (p) { return p.monthKey === key; }).reduce(function (a, p) { return a + p.amount; }, 0); }
  function sPaiements(prefill) {
    var months = Object.keys(S.months).map(function (k) { return S.months[k]; }).sort(function (a, b) { return a.key < b.key ? 1 : -1; });
    var pf = prefill || {};
    var list = months.map(function (m) {
      var paid = E.round2(paidFor(m.key)), ps = E.paymentStatus(m.total, paid), b = BADGE[ps.status];
      return '<div class="pj"><div><div class="l">' + cap(MONTHS[m.month - 1]) + ' ' + m.year + ' — dû ' + eur(m.total) + ' · versé ' + eur(paid) + '</div><div class="v">' + (ps.ecart ? eur(ps.ecart) : '0,00 €') + '</div></div><span class="badge ' + b[0] + '">' + b[1] + '</span>' +
        (ps.status === 'a_verser' ? '<div class="acts"><button type="button" data-comp="' + m.key + '" data-amt="' + ps.ecart + '">Saisir le complément</button></div>' : '') + '</div>';
    }).join('');
    var pays = S.payments.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (p) {
      var m = S.months[p.monthKey];
      return '<div class="hrow"><div class="meta"><span>' + fmtDate(p.date) + ' — ' + (m ? cap(MONTHS[m.month - 1]) + ' ' + m.year : esc(p.monthKey)) + '</span><small>' + (p.kind === 'regularisation' ? 'Régularisation' : 'Versement') + (p.note ? ' · ' + esc(p.note) : '') + '</small></div><b>' + eur(p.amount) + '</b><div class="btns"><button type="button" data-delp="' + p.id + '">Supprimer</button></div></div>';
    }).join('');
    $('screen').innerHTML = '<div class="stack"><header><h1>Paiements</h1><p class="sub">Suivi de ce qui est dû, versé, et des régularisations pour chaque mois enregistré.</p></header>' +
      (months.length ? '<div class="tbl">' + list + '</div>' : '<p class="empty">Enregistre d\'abord un mois (écran Mois ou À saisir) pour suivre son paiement.</p>') +
      (months.length ? '<section class="panel"><h2>Saisir un versement</h2><div class="grid"><label for="pa-m">Mois<select id="pa-m">' + months.map(function (m) { return '<option value="' + m.key + '"' + (m.key === pf.key ? ' selected' : '') + '>' + cap(MONTHS[m.month - 1]) + ' ' + m.year + '</option>'; }).join('') + '</select></label>' +
        fld('pa-d', 'Date du versement', pf.date || today(), { type: 'date' }) + fld('pa-a', 'Montant (€)', pf.amt != null ? pf.amt : '', { attrs: 'inputmode="decimal"' }) +
        sel('pa-k', 'Type', pf.kind || 'versement', [['versement', 'Versement'], ['regularisation', 'Régularisation']]) + fld('pa-n', 'Note', '') + '</div><div class="bar"><button type="button" class="primary" id="pa-add">Enregistrer</button></div></section>' : '') +
      (pays ? '<section class="panel"><h2>Historique</h2><div class="hist">' + pays + '</div></section>' : '') + '</div>';
    document.querySelectorAll('[data-comp]').forEach(function (b) { b.onclick = function () { sPaiements({ key: b.dataset.comp, amt: b.dataset.amt, kind: 'regularisation' }); $('pa-a').scrollIntoView(); }; });
    document.querySelectorAll('[data-delp]').forEach(function (b) {
      b.onclick = async function () { S.payments = S.payments.filter(function (p) { return p.id !== b.dataset.delp; }); if (dbOK) await DB.del('payments', b.dataset.delp).catch(warnDB); sPaiements(); };
    });
    if ($('pa-add')) $('pa-add').onclick = async function () {
      var amt = numv('pa-a'), d = val('pa-d'), errs = {};
      if (!(amt > 0)) errs['pa-a'] = 'Montant supérieur à 0';
      if (!E.isISODate(d)) errs['pa-d'] = 'Date invalide';
      if (!showErrors(errs)) return;
      var p = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), contractId: CID, monthKey: val('pa-m'), date: d, amount: E.round2(amt), kind: val('pa-k'), note: val('pa-n') };
      S.payments.push(p); if (dbOK) await DB.put('payments', p).catch(warnDB); sPaiements();
    };
  }

  /* ---------- Réglages + sauvegarde (F4) ---------- */
  /* ---------- Récapitulatif PDF / image (F10) ---------- */
  function currentMonthRecord() {
    var V = view(), r = E.computeMonth(V);
    return { key: mk(), year: S.year, month: S.month, rate: V.rate, indem: V.indem, hpd: V.hpd, hsup: V.hsup, unpaid: V.unpaid, mensu: r.mensu, heures: r.heures,
      salaire: r.salaire, accueil: r.accueil, entretien: r.entretien, total: r.total, cpOuvres: r.cpOuvres, cpo: r.cpo, absN: r.days.filter(function (d) { return d.abs; }).length };
  }
  async function exportRecap(kind, scope) {
    var ctx = { P: P, CH: CH, ST: ST }, msg = $(scope === 'year' ? 'y-msg' : 'recap-msg'), name, model;
    if (scope === 'year') { model = Recap.yearModel(E.yearSummary(Object.keys(S.months).map(function (k) { return S.months[k]; }), S.payments, yearView, C.start), ctx); name = Recap.fileName(kind, yearView); }
    else { var m = currentMonthRecord(); model = Recap.monthModel(m, S.payments, ctx); name = Recap.fileName(kind, m.year, m.month); }
    try {
      var ops = Recap.layout(model), b64, mime;
      if (kind === 'pdf') { b64 = Recap.toBase64(Recap.pdf(ops)); mime = 'application/pdf'; }
      else { var cv = document.createElement('canvas'); Recap.drawCanvas(ops, cv); b64 = cv.toDataURL('image/png').split(',')[1]; mime = 'image/png'; }
      var ok = await Platform.files.exportBlob(name, mime, b64);
      if (msg) msg.textContent = ok ? (kind === 'pdf' ? 'PDF prêt : ' : 'Image prête : ') + name : 'Export annulé ou échoué.';
    } catch (e) { if (msg) msg.textContent = 'Export impossible sur cet appareil.'; console.error(e); }
    if (msg) setTimeout(function () { if (msg) msg.textContent = ''; }, 5000);
  }

  /* ---------- Année (F6) ---------- */
  var yearView = new Date().getFullYear();
  function sAnnee() {
    var y = E.yearSummary(Object.keys(S.months).map(function (k) { return S.months[k]; }), S.payments, yearView, C.start), f2 = function (v) { return fmtN(v, 2); };
    var rowsHtml = y.rows.map(function (r) {
      var name = cap(MONTHS[r.month - 1]);
      if (r.status === 'avant_contrat') return '<div class="pj before"><div class="l">' + name + '</div><span class="badge">avant le contrat</span></div>';
      if (r.status === 'non_enregistre') return '<button type="button" class="pj yrow" data-ym="' + r.ym + '"><div><div class="l">' + name + '</div><div class="v">—</div></div><span class="badge warn">non enregistré</span></button>';
      return '<button type="button" class="pj yrow" data-ym="' + r.ym + '"><div><div class="l">' + name + ' — ' + r.mensu + ' j · ' + fmtN(r.heures, 1) + ' h · salaire ' + eur(r.salaire) + ' · entretien ' + eur(r.entretien) + '</div>' +
        '<div class="v">' + eur(r.total) + '</div><div class="l">versé ' + eur(r.paid) + ' · écart ' + eur(r.ecart) + '</div></div><span class="badge ' + (r.ecart > 0.004 ? 'warn' : r.ecart < -0.004 ? 'bad' : 'ok') + '">' + (r.ecart > 0.004 ? 'À verser' : r.ecart < -0.004 ? 'Trop-perçu' : 'Réglé') + '</span></button>';
    }).join('');
    var body = y.recorded === 0
      ? '<p class="hint" id="y-empty">Aucun mois enregistré en ' + y.year + '. Enregistre un mois depuis l\'écran Mois.</p>'
      : '<div class="tbl" id="y-rows"><div class="th">Mois de ' + y.year + '</div>' + rowsHtml + '</div>' +
        '<div class="tbl" id="y-tot"><div class="th">Total ' + y.year + '</div>' +
        row('Jours mensualisés', y.totals.mensu + ' j') + row('Heures', fmtN(y.totals.heures, 1) + ' h') + row('Salaire net', eur(y.totals.salaire)) +
        row('Entretien', eur(y.totals.entretien)) + row('Total dû', '<b>' + eur(y.totals.total) + '</b>', 'total') + row('Versé', eur(y.paid)) +
        row('Écart à ' + (y.ecart >= 0 ? 'verser' : 'récupérer'), '<b>' + eur(Math.abs(y.ecart)) + '</b>') + '</div>' +
        (y.unrecorded ? '<p class="hint" id="y-unrec">' + y.unrecorded + ' mois non enregistré' + (y.unrecorded > 1 ? 's' : '') + ' (non comptés dans les totaux).</p>' : '') +
        '<div class="bar"><button type="button" id="y-pdf">Récapitulatif annuel PDF</button><button type="button" id="y-png">Récapitulatif annuel image</button></div><p class="ok" id="y-msg" role="status"></p>' +
        '<section class="panel" id="y-cp"><h2>Congés</h2><p style="margin-top:0">' + y.cpo + ' jour' + (y.cpo > 1 ? 's' : '') + ' ouvrable' + (y.cpo > 1 ? 's' : '') + ' pris en ' + y.year +
        '.</p><p class="hint">Les droits se calculent sur la période du 1er juin au 31 mai.</p><div class="bar"><button type="button" id="y-conges">Voir l\'écran Congés</button></div></section>';
    $('screen').innerHTML = '<div class="stack"><header><h1>Année ' + y.year + '</h1><p class="sub">Totaux des mois enregistrés et versements de l\'année civile.</p></header>' +
      '<div class="pager" style="margin-top:0"><button type="button" id="y-prev" aria-label="Année précédente">‹ ' + (y.year - 1) + '</button><button type="button" id="y-next" aria-label="Année suivante">' + (y.year + 1) + ' ›</button></div>' + body + '</div>';
    $('y-prev').onclick = function () { yearView--; sAnnee(); };
    $('y-next').onclick = function () { yearView++; sAnnee(); };
    document.querySelectorAll('.yrow').forEach(function (b) {
      b.onclick = function () { var p = b.dataset.ym.split('-'); S.year = Number(p[0]); S.month = Number(p[1]); go('mois'); };
    });
    if ($('y-pdf')) { $('y-pdf').onclick = function () { exportRecap('pdf', 'year'); }; $('y-png').onclick = function () { exportRecap('png', 'year'); }; }
    if ($('y-conges')) $('y-conges').onclick = function () { go('conges'); };
  }
  function sReglages() {
    var lb = ST.lastBackupAt ? 'Dernière sauvegarde : ' + fmtDate(ST.lastBackupAt.slice(0, 10)) : 'Aucune sauvegarde effectuée.';
    $('screen').innerHTML = '<div class="stack"><header><h1>Réglages</h1></header>' +
      '<section class="panel"><h2>Profil du parent</h2>' + parentForm(P, true) + '<div class="bar"><button type="button" class="primary" id="sv-p">Enregistrer</button></div></section>' +
      '<section class="panel"><h2>Enfant</h2>' + childForm(CH) + '<div class="bar"><button type="button" class="primary" id="sv-c">Enregistrer</button></div></section>' +
      '<section class="panel"><h2>Contrat et tarifs</h2>' + contractForm(C) + '<div class="bar"><button type="button" class="primary" id="sv-k">Enregistrer</button></div>' +
      '<p class="hint">Les mois déjà enregistrés gardent leurs tarifs ; les autres utilisent les nouveaux.</p></section>' +
      '<section class="panel"><h2>Options</h2><div class="stack">' +
      sel('o-acq', 'Calcul des congés acquis', ST.acqMode === '4sem' ? '4sem' : 'prorata', [['prorata', 'Au prorata des jours (2,5 j par mois)'], ['4sem', 'Par période de 4 semaines complète']]) +
      '<label class="chk"><input type="checkbox" id="o-share"' + (ST.shareChild ? ' checked' : '') + '> Mettre le prénom de l\'enfant dans le message partagé</label>' +
      '<p class="hint" style="margin:0">L\'adresse et les dates de naissance ne sont jamais partagées.</p></div></section>' +
      '<section class="panel"><h2>Sauvegarde et restauration</h2><p class="hint" style="margin-top:0" id="bk-info">' + lb + '</p><div class="bar"><button type="button" class="primary" id="bk-exp">Exporter (JSON)</button><button type="button" id="bk-imp">Importer…</button></div>' +
      '<input type="file" id="bk-file" accept="application/json,.json" hidden><div id="bk-prev" class="stack" style="margin-top:12px"></div><p class="ok" id="bk-msg" role="status"></p></section>' +
      '<section class="panel"><h2>Stockage et confidentialité</h2><p class="hint" id="persist-info" style="margin-top:0">Stockage persistant : …</p><div class="bar"><button type="button" id="priv-open" aria-expanded="false" aria-controls="privacy">Confidentialité</button></div>' +
      '<div id="privacy" hidden><p>Toutes tes données (profil, enfant, contrat, jours, paiements) sont enregistrées uniquement sur cet appareil. Aucune donnée ne quitte jamais ton appareil : aucun compte, aucun serveur, aucune statistique, aucun suivi. L\'appli fonctionne hors ligne.</p><p>Seules tes sauvegardes JSON exportées et le message que tu choisis de partager sortent de l\'appli, à ta demande.</p><p>Outil de calcul indicatif, pas un avis juridique.</p></div></section>' +
      '<section class="panel"><h2>Zone sensible</h2><div id="del-zone"><button type="button" class="danger" id="del-ask">Tout supprimer</button></div></section>' +
      '<p class="hint">Paie Assmat <span id="app-version">' + Platform.APP_VERSION + '</span> — outil de calcul indicatif, pas un avis juridique.</p></div>';
    $('priv-open').onclick = function () { var p = $('privacy'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden)); };
    Platform.persistence().then(function (r) {
      var el = $('persist-info'); if (!el) return;
      el.textContent = 'Stockage persistant : ' + (r.persisted === true ? 'oui' : 'non') + (r.persisted === false ? ' — exporte régulièrement une sauvegarde.' : '');
      if (r.supported && r.persisted === false) Platform.requestPersistence().then(function (ok) { var e2 = $('persist-info'); if (ok && e2) e2.textContent = 'Stockage persistant : oui'; });
    });
    var saveP = async function (which) {
      var p = readParent(), c = readChild(), k = readContract();
      var errs = which === 'p' ? parentErrors(p) : which === 'c' ? childErrors(c) : contractErrors(k);
      if (!showErrors(errs)) return;
      await saveProfileData(which === 'p' ? p : P, which === 'c' ? Object.assign({}, c, { id: EID }) : CH, which === 'k' ? k : C);
      $('bk-msg').textContent = 'Enregistré.'; setTimeout(function () { var m = $('bk-msg'); if (m) m.textContent = ''; }, 2500);
    };
    $('sv-p').onclick = function () { saveP('p'); }; $('sv-c').onclick = function () { saveP('c'); }; $('sv-k').onclick = function () { saveP('k'); };
    $('o-acq').onchange = function () { saveSettings({ acqMode: $('o-acq').value }); };
    $('o-share').onchange = function () { saveSettings({ shareChild: $('o-share').checked }); };

    var say = function (m) { $('bk-msg').textContent = m; };
    $('bk-exp').onclick = async function () {
      try {
        var json = JSON.stringify(E.buildExport(await DB.dump(), new Date().toISOString()), null, 2);
        var name = 'paie-assmat-' + today() + '.json';
        Platform.files.exportJSON(name, json);
      } catch (e) { say("Échec de l'export."); }
    };
    $('bk-imp').onclick = function () { Platform.files.importJSON(); };
    $('bk-file').onchange = function () {
      var f = this.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { window.onImportFile(r.result); }; r.readAsText(f); this.value = '';
    };
    $('del-ask').onclick = function () {
      $('del-zone').innerHTML = '<p class="alert bad">Supprimer définitivement profil, enfant, contrat, jours, mois et paiements de ce téléphone ? Exporte d\'abord une sauvegarde.</p><div class="bar"><button type="button" class="danger" id="del-yes">Oui, tout supprimer</button><button type="button" id="del-no">Annuler</button></div>';
      $('del-no').onclick = sReglages;
      $('del-yes').onclick = async function () {
        try { await DB.clearAll(); } catch (e) { warnDB(e); }
        P = CH = C = null; ST = { id: 'main', migrated: true }; S.cp = new Set(); S.abs = new Set(); S.unp = {}; S.months = {}; S.payments = []; S.leave = {};
        await saveSettings({ migrated: true }); $('screen').innerHTML = ''; onboarding();
      };
    };
  }

  window.onExportResult = function (ok) {
    if (!ok) { var m0 = $('bk-msg'); if (m0) m0.textContent = 'Export annulé ou échoué.'; return; }
    Platform.prefs.set('lastBackupAt', new Date().toISOString());
    saveSettings({ lastBackupAt: new Date().toISOString() }).then(function () {
      var m = $('bk-msg'); if (m) m.textContent = 'Sauvegarde exportée.';
      var i = $('bk-info'); if (i) i.textContent = 'Dernière sauvegarde : ' + fmtDate(today()); renderBanner();
    });
  };
  window.onImportFile = function (text) {
    var box = $('bk-prev'), msg = $('bk-msg'); if (!box) return;
    if (text == null) { msg.textContent = 'Import annulé.'; return; }
    var p = E.parseExport(text);
    if (!p.ok) { box.innerHTML = ''; msg.textContent = p.error; return; }
    msg.textContent = '';
    box.innerHTML = '<div class="alert good">Sauvegarde valide' + (p.exportedAt ? ' du ' + fmtDate(p.exportedAt.slice(0, 10)) : '') + ' : ' + p.counts.days + ' jour(s), ' + p.counts.months + ' mois, ' + p.counts.payments + ' paiement(s).</div>' +
      '<div class="bar"><button type="button" class="primary" id="im-merge">Fusionner avec mes données</button><button type="button" class="danger" id="im-replace">Remplacer mes données</button><button type="button" id="im-cancel">Annuler</button></div>';
    var run = async function (m) {
      try { await DB.restore(p.data, m); await loadAll(); await saveSettings({ migrated: true }); box.innerHTML = ''; msg.textContent = 'Import terminé (' + (m === 'merge' ? 'fusion' : 'remplacement') + ').'; if (!C) { onboarding(); } else if ($('restore-first')) { go('mois'); } }
      catch (e) { msg.textContent = "Échec de l'import."; }
    };
    $('im-merge').onclick = function () { run('merge'); }; $('im-replace').onclick = function () { run('replace'); };
    $('im-cancel').onclick = function () { box.innerHTML = ''; };
  };

  /* ---------- données absentes alors qu'une sauvegarde a déjà été faite (FR-13) ---------- */
  function restoreFirst() {
    var o = $('screen');
    o.innerHTML = '<div class="panel stack" role="alertdialog" aria-labelledby="rf-t"><h2 id="rf-t">Aucune donnée trouvée</h2><p class="alert warn">Une sauvegarde avait été exportée depuis ce navigateur, mais les données locales sont vides (le navigateur a pu les effacer). Restaure ta dernière sauvegarde JSON.</p>' +
      '<div class="bar"><button type="button" class="primary" id="restore-first">Restaurer une sauvegarde…</button><button type="button" id="restore-skip">Commencer à neuf</button></div>' +
      '<input type="file" id="bk-file" accept="application/json,.json" hidden><div id="bk-prev" class="stack"></div><p class="ok" id="bk-msg" role="status"></p></div>';
    $('restore-first').onclick = function () { Platform.files.importJSON(); };
    $('bk-file').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { window.onImportFile(r.result); }; r.readAsText(f); this.value = ''; };
    $('restore-skip').onclick = function () { o.innerHTML = ''; onboarding(); };
  }

  /* ---------- démarrage ---------- */
  document.querySelectorAll('#tabs button').forEach(function (b) { b.onclick = function () { if (C) go(b.dataset.tab); }; });
  (async function () {
    await Platform.ready;
    try { await DB.open(); dbOK = true; await loadAll(); await migrateLegacy(); await loadAll(); if (!C && !legacy) legacy = await DB.get('state', 'main') || null; }
    catch (e) { dbOK = false; }
    var t = new Date(); if (!C) { S.year = t.getFullYear(); S.month = t.getMonth() + 1; } else { S.year = t.getFullYear(); S.month = t.getMonth() + 1; }
    if (!C && !legacy && Platform.prefs.get('lastBackupAt')) restoreFirst(); else if (!C) onboarding(); else go('mois');
    Platform.registerServiceWorker(function (apply) {
      var b = $('banner'); if (!b || !b.hidden) return; b.hidden = false;
      b.innerHTML = 'Nouvelle version disponible. <button type="button" id="upd">Mettre à jour</button>';
      $('upd').onclick = apply;
    });
  })();
})();
