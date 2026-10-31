const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const E = require('../app/src/main/assets/engine.js');
const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');

// T2 (FR-9, NFR-6) : une sauvegarde faite sur Android se relit et se recalcule à l'identique sur toute cible.
test('T2 sauvegarde de référence : montants recalculés identiques aux montants stockés', () => {
  const p = E.parseExport(fs.readFileSync(path.join(__dirname, 'fixtures', 'backup-android-1.1.0.json'), 'utf8'));
  assert.ok(p.ok, p.error);
  const c = p.data.contracts[0];
  const cp = new Set(p.data.days.filter(d => d.type === 'cp').map(d => d.date));
  const abs = new Set(p.data.days.filter(d => d.type === 'abs').map(d => d.date));
  assert.ok(p.data.months.length >= 2);
  p.data.months.forEach(m => {
    const r = E.computeMonth({ year: m.year, month: m.month, rate: m.rate, indem: m.indem, hpd: m.hpd, hsup: m.hsup, start: c.start, unpaid: m.unpaid || 0, cp, abs });
    assert.equal(r.mensu, m.mensu, m.key + ' mensu');
    assert.equal(r.heures, m.heures, m.key + ' heures');
    assert.equal(r.salaire, m.salaire, m.key + ' salaire');
    assert.equal(r.entretien, m.entretien, m.key + ' entretien');
    assert.equal(r.total, m.total, m.key + ' total');
  });
});

test('T2b aller-retour export/import identique', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'backup-android-1.1.0.json'), 'utf8');
  const p = E.parseExport(raw);
  const again = E.parseExport(JSON.stringify(E.buildExport(p.data, p.exportedAt)));
  assert.deepEqual(again.data, p.data);
});

// T5 (NFR-1) : poids des assets web, non compressés, borne supérieure du transfert.
test('T5 poids des assets web < 150 Ko', () => {
  const total = fs.readdirSync(assets).reduce((a, f) => a + fs.statSync(path.join(assets, f)).size, 0);
  assert.ok(total < 150 * 1024, 'total ' + total + ' octets');
});

// T12 (FR-13) : une seule version, la même partout.
test('T12 version de l\'appli identique dans platform.js et build.gradle', () => {
  const js = fs.readFileSync(path.join(assets, 'platform.js'), 'utf8');
  const gradle = fs.readFileSync(path.join(__dirname, '..', 'app', 'build.gradle'), 'utf8');
  const v = /APP_VERSION\s*=\s*'([^']+)'/.exec(js);
  const g = /versionName\s+"([^"]+)"/.exec(gradle);
  assert.ok(v && g, 'versions introuvables');
  assert.equal(v[1], g[1]);
});

test('T12b le cache du service worker porte la version', () => {
  const sw = fs.readFileSync(path.join(assets, 'sw.js'), 'utf8');
  const js = fs.readFileSync(path.join(assets, 'platform.js'), 'utf8');
  const v = /APP_VERSION\s*=\s*'([^']+)'/.exec(js)[1];
  assert.ok(sw.includes("'" + v + "'") || sw.includes('"' + v + '"'), 'sw.js doit référencer ' + v);
});

test('T3b le service worker pré-cache tous les fichiers de l\'appli', () => {
  const sw = fs.readFileSync(path.join(assets, 'sw.js'), 'utf8');
  ['index.html', 'style.css', 'engine.js', 'db.js', 'platform.js', 'app.js', 'manifest.webmanifest'].forEach(f => assert.ok(sw.includes(f), f));
});
