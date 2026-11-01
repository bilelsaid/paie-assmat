/* Récapitulatif mensuel / annuel (F10) : modèle -> opérations de dessin (A4, points) -> PDF texte ou PNG (canvas).
   Pur et sans réseau. Un seul jeu d'opérations alimente le PDF et l'image : même contenu. Testé sous Node (tests/recap.test.js).
   Confidentialité : seuls le nom de l'assistante (si saisi) et le prénom de l'enfant (si l'option de partage est cochée) sont lus. */
(function (root) {
  'use strict';
  var E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var PW = 595, PH = 842, MX = 40, RIGHT = PW - MX, PNG_W = 1240, PNG_H = 1754;
  var DISCLAIMER = 'Montants indicatifs, pas un avis juridique.';

  /* ---------- formats ---------- */
  function group(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function num(v, d) {
    var a = Math.abs(v).toFixed(d).split('.'), s = group(a[0]) + (a[1] ? ',' + a[1] : '');
    return (v < 0 && Number(Math.abs(v).toFixed(d)) !== 0 ? '-' : '') + s;
  }
  function money(v) { return num(v, 2) + ' €'; }
  function frDate(s) { return s.split('-').reverse().join('/'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fileName(kind, year, month) { return 'paie-assmat-' + year + (month ? '-' + E.pad(month) : '') + '.' + kind; }

  /* ---------- encodage WinAnsi (Helvetica intégrée) ---------- */
  var SPECIAL = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c };
  function winAnsi(t) {
    var out = '', i, c, ch;
    t = String(t).replace(/[\u202f\u00a0]/g, ' ');
    for (i = 0; i < t.length; i++) {
      ch = t.charAt(i); c = t.charCodeAt(i);
      if (SPECIAL[ch] !== undefined) out += String.fromCharCode(SPECIAL[ch]);
      else if (c >= 32 && c < 127) out += ch;
      else if (c >= 0xa1 && c <= 0xff) out += ch;
      else out += '?';
    }
    return out;
  }

  /* ---------- largeurs Helvetica (1/1000 em), ASCII 32..126 ---------- */
  var W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  function cw(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return W[c - 32];
    if (ch === '—') return 1000;
    if (ch === '·' || ch === ' ') return 278;
    if (ch === '×') return 584;
    if (ch === '’') return 222;
    if (ch === '°') return 400;
    var b = ch.normalize('NFD').charAt(0), bc = b.charCodeAt(0);
    return bc >= 32 && bc <= 126 ? W[bc - 32] : 556;
  }
  function width(text, size) { var w = 0, i; for (i = 0; i < text.length; i++) w += cw(text.charAt(i)); return w * size / 1000; }
  function wrap(text, size, maxW) {
    var words = String(text).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      while (width(w, size) > maxW) { // mot trop long : coupure dure
        var k = w.length; while (k > 1 && width(w.slice(0, k), size) > maxW) k--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      var t = cur ? cur + ' ' + w : w;
      if (cur && width(t, size) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* ---------- modèles ---------- */
  function header(ctx, lines) {
    var P = (ctx && ctx.P) || {}, CH = (ctx && ctx.CH) || {}, ST = (ctx && ctx.ST) || {};
    var nanny = typeof P.nannyName === 'string' ? P.nannyName.trim() : '';
    if (nanny) lines.push('Assistante maternelle : ' + nanny.slice(0, 80));
    if (ST.shareChild && CH.prenom) lines.push('Enfant : ' + CH.prenom);
    return lines;
  }
  function countHolidays(year, month) {
    var pre = year + '-' + E.pad(month) + '-';
    return Object.keys(E.holidays(year)).filter(function (k) { return k.indexOf(pre) === 0; }).length;
  }

  // m : enregistrement de mois (store `months`) ou résultat du calcul courant ; payments : store `payments`.
  function monthModel(m, payments, ctx) {
    var paid = 0, pays = (payments || []).filter(function (p) { return p.monthKey === m.key; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    pays.forEach(function (p) { paid += p.amount; });
    paid = E.round2(paid);
    var absN = m.absN != null ? m.absN : (m.abs ? m.abs.length : 0), fer = countHolidays(m.year, m.month), left = E.round2(m.total - paid);
    var sec = [];
    sec.push({ h: 'Valeurs à déclarer (Pajemploi)', rows: [
      ['Jours mensualisés', m.mensu + ' j'], ['Heures normales', num(m.heures, 1) + ' h'], ['Salaire net', money(m.salaire)],
      ["Indemnité d'entretien", money(m.entretien)], ['Total à verser', money(m.total), true]] });
    var cong = [['Congés payés (jours ouvrés)', (m.cpOuvres || 0) + ' j'], ['Congés payés (jours ouvrables, CPO)', (m.cpo || 0) + ' j'],
      ['Jours fériés du mois', String(fer)], ["Jours d'absence de l'enfant", absN + ' j']];
    if (m.unpaid) cong.push(['Jours ouvrés non rémunérés', m.unpaid + ' j']);
    sec.push({ h: "Jours de congé et d'absence", rows: cong });
    sec.push({ h: 'Détail du calcul', text: [
      'Heures = ' + m.mensu + ' j × ' + num(m.hpd, 1) + ' h + ' + num(m.hsup, 1) + ' h = ' + num(m.heures, 1) + ' h',
      'Salaire net = ' + num(m.heures, 1) + ' h × ' + num(m.rate, 2) + ' €/h = ' + money(m.salaire),
      "Entretien = " + m.accueil + " j d'accueil × " + num(m.indem, 2) + ' € = ' + money(m.entretien),
      'Total = ' + money(m.salaire) + ' + ' + money(m.entretien) + ' = ' + money(m.total),
      "Hypothèses : contrat mensualisé sur 52 semaines ; jours d'accueil = jours ouvrés hors congés payés et absences de l'enfant."] });
    var prow = pays.map(function (p) { return [frDate(p.date) + ' – ' + (p.kind === 'regularisation' ? 'Régularisation' : 'Versement'), money(p.amount)]; });
    if (!prow.length) prow.push(['Aucun versement enregistré', '']);
    prow.push(['Total dû', money(m.total)], ['Total versé', money(paid)], [left > 0.004 ? 'Reste à verser' : left < -0.004 ? 'Trop-perçu' : 'Solde', money(Math.abs(left)), true]);
    sec.push({ h: 'Paiements', rows: prow });
    return { title: 'Récapitulatif de paie – ' + cap(E.MONTHS[m.month - 1]) + ' ' + m.year, info: header(ctx, []), sections: sec };
  }

  function yearModel(y, ctx) {
    var cols = ['Mois', 'Jours', 'Heures', 'Salaire', 'Entretien', 'Dû', 'Versé', 'Écart'];
    var rows = y.rows.map(function (r) {
      var n = cap(E.MONTHS[r.month - 1]);
      if (r.status === 'avant_contrat') return [n, 'avant le contrat'];
      if (r.status === 'non_enregistre') return [n, 'non enregistré'];
      return [n, String(r.mensu), num(r.heures, 1), money(r.salaire), money(r.entretien), money(r.total), money(r.paid), money(r.ecart)];
    });
    var T = y.totals;
    var sum = [['Total dû', money(T.total)], ['Versé en ' + y.year, money(y.paid)], [y.ecart >= 0 ? 'Écart à verser' : 'Écart à récupérer', money(Math.abs(y.ecart)), true],
      ['Congés payés pris (jours ouvrables)', y.cpo + ' j']];
    var sec = [{ table: { cols: cols, rows: rows, total: ['Total', String(T.mensu), num(T.heures, 1), money(T.salaire), money(T.entretien), money(T.total), '', ''] } },
      { h: 'Bilan ' + y.year, rows: sum }];
    var notes = [];
    if (y.unrecorded) notes.push(y.unrecorded + ' mois non enregistré' + (y.unrecorded > 1 ? 's' : '') + ' (non comptés dans les totaux).');
    notes.push('Versé = paiements datés de ' + y.year + ' ; la colonne Versé de chaque mois = paiements rattachés à ce mois.');
    sec.push({ text: notes });
    return { title: 'Récapitulatif annuel ' + y.year, info: header(ctx, []), sections: sec };
  }

  /* ---------- mise en page : opérations en points, y mesuré depuis le haut ---------- */
  function layout(model) {
    var ops = [], y = 50, GRAY = 0.35;
    function text(x, t, size, o) { o = o || {}; ops.push({ k: 'text', x: x, y: y, size: size, bold: !!o.bold, align: o.align || 'l', gray: o.gray ? GRAY : 0, text: t }); }
    text(MX, model.title, 18, { bold: true }); y += 8;
    ops.push({ k: 'line', x1: MX, y1: y, x2: RIGHT, y2: y, w: 1 }); y += 16;
    model.info.forEach(function (l) { text(MX, l, 10); y += 14; });
    if (model.info.length) y += 4;
    model.sections.forEach(function (s) {
      y += 6;
      if (s.h) { ops.push({ k: 'rect', x: MX, y: y - 11, w: RIGHT - MX, h: 17, gray: 0.92 }); text(MX + 6, s.h, 11, { bold: true }); y += 20; }
      (s.rows || []).forEach(function (r) {
        text(MX + 6, r[0], 10, { bold: r[2] }); if (r[1]) text(RIGHT - 6, r[1], r[2] ? 11 : 10, { bold: r[2], align: 'r' });
        y += r[2] ? 17 : 15;
      });
      (s.text || []).forEach(function (t) { wrap(t, 9, RIGHT - MX - 12).forEach(function (l) { text(MX + 6, l, 9, { gray: true }); y += 12; }); });
      if (s.table) y = table(s.table, y);
    });
    y = Math.max(y + 10, 0);
    ops.push({ k: 'line', x1: MX, y1: y, x2: RIGHT, y2: y, w: 0.5 }); y += 14;
    text(MX, DISCLAIMER, 9, { gray: true });
    text(RIGHT, 'Paie Assmat', 9, { gray: true, align: 'r' });
    return ops;

    function table(t, y0) {
      var size = 8.5, i;
      var R = [0, 160, 205, 275, 345, 415, 490, RIGHT - 4];
      ops.push({ k: 'rect', x: MX, y: y0 - 11, w: RIGHT - MX, h: 17, gray: 0.92 });
      var yy = y0;
      for (i = 0; i < t.cols.length; i++) ops.push({ k: 'text', x: i === 0 ? MX + 6 : R[i], y: yy, size: size, bold: true, align: i === 0 ? 'l' : 'r', gray: 0, text: t.cols[i] });
      yy += 18;
      t.rows.concat([t.total]).forEach(function (r, ri) {
        var tot = ri === t.rows.length;
        if (tot) ops.push({ k: 'line', x1: MX, y1: yy - 11, x2: RIGHT, y2: yy - 11, w: 0.5 });
        if (r.length === 2) {
          ops.push({ k: 'text', x: MX + 6, y: yy, size: size, bold: false, align: 'l', gray: 0, text: r[0] });
          ops.push({ k: 'text', x: R[1] + 0, y: yy, size: size, bold: false, align: 'r', gray: GRAY, text: r[1] });
        } else {
          for (i = 0; i < r.length; i++) if (r[i] !== '') ops.push({ k: 'text', x: i === 0 ? MX + 6 : R[i], y: yy, size: size, bold: tot, align: i === 0 ? 'l' : 'r', gray: 0, text: r[i] });
        }
        yy += 17;
      });
      return yy;
    }
  }

  /* ---------- PDF ---------- */
  function esc(s) { return s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, function (c) { return '\\' + ('00' + c.charCodeAt(0).toString(8)).slice(-3); }); }
  function f(n) { return String(Math.round(n * 100) / 100); }
  function pdf(ops) {
    var s = '', gray = -1;
    function setGray(g) { if (g !== gray) { s += g + ' g\n'; gray = g; } }
    ops.forEach(function (o) {
      if (o.k === 'rect') { setGray(o.gray); s += f(o.x) + ' ' + f(PH - o.y - o.h) + ' ' + f(o.w) + ' ' + f(o.h) + ' re f\n'; }
      else if (o.k === 'line') { s += '0 G ' + o.w + ' w ' + f(o.x1) + ' ' + f(PH - o.y1) + ' m ' + f(o.x2) + ' ' + f(PH - o.y2) + ' l S\n'; }
      else {
        var t = winAnsi(o.text), x = o.align === 'r' ? o.x - width(t, o.size) : o.x;
        setGray(o.gray);
        s += 'BT /' + (o.bold ? 'F2' : 'F1') + ' ' + o.size + ' Tf ' + f(x) + ' ' + f(PH - o.y) + ' Td (' + esc(t) + ') Tj ET\n';
      }
    });
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + s.length + ' >>\nstream\n' + s + 'endstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    var out = '%PDF-1.4\n', offs = [], i;
    for (i = 0; i < objs.length; i++) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
  function toBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var b = '', i; for (i = 0; i < bytes.length; i += 8192) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return root.btoa(b);
  }

  /* ---------- image PNG (navigateur) ---------- */
  function drawCanvas(ops, canvas) {
    var k = PNG_W / PW; canvas.width = PNG_W; canvas.height = PNG_H;
    var c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, PNG_W, PNG_H);
    ops.forEach(function (o) {
      var g = Math.round(o.gray * 255);
      if (o.k === 'rect') { var v = Math.round(o.gray * 255); c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; c.fillRect(o.x * k, o.y * k, o.w * k, o.h * k); }
      else if (o.k === 'line') { c.strokeStyle = '#000'; c.lineWidth = o.w * k; c.beginPath(); c.moveTo(o.x1 * k, o.y1 * k); c.lineTo(o.x2 * k, o.y2 * k); c.stroke(); }
      else {
        c.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; c.textAlign = o.align === 'r' ? 'right' : 'left'; c.textBaseline = 'alphabetic';
        c.font = (o.bold ? 'bold ' : '') + (o.size * k) + 'px Helvetica, Arial, sans-serif';
        c.fillText(o.text.replace(/[\u202f\u00a0]/g, ' '), o.x * k, o.y * k);
      }
    });
    return canvas;
  }

  root.Recap = { PNG_W: PNG_W, PNG_H: PNG_H, DISCLAIMER: DISCLAIMER, money: money, num: num, fileName: fileName, winAnsi: winAnsi, width: width, wrap: wrap,
    monthModel: monthModel, yearModel: yearModel, layout: layout, pdf: pdf, toBase64: toBase64, drawCanvas: drawCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Recap;
})(typeof window !== 'undefined' ? window : globalThis);
