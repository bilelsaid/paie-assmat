// Phase 1 : PWA, interface Platform, persistance, confidentialité, mise en page PC, clavier, alerte de base vide.
// Lancer : node tests/e2e/phase1.e2e.js (Playwright requis)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(root, p)); r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); r.end(b); }
  catch (e) { r.writeHead(404); r.end(); }
});
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const U = 'http://localhost:8766/';
const seed = pg => pg.evaluate(async () => {
  await DB.put('profile', { id: 'main', nom: 'Dupont', prenom: 'Camille' });
  await DB.put('children', { id: 'e1', nom: 'Dupont', prenom: 'Alex', naissance: '2025-03-01' });
  await DB.put('contracts', { id: 'c1', childId: 'e1', type: 'mensualise52', start: '2026-09-07', taux: 5.5, indemnite: 7, hpd: 9, hsup: 2, enfantsCharge: 0 });
  await DB.put('settings', { id: 'main', migrated: true, onboardingDone: true, createdAt: '2026-10-31' });
});
(async () => {
  await new Promise(r => srv.listen(8766, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
  const pg = await ctx.newPage(); const errs = [], reqs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('request', q => reqs.push(q.url()));
  await pg.clock.setFixedTime(new Date('2026-10-31T10:00:00'));
  await pg.goto(U); await pg.waitForSelector('#onb:not([hidden])');
  await seed(pg); await pg.reload(); await pg.waitForSelector('#cal');

  // T3 : hors ligne après le premier chargement
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload(); await pg.waitForSelector('#cal');
  ok(await pg.evaluate(() => !!navigator.serviceWorker.controller), 'T3 service worker actif et contrôle la page');
  await ctx.setOffline(true);
  await pg.reload(); await pg.waitForSelector('#cal', { timeout: 8000 }).catch(() => {});
  ok(await pg.isVisible('#cal'), 'T3 hors ligne : l\'appli s\'ouvre');
  ok((await pg.textContent('#pay')).includes('TOTAL À VERSER'), 'T3 hors ligne : le calcul s\'affiche');
  const manifest = await pg.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()).catch(() => null));
  ok(manifest && manifest.display === 'standalone' && manifest.icons && manifest.icons.length > 0, 'T3 manifeste PWA installable (standalone + icône)');
  await ctx.setOffline(false);

  // T4 : aucune requête hors origine
  for (const t of ['saisir', 'conges', 'paiements', 'reglages', 'mois']) await pg.click('[data-tab=' + t + ']');
  const ext = reqs.filter(u => !u.startsWith(U) && !u.startsWith('data:') && !u.startsWith('blob:'));
  ok(ext.length === 0, 'T4 0 requête hors origine ' + ext.join(','));

  // T6, T8, T12 : réglages
  await pg.click('[data-tab=reglages]');
  await pg.waitForFunction(() => /stockage persistant\s*:\s*(oui|non)/i.test(document.getElementById('persist-info').textContent), null, { timeout: 5000 }).catch(() => {});
  const persist = await pg.textContent('#persist-info');
  ok(/stockage persistant\s*:\s*(oui|non)/i.test(persist), 'T6 stockage persistant affiché : ' + persist.trim());
  await pg.click('#priv-open');
  ok((await pg.textContent('#privacy')).includes('ne quitte jamais'), 'T8 confidentialité affichée');
  await ctx.setOffline(true);
  await pg.click('#priv-open'); await pg.click('#priv-open');
  ok(await pg.isVisible('#privacy'), 'T8 confidentialité disponible hors ligne');
  await ctx.setOffline(false);
  const ver = fs.readFileSync(path.join(root, 'platform.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/);
  ok(ver && (await pg.textContent('#app-version')).includes(ver[1]), 'T12 version affichée dans Réglages');

  // T9 : deux colonnes à 1280 px ; impression
  await pg.click('[data-tab=mois]'); await pg.waitForSelector('#cal');
  const a = await pg.locator('#cal').boundingBox(), r = await pg.locator('#recap').boundingBox();
  ok(r.x > a.x + a.width * 0.5, 'T9 deux colonnes : récap à droite du calendrier (x ' + Math.round(a.x) + ' / ' + Math.round(r.x) + ')');
  await pg.emulateMedia({ media: 'print' });
  ok(!(await pg.isVisible('#tabs')) && !(await pg.isVisible('#share-panel')) && await pg.isVisible('#recap') && await pg.isVisible('#pay'), 'T9 impression : récap et paie seuls');
  await pg.emulateMedia({ media: 'screen' });
  ok(await pg.isVisible('#print-month'), 'T9 bouton Imprimer');

  // T10 : clavier
  await pg.click('[data-tab=mois]');
  await pg.focus('[data-tab=mois]');
  for (let i = 0; i < 2; i++) await pg.keyboard.press('Tab'); // mois → À saisir → Congés
  ok(await pg.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.tab === 'conges'), 'T10 Tab parcourt les onglets');
  await pg.keyboard.press('Enter');
  ok((await pg.textContent('#screen')).includes('Droits à congés'), 'T10 Entrée ouvre l\'écran Congés');
  await pg.click('[data-tab=mois]'); await pg.waitForSelector('#cal');
  const day = pg.locator('#cal button:not([disabled])').nth(10); await day.focus();
  const before = await day.getAttribute('class'); await pg.keyboard.press('Enter');
  ok((await pg.locator('#cal button:not([disabled])').nth(10).getAttribute('class')) !== before, 'T10 Entrée marque un jour au clavier');

  // T11 : base vide + sauvegarde déjà faite
  await pg.evaluate(async () => { await DB.clearAll(); localStorage.setItem('paie.lastBackupAt', '2026-10-01T00:00:00Z'); });
  await pg.reload(); await pg.waitForSelector('#restore-first', { timeout: 5000 }).catch(() => {});
  ok(await pg.isVisible('#restore-first') && !(await pg.isVisible('#onb')), 'T11 alerte de restauration avant l\'assistant');
  await pg.setInputFiles('#bk-file', path.join(__dirname, '..', 'fixtures', 'backup-android-1.1.0.json'));
  await pg.waitForSelector('#im-replace'); await pg.click('#im-replace');
  await pg.waitForSelector('#cal', { timeout: 5000 }).catch(() => {});
  ok(await pg.isVisible('#cal') && (await pg.textContent('#pay')).includes('TOTAL'), 'T11 restauration depuis l\'écran d\'alerte → appli prête');
  await pg.evaluate(async () => { await DB.clearAll(); }); await pg.reload(); await pg.waitForSelector('#restore-first');
  await pg.click('#restore-skip'); await pg.waitForSelector('#onb:not([hidden])');
  ok(true, 'T11 « continuer sans » ouvre l\'assistant');
  await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForSelector('#onb:not([hidden])');
  ok(!(await pg.isVisible('#restore-first')), 'T11 pas d\'alerte sans sauvegarde antérieure');

  ok(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close(); srv.close();
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
