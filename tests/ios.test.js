// Phase 3 (iOS) : adaptateur SQLite/Preferences/Fichiers/Partage, testé avec un faux Capacitor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const E = require('../app/src/main/assets/engine.js');
const fake = require('./helpers/fake-capacitor.js');
const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const root = path.join(__dirname, '..');
const fixture = E.parseExport(fs.readFileSync(path.join(__dirname, 'fixtures', 'backup-android-1.1.0.json'), 'utf8')).data;
const mem = () => { const m = new Map(); return { get: k => (m.has(k) ? m.get(k) : undefined), set: (k, v) => m.set(k, v) }; };
function shell(store, platform) {
  global.Engine = E;
  const win = { calls: [], onExportResult(ok) { this.calls.push(ok); } };
  const cap = fake(store, platform || 'ios');
  const { create } = require(path.join(assets, 'platform-ios.js'));
  return { win, cap, sh: create(cap, win) };
}

test('I8 inactif hors iOS (web, Android) : aucune surcharge', () => {
  assert.equal(shell(mem(), 'web').sh.active, false);
  assert.equal(shell(mem(), 'android').sh.active, false);
  assert.equal(shell(mem(), 'ios').sh.active, true);
});

test('I1 FR-6 : API DB identique (put/get/all/del, clé hors ligne, tx, replaceDays, clearAll)', async () => {
  const { sh } = shell(mem()); const DB = sh.DB; await sh.ready; await DB.open();
  await DB.put('children', { id: 'e2', nom: 'B' }); await DB.put('children', { id: 'e1', nom: 'A' });
  assert.deepEqual((await DB.all('children')).map(x => x.id), ['e1', 'e2'], 'ordre par clé');
  assert.deepEqual(await DB.get('children', 'e1'), { id: 'e1', nom: 'A' });
  assert.equal(await DB.get('children', 'zz'), undefined);
  await DB.put('state', { a: 1 }, 'main'); assert.deepEqual(await DB.get('state', 'main'), { a: 1 });
  await DB.del('children', 'e1'); assert.equal((await DB.all('children')).length, 1);
  await DB.tx('days', 'readwrite', t => { t.objectStore('days').put({ key: 'c1|2026-10-01', date: '2026-10-01', type: 'cp' }); });
  assert.equal((await DB.all('days')).length, 1);
  await DB.replaceDays([{ key: 'c1|2026-11-02', date: '2026-11-02', type: 'abs' }]);
  assert.deepEqual((await DB.all('days')).map(x => x.key), ['c1|2026-11-02']);
  await DB.clearAll(); assert.equal((await DB.all('days')).length, 0); assert.equal(await DB.get('state', 'main'), undefined);
});

test('I2 FR-6/9, NFR-6 : restauration puis export identiques aux données de la sauvegarde (replace, merge, idempotence)', async () => {
  const { sh } = shell(mem()); const DB = sh.DB; await sh.ready; await DB.open();
  await DB.restore(fixture, 'replace');
  assert.deepEqual(await DB.dump(), fixture);
  await DB.restore(fixture, 'merge'); assert.deepEqual(await DB.dump(), fixture, 'fusion idempotente');
  await DB.put('profile', { id: 'main', nom: 'Autre', prenom: 'X' });
  await DB.restore(fixture, 'merge'); assert.equal((await DB.dump()).profile.nom, 'Autre', 'profil existant conservé en fusion');
});

test('I3 FR-9 : montants recalculés depuis la base iOS = montants stockés', async () => {
  const { sh } = shell(mem()); const DB = sh.DB; await sh.ready; await DB.open(); await DB.restore(fixture, 'replace');
  const d = await DB.dump(), c = d.contracts[0];
  const cps = new Set(d.days.filter(x => x.type === 'cp').map(x => x.date)), abs = new Set(d.days.filter(x => x.type === 'abs').map(x => x.date));
  d.months.forEach(m => {
    const r = E.computeMonth({ year: m.year, month: m.month, rate: m.rate, indem: m.indem, hpd: m.hpd, hsup: m.hsup, start: c.start, unpaid: m.unpaid || 0, cp: cps, abs });
    assert.equal(r.total, m.total, m.key);
  });
});

test('I4 FR-6 : les données survivent à la réouverture de l\'appli', async () => {
  const store = mem();
  let a = shell(store); await a.sh.ready; await a.sh.DB.open(); await a.sh.DB.restore(fixture, 'replace');
  const b = shell(store); await b.sh.ready; await b.sh.DB.open();
  assert.deepEqual(await b.sh.DB.dump(), fixture);
});

test('I5 FR-12 : la date de dernière sauvegarde est dans Preferences, hors base métier', async () => {
  const store = mem();
  let a = shell(store); await a.sh.ready; await a.sh.DB.open();
  assert.equal(a.sh.prefs.get('lastBackupAt'), null);
  a.sh.prefs.set('lastBackupAt', '2026-10-01T00:00:00Z');
  assert.equal(a.sh.prefs.get('lastBackupAt'), '2026-10-01T00:00:00Z', 'lecture synchrone');
  await a.sh.DB.clearAll();
  const b = shell(store); await b.sh.ready;
  assert.equal(b.sh.prefs.get('lastBackupAt'), '2026-10-01T00:00:00Z', 'survit à la base vide');
  assert.equal(store.get('pref.paie.lastBackupAt'), '2026-10-01T00:00:00Z');
});

test('I6 FR-7 : export = fichier dans le cache + feuille de partage ; annulation signalée', async () => {
  const store = mem(); const { sh, cap, win } = shell(store);
  await sh.files.exportJSON('paie.json', '{"a":1}'); await new Promise(r => setImmediate(r));
  assert.ok(cap.__log.includes('writeFile:CACHE:paie.json'));
  assert.ok(cap.__log.some(l => l.startsWith('share:') && l.includes('file:///cache/paie.json')));
  assert.deepEqual(win.calls, [true]);
  store.set('share.cancel', '1');
  await sh.files.exportJSON('paie2.json', '{}'); await new Promise(r => setImmediate(r));
  assert.deepEqual(win.calls, [true, false]);
});

test('I7 partage de texte via la feuille de partage iOS', async () => {
  const { sh, cap } = shell(mem()); assert.equal(sh.share.available(), true);
  sh.share.text('Bonjour'); await new Promise(r => setImmediate(r));
  assert.ok(cap.__log.some(l => l.startsWith('share:') && l.includes('Bonjour')));
});

test('I9 NFR-10 : code propre à une cible < 300 lignes', () => {
  const lines = f => fs.readFileSync(path.join(assets, f), 'utf8').split('\n').length;
  assert.ok(lines('platform-ios.js') < 300, 'platform-ios.js ' + lines('platform-ios.js'));
  assert.ok(lines('platform.js') < 300, 'platform.js ' + lines('platform.js'));
});

test('I10 FR-13, D1 : package.json et capacitor.config.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const ver = fs.readFileSync(path.join(assets, 'platform.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
  assert.equal(pkg.version, ver);
  ['@capacitor/core', '@capacitor/ios', '@capacitor/preferences', '@capacitor/filesystem', '@capacitor/share', '@capacitor-community/sqlite'].forEach(d => assert.ok(pkg.dependencies[d], d));
  assert.ok(pkg.devDependencies['@capacitor/cli']);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  assert.equal(cfg.appId, 'com.bilel.paieassmat'); assert.equal(cfg.webDir, 'www');
  assert.ok(!cfg.server || !cfg.server.url, 'aucun contenu externe dans la WebView');
});

test('I11 build www iOS : tout est local, platform-ios.js chargé entre db.js et platform.js, sans service worker', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'www-'));
  cp.execFileSync('node', [path.join(root, 'scripts', 'build-www.js'), out]);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const order = ['engine.js', 'db.js', 'platform-ios.js', 'platform.js', 'app.js'].map(s => html.indexOf('src="' + s + '"'));
  assert.ok(order.every(i => i >= 0) && order.every((v, i) => !i || v > order[i - 1]), 'ordre des scripts ' + order);
  assert.ok(!fs.existsSync(path.join(out, 'sw.js')) && !fs.existsSync(path.join(out, 'manifest.webmanifest')));
  (html.match(/(?:src|href)="([^"]+)"/g) || []).map(s => s.replace(/^(src|href)="|"$/g, '')).forEach(f => assert.ok(fs.existsSync(path.join(out, f)), f));
  assert.ok(!/https?:\/\//.test(html), 'aucune URL externe dans index.html');
});

test('I12 NFR-4, D6 : script CI iOS fixe le déploiement à iOS 15 et build sur simulateur', () => {
  const s = fs.readFileSync(path.join(root, 'scripts', 'ios-ci.sh'), 'utf8');
  assert.ok(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*15\.0/.test(s) || /15\.0/.test(s));
  assert.ok(/xcodebuild/.test(s) && /iphonesimulator/.test(s));
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'build-ios.yml'), 'utf8');
  assert.ok(/macos-/.test(wf) && /workflow_dispatch/.test(wf) && !/^\s*push:/m.test(wf), 'manuel : ne rend pas main rouge');
});
