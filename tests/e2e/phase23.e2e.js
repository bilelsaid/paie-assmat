// Phases 2-3 : CSP sans violation (web) ; appli complète sur le build www iOS avec un faux Capacitor (SQLite/Preferences/Partage).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const fake = require('../helpers/fake-capacitor.js');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const serve = (dir, port) => new Promise(r => {
  const s = http.createServer((q, res) => {
    let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    try { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(path.join(dir, p))); } catch (e) { res.writeHead(404); res.end(); }
  }).listen(port, () => r(s));
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const assets = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const fixture = path.join(__dirname, '..', 'fixtures', 'backup-android-1.1.0.json');
const cspSpy = () => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); };
const fakeInit = `(${function (mk) {
  var ls = window.localStorage;
  window.Capacitor = mk({ get: function (k) { var v = ls.getItem('fake.' + k); return v === null ? undefined : v; }, set: function (k, v) { ls.setItem('fake.' + k, v); } }, 'ios');
}.toString()})(${fake.toString()})`;

(async () => {
  const b = await chromium.launch();
  // ---- A. web : CSP
  const sA = await serve(assets, 8781);
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(cspSpy);
    await pg.goto('http://localhost:8781/'); await pg.waitForSelector('#onb:not([hidden])');
    await pg.evaluate(async () => { await DB.put('profile', { id: 'main', nom: 'D', prenom: 'C' }); await DB.put('children', { id: 'e1', nom: 'D', prenom: 'A', naissance: '2025-03-01' });
      await DB.put('contracts', { id: 'c1', childId: 'e1', type: 'mensualise52', start: '2026-09-07', taux: 5.5, indemnite: 7, hpd: 9, hsup: 2, enfantsCharge: 0 }); await DB.put('settings', { id: 'main', migrated: true, onboardingDone: true, createdAt: '2026-10-31' }); });
    await pg.reload(); await pg.waitForSelector('#cal');
    for (const t of ['saisir', 'conges', 'paiements', 'reglages', 'mois']) await pg.click('[data-tab=' + t + ']');
    await pg.click('[data-tab=reglages]'); await pg.click('#priv-open');
    ok((await pg.evaluate(() => window.__csp)).length === 0, 'AG7 web : 0 violation de CSP sur les 5 écrans');
    ok(errs.length === 0, 'web : aucune erreur JS ' + errs.join('|'));
    await ctx.close(); }
  sA.close();

  // ---- B. iOS : build www + faux Capacitor
  const www = fs.mkdtempSync(path.join(os.tmpdir(), 'www-'));
  cp.execFileSync('node', [path.join(__dirname, '..', '..', 'scripts', 'build-www.js'), www]);
  const sB = await serve(www, 8782);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(cspSpy); await pg.addInitScript(fakeInit);
  const U = 'http://localhost:8782/';
  await pg.goto(U); await pg.waitForSelector('#onb:not([hidden])');
  ok(await pg.evaluate(() => Platform.target === 'ios'), 'IOS cible détectée : ios');
  ok(await pg.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0), 'IOS aucun service worker');
  // restauration depuis la sauvegarde de référence (Android 1.1.0) via le sélecteur de fichier
  const raw = fs.readFileSync(fixture, 'utf8');
  await pg.evaluate(async r => { await DB.open(); const p = Engine.parseExport(r); await DB.restore(p.data, 'replace'); }, raw);
  await pg.reload(); await pg.waitForSelector('#cal');
  const sql = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake.sql'))).length);
  ok(sql > 10, 'IOS FR-6 : données écrites dans SQLite (faux) : ' + sql + ' lignes');
  ok(await pg.evaluate(async () => (await indexedDB.databases()).filter(d => d.name === 'paie-assmat').length === 0), 'IOS FR-6 : aucune base IndexedDB créée');
  await pg.click('[data-tab=paiements]');
  const txt = await pg.textContent('#screen');
  ok(/1\s?021/.test(txt) || /1021/.test(txt), 'IOS FR-9 : le total de septembre (1 021,00 €) apparaît après restauration iOS');
  // réouverture : mêmes données, pas d'assistant
  await pg.reload(); await pg.waitForSelector('#cal');
  ok(!(await pg.isVisible('#onb')), 'IOS FR-6 : réouverture sans perte, pas d\'assistant');
  // export → Filesystem + Share, date de sauvegarde en Preferences
  await pg.click('[data-tab=reglages]'); await pg.click('#bk-exp');
  await pg.waitForFunction(() => /Sauvegarde exportée/.test(document.getElementById('bk-msg').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/Sauvegarde exportée/.test(await pg.textContent('#bk-msg')), 'IOS FR-7 : export via feuille de partage');
  ok(await pg.evaluate(() => Capacitor.__log.some(l => l.startsWith('writeFile:CACHE:paie-assmat-')) && Capacitor.__log.some(l => l.startsWith('share:'))), 'IOS FR-7 : fichier écrit puis partagé');
  ok(await pg.evaluate(() => !!localStorage.getItem('fake.pref.paie.lastBackupAt')), 'IOS FR-12 : date de sauvegarde dans Preferences');
  ok(!(await pg.isVisible('#persist-info')) || /oui/i.test(await pg.textContent('#persist-info')), 'IOS FR-4/persistance : toujours persistant');
  ok(!(await pg.isVisible('#print-month')), 'IOS pas de bouton Imprimer (cible non web)');
  // base effacée mais Preferences conservées → alerte de restauration (FR-12)
  await pg.evaluate(() => localStorage.removeItem('fake.sql')); await pg.reload();
  await pg.waitForSelector('#restore-first', { timeout: 5000 }).catch(() => {});
  ok(await pg.isVisible('#restore-first') && !(await pg.isVisible('#onb')), 'IOS FR-12 : alerte avant l\'assistant');
  await pg.setInputFiles('#bk-file', fixture); await pg.waitForSelector('#im-replace'); await pg.click('#im-replace');
  await pg.waitForSelector('#cal', { timeout: 5000 }).catch(() => {});
  ok(await pg.isVisible('#cal'), 'IOS FR-7/FR-12 : réimport depuis Fichiers (sélecteur) → appli prête');
  // version
  await pg.click('[data-tab=reglages]');
  const ver = fs.readFileSync(path.join(assets, 'platform.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
  ok((await pg.textContent('#app-version')).includes(ver), 'IOS FR-13 : version ' + ver);
  ok((await pg.evaluate(() => window.__csp)).length === 0, 'IOS 0 violation de CSP');
  ok(errs.length === 0, 'IOS aucune erreur JS ' + errs.join('|'));
  await b.close(); sB.close();
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
