// F10 : récapitulatif PDF et image (TP1 à TP3, TP6). Spec : docs/specs/03-F6-F10-F12.md, FR-F10-1 à 8.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const E = require('../app/src/main/assets/engine.js');
global.Engine = E;
const R = require('../app/src/main/assets/recap.js');
const ref = E.parseExport(fs.readFileSync(path.join(__dirname, 'fixtures', 'backup-android-1.1.0.json'), 'utf8')).data;
const have = (c) => cp.spawnSync('which', [c]).status === 0;
const P = Object.assign({}, ref.profile, { naissance: '1985-04-02', adresse: '12 rue des Lilas', ville: 'Antony', email: 'secret@example.org', telephone: '06 98 76 54 32' });
const CH = { id: 'e1', nom: 'Martin', prenom: 'Zéphyrine', naissance: '2025-03-01' };
const sep = ref.months.find(m => m.key === 'c1|2026-09');
const ctx = (extra) => Object.assign({ P, CH, ST: {} }, extra);
const normal = (t) => t.replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ');
function pdfText(bytes) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-')), 'r.pdf'); fs.writeFileSync(f, bytes);
  return { file: f, text: normal(cp.execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' })) };
}
const monthPdf = (c) => R.pdf(R.layout(R.monthModel(sep, ref.payments, c)));

test('TP1 FR-F10-2/3 : texte du PDF mensuel = montants + avertissement, sans identité', { skip: !have('pdftotext') }, () => {
  const { text } = pdfText(monthPdf(ctx()));
  for (const s of ['Septembre 2026', '18', '164', '902,00 €', '119,00 €', '1 021,00 €', 'Montants indicatifs, pas un avis juridique', '971,50 €', '49,50 €'])
    assert.ok(text.includes(s), 'manque : ' + s);
  for (const s of ['Zéphyrine', 'Martin', '12 rue des Lilas', 'Antony', '1985', '2025-03', '2025', 'secret@example.org', '06 98 76 54 32', 'Dupont', 'Camille', 'undefined', 'NaN'])
    assert.ok(!text.includes(s), 'ne devrait pas apparaître : ' + s);
});

test('TP1 FR-F10-3 : le prénom de l’enfant n’apparaît que si l’option de partage est cochée', { skip: !have('pdftotext') }, () => {
  assert.ok(pdfText(monthPdf(ctx({ ST: { shareChild: true } }))).text.includes('Zéphyrine'));
  assert.ok(!pdfText(monthPdf(ctx({ ST: { shareChild: false } }))).text.includes('Zéphyrine'));
});

test('TP6 FR-F10-8 : nom de l’assistante présent ; champ vide ou blanc : aucune ligne', { skip: !have('pdftotext') }, () => {
  const withName = pdfText(monthPdf(ctx({ P: Object.assign({}, P, { nannyName: 'Mme Dupont' }) }))).text;
  assert.ok(withName.includes('Mme Dupont'));
  for (const v of [undefined, '', '   ']) {
    const t = pdfText(monthPdf(ctx({ P: Object.assign({}, P, { nannyName: v }) }))).text;
    assert.ok(!/Assistante maternelle/.test(t) && !t.includes('undefined'), 'valeur ' + JSON.stringify(v));
  }
  const ops = R.layout(R.monthModel(sep, ref.payments, ctx({ P: Object.assign({}, P, { nannyName: 'Mme Dupont' }) })));
  assert.ok(ops.some(o => o.k === 'text' && o.text.includes('Mme Dupont')), 'même contenu pour l’image (opérations de dessin)');
  // une sauvegarde 1.3.0 (profil sans nannyName) se relit sans erreur
  assert.doesNotThrow(() => R.monthModel(sep, ref.payments, { P: ref.profile, CH, ST: ref.settings }));
});

test('TP2 FR-F10-1 / NFR-X-3 : PDF valide, une page, A4, < 50 Ko, < 1 s', { skip: !(have('qpdf') && have('pdfinfo')) }, () => {
  const t0 = Date.now(); const bytes = monthPdf(ctx()); const ms = Date.now() - t0;
  const { file } = pdfText(bytes);
  assert.equal(cp.spawnSync('qpdf', ['--check', file]).status, 0, 'qpdf --check');
  const info = cp.execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  assert.match(info, /Pages:\s+1\b/); assert.match(info, /Page size:\s+595(\.\d+)? x 84[12](\.\d+)? pts \(A4\)/);
  assert.ok(bytes.length < 50 * 1024, 'taille ' + bytes.length); assert.ok(ms < 1000, 'durée ' + ms);
  assert.ok(!/\/JavaScript|\/JS|\/OpenAction|\/AA|\/Launch|\/URI/.test(Buffer.from(bytes).toString('latin1')), 'aucun contenu actif');
  assert.ok(!/\/Author|\/Creator|\/Producer/.test(Buffer.from(bytes).toString('latin1')), 'aucune métadonnée d’identité');
});

test('TP3 FR-F10-4/6 : PDF annuel (12 lignes, totaux) et noms de fichier', { skip: !(have('pdftotext') && have('qpdf')) }, () => {
  const y = E.yearSummary(ref.months, ref.payments, 2026, '2026-09-07');
  const bytes = R.pdf(R.layout(R.yearModel(y, ctx({ P: Object.assign({}, P, { nannyName: 'Mme Dupont' }) }))));
  const { text, file } = pdfText(bytes);
  assert.equal(cp.spawnSync('qpdf', ['--check', file]).status, 0);
  assert.match(cp.execFileSync('pdfinfo', [file], { encoding: 'utf8' }), /Pages:\s+1\b/);
  for (const m of E.MONTHS) assert.ok(text.toLowerCase().includes(m), 'mois ' + m);
  for (const s of ['2026', '40', '364,0', '2 002,00 €', '224,00 €', '2 226,00 €', '1 021,00 €', '1 205,00 €', 'Mme Dupont', 'Montants indicatifs, pas un avis juridique'])
    assert.ok(text.includes(s), 'manque : ' + s);
  assert.match(text, /2 mois non enregistrés/);
  assert.equal(R.fileName('pdf', 2026, 9), 'paie-assmat-2026-09.pdf');
  assert.equal(R.fileName('pdf', 2026), 'paie-assmat-2026.pdf');
  assert.equal(R.fileName('png', 2026, 9), 'paie-assmat-2026-09.png');
  assert.equal(R.fileName('png', 2026), 'paie-assmat-2026.png');
});

test('FR-F10-2 mise en page : tout tient dans la page, caractères accentués et € encodés en WinAnsi', () => {
  for (const ops of [R.layout(R.monthModel(sep, ref.payments, ctx())), R.layout(R.yearModel(E.yearSummary(ref.months, ref.payments, 2026, '2026-09-07'), ctx()))]) {
    assert.ok(ops.every(o => o.k !== 'text' || (o.y < 810 && o.x >= 0)), 'dans la page');
    assert.ok(ops.some(o => o.k === 'text'));
  }
  assert.equal(R.winAnsi('é€—·×'), '\xe9\x80\x97\xb7\xd7');
  assert.equal(R.winAnsi('a b c'), 'a b c'.replace(/ /g, ' '));
  assert.equal(R.winAnsi('日'), '?');
  assert.equal(R.money(1021), '1 021,00 €'); assert.equal(R.money(-5.5), '-5,50 €'); assert.equal(R.money(0), '0,00 €');
});

test('Robustesse : mois sans paiement, mois à zéro jour, très longue valeur de nom', { skip: !have('qpdf') }, () => {
  const empty = Object.assign({}, sep, { mensu: 0, heures: 0, salaire: 0, accueil: 0, entretien: 0, total: 0, cp: [], abs: [], cpOuvres: 0, cpo: 0 });
  for (const c of [ctx(), ctx({ P: Object.assign({}, P, { nannyName: 'X'.repeat(300) }) })]) {
    const bytes = R.pdf(R.layout(R.monthModel(empty, [], c)));
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-')), 'e.pdf'); fs.writeFileSync(f, bytes);
    assert.equal(cp.spawnSync('qpdf', ['--check', f]).status, 0);
  }
  const t = R.layout(R.monthModel(empty, [], ctx())).filter(o => o.k === 'text').map(o => o.text).join('|');
  assert.ok(/Aucun versement enregistré/.test(t));
});

test('TR1 NFR-X-2 : poids HTML+CSS+JS < 110 Ko ; recap.js chargé, précaché (SW) et embarqué iOS', () => {
  const dir = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
  const size = ['index.html', 'style.css', 'engine.js', 'recap.js', 'db.js', 'platform.js', 'app.js', 'sw.js'].reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(size < 110 * 1024, 'poids ' + size);
  assert.ok(fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes('<script src="recap.js"></script>'));
  assert.ok(/'recap\.js'/.test(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')));
  const www = fs.mkdtempSync(path.join(os.tmpdir(), 'www-'));
  cp.execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build-www.js'), www], { stdio: 'ignore' });
  assert.ok(fs.existsSync(path.join(www, 'recap.js')));
  assert.ok(/exportBinary/.test(fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'java', 'com', 'bilel', 'paieassmat', 'MainActivity.java'), 'utf8')), 'pont Android exportBinary');
});
